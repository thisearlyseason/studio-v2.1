
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { LeagueRegistrationConfig, RegistrationFormField, TeamEvent } from '@/components/providers/team-provider';
import { usePublicPortal } from '@/hooks/use-public-portal';
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
import { PortalStatus } from '@/components/public/PortalStatus';

function RegistrationForm() {
  const { teamId, eventId } = useParams();
  const searchParams = useSearchParams();
  const protocolId = searchParams.get('protocol') || 'team_config';
  const portalUrl = teamId && eventId ? `/api/public/portals?kind=tournament-registration&teamId=${encodeURIComponent(teamId as string)}&eventId=${encodeURIComponent(eventId as string)}&protocolId=${encodeURIComponent(protocolId)}` : null;
  const { data: portal, isLoading, error, status, retry } = usePublicPortal<{ config: LeagueRegistrationConfig; event: TeamEvent }>(portalUrl);
  const config = portal?.config || null;
  const event = portal?.event || null;

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const isPlayerPipeline = protocolId === 'player_config';
  const formSchema = useMemo(() => {
    const schema = config?.form_schema || [];
    if (isPlayerPipeline) return schema;
    const builtInIds = new Set(['f_core_sq', 'f_core_co', 'f_core_em', 'f_core_ph']);
    const builtInLabels = [/^team name$/i, /^(authorized contact|head coach).*name$/i, /^email( address)?$/i, /^phone( number)?$/i];
    return schema.filter(field => {
      if (builtInIds.has(field.id)) return false;
      if (field.step && field.step !== 'additional') return true;
      return !builtInLabels.some(pattern => pattern.test(field.label.trim()));
    });
  }, [config?.form_schema, isPlayerPipeline]);
  
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
      const steps = [{ id: 'identity', label: isPlayerPipeline ? 'Athlete Details' : 'Team Details', icon: Target }];
      
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
        steps.push({ id: 'compliance', label: 'Agreements', icon: FileSignature });
      }
      return steps;
    } else {
      const steps = [{ id: 'details', label: 'Team Details', icon: ShieldCheck }];
      if (formSchema.some(f => f.step === 'guardian')) {
        steps.push({ id: 'guardian', label: 'Parent or Guardian', icon: Users });
      }
      if (formSchema.some(f => f.step === 'team_code')) {
        steps.push({ id: 'team_code', label: 'Team Assignment', icon: Zap });
      }
      steps.push({ id: 'additional', label: 'Contact Details', icon: Sparkles });
      
      const hasCompliance = (config.require_default_waiver || 
                             (config.custom_waiver_text && config.custom_waiver_text.trim() !== '') || 
                             (config.team_waivers_content && (config.team_waivers_content?.length ?? 0) > 0));
      if (hasCompliance) {
        steps.push({ id: 'compliance', label: 'Agreements', icon: FileSignature });
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
      toast({ title: "Signature Required", description: "Accept and sign the required agreements before submitting.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/public/portals/action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'tournament', action: 'register', teamId, eventId, protocolId: config.id, answers, formVersion: config.form_version || 0, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Submission failed.');
      setIsSuccess(true);
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : 'Please review the form and try again.',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (id: string, value: any) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const isMissingRequiredValue = (field: RegistrationFormField) => {
    if (!field.required || ['header', 'information_box'].includes(field.type)) return false;
    const value = answers[field.id];
    if (field.type === 'checkbox') return Array.isArray(value) ? value.length === 0 : value !== true;
    return value == null || value === '';
  };

  const renderFormField = (field: RegistrationFormField) => {
    if (field.type === 'header') {
      return <div key={field.id} className="pt-6 border-b-2 pb-2 mb-4 text-primary"><h3 className="font-black text-xl uppercase tracking-tighter">{field.label}</h3></div>;
    }
    if (field.type === 'information_box') {
      return (
        <div key={field.id} className="flex items-start gap-4 p-6 bg-blue-50 rounded-[2rem] border-2 border-blue-100 my-4">
          <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600 shrink-0 mt-0.5"><Info className="h-5 w-5" /></div>
          <div className="space-y-1">
            <p className="font-black text-sm uppercase tracking-widest text-blue-900">{field.label}</p>
            {field.infoContent && <p className="text-sm font-medium text-blue-700 leading-relaxed">{field.infoContent}</p>}
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="space-y-3">
        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">
          {field.label} {field.required && <span className="text-primary">*</span>}
        </Label>
        {field.type === 'short_text' && (
          <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" />
        )}
        {field.type === 'long_text' && (
          <Textarea required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="rounded-2xl min-h-[120px] border-2 font-medium bg-muted/5 focus:bg-white transition-all p-5 shadow-inner" />
        )}
        {field.type === 'dropdown' && (
          <Select required={field.required} value={answers[field.id] || ''} onValueChange={value => handleInputChange(field.id, value)}>
            <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-muted/5 shadow-inner"><SelectValue placeholder="Select an option..." /></SelectTrigger>
            <SelectContent className="rounded-2xl">
              {field.options?.map(option => <SelectItem key={option} value={option} className="font-bold">{option}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {field.type === 'radio' && (
          <RadioGroup required={field.required} value={answers[field.id] || ''} onValueChange={value => handleInputChange(field.id, value)} className="flex flex-col gap-3 py-2">
            {field.options?.map(option => (
              <div key={option} className="flex items-center space-x-3 bg-muted/5 p-4 rounded-2xl border-2">
                <RadioGroupItem value={option} id={`${field.id}_${option}`} />
                <Label htmlFor={`${field.id}_${option}`} className="font-bold cursor-pointer flex-1">{option}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {field.type === 'checkbox' && (
          <div className="flex flex-col gap-3 py-2">
            {field.options?.map(option => (
              <div key={option} className="flex items-center space-x-3 bg-muted/5 p-4 rounded-2xl border-2">
                <Checkbox
                  id={`${field.id}_${option}`}
                  checked={(Array.isArray(answers[field.id]) ? answers[field.id] : []).includes(option)}
                  onCheckedChange={checked => {
                    const current = Array.isArray(answers[field.id]) ? answers[field.id] : [];
                    handleInputChange(field.id, checked ? [...current, option] : current.filter((item: string) => item !== option));
                  }}
                />
                <Label htmlFor={`${field.id}_${option}`} className="font-bold cursor-pointer flex-1">{option}</Label>
              </div>
            ))}
          </div>
        )}
        {field.type === 'signature' && (
          <div className="relative">
            <Signature className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} placeholder="Type the signer's full legal name" className="h-14 rounded-2xl border-2 pl-12 font-bold bg-muted/5 focus:bg-white transition-all shadow-inner" />
          </div>
        )}
      </div>
    );
  };

  const validateCurrentStep = () => {
    const stepId = currentStepInfo?.id;
    const configuredFields = formSchema.filter(field => {
      if (stepId === 'details') return field.step === 'identity';
      if (stepId === 'identity') return field.step === 'identity' || !field.step;
      if (stepId === 'additional') return field.step === 'additional' || !field.step;
      return field.step === stepId;
    });
    const missingConfiguredField = configuredFields.some(isMissingRequiredValue);
    const missingCoreField = stepId === 'identity'
      ? !answers.fullName || !answers.email || !answers.dateOfBirth
      : stepId === 'details'
        ? !answers.teamName
        : stepId === 'additional' && !isPlayerPipeline
          ? !answers.name || !answers.email
          : stepId === 'team_code'
            ? isPlayerPipeline && !answers.teamCode
            : false;

    if (missingCoreField || missingConfiguredField) {
      toast({ title: 'Complete Required Fields', description: 'Fill in every field marked with an asterisk before continuing.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (!validateCurrentStep()) return;
    setStep(prev => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Loading registration form...</p>
      </div>
    );
  }

  if (!config || !config.is_active || !event) return <PortalStatus status={status ?? (portal ? 404 : null)} message={error} onRetry={retry} title={status === 404 || portal ? 'Registration Closed' : undefined} />;

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center text-foreground">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-xl w-full p-12 rounded-[3.5rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-10">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-4xl font-black uppercase tracking-tighter">Registration Submitted</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[11px] mt-2 mb-10">Your response was received for {event?.title}</p>
          
          <div className="bg-primary p-8 rounded-[2rem] text-left text-white space-y-4 shadow-xl">
            <div className="flex items-center gap-2"><Info className="h-5 w-5 opacity-50" /><p className="text-[10px] font-black uppercase tracking-wide">Action Required</p></div>
            <p className="text-sm font-bold leading-relaxed">
              To manage your team throughout the tournament, open a free account for roster updates and real-time access to the live bracket.
            </p>
            <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-xs" onClick={() => window.location.href='/signup'}>Open Free Account</Button>
          </div>

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
              <span>Tournament Registration</span>
            </div>
          </div>

          <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border-2 border-white shadow-xl space-y-4">
            <h3 className="font-black text-xs uppercase tracking-widest text-primary mb-2">Tournament Details</h3>
            <p className="text-sm font-medium leading-relaxed text-foreground/80">{event.description || 'Tournament details will be provided by the organizer.'}</p>
            
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
                  <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Organizer Contact</p>
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
            <div className="flex items-center gap-3"><div className="bg-primary p-2.5 rounded-2xl text-white shadow-lg"><Wallet className="h-5 w-5" /></div><h4 className="text-xl font-black uppercase tracking-tight text-foreground">Tournament Entry Fee</h4></div>
            {config.registration_cost && parseFloat(config.registration_cost) > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-primary">${config.registration_cost}</span>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Per registration</span>
              </div>
            ) : (
              <p className="text-sm font-black text-green-600 uppercase tracking-widest">✓ NO FEE — Free Entry</p>
            )}
            <div className="pt-4 border-t border-primary/10 space-y-4">
              <div className="bg-white p-5 rounded-[2rem] text-[11px] font-medium leading-relaxed border border-primary/5 text-foreground/80 shadow-inner whitespace-pre-wrap">
                {event?.paymentInstructions || config.offline_payment_instructions || 'Tournament entry fees are processed offline. Contact the tournament organizer for payment instructions.'}
              </div>
              <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border-2 border-amber-200">
                <div className="bg-amber-100 p-2 rounded-xl"><Sparkles className="h-4 w-4 text-amber-600" /></div>
                <p className="text-[10px] font-black uppercase text-amber-700 tracking-tight leading-tight">Online payment is not yet available</p>
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
                      {formSchema.filter(f => f.step === 'identity' || !f.step).map(renderFormField)}
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
                      {formSchema.filter(f => f.step === 'identity').map(renderFormField)}
                    </div>
                  )}

                  {currentStepInfo.id === 'guardian' && (
                    <div className="space-y-8">
                      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                        <ShieldCheck className="h-6 w-6 text-amber-600" />
                        <p className="text-sm font-bold text-amber-800">
                          {isPlayerPipeline ? 'Guardian Information Required (Under 18)' : 'Parent or Guardian Information'}
                        </p>
                      </div>
                      {formSchema.filter(f => f.step === 'guardian').map(renderFormField)}
                    </div>
                  )}

                  {currentStepInfo.id === 'team_code' && (
                    <div className="space-y-8">
                      {isPlayerPipeline && (
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Code <span className="text-primary">*</span></Label>
                          <Input
                            placeholder="Enter code from coach"
                            value={answers['teamCode'] || ''}
                            onChange={e => handleInputChange('teamCode', e.target.value)}
                            className="h-16 rounded-2xl border-2 font-black bg-muted/5 focus:bg-white transition-all text-xl shadow-inner text-center uppercase tracking-widest"
                            required
                          />
                        </div>
                      )}
                      {formSchema.filter(f => f.step === 'team_code').map(renderFormField)}
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
                      {formSchema.filter(f => f.step === 'additional' || !f.step).map(renderFormField)}
                    </div>
                  )}

                  {currentStepInfo.id === 'compliance' && (
                    <div className="space-y-10">
                      {(config.require_default_waiver || config.custom_waiver_text || (config.team_waivers_content && config.team_waivers_content.length > 0)) ? (
                        <div className="space-y-8">
                          <div className="flex items-center gap-3"><FileSignature className="h-6 w-6 text-primary" /><h4 className="text-xl font-black uppercase tracking-tighter">Required Agreements</h4></div>
                           
                          {config.require_default_waiver && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Standard Liability Waiver</p>
                              <ScrollArea className="h-40 p-5 rounded-2xl bg-muted/10 border-2 font-medium text-xs leading-relaxed">
                                {config.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this tournament. I waive, release, and discharge the organization, its directors, host facilities, and affiliated sponsors from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'}
                              </ScrollArea>
                            </div>
                          )}

                          {config.custom_waiver_text && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Organization-Specific Agreement</p>
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
                              {isPlayerPipeline ? "I confirm that I (or the athlete in my care) have reviewed and accept the tournament rules and liability terms above." : "I confirm that our team has reviewed and accepts the tournament rules and liability terms above."}
                            </Label>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-60">{isPlayerPipeline ? 'Athlete or Guardian Signature' : 'Coach or Team Representative Signature'}</Label>
                            <Input placeholder="Type legal name to execute..." value={signature} onChange={e => setSignature(e.target.value)} className="h-16 rounded-2xl border-2 font-mono italic text-center text-2xl bg-muted/5 focus:bg-white shadow-inner" required />
                          </div>
                        </div>
                      ) : (
                        <div className="py-20 text-center space-y-4">
                           <ShieldCheck className="h-16 w-16 text-primary mx-auto mb-4" />
                           <h3 className="text-2xl font-black uppercase tracking-tight">Final Handshake</h3>
                           <p className="text-sm font-medium text-muted-foreground max-w-sm mx-auto">No waivers are required for this registration.</p>
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
                  Continue Registration <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <Button type="submit" className="flex-1 h-16 rounded-2xl text-lg font-black shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-8 w-8 animate-spin" /> : "Submit Registration"}
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
