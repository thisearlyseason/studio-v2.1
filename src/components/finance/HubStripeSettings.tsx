"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Users,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { useAuth, useFirestore, useDoc } from '@/firebase';

// ─── Types ─────────────────────────────────────────────────────────────────

interface HubStripeSettingsProps {
  userId: string;
  hubTeamId: string;
  subSquads: { id: string; name: string }[];
  isSchoolMode: boolean;
  isDemo?: boolean;
}

interface HubConnectStatus {
  connected: boolean;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  email?: string | null;
  connectAccountId?: string;
}

interface TeamDoc {
  stripeConnectMode?: 'shared' | 'per_squad';
  stripeConnectAccountId?: string;
  name?: string;
  [key: string]: unknown;
}

interface SquadStatusMap {
  [squadId: string]: boolean; // true = has stripeConnectAccountId
}

// ─── Sub-squad status list ──────────────────────────────────────────────────

function SquadStatusList({ subSquads }: { subSquads: { id: string; name: string }[] }) {
  const db = useFirestore();
  const [squadStatuses, setSquadStatuses] = useState<SquadStatusMap>({});

  // Stable squad ID string — prevents useEffect from re-running on every render
  // when the parent passes a new array reference with the same contents.
  const squadIdsKey = useMemo(() => subSquads.map(s => s.id).join(','), [subSquads]);

  useEffect(() => {
    if (!db || !squadIdsKey) return;

    const unsubs: (() => void)[] = [];

    subSquads.forEach(({ id }) => {
      if (!id) return;
      const ref = doc(db, 'teams', id);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const data = snap.data() as TeamDoc | undefined;
          setSquadStatuses((prev) => ({
            ...prev,
            [id]: !!(data?.stripeConnectAccountId),
          }));
        },
        () => {
          setSquadStatuses((prev) => ({ ...prev, [id]: false }));
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, squadIdsKey]); // subSquads intentionally excluded — use squadIdsKey for stability

  if (!subSquads.length) {
    return (
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center py-4">
        No sub-squads found
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {subSquads.map((squad) => {
        const isConnected = squadStatuses[squad.id] === true;
        return (
          <div
            key={squad.id}
            className={cn(
              'flex items-center justify-between px-4 py-3 rounded-2xl transition-colors',
              isConnected
                ? 'bg-emerald-50 ring-1 ring-emerald-100'
                : 'bg-muted/40 ring-1 ring-border/30'
            )}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'p-1.5 rounded-lg shrink-0',
                  isConnected ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                )}
              >
                {isConnected ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <CreditCard className="h-3.5 w-3.5" />
                )}
              </div>
              <p className="text-[11px] font-black uppercase tracking-wider text-foreground">
                {squad.name}
              </p>
            </div>
            <Badge
              className={cn(
                'text-[8px] font-black uppercase tracking-widest border-none',
                isConnected
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {isConnected ? 'Connected ✓' : 'Not Connected'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hub-level connect card ─────────────────────────────────────────────────

interface HubConnectCardProps {
  userId: string;
  hubTeamId: string;
}

function HubConnectCard({ userId, hubTeamId }: HubConnectCardProps) {
  const auth = useAuth();
  const [status, setStatus] = useState<HubConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setFetchError(null);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) { setIsLoading(false); return; }
      const res = await fetch(
        `/api/stripe/connect/status?userId=${userId}&teamId=${hubTeamId}&mode=hub`,
        { headers: authHeader(idToken) }
      );
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else if (res.status === 404) {
        setStatus({ connected: false });
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err.error || 'Failed to check Stripe status.');
      }
    } catch (err) {
      console.error('[HubConnectCard] fetchStatus error:', err);
      setFetchError('Unable to reach server.');
    } finally {
      setIsLoading(false);
    }
  }, [auth, userId, hubTeamId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('stripe_connect_return') === 'true' ||
      params.get('stripe_connect_refresh') === 'true'
    ) {
      params.delete('stripe_connect_return');
      params.delete('stripe_connect_refresh');
      const newUrl =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
      setIsLoading(true);
      fetchStatus();
    }
  }, [fetchStatus]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');
      const res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ userId, teamId: hubTeamId, mode: 'hub' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start Stripe onboarding');
      if (data.url) window.location.href = data.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ title: 'Connection Failed', description: message, variant: 'destructive' });
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-muted/30 p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Checking hub Stripe connection...
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

  // ── Connected & charges enabled ────────────────────────────────────────────
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
                Hub Stripe Connected
              </p>
              {status.email && (
                <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{status.email}</p>
              )}
              <p className="text-[10px] font-bold text-emerald-500/70 mt-1">
                All sub-squad payments route to this account
              </p>
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

  // ── Connected but incomplete ───────────────────────────────────────────────
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
                Hub Stripe Setup Incomplete
              </p>
              <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                Finish setting up your hub Stripe account to route payments.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={isConnecting}
            className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white border-none shadow-md shrink-0"
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            )}
            Complete Setup
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  return (
    <Card className="rounded-[2rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
      <div className="absolute top-0 right-0 p-8 opacity-5 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
        <CreditCard className="h-32 w-32" />
      </div>
      <CardContent className="p-6 md:p-8 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/20 p-3 rounded-2xl text-primary shadow-lg shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">
                Hub Payment Account
              </p>
              <h3 className="text-lg font-black uppercase tracking-tight leading-none text-white">
                Connect Hub Stripe Account
              </h3>
              <p className="text-[10px] font-bold text-white/50 mt-1.5 max-w-sm">
                All payment items from sub-squads will route to this Stripe account. Money goes
                directly to the hub — no platform fee.
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" /> Connect Stripe
                </>
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

// ─── Main Component ─────────────────────────────────────────────────────────

export function HubStripeSettings({
  userId,
  hubTeamId,
  subSquads,
  isSchoolMode,
  isDemo = false,
}: HubStripeSettingsProps) {
  const db = useFirestore();

  // Real-time listener on the hub team doc — guard against db not ready or missing hubTeamId
  const hubDocRef = useMemo(
    () => (db && hubTeamId ? doc(db, 'teams', hubTeamId) : null),
    [db, hubTeamId]
  );
  const { data: hubTeamData, isLoading: isHubLoading } = useDoc<TeamDoc>(hubDocRef as any);

  const currentMode: 'shared' | 'per_squad' = hubTeamData?.stripeConnectMode ?? 'shared';
  const isPerSquad = currentMode === 'per_squad';

  const [isSavingMode, setIsSavingMode] = useState(false);

  const handleModeToggle = async (checked: boolean) => {
    if (!db || !hubTeamId) return;
    const newMode: 'shared' | 'per_squad' = checked ? 'per_squad' : 'shared';
    setIsSavingMode(true);
    try {
      await updateDoc(doc(db, 'teams', hubTeamId), { stripeConnectMode: newMode });
      toast({
        title: newMode === 'shared' ? 'Switched to Shared Hub Account' : 'Switched to Per-Squad Accounts',
        description:
          newMode === 'shared'
            ? 'All sub-squad payments will route through the hub Stripe account.'
            : 'Each squad will connect their own Stripe account from their Finance tab.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update mode';
      toast({ title: 'Save Failed', description: message, variant: 'destructive' });
    } finally {
      setIsSavingMode(false);
    }
  };

  const hubLabel = isSchoolMode ? 'School Hub' : 'Club Hub';

  if (isDemo) {
    return (
      <Card className="rounded-[2rem] border-none shadow-md bg-muted/30 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-foreground">
              Online Payments Disabled in Demo
            </p>
            <p className="text-[10px] font-bold text-muted-foreground mt-1 leading-relaxed">
              Stripe setup is available only in a live paid workspace. Demo data will not connect to or modify a payment account.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Card className="rounded-[2rem] border-none shadow-md overflow-hidden">
        <CardHeader className="pb-0 pt-6 px-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-primary/10 p-2 rounded-xl text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">
              {hubLabel} · Stripe Settings
            </p>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight leading-none">
            Payment Routing
          </h2>
        </CardHeader>

        <CardContent className="px-6 pb-6 pt-4">
          {/* ── Mode Toggle ───────────────────────────────────────────────── */}
          <div
            className={cn(
              'flex items-center justify-between p-4 rounded-2xl transition-colors',
              isPerSquad ? 'bg-muted/40' : 'bg-primary/5'
            )}
          >
            {/* Shared side */}
            <div
              className={cn(
                'flex items-center gap-2.5 transition-opacity',
                isPerSquad ? 'opacity-40' : 'opacity-100'
              )}
            >
              <Building2
                className={cn('h-4 w-4 shrink-0', isPerSquad ? 'text-muted-foreground' : 'text-primary')}
              />
              <div>
                <p
                  className={cn(
                    'text-[10px] font-black uppercase tracking-widest',
                    isPerSquad ? 'text-muted-foreground' : 'text-primary'
                  )}
                >
                  Shared Hub Account
                </p>
                <p className="text-[9px] text-muted-foreground font-bold">
                  One Stripe for all squads
                </p>
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-3">
              {isSavingMode || isHubLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={isPerSquad}
                  onCheckedChange={handleModeToggle}
                  disabled={isSavingMode || isHubLoading}
                />
              )}
            </div>

            {/* Per-squad side */}
            <div
              className={cn(
                'flex items-center gap-2.5 transition-opacity',
                isPerSquad ? 'opacity-100' : 'opacity-40'
              )}
            >
              <div className="text-right">
                <p
                  className={cn(
                    'text-[10px] font-black uppercase tracking-widest',
                    isPerSquad ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  Per-Squad Accounts
                </p>
                <p className="text-[9px] text-muted-foreground font-bold">
                  Each squad connects their own
                </p>
              </div>
              <Users
                className={cn(
                  'h-4 w-4 shrink-0',
                  isPerSquad ? 'text-foreground' : 'text-muted-foreground'
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Shared Mode Panel ──────────────────────────────────────────────── */}
      {!isPerSquad && (
        <div className="flex flex-col gap-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-primary/5 ring-1 ring-primary/10">
            <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold text-primary/80 leading-relaxed">
              All payment items from sub-squads will route to this Stripe account.
            </p>
          </div>

          {/* Hub connect card */}
          <HubConnectCard userId={userId} hubTeamId={hubTeamId} />
        </div>
      )}

      {/* ── Per-Squad Mode Panel ───────────────────────────────────────────── */}
      {isPerSquad && (
        <div className="flex flex-col gap-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-muted/40 ring-1 ring-border/30">
            <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
              Each squad connects their own Stripe account from their Finance tab. Payments go
              directly to each squad's account.
            </p>
          </div>

          {/* Squad status list */}
          <Card className="rounded-[2rem] border-none shadow-md overflow-hidden">
            <CardHeader className="pb-2 pt-5 px-5">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Sub-Squad Stripe Status
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <SquadStatusList subSquads={subSquads} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
