
"use client";

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
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
  ArrowRight, 
  AlertCircle, 
  DollarSign,
  Info,
  Globe,
  Lock,
  Zap,
  ChevronLeft
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

function DonationForm() {
  const { teamId, fundId } = useParams();
  const db = useFirestore();
  const router = useRouter();
  const { submitPublicDonation } = useTeam();

  const fundRef = useMemoFirebase(() => (db && teamId && fundId) ? doc(db, 'teams', teamId as string, 'fundraising', fundId as string) : null, [db, teamId, fundId]);
  const { data: fund, isLoading } = useDoc<FundraisingOpportunity>(fundRef);

  const [formData, setFormData] = useState({ name: '', email: '', phone: '', amount: '50' });
  const [method, setMethod] = useState<'external' | 'e-transfer'>('external');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.amount || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitPublicDonation(teamId as string, fundId as string, {
        ...formData,
        method
      });

      if (method === 'external' && fund?.externalLink) {
        toast({ title: "Redirecting to Hub", description: "Securing your external payment window..." });
        setTimeout(() => {
          window.location.href = fund.externalLink!;
        }, 1500);
      } else {
        setIsSuccess(true);
      }
    } catch (err) {
      toast({ title: "Submission Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!fund) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase">Campaign Not Found</h2></Card></div>;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col items-center justify-center p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Contribution Logged</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Pending Internal Verification</p>
          
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left space-y-4">
            <p className="text-[10px] font-black uppercase text-primary">Instructions</p>
            <p className="text-sm font-bold leading-relaxed">
              Thanks for supporting the squad! Please ensure you have completed your e-transfer to the provided recipient. The organizer will confirm the funds and update the campaign total shortly.
            </p>
          </div>
          
          <Button variant="ghost" className="mt-8 font-black uppercase text-xs" onClick={() => window.location.reload()}>Make Another Donation</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-8">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg">Community Support</Badge>
            <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-[0.9]">{fund.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Capital Campaign</p>
          </div>

          <Card className="rounded-3xl border-none shadow-xl bg-black text-white p-8 space-y-6 relative overflow-hidden group">
            <PiggyBank className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12" />
            <div className="space-y-1 relative z-10">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Campaign Narrative</p>
              <p className="text-sm font-medium leading-relaxed italic opacity-80">"{fund.description || 'Supporting the squad in their journey to championship success.'}"</p>
            </div>
            <div className="relative z-10 pt-4 border-t border-white/10 flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black uppercase opacity-40">Goal</p>
                <p className="text-3xl font-black">${fund.goalAmount.toLocaleString()}</p>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary font-black">Verified Squad</Badge>
            </div>
          </Card>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Audit Notice</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              All contributions are logged in the institutional ledger. Donations marked as "E-Transfer" remain pending until manually verified by the organizer.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Make a Donation</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Select payment hub</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Your Name</Label>
                  <Input 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="h-12 rounded-xl border-2 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Amount ($)</Label>
                  <Input 
                    type="number"
                    required 
                    value={formData.amount} 
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="h-12 rounded-xl border-2 font-black text-xl text-primary"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Payment Protocol</Label>
                <RadioGroup 
                  value={method} 
                  onValueChange={(v: any) => setMethod(v)}
                  className="grid grid-cols-1 gap-3"
                >
                  <div 
                    className={cn(
                      "flex items-center justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer",
                      method === 'external' ? "border-primary bg-primary/5 shadow-sm" : "bg-muted/30 border-transparent hover:border-muted"
                    )}
                    onClick={() => setMethod('external')}
                  >
                    <div className="flex items-center gap-4">
                      <RadioGroupItem value="external" id="external" className="h-5 w-5" />
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">Digital Payment Hub</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">Stripe, PayPal, Venmo</p>
                      </div>
                    </div>
                    <Globe className={cn("h-5 w-5 opacity-20", method === 'external' && "text-primary opacity-100")} />
                  </div>

                  <div 
                    className={cn(
                      "flex items-center justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer",
                      method === 'e-transfer' ? "border-primary bg-primary/5 shadow-sm" : "bg-muted/30 border-transparent hover:border-muted"
                    )}
                    onClick={() => setMethod('e-transfer')}
                  >
                    <div className="flex items-center gap-4">
                      <RadioGroupItem value="e-transfer" id="e-transfer" className="h-5 w-5" />
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">E-Transfer / Offline</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">Direct Transfer Instructions</p>
                      </div>
                    </div>
                    <DollarSign className={cn("h-5 w-5 opacity-20", method === 'e-transfer' && "text-primary opacity-100")} />
                  </div>
                </RadioGroup>
              </div>

              {method === 'e-transfer' && fund.eTransferDetails && (
                <div className="p-6 bg-black text-white rounded-[2rem] space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-xl"><Zap className="h-4 w-4 text-white" /></div>
                    <h4 className="text-sm font-black uppercase tracking-widest">Transfer Protocol</h4>
                  </div>
                  <p className="text-xs font-medium leading-relaxed italic text-white/60 whitespace-pre-wrap">
                    {fund.eTransferDetails}
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={isSubmitting || !formData.name || !formData.amount}
              >
                {isSubmitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : method === 'external' ? (
                  <>Go to Payment Hub <ArrowRight className="ml-2 h-5 w-5" /></>
                ) : (
                  "Commit Donation Record"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function PublicDonationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <DonationForm />
    </Suspense>
  );
}
