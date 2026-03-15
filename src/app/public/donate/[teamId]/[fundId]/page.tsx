
"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PiggyBank, CheckCircle2, AlertCircle, DollarSign, CreditCard, Loader2, Info, ArrowRight } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

export default function PublicDonationPage() {
  const { teamId, fundId } = useParams();
  const db = useFirestore();
  const { submitPublicDonation } = useTeam();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', amount: '25', method: 'external' as 'external' | 'e-transfer' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const fundRef = useMemoFirebase(() => (db && teamId && fundId) ? doc(db, 'teams', teamId as string, 'fundraising', fundId as string) : null, [db, teamId, fundId]);
  const { data: fund, isLoading } = useDoc<FundraisingOpportunity>(fundRef);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.amount || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitPublicDonation(teamId as string, fundId as string, formData);
      if (formData.method === 'external' && fund?.externalLink) {
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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-muted/30"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!fund) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase tracking-tight">Campaign Inactive</h2></Card></div>;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Pledge Received</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Strategic Support Logged</p>
          {formData.method === 'e-transfer' && fund.eTransferDetails && (
            <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left space-y-2">
              <p className="text-[10px] font-black uppercase text-primary">Transfer Instructions</p>
              <p className="text-sm font-bold leading-relaxed">{fund.eTransferDetails}</p>
              <p className="text-[9px] font-medium opacity-60 italic">Your donation will be verified once funds are received.</p>
            </div>
          )}
          <Button variant="ghost" className="mt-8 font-black uppercase text-xs" onClick={() => window.close()}>Close Portal</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-2 text-center">
          <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg">Community Campaign</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight mt-2">{fund.title}</h1>
          <p className="text-sm font-medium text-muted-foreground max-w-sm mx-auto leading-relaxed italic">"{fund.description || 'Support our squad as we strive for championship excellence.'}"</p>
        </div>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4"><div className="bg-primary/5 p-3 rounded-2xl text-primary"><PiggyBank className="h-6 w-6" /></div><div><CardTitle className="text-2xl font-black uppercase tracking-tight">Direct Support</CardTitle><CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Institutional Capital Dispatch</CardDescription></div></div>
            </CardHeader>
            <CardContent className="p-8 lg:p-10 space-y-8 pt-0">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Donor Name</Label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Dispatch Amount ($)</Label><Input type="number" required value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="h-12 border-2 rounded-xl font-black text-xl text-primary" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Payment Protocol</Label>
                    <Select value={formData.method} onValueChange={(v: any) => setFormData({...formData, method: v})}>
                      <SelectTrigger className="h-12 border-2 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {fund.externalLink && <SelectItem value="external" className="font-bold">Digital Portal</SelectItem>}
                        {fund.eTransferDetails && <SelectItem value="e-transfer" className="font-bold">E-Transfer</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" disabled={isSubmitting || !formData.name || !formData.amount}>
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : (formData.method === 'external' ? "Continue to Payment" : "Authorize Pledge")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
