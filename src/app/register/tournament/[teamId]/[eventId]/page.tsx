
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Info,
  Wallet,
  Sparkles,
  Globe
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
    if ((config.require_default_waiver || config.custom_waiver_text) && (!waiverAgreed || !signature.trim())) {
      toast({ title: "Compliance Required", description: "Please sign the required documentation.", variant: "destructive" });
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
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{event.title}</h1>
            <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.2em] bg-primary/10 w-fit px-4 h-8 rounded-full shadow-sm">
              <Trophy className="h-4 w-4" />
              <span>Championship Series Enrollment</span>
            </div>
          </div>

          <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border-2 border-white shadow-xl space-y-4">
            <h3 className="font-black text-xs uppercase tracking-widest text-primary mb-2">Series Context</h3>
            <p className="text-sm font-medium leading-relaxed text-foreground/80">{event.description || 'Championship itinerary established.'}</p>
            
            <div className="pt-4 border-t border-black/5 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Venue</p>
                <p className="font-bold text-sm uppercase truncate" title={event.location}>{event.location || 'TBA'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Timeline</p>
                <p className="font-bold text-sm uppercase">
                  {format(new Date(event.date), 'MMM d')} 
                  {event.endDate ? ` - ${format(new Date(event.endDate), 'MMM d')}` : ''}
                </p>
              </div>
              {event.ages && (
                <div className="col-span-2 space-y-1 pt-2">
                  <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Divisions</p>
                  <p className="font-bold text-sm uppercase">{event.ages}</p>
                </div>
              )}
              {(event?.contactEmail || event?.contactPhone) && (
                <div className="col-span-2 space-y-1 pt-2">
                  <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Administration</p>
                  <div className="flex flex-wrap gap-4">
                    {event?.contactEmail && <p className="font-bold text-sm text-primary">{event.contactEmail}</p>}
                    {event?.contactPhone && <p className="font-bold text-sm">{event.contactPhone}</p>}
                  </div>
                </div>
              )}
              {(event?.socialLinks?.twitter || event?.socialLinks?.instagram) && (
                <div className="col-span-2 space-y-2 pt-2">
                  <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Social Channels</p>
                  <div className="flex gap-2">
                    {event?.socialLinks?.twitter && (
                      <a href={event.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="bg-black text-white h-8 w-8 rounded-lg flex items-center justify-center hover:scale-105 transition-transform"><Globe className="h-4 w-4" /></a>
                    )}
                    {event?.socialLinks?.instagram && (
                      <a href={event.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="bg-pink-600 text-white h-8 w-8 rounded-lg flex items-center justify-center hover:scale-105 transition-transform"><AlertCircle className="h-4 w-4" /></a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-primary/5 p-8 rounded-[3rem] border-2 border-primary/10 space-y-4 shadow-sm relative overflow-hidden group">
            {config.registration_cost && parseFloat(config.registration_cost) > 0 && (
              <div className="absolute -bottom-4 -right-4 p-4 opacity-5 rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700 font-black text-6xl text-primary">${config.registration_cost}</div>
            )}
            <div className="flex items-center gap-3"><div className="bg-primary p-2.5 rounded-2xl text-white shadow-lg"><Wallet className="h-5 w-5" /></div><h4 className="text-xl font-black uppercase tracking-tight text-foreground">Series Entry Fee</h4></div>
            {config.registration_cost && parseFloat(config.registration_cost) > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-primary">${config.registration_cost}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Guaranteed Slot</span>
              </div>
            ) : (
              <p className="text-sm font-black text-primary uppercase tracking-widest">Pipeline Entry: Under Review</p>
            )}
            <div className="pt-4 border-t border-primary/10 space-y-4">
              <div className="bg-white p-5 rounded-[2rem] text-[11px] font-medium leading-relaxed border border-primary/5 text-foreground/80 shadow-inner whitespace-pre-wrap">
                {event?.paymentInstructions || config.offline_payment_instructions || 'Tournament entry fees are currently processed via bank transfer or institutional check. Please coordinate with regional directors for final validation.'}
              </div>
              <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border-2 border-amber-200">
                <div className="bg-amber-100 p-2 rounded-xl"><Sparkles className="h-4 w-4 text-amber-600" /></div>
                <p className="text-[10px] font-black uppercase text-amber-700 tracking-tight leading-tight">Direct Online Checkout Coming Soon</p>
              </div>
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
                        <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                          <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select Choice..." /></SelectTrigger>
                          <SelectContent className="rounded-2xl">
                            {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold text-[10px] uppercase">{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {field.type === 'radio' && (
                        <RadioGroup required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)} className="flex flex-col gap-3 py-2">
                          {field.options?.map((opt: string) => (
                            <div key={opt} className="flex items-center space-x-3 bg-muted/5 p-4 rounded-2xl border-2 cursor-pointer hover:bg-white transition-all">
                              <RadioGroupItem value={opt} id={`${field.id}_${opt}`} />
                              <Label htmlFor={`${field.id}_${opt}`} className="font-black text-[10px] uppercase cursor-pointer flex-1">{opt}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                      {field.type === 'checkbox' && (
                        <div className="flex flex-col gap-3 py-2">
                          {field.options?.map((opt: string) => (
                            <div key={opt} className="flex items-center space-x-3 bg-muted/5 p-4 rounded-2xl border-2 hover:bg-white transition-all">
                              <Checkbox 
                                id={`${field.id}_${opt}`} 
                                checked={(answers[field.id] || []).includes(opt)} 
                                onCheckedChange={(checked) => {
                                  const current = Array.isArray(answers[field.id]) ? answers[field.id] : [];
                                  const updated = checked ? [...current, opt] : current.filter((i: string) => i !== opt);
                                  handleInputChange(field.id, updated);
                                }} 
                              />
                              <Label htmlFor={`${field.id}_${opt}`} className="font-black text-[10px] uppercase cursor-pointer flex-1">{opt}</Label>
                            </div>
                          ))}
                        </div>
                      )}
                      {field.type === 'signature' && (
                        <div className="space-y-2">
                           <Input required={field.required} placeholder="Type Full Legal Name to Sign..." value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-16 rounded-2xl border-2 font-mono italic text-center text-xl bg-muted/5 shadow-inner" />
                           <p className="text-[8px] font-black uppercase text-center opacity-40">Verified Tournament Handshake v{config.form_version || 1}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {(config.require_default_waiver || config.custom_waiver_text) && (
                <div className="space-y-8 pt-10 border-t-2">
                  <div className="flex items-center gap-3"><FileSignature className="h-6 w-6 text-primary" /><h4 className="text-xl font-black uppercase tracking-tighter">Required Agreements</h4></div>
                  
                  {config.require_default_waiver && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Universal Institutional Liability Waiver</p>
                      <ScrollArea className="h-40 p-5 rounded-2xl bg-muted/10 border-2 font-medium text-xs leading-relaxed">
                        {config.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this tournament series. I waive, release, and discharge the organization, its directors, host facilities, and affiliated sponsors from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'}
                      </ScrollArea>
                    </div>
                  )}

                  {config.custom_waiver_text && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Organization Specific Agreement</p>
                      <ScrollArea className="h-48 p-6 rounded-[2rem] bg-primary/5 border border-primary/20 font-medium text-xs leading-loose text-primary/90">
                        {config.custom_waiver_text}
                      </ScrollArea>
                    </div>
                  )}

                  <div className="flex items-center space-x-4 p-5 bg-primary/5 rounded-[2rem] border-2 border-primary/10 group cursor-pointer transition-all hover:bg-primary/10" onClick={() => setWaiverAgreed(!waiverAgreed)}>
                    <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} className="h-6 w-6 rounded-lg border-2 border-primary" />
                    <Label htmlFor="waiver_agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                      I verify that our entire squad roster has reviewed and accepts the championship protocols and liability terms listed above.
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
