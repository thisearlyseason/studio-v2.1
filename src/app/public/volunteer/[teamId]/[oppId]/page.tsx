
"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, VolunteerOpportunity } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { HandHelping, CheckCircle2, AlertCircle, Clock, MapPin, Loader2, ChevronLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';

export default function PublicVolunteerSignupPage() {
  const { teamId, oppId } = useParams();
  const db = useFirestore();
  const { publicSignUpForVolunteer } = useTeam();
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const oppRef = useMemoFirebase(() => (db && teamId && oppId) ? doc(db, 'teams', teamId as string, 'volunteers', oppId as string) : null, [db, teamId, oppId]);
  const { data: opp, isLoading } = useDoc<VolunteerOpportunity>(oppRef);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await publicSignUpForVolunteer(teamId as string, oppId as string, formData);
      setIsSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-muted/30"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!opp) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase tracking-tight">Assignment Inactive</h2></Card></div>;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8"><CheckCircle2 className="h-10 w-10 text-green-600" /></div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Signup Dispatched</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Pending Coordinator Review</p>
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Next Steps</p>
            <p className="text-sm font-bold mt-1">The squad organizer will verify your enrollment and reach out with deployment details.</p>
          </div>
          <Button variant="ghost" className="mt-8 font-black uppercase text-xs" onClick={() => window.close()}>Close Hub</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      <div className="max-w-xl w-full space-y-8">
        <div className="space-y-2">
          <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Public Opportunity</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">{opp.title}</h1>
          <div className="flex items-center gap-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-primary" /> {format(new Date(opp.date), 'MMM d, yyyy')}</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-primary" /> {opp.location}</span>
          </div>
        </div>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4"><div className="bg-primary/5 p-3 rounded-2xl text-primary"><HandHelping className="h-6 w-6" /></div><div><CardTitle className="text-2xl font-black uppercase tracking-tight">Claim Assignment</CardTitle><CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Support Deployment Registration</CardDescription></div></div>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed italic">"{opp.description || 'Community support required for the upcoming squad event.'}"</p>
            </CardHeader>
            <CardContent className="p-8 lg:p-10 space-y-6 pt-0">
              <div className="space-y-4">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Full Legal Name</Label><Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Email Address</Label><Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Phone Number</Label><Input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-8 lg:p-10 pt-0"><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" disabled={isSubmitting || !formData.name || !formData.email}>{isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit to Assignment"}</Button></CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
