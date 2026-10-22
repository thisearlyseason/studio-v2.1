"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { FundraisingOpportunity } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  PiggyBank, 
  Target, 
  ChevronRight, 
  Loader2, 
  CheckCircle2, 
  Globe,
  CreditCard,
  Mail,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  Info,
  DollarSign
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function PublicDonationPortalPage() {
  const { teamId, fundId } = useParams();
  const [fund, setFund] = useState<FundraisingOpportunity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'external' | 'etransfer'>('external');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const submissionKey = useRef<string | null>(null);

  useEffect(() => {
    const resolvedTeamId = typeof teamId === 'string' ? teamId : '';
    const resolvedFundId = typeof fundId === 'string' ? fundId : '';
    if (!resolvedTeamId || !resolvedFundId) {
      setLoadError('This donation link is invalid.');
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    fetch(
      `/api/public/fundraising?teamId=${encodeURIComponent(resolvedTeamId)}&fundId=${encodeURIComponent(resolvedFundId)}`,
      { signal: controller.signal }
    )
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Campaign unavailable.');
        setFund(payload.campaign as FundraisingOpportunity);
        setLoadError(null);
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setFund(null);
          setLoadError(error.message || 'Campaign unavailable.');
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [teamId, fundId]);

  const progress = useMemo(() => {
    if (!fund) return 0;
    return Math.min(100, (fund.currentAmount / fund.goalAmount) * 100);
  }, [fund]);

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName || !donorEmail || !donorPhone || !relationship || !amount || isSubmitting || !fund) return;

    setIsSubmitting(true);
    try {
      if (!submissionKey.current) {
        submissionKey.current = crypto.randomUUID();
      }
      const response = await fetch(
        `/api/public/fundraising?teamId=${encodeURIComponent(teamId as string)}&fundId=${encodeURIComponent(fundId as string)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': submissionKey.current,
          },
          body: JSON.stringify({
            donorName,
            donorEmail,
            donorPhone,
            relationship,
            amount: Number(amount),
            method,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to record this donation intent.');
      }
      submissionKey.current = null;
      if (method === 'external' && fund.externalLink) {
        toast({ title: "Dispatching to Secure Hub" });
        setTimeout(() => {
          window.location.href = fund.externalLink!;
        }, 1500);
      } else {
        setIsSuccess(true);
      }
    } catch (err: any) {
      toast({
        title: "Submission Failed",
        description: err.message || 'Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/10 gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Connecting to Squad Hub...</p>
    </div>
  );

  if (!fund || loadError) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10">
      <Card className="max-w-md text-center p-12 rounded-[3rem] border-none shadow-2xl">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
        <h2 className="text-2xl font-black uppercase tracking-tight">Campaign Inactive</h2>
        <p className="text-muted-foreground font-medium mt-2">{loadError || 'This donation portal has been closed or the link is invalid.'}</p>
      </Card>
    </div>
  );

  if (isSuccess) return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
        <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-black uppercase tracking-tighter">Intent Logged</h2>
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Pending Verification</p>
        
        <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left space-y-4">
          <p className="text-[10px] font-black uppercase text-primary">Instructions Received</p>
          <p className="text-sm font-bold leading-relaxed">
            Your {method === 'etransfer' ? 'E-Transfer' : 'Donation'} has been logged. The squad coordinator will verify the receipt and update the official total shortly.
          </p>
        </div>

        <Button variant="ghost" className="mt-10 font-black uppercase text-xs" onClick={() => window.location.reload()}>Donate Again</Button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Public Support Hub</Badge>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{fund.title}</h1>
            <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
              <Clock className="h-3 w-3" /> Ends: {format(new Date(fund.deadline), 'MMM d, yyyy')}
            </div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-40">Progress Verified</p>
                  <p className="text-4xl font-black text-primary">${fund.currentAmount.toLocaleString()}</p>
                </div>
                <Badge variant="secondary" className="bg-black text-white font-black text-[10px] h-7 px-4">GOAL: ${fund.goalAmount.toLocaleString()}</Badge>
              </div>
              <Progress value={progress} className="h-3 rounded-full" />
            </div>
            <p className="text-sm font-medium text-foreground/70 leading-relaxed italic border-t pt-6">"{fund.description || 'Join us in fueling the next championship run.'}"</p>
          </Card>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Secure Protocol</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Every contribution is recorded in our institutional audit ledger. The squad coordinator manually verifies each receipt to ensure 100% fiscal transparency.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleDonate}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-muted p-3 rounded-2xl">
                  <PiggyBank className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Make a Contribution</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Support elite squad mobilization</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="donor-name" className="text-[10px] font-black uppercase tracking-widest ml-1">Your Name (Internal Audit)</Label>
                  <Input 
                    id="donor-name"
                    autoComplete="name"
                    required 
                    placeholder="Full Name" 
                    value={donorName} 
                    onChange={e => setDonorName(e.target.value)}
                    className="h-14 rounded-2xl border-2 font-bold text-base focus:border-primary/20 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="donation-amount" className="text-[10px] font-black uppercase tracking-widest ml-1">Amount ($)</Label>
                  <Input 
                    id="donation-amount"
                    required 
                    type="number" 
                    placeholder="0.00" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    className="h-14 rounded-2xl border-2 font-black text-2xl text-primary focus:border-primary/20 transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="donor-email" className="text-[10px] font-black uppercase tracking-widest ml-1">Email Address</Label>
                  <Input id="donor-email" autoComplete="email" required type="email" value={donorEmail} onChange={e => setDonorEmail(e.target.value)} className="h-14 rounded-2xl border-2 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="donor-phone" className="text-[10px] font-black uppercase tracking-widest ml-1">Phone Number</Label>
                  <Input id="donor-phone" autoComplete="tel" required type="tel" value={donorPhone} onChange={e => setDonorPhone(e.target.value)} className="h-14 rounded-2xl border-2 font-bold" />
                </div>
              </div>
              <div className="space-y-3">
                <Label id="donor-relationship-label" className="text-[10px] font-black uppercase tracking-widest ml-1">Your Connection</Label>
                <RadioGroup aria-labelledby="donor-relationship-label" value={relationship} onValueChange={setRelationship} className="grid grid-cols-2 gap-3">
                  {[
                    ['parent', 'Parent'],
                    ['family_member', 'Family Member'],
                    ['friend', 'Friend'],
                    ['other', 'Other'],
                  ].map(([value, label]) => (
                    <Label key={value} htmlFor={`donor-${value}`} className="flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer">
                      <RadioGroupItem id={`donor-${value}`} value={value} />
                      <span className="text-xs font-black uppercase">{label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <Label id="payment-protocol-label" className="text-[10px] font-black uppercase tracking-widest ml-1">Select Payment Protocol</Label>
                <RadioGroup aria-labelledby="payment-protocol-label" value={method} onValueChange={(v: any) => setMethod(v)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={cn(
                    "p-5 rounded-2xl border-2 transition-all cursor-pointer group",
                    method === 'external' ? "border-primary bg-primary/5 shadow-md" : "border-muted/50 hover:border-muted"
                  )} onClick={() => setMethod('external')}>
                    <div className="flex items-center gap-3 mb-2">
                      <RadioGroupItem value="external" id="m_ext" />
                      <Label htmlFor="m_ext" className="font-black text-[10px] uppercase cursor-pointer">Digital Payment Hub</Label>
                    </div>
                    <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                      <Globe className="h-3 w-3" />
                      <span className="text-[8px] font-bold uppercase">Stripe / PayPal / Venmo</span>
                    </div>
                  </div>

                  <div className={cn(
                    "p-5 rounded-2xl border-2 transition-all cursor-pointer group",
                    method === 'etransfer' ? "border-primary bg-primary/5 shadow-md" : "border-muted/50 hover:border-muted"
                  )} onClick={() => setMethod('etransfer')}>
                    <div className="flex items-center gap-3 mb-2">
                      <RadioGroupItem value="etransfer" id="m_et" />
                      <Label htmlFor="m_et" className="font-black text-[10px] uppercase cursor-pointer">E-Transfer / Offline</Label>
                    </div>
                    <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                      <Mail className="h-3 w-3" />
                      <span className="text-[8px] font-bold uppercase">Manual Instructions</span>
                    </div>
                  </div>
                </RadioGroup>

                <div className="pt-4 overflow-hidden">
                  {method === 'external' ? (
                    <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 animate-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center gap-3 mb-2">
                        <Info className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black uppercase text-primary">Redirection Protocol</span>
                      </div>
                      <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                        You will be securely dispatched to the squad's external payment hub after clicking the support button below.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-black text-white p-8 rounded-3xl space-y-6 animate-in slide-in-from-top-4 duration-500 shadow-xl relative">
                      <DollarSign className="absolute -right-2 -bottom-2 h-20 w-20 opacity-10 -rotate-12" />
                      <div className="flex items-center gap-3 relative z-10">
                        <div className="bg-primary p-2 rounded-xl"><Mail className="h-4 w-4 text-white" /></div>
                        <h4 className="text-lg font-black uppercase tracking-tight">E-Transfer Details</h4>
                      </div>
                      <div className="space-y-4 relative z-10">
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                          <p className="text-xs font-medium leading-relaxed whitespace-pre-wrap">
                            {fund.eTransferDetails || "Contact the coordinator for offline payment instructions."}
                          </p>
                        </div>
                        <div className="bg-primary/20 p-4 rounded-xl border border-primary/20">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Audit Protocol</p>
                          <p className="text-[10px] font-medium leading-relaxed italic">
                            Please ensure your E-Transfer memo matches the name provided in this form for rapid verification.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={!donorName || !amount || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    Confirm & Support Squad <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <footer className="mt-16 text-center opacity-30 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-[0.3em]">Institutional Capital Engine v1.0 • The Squad</p>
      </footer>
    </div>
  );
}
