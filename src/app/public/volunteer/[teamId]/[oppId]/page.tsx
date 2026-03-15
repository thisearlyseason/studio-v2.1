
"use client";

import React, { useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, VolunteerOpportunity } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  HandHelping, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  AlertCircle, 
  Calendar,
  MapPin,
  Users,
  Info,
  Clock
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

function VolunteerSignupForm() {
  const { teamId, oppId } = useParams();
  const db = useFirestore();
  const { publicSignUpForVolunteer } = useTeam();

  const oppRef = useMemoFirebase(() => (db && teamId && oppId) ? doc(db, 'teams', teamId as string, 'volunteers', oppId as string) : null, [db, teamId, oppId]);
  const { data: opp, isLoading } = useDoc<VolunteerOpportunity>(oppRef);

  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await publicSignUpForVolunteer(teamId as string, oppId as string, formData);
      setIsSuccess(true);
    } catch (err) {
      toast({ title: "Submission Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!opp) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase">Opportunity Not Found</h2></Card></div>;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col items-center justify-center p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Registration Sent</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">The Organizer will confirm shortly</p>
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Confirmation Memo</p>
            <p className="text-sm font-bold mt-1 leading-relaxed">
              Thanks for volunteering! The squad coordinator has been notified of your interest. You will be contacted via the email/phone provided to finalize details.
            </p>
          </div>
          <Button variant="ghost" className="mt-8 font-black uppercase text-xs" onClick={() => window.close()}>Close Hub</Button>
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
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg">Community Help</Badge>
            <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-[0.9]">{opp.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Volunteer Opportunity</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm ring-1 ring-black/5">
              <Calendar className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase opacity-40">Event Date</p>
                <p className="text-sm font-black uppercase">{format(new Date(opp.date), 'EEEE, MMM d')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm ring-1 ring-black/5">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase opacity-40">Location</p>
                <p className="text-sm font-black uppercase truncate">{opp.location}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm ring-1 ring-black/5">
              <Clock className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase opacity-40">Credit</p>
                <p className="text-sm font-black uppercase">{opp.hoursPerSlot} Verified Hours</p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Support</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              By signing up, you are pledging your support to the squad. Verified attendance will be logged in our organizational support records.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <HandHelping className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Claim Assignment</CardTitle>
              </div>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground italic bg-muted/20 p-6 rounded-2xl border-2 border-dashed">
                "{opp.description || 'Assisting with coordination and logistics for the upcoming squad event.'}"
              </p>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Full Name</Label>
                <Input 
                  required 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="h-12 rounded-xl border-2 font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Email Address</Label>
                  <Input 
                    type="email"
                    required 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="h-12 rounded-xl border-2 font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Phone Number</Label>
                  <Input 
                    type="tel"
                    required 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="h-12 rounded-xl border-2 font-bold"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={isSubmitting || !formData.name}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit to Assignment"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function PublicVolunteerSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <VolunteerSignupForm />
    </Suspense>
  );
}
