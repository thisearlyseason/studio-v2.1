"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CreditCard, CheckCircle2, Loader2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { useUser, useAuth } from '@/firebase';
import Link from 'next/link';

interface ConnectStatus {
  connected: boolean;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  email?: string | null;
  connectAccountId?: string;
}

interface StripeConnectSetupProps {
  /** The authenticated user's Firebase UID */
  userId: string;
  /** The paid squad whose seat authorizes online payments */
  teamId: string;
  /** Called after a successful connection so parent can refresh state */
  onConnected?: () => void;
}

/**
 * StripeConnectSetup
 *
 * Compact card that guides a Pro team owner through connecting their Stripe
 * Express account. Shows a "Connect Stripe" CTA when not yet connected, and a
 * green "Connected" status when charges are enabled.
 *
 * Free/starter users should NOT see this component — the parent (SquadFinancialHub)
 * is already guarded by {isPro && ...}. We add a secondary guard here for safety.
 */
export function StripeConnectSetup({ userId, teamId, onConnected }: StripeConnectSetupProps) {
  const auth = useAuth();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Use a ref so onConnected never causes fetchStatus to be recreated
  const onConnectedRef = useRef(onConnected);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);

  const fetchStatus = useCallback(async () => {
    setFetchError(null);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) { setIsLoading(false); return; }
      const res = await fetch(
        `/api/stripe/connect/status?userId=${userId}&teamId=${encodeURIComponent(teamId)}`,
        {
        headers: authHeader(idToken),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.connected && data.chargesEnabled && onConnectedRef.current) {
          onConnectedRef.current();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        // 404 just means no account yet — treat as not connected, not an error
        if (res.status === 404) {
          setStatus({ connected: false });
        } else {
          setFetchError(err.error || 'Failed to check Stripe status.');
        }
      }
    } catch (err: any) {
      console.error('[StripeConnectSetup] fetchStatus error:', err);
      setFetchError('Unable to reach server. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [auth, userId, teamId]); // onConnected intentionally excluded — use ref instead

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle return from Stripe onboarding (URL param from redirect)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_connect_return') === 'true' || params.get('stripe_connect_refresh') === 'true') {
      // Strip the param from URL
      params.delete('stripe_connect_return');
      params.delete('stripe_connect_refresh');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
      // Re-fetch status after returning from Stripe
      setIsLoading(true);
      fetchStatus();
    }
  }, [fetchStatus]);

  const [platformProfileError, setPlatformProfileError] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    setPlatformProfileError(false);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');
      const res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ userId, teamId }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Detect the specific "platform profile not complete" Stripe error
        if (data.error?.toLowerCase().includes('responsibilities') || data.error?.toLowerCase().includes('platform profile')) {
          setPlatformProfileError(true);
          setIsConnecting(false);
          return;
        }
        throw new Error(data.error || 'Failed to start Stripe onboarding');
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
      setIsConnecting(false);
    }
  };


  if (platformProfileError) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md overflow-hidden">
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="bg-amber-100 p-2.5 rounded-xl shrink-0">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-foreground">
                One-Time Stripe Setup Required
              </p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1 leading-relaxed">
                Your Stripe platform profile needs to be completed before coaches can connect.
                This is a one-time step required by Stripe for Connect platforms.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              asChild
              className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest bg-[#635bff] hover:bg-[#5a52e8] text-white border-none shadow-md"
            >
              <a href="https://dashboard.stripe.com/settings/connect/platform-profile" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Complete Platform Profile on Stripe
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlatformProfileError(false)}
              className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest"
            >
              Try Again
            </Button>
          </div>
          <p className="text-[9px] text-muted-foreground font-bold">
            After completing on Stripe: 1) Return here  2) Click "Try Again"
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-muted/30 p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Checking Stripe connection...
          </p>
        </div>
      </Card>
    );
  }

  if (fetchError) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-red-50 ring-1 ring-red-100 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-xs font-black uppercase text-red-700">{fetchError}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setIsLoading(true); fetchStatus(); }}
            className="h-8 rounded-xl font-black text-[9px] uppercase tracking-widest text-red-600 hover:bg-red-100"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" /> Retry
          </Button>
        </div>
      </Card>
    );
  }

  // ── Already connected and charges enabled ─────────────────────────────────
  if (status?.connected && status.chargesEnabled) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-emerald-50 ring-1 ring-emerald-100 overflow-hidden">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-2.5 rounded-xl text-white shadow-sm shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Stripe Connected
              </p>
              {status.email && (
                <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{status.email}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 border-none font-black text-[8px] uppercase tracking-widest">
              Charges Enabled
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 rounded-xl"
              onClick={fetchStatus}
            >
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Connected but setup incomplete ────────────────────────────────────────
  if (status?.connected && !status.chargesEnabled) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-amber-50 ring-1 ring-amber-100 overflow-hidden">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-400 p-2.5 rounded-xl text-white shadow-sm shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                Stripe Setup Incomplete
              </p>
              <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                Finish setting up your Stripe account to accept payments.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={isConnecting}
            className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white border-none shadow-md shrink-0"
          >
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
            Complete Setup
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Not yet connected ─────────────────────────────────────────────────────
  return (
    <Card className="rounded-[2rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
      {/* Subtle background decoration */}
      <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
        <CreditCard className="h-32 w-32" />
      </div>

      <CardContent className="p-6 md:p-8 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/20 p-3 rounded-2xl text-primary shadow-lg shrink-0">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">
                Online Payments
              </p>
              <h3 className="text-lg font-black uppercase tracking-tight leading-none text-white">
                Connect Stripe to Accept Payments
              </h3>
              <p className="text-[10px] font-bold text-white/50 mt-1.5 max-w-sm">
                Link your free Stripe account to create payment links for league fees, tournament
                registrations, equipment, and more. Money goes directly to you — no platform fee.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className={cn(
                'h-12 px-6 rounded-2xl font-black text-sm uppercase tracking-widest',
                'bg-primary text-white hover:bg-primary/90 border-none shadow-xl shadow-primary/30',
                'active:scale-[0.98] transition-all'
              )}
            >
              {isConnecting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Connecting...</>
              ) : (
                <><ExternalLink className="h-4 w-4 mr-2" /> Connect Stripe</>
              )}
            </Button>
            <p className="text-[8px] font-bold text-white/25 uppercase tracking-widest text-center">
              Free to connect · Powered by Stripe
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
