"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { 
  PiggyBank, 
  CheckCircle2, 
  CreditCard, 
  Loader2, 
  DollarSign, 
  Target, 
  Info, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export default function PublicDonationPage() {
  const { teamId, fundId } = useParams();
  const { submitPublicDonation } = useTeam();
  const db = useFirestore();
  const router = useRouter();

  const fundRef = useMemoFirebase(() => (db && teamId && fundId) ? doc(db, 'teams', teamId as string, 'fundraising', fundId as string) : null, [db, teamId, fundId]);
  const { data: fund, isLoading } = useDoc<FundraisingOpportunity>(fundRef);

  const [amount, setScore1] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<'external' | 'e-transfer'>('external');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (fund && !fund.isShareable) {
      router.push('/login');
    }
  }, [fund, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !name || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitPublicDonation(teamId as string, fundId as string, {
        name, email, phone, amount, method
      });

      if (method === 'external' && fund?.externalLink) {
        window.location.href = fund.externalLink;
      } else {
        setIsSuccess(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!fund) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase tracking-tight">Campaign Inactive</h2></Card></div>;

  const progress = (fund.currentAmount / fund.goalAmount) * 100;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Donation Logged</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Pending Verification</p>
          
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-primary">Instructions</p>
              <p className="text-sm font-bold leading-relaxed">{fund.eTransferDetails || "Please complete your e-transfer or offline payment as coordinated. The organizer will confirm receipt shortly."}</p>
            </div>
          </div>

          <Button variant="ghost" className="mt-10 font-black uppercase text-xs" onClick={() => window.location.reload()}>Donate Again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg">Community Campaign</Badge>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{fund.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Secure Contribution Portal</p>
          </div>

          <Card className="rounded-3xl border-none shadow-xl bg-black text-white p-8 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Goal Progress</p>
                  <p className="text-3xl font-black text-primary">${fund.currentAmount.toLocaleString()} <span className="text-white opacity-40">/ ${fund.goalAmount.toLocaleString()}</span></p>
                </div>
                <Badge variant="outline" className="border-primary/20 text-primary font-black text-[10px] h-6">{Math.round(progress)}%</Badge>
              </div>
              <Progress value={progress} className="h-2 bg-white/10" />
            </div>
            <p className="text-sm font-medium text-white/60 leading-relaxed italic">"{fund.description}"</p>
          </Card>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Secure Verification</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              All contributions are logged into the official squad ledger. E-Transfers and offline payments require manual verification by the campaign organizer before being added to the public total.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-muted p-3 rounded-2xl">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Contribution</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Institutional Support Logic</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Payment Protocol</Label>
                  <RadioGroup value={method} onValueChange={(v: any) => setMethod(v)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fund.externalLink && (
                      <div className={cn(
                        "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4",
                        method === 'external' ? "border-primary bg-primary/5" : "bg-muted/30 border-transparent"
                      )} onClick={() => setMethod('external')}>
                        <RadioGroupItem value="external" id="external" className="sr-only" />
                        <div className={cn("p-2 rounded-xl", method === 'external' ? "bg-primary text-white" : "bg-white text-muted-foreground")}>
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-black text-[10px] uppercase">Digital Hub</p>
                          <p className="text-[8px] font-bold opacity-60 uppercase">Stripe / PayPal / Square</p>
                        </div>
                      </div>
                    )}
                    <div className={cn(
                      "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4",
                      method === 'e-transfer' ? "border-primary bg-primary/5" : "bg-muted/30 border-transparent"
                    )} onClick={() => setMethod('e-transfer')}>
                      <RadioGroupItem value="e-transfer" id="e-transfer" className="sr-only" />
                      <div className={cn("p-2 rounded-xl", method === 'e-transfer' ? "bg-primary text-white" : "bg-white text-muted-foreground")}>
                        <Info className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-black text-[10px] uppercase">E-Transfer / Offline</p>
                        <p className="text-[8px] font-bold opacity-60 uppercase">Direct Peer-to-Peer</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Donation Amount ($)</Label>
                    <Input 
                      type="number" 
                      placeholder="0.00" 
                      value={amount} 
                      onChange={e => setScore1(e.target.value)}
                      className="h-16 rounded-2xl border-2 text-3xl font-black text-center focus:border-primary transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contributor Name</Label>
                    <Input 
                      placeholder="Display name for ledger..." 
                      value={name} 
                      onChange={e => setName(e.target.value)}
                      className="h-12 rounded-xl border-2 font-bold"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Email (Optional)</Label>
                      <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl border-2 font-bold" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Phone (Optional)</Label>
                      <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="h-12 rounded-xl border-2 font-bold" />
                    </div>
                  </div>
                </div>

                {method === 'e-transfer' && (
                  <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed space-y-3 animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      <p className="text-[10px] font-black uppercase tracking-widest">E-Transfer Protocol</p>
                    </div>
                    <p className="text-xs font-bold leading-relaxed">{fund.eTransferDetails || "Please coordination with the organizer for payment details."}</p>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={!amount || !name || isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <>
                    {method === 'external' ? "Log & Open Digital Hub" : "Confirm Offline Support"}
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] mt-12 opacity-40">The Squad Fiscal Intelligence v1.0 • thesquad.pro</p>
    </div>
  );
}
