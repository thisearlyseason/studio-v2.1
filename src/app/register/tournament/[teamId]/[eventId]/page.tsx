
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
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
  Globe,
  ArrowRight,
  Zap
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const formSchema = config?.form_schema || [];
  const isPlayerPipeline = protocolId === 'player_config';
  
  const isUnder18 = useMemo(() => {
    const dob = answers['dateOfBirth'] || answers['dob'];
    if (!dob) return false;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age < 18;
  }, [answers['dateOfBirth'], answers['dob']]);

  const activeSteps = useMemo(() => {
    if (!config) return [];
    
    if (isPlayerPipeline) {
      const steps = [{ id: 'identity', label: 'Identity', icon: Target }];
      
      const hasGuardianFields = formSchema.some(f => f.step === 'guardian');
      if (hasGuardianFields && isUnder18) {
        steps.push({ id: 'guardian', label: 'Guardian', icon: Users });
      }
      
      const hasTeamCodeFields = formSchema.some(f => f.step === 'team_code');
      if (hasTeamCodeFields) {
        steps.push({ id: 'team_code', label: 'Team Code', icon: Zap });
      }
      
      const hasCompliance = (config.require_default_waiver || 
                             (config.custom_waiver_text && config.custom_waiver_text.trim() !== '') || 
                             (config.team_waivers_content && (config.team_waivers_content?.length ?? 0) > 0));
      if (hasCompliance) {
        steps.push({ id: 'compliance', label: 'Compliance', icon: FileSignature });
      }
      return steps;
    } else {
      // Team Pipeline
      const steps = [{ id: 'details', label: 'Team Details', icon: ShieldCheck }];
      
      const hasAdditionalFields = formSchema.some(f => f.step === 'additional' || !f.step);
      if (hasAdditionalFields) {
        steps.push({ id: 'additional', label: 'Additional Info', icon: Sparkles });
      }
      
      const hasCompliance = (config.require_default_waiver || 
                             (config.custom_waiver_text && config.custom_waiver_text.trim() !== '') || 
                             (config.team_waivers_content && (config.team_waivers_content?.length ?? 0) > 0));
      if (hasCompliance) {
        steps.push({ id: 'compliance', label: 'Compliance', icon: FileSignature });
      }
      return steps;
    }
  }, [config, isPlayerPipeline, formSchema, isUnder18]);

  const totalSteps = activeSteps.length;
  const currentStepInfo = useMemo(() => activeSteps[step - 1] || activeSteps[0], [activeSteps, step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || isSubmitting) return;
    if ((config.require_default_waiver || config.custom_waiver_text || (config.team_waivers_content && config.team_waivers_content.length > 0)) && (!waiverAgreed || !signature.trim())) {
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

  const nextStep = () => {
    setStep(prev => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="font-bold text-sm uppercase truncate cursor-help" title={undefined}>{event.location || 'TBA'}</p>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg">
                    {event.location}
                  </TooltipContent>
                </Tooltip>
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
        </div>

        <Card className="lg:col-span-7 rounded-[3.5rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5 min-h-[600px] flex flex-col">
          <div className="h-3 bg-primary w-full" />
          
          <div className="p-10 lg:p-12 pb-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-muted p-4 rounded-2xl flex items-center justify-center text-primary">
                <currentStepInfo.icon className="h-7 w-7" />
              </div>
              <div>
                <CardTitle className="text-3xl font-black uppercase tracking-tighter">
                  {currentStepInfo.label}
                </CardTitle>
                <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] mt-1">Step {step} of {totalSteps}</CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                <div key={s} className={cn("h-2 rounded-full transition-all duration-300", step >= s ? "w-8 bg-primary" : "w-4 bg-muted")} />
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
            <CardContent className="p-10 lg:p-12 space-y-10 flex-1">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                  {currentStepInfo.id === 'identity' && (
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Full Name <span className="text-primary">*</span></Label>
                        <Input 
                          placeholder="e.g. Marcus Thompson" 
                          value={answers['fullName'] || ''} 
                          onChange={e => handleInputChange('fullName', e.target.value)} 
                          className="h-14 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all shadow-inner" 
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Email <span className="text-primary">*</span></Label>
                          <Input 
                            type="email"
                            placeholder="player@email.com" 
                            value={answers['email'] || ''} 
                            onChange={e => handleInputChange('email', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" 
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date of Birth <span className="text-primary">*</span></Label>
                          <Input 
                            type="date"
                            value={answers['dateOfBirth'] || ''} 
                            onChange={e => handleInputChange('dateOfBirth', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" 
                            required
                          />
                        </div>
                      </div>
                      {formSchema.filter(f => f.step === 'identity' || !f.step).map(field => (
                        <div key={field.id} className="space-y-3">
                          {field.type === 'header' ? (
                            <div className="pt-6 border-b-2 pb-2 mb-4 text-primary"><h3 className="font-black text-xl uppercase tracking-tighter">{field.label}</h3></div>
                          ) : (
                            <>
                              <div className="flex justify-between items-end px-1"><Label className="text-[10px] font-black uppercase tracking-widest">{field.label} {field.required && <span className="text-primary">*</span>}</Label></div>
                              {field.type === 'short_text' && (
                                <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-lg shadow-inner" />
                              )}
                              {field.type === 'dropdown' && (
                                <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                                  <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select..." /></SelectTrigger>
                                  <SelectContent className="rounded-2xl">
                                    {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold text-[10px] uppercase">{opt}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {currentStepInfo.id === 'details' && (
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Official Team Name <span className="text-primary">*</span></Label>
                        <Input 
                          placeholder="e.g. Phoenix Elite Academy" 
                          value={answers['teamName'] || ''} 
                          onChange={e => handleInputChange('teamName', e.target.value)} 
                          className="h-16 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-xl shadow-inner" 
                          required
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Origin Organization / City</Label>
                        <Input 
                          placeholder="e.g. Chicago, IL" 
                          value={answers['teamOrigin'] || ''} 
                          onChange={e => handleInputChange('teamOrigin', e.target.value)} 
                          className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" 
                        />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Competitive Experience</Label>
                        <Select value={answers['experience'] || ''} onValueChange={v => handleInputChange('experience', v)}>
                          <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select Level..." /></SelectTrigger>
                          <SelectContent className="rounded-2xl">
                            <SelectItem value="Elite" className="font-bold text-[10px] uppercase">Elite / National</SelectItem>
                            <SelectItem value="Advanced" className="font-bold text-[10px] uppercase">Advanced / Regional</SelectItem>
                            <SelectItem value="Intermediate" className="font-bold text-[10px] uppercase">Intermediate</SelectItem>
                            <SelectItem value="Developmental" className="font-bold text-[10px] uppercase">Developmental</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {currentStepInfo.id === 'guardian' && (
                    <div className="space-y-8">
                      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                        <ShieldCheck className="h-6 w-6 text-amber-600" />
                        <p className="text-sm font-bold text-amber-800">Guardian Information Required (Under 18)</p>
                      </div>
                      {formSchema.filter(f => f.step === 'guardian').map(field => (
                        <div key={field.id} className="space-y-3">
                          <div className="flex justify-between items-end px-1"><Label className="text-[10px] font-black uppercase tracking-widest">{field.label} {field.required && <span className="text-primary">*</span>}</Label></div>
                          {field.type === 'short_text' && (
                            <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all shadow-inner" />
                          )}
                          {field.type === 'dropdown' && (
                            <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                              <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent className="rounded-2xl">
                                {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold text-[10px] uppercase">{opt}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {currentStepInfo.id === 'team_code' && (
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Recruit Code <span className="text-primary">*</span></Label>
                        <Input 
                          placeholder="Enter code from coach" 
                          value={answers['teamCode'] || ''} 
                          onChange={e => handleInputChange('teamCode', e.target.value)} 
                          className="h-16 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-xl shadow-inner text-center uppercase tracking-widest" 
                          required
                        />
                      </div>
                      {formSchema.filter(f => f.step === 'team_code').map(field => (
                        <div key={field.id} className="space-y-3">
                          <div className="flex justify-between items-end px-1"><Label className="text-[10px] font-black uppercase tracking-widest">{field.label} {field.required && <span className="text-primary">*</span>}</Label></div>
                          {field.type === 'short_text' && (
                            <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all shadow-inner" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {currentStepInfo.id === 'additional' && (
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Head Coach Full Name <span className="text-primary">*</span></Label>
                        <Input 
                          placeholder="e.g. Marcus Thompson" 
                          value={answers['name'] || ''} 
                          onChange={e => handleInputChange('name', e.target.value)} 
                          className="h-16 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-xl shadow-inner" 
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Direct Email <span className="text-primary">*</span></Label>
                          <Input 
                            type="email"
                            placeholder="coach@team.com" 
                            value={answers['email'] || ''} 
                            onChange={e => handleInputChange('email', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" 
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Cell Phone Number</Label>
                          <Input 
                            type="tel"
                            placeholder="(555) 000-0000" 
                            value={answers['phone'] || ''} 
                            onChange={e => handleInputChange('phone', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" 
                          />
                        </div>
                      </div>
                      {formSchema.filter(f => f.step === 'additional' || !f.step).map(field => (
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
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {currentStepInfo.id === 'compliance' && (
                    <div className="space-y-10">
                      {(config.require_default_waiver || config.custom_waiver_text || (config.team_waivers_content && config.team_waivers_content.length > 0)) ? (
                        <div className="space-y-8">
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

                          {config.team_waivers_content?.map((waiver) => (
                            <div key={waiver.id} className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 ml-1">{waiver.title}</p>
                              <ScrollArea className="h-40 p-5 rounded-2xl bg-rose-50 border-2 border-rose-100 font-medium text-xs leading-relaxed">
                                {waiver.content}
                              </ScrollArea>
                            </div>
                          ))}

                          <div className="flex items-center space-x-4 p-5 bg-primary/5 rounded-[2rem] border-2 border-primary/10 group cursor-pointer transition-all hover:bg-primary/10" onClick={() => setWaiverAgreed(!waiverAgreed)}>
                            <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} className="h-6 w-6 rounded-lg border-2 border-primary" />
                            <Label htmlFor="waiver_agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                              {isPlayerPipeline ? "I verify that I (or my ward) have reviewed and accept the championship protocols and liability terms listed above." : "I verify that our entire squad roster has reviewed and accepts the championship protocols and liability terms listed above."}
                            </Label>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-60">{isPlayerPipeline ? 'Player / Guardian Authorization (Digital Signature)' : 'Coach / Rep Authorization (Digital Signature)'}</Label>
                            <Input placeholder="Type legal name to execute..." value={signature} onChange={e => setSignature(e.target.value)} className="h-16 rounded-2xl border-2 font-mono italic text-center text-2xl bg-muted/5 focus:bg-white shadow-inner" required />
                          </div>
                        </div>
                      ) : (
                        <div className="py-20 text-center space-y-4">
                           <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-4" />
                           <h3 className="text-2xl font-black uppercase tracking-tight">Final Handshake</h3>
                           <p className="text-sm font-medium text-muted-foreground max-w-sm mx-auto">No formal waivers are configured for this series. Proceed to finalize your roster enrollment.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>

            <CardFooter className="p-10 lg:p-12 pt-0 border-t flex gap-4">
              {step > 1 && (
                <Button type="button" variant="outline" className="h-16 px-10 rounded-2xl border-2 font-black uppercase text-xs" onClick={prevStep}>
                  Back
                </Button>
              )}
              {step < totalSteps ? (
                <Button 
                  type="button" 
                  className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" 
                  onClick={nextStep}
                  disabled={isPlayerPipeline ? (step === 1 ? (!answers['fullName'] || !answers['email'] || !answers['dateOfBirth']) : false) : (step === 1 ? !answers['teamName'] : (!answers['name'] || !answers['email']))}
                >
                  Continue Enrollment <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <Button type="submit" className="flex-1 h-16 rounded-2xl text-lg font-black shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-8 w-8 animate-spin" /> : (isPlayerPipeline ? "Complete Player Registration" : "Deploy Roster Enrollment")}
                </Button>
              )}
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
