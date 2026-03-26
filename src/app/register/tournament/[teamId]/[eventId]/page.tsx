
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationFormField, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Users, 
  Signature,
  FileSignature,
  Target,
  Trophy,
  MapPin,
  Clock,
  Info
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import BrandLogo from '@/components/BrandLogo';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function RegistrationForm() {
  const { teamId, eventId } = useParams();
  const searchParams = useSearchParams();
  const protocolId = searchParams.get('protocol') || 'team_config';
  const { submitRegistrationEntry } = useTeam();
  const db = useFirestore();

  const eventRef = useMemoFirebase(() => db ? doc(db, 'teams', teamId as string, 'events', eventId as string) : null, [db, teamId, eventId]);
  const { data: event, isLoading: isEventLoading } = useDoc<TeamEvent>(eventRef);

  const configRef = useMemoFirebase(() => db ? doc(db, 'teams', teamId as string, 'events', eventId as string, 'registration', protocolId) : null, [db, teamId, eventId, protocolId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || isSubmitting) return;
    if (config.waiver_text && (!waiverAgreed || !signature.trim())) {
      toast({ title: "Compliance Required", description: "Please sign the institutional waiver.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitRegistrationEntry(teamId as string, config.id, answers, config.form_version || 0, signature, 'teams', eventId as string);
      setIsSuccess(true);
    } catch (error) {
      toast({ title: "Submission Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (id: string, value: any) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  if (isEventLoading || isConfigLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Connecting to Tournament Hub...</p>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center text-foreground">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-xl w-full p-12 rounded-[3.5rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-10">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Squad Roster Verified</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[11px] mt-2 mb-10">You are now officially rostered for {event?.title}</p>
          
          <div className="bg-primary p-8 rounded-[2rem] text-left text-white space-y-4 shadow-xl">
            <div className="flex items-center gap-2"><Info className="h-5 w-5 opacity-50" /><p className="text-[10px] font-black uppercase tracking-wide">Action Required</p></div>
            <p className="text-sm font-bold leading-relaxed">
              To manage your squad throughout the tournament, please open a free account. This ensures your roster integrity and provides real-time access to the live bracket.
            </p>
            <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-xs" onClick={() => window.location.href='/signup'}>Open Free Account</Button>
          </div>

          <p className="mt-10 text-[9px] font-black uppercase opacity-30">Deployment ID: {eventId}</p>
        </Card>
      </div>
    );
  }

  if (!config || !config.is_active || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6 text-foreground">
        <Card className="max-w-md w-full text-center p-12 rounded-[3.5rem] border-none shadow-2xl bg-white">
          <Trophy className="h-20 w-20 text-muted mx-auto mb-8 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Series Locked</h2>
          <p className="text-muted-foreground font-medium mt-2 leading-relaxed">The enrollment pipeline for this series is currently closed or restricted.</p>
        </Card>
      </div>
    );
  }

  const formSchema = config.form_schema || [];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-16 px-6 text-foreground">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5 space-y-10 lg:sticky lg:top-16">
          <div className="space-y-4">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[10px] h-7 px-4 shadow-lg shadow-primary/20">Tournament Pipeline</Badge>
            <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8]">{event.title}</h1>
            <div className="flex items-center gap-3 mt-4 text-[11px] font-black uppercase text-primary tracking-widest">
              <Trophy className="h-4 w-4" />
              <span>Championship Series Enrollment</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-[1.5rem] border border-white shadow-sm flex items-center gap-4">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Clock className="h-5 w-5" /></div>
              <div><p className="text-[8px] font-black uppercase opacity-40">Start Date</p><p className="font-black uppercase">{format(new Date(event.date), 'EEEE, MMM d')}</p></div>
            </div>
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-[1.5rem] border border-white shadow-sm flex items-center gap-4">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><MapPin className="h-5 w-5" /></div>
              <div><p className="text-[8px] font-black uppercase opacity-40">Series Venue</p><p className="font-black uppercase truncate">{event.location}</p></div>
            </div>
          </div>

          <div className="bg-black text-white p-10 rounded-[3rem] shadow-2xl space-y-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 group-hover:scale-110 transition-all duration-700 pointer-events-none"><Target className="h-40 w-40" /></div>
            <h4 className="text-xl font-black uppercase tracking-tight relative z-10">Elite Competition</h4>
            <div className="space-y-2 relative z-10">
              <p className="text-xs font-medium text-white/70 leading-relaxed italic">"{config.description}"</p>
            </div>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3.5rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-3 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-10 lg:p-12 pb-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-muted p-4 rounded-2xl flex items-center justify-center text-primary"><Users className="h-7 w-7" /></div>
                <div><CardTitle className="text-3xl font-black uppercase tracking-tighter">Squad Roster</CardTitle><CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] mt-1">Institutional Verification</CardDescription></div>
              </div>
            </CardHeader>
            
            <CardContent className="p-10 lg:p-12 space-y-10">
              {formSchema.map(field => (
                <div key={field.id} className="space-y-3">
                  {field.type === 'header' ? (
                    <div className="pt-6 border-b-2 pb-2 mb-4 text-primary"><h3 className="font-black text-xl uppercase tracking-tighter">{field.label}</h3></div>
                  ) : (
                    <>
                      <div className="flex justify-between items-end px-1"><Label className="text-[10px] font-black uppercase tracking-widest">{field.label} {field.required && <span className="text-primary">*</span>}</Label></div>
                      {field.type === 'short_text' && (
                        <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-lg shadow-inner" />
                      )}
                      {field.type === 'long_text' && (
                        <Textarea required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="rounded-2xl min-h-[120px] border-2 font-medium bg-muted/5 focus:bg-white transition-all p-5 shadow-inner" />
                      )}
                      {field.type === 'dropdown' && (
                        <Select required={field.required} onValueChange={v => handleInputChange(field.id, v)}>
                          <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select Choice..." /></SelectTrigger>
                          <SelectContent className="rounded-2xl">
                            {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold text-[10px] uppercase">{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </>
                  )}
                </div>
              ))}

              {config.waiver_text && (
                <div className="space-y-8 pt-10 border-t-2">
                  <div className="flex items-center gap-3"><FileSignature className="h-6 w-6 text-primary" /><h4 className="text-xl font-black uppercase tracking-tighter">Participation Terms</h4></div>
                  <ScrollArea className="h-48 p-6 rounded-[2rem] bg-muted/10 border-2 font-medium text-xs leading-loose text-foreground/80">
                    {config.waiver_text}
                  </ScrollArea>
                  <div className="flex items-center space-x-4 p-5 bg-primary/5 rounded-[2rem] border-2 border-primary/10 group cursor-pointer transition-all hover:bg-primary/10" onClick={() => setWaiverAgreed(!waiverAgreed)}>
                    <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} className="h-6 w-6 rounded-lg border-2 border-primary" />
                    <Label htmlFor="waiver_agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                      I verify that our entire squad roster has reviewed and accepts the championship protocols and liability terms.
                    </Label>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-60">Coach / Rep Authorization (Digital Signature)</Label>
                    <Input placeholder="Type legal name to execute..." value={signature} onChange={e => setSignature(e.target.value)} className="h-16 rounded-2xl border-2 font-mono italic text-center text-2xl bg-muted/5 focus:bg-white shadow-inner" required />
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-10 lg:p-12 pt-0">
              <Button type="submit" className="w-full h-18 py-8 rounded-[2rem] text-xl font-black shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-8 w-8 animate-spin" /> : "Deploy Roster Enrollment"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function TournamentRegistrationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <RegistrationForm />
    </Suspense>
  );
}
