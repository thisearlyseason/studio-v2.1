"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationFormField } from '@/components/providers/team-provider';
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
  CreditCard,
  Info,
  Clock,
  ArrowRight,
  XCircle,
  Plus,
  DollarSign,
  Signature,
  FileSignature,
  Download,
  ExternalLink,
  Target,
  UserCheck,
  Zap,
  Globe,
  Wallet,
  Sparkles,
  ArrowLeft,
  Search,
  Check
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

function RegistrationForm() {
  const { leagueId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const protocolId = searchParams.get('protocol') || 'player_config';
  const { submitRegistrationEntry, getTeamByCode } = useTeam();
  const db = useFirestore();

  const configRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string, 'registration', protocolId) : null, [db, leagueId, protocolId]);
  const leagueRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);
  const { data: league, isLoading: isLeagueLoading } = useDoc<any>(leagueRef);

  const isLoading = isConfigLoading || isLeagueLoading;

  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const [teamCode, setTeamCode] = useState('');
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatedTeam, setValidatedTeam] = useState<any>(null);

  const formSchema = config?.form_schema || [];

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

  const totalSteps = useMemo(() => {
    let steps = 1; // Identity
    if (formSchema.some(f => f.step === 'guardian') && isUnder18) steps++; // Guardian
    steps++; // Team Code
    steps++; // Compliance
    return steps;
  }, [formSchema, isUnder18]);

  const currentStepInfo = useMemo(() => {
    let stepNum = 1;
    if (currentStep === stepNum++) return { label: 'Identity', icon: Users };
    if (formSchema.some(f => f.step === 'guardian') && isUnder18 && currentStep === stepNum++) return { label: 'Guardian', icon: ShieldCheck };
    if (currentStep === stepNum++) return { label: 'Team Code', icon: Zap };
    return { label: 'Compliance', icon: FileSignature };
  }, [currentStep, formSchema, isUnder18]);

  const stepFields = useMemo(() => {
    if (currentStep === 1) {
      return formSchema.filter(f => f.step === 'identity' || !f.step);
    }
    if (currentStep === 2 && isUnder18 && formSchema.some(f => f.step === 'guardian')) {
      return formSchema.filter(f => f.step === 'guardian');
    }
    return [];
  }, [formSchema, currentStep, isUnder18]);

  useEffect(() => {
    if (!teamCode || teamCode.length < 3) {
      setValidatedTeam(null);
      return;
    }
    const timer = setTimeout(async () => {
      setValidatingCode(true);
      try {
        const team = await getTeamByCode(teamCode, leagueId as string);
        setValidatedTeam(team);
      } catch (err) {
        console.error(err);
      } finally {
        setValidatingCode(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [teamCode, getTeamByCode]);

  const steps = [
    { id: 1, name: 'Identity', icon: Users },
    { id: 2, name: 'Guardian', icon: ShieldCheck },
    { id: 3, name: 'Team Code', icon: Zap },
    { id: 4, name: 'Compliance', icon: FileSignature }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || isSubmitting) return;

    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
      return;
    }

    if ((config.require_default_waiver || config.custom_waiver_text) && (!waiverAgreed || !signature.trim())) {
      toast({ title: "Compliance Required", description: "Please sign the required documentation.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const finalAnswers = {
        ...answers,
        recruiter_code: teamCode,
        team_name: validatedTeam?.name || validatedTeam?.teamName || null,
        team_id: validatedTeam?.id || null
      };
      await submitRegistrationEntry(leagueId as string, config.id, finalAnswers, config.form_version || 0, signature, 'leagues');
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Connecting to Hub...</p>
      </div>
    );
  }

  if (league?.is_active === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center space-y-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full border-none shadow-2xl rounded-[2.5rem] bg-white p-12 space-y-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-orange-600" />
          <div className="flex justify-center"><AlertCircle className="h-16 w-16 text-orange-600 mb-2" /></div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-black">Registration Closed</h2>
            <p className="text-sm text-muted-foreground font-medium italic">This recruitment portal has been deactivated by the league administration.</p>
          </div>
          <Button className="w-full h-14 rounded-2xl font-black uppercase text-xs" onClick={() => router.push('/')}>Return to Hub</Button>
        </Card>
      </div>
    );
  }
  
  if (!config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full border-none shadow-2xl rounded-[2.5rem] bg-white p-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-black uppercase text-black">Portal not found</h2>
          <Button className="mt-6 w-full h-12 rounded-xl" onClick={() => router.push('/')}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 text-center text-foreground">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-lg w-full p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Entry Dispatched</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Application Successfully Archived</p>
          
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Status Update</p>
            <p className="text-sm font-bold mt-1 leading-relaxed">
              {config?.confirmation_message || "Your application is currently in the recruitment pool. A league coordinator will review your data and dispatch assignments shortly."}
            </p>
          </div>

          <Button variant="ghost" className="mt-10 font-black uppercase text-xs" onClick={() => window.location.reload()}>Submit Another</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6 text-foreground">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left Info Panel */}
        <div className="lg:col-span-4 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-4">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Recruitment Hub</Badge>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-[0.9]">{config.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Enrollment pipeline</p>
          </div>

          {/* Progress Tracker */}
          <div className="space-y-6">
            <div className="flex justify-between items-end px-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black">Progression</p>
              <p className="text-[10px] font-black text-primary uppercase">{currentStep} / {steps.length}</p>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isCompleted = currentStep > step.id;
                const isActive = currentStep === step.id;
                
                return (
                  <div key={step.id} className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 border-2",
                    isActive ? "bg-white border-primary shadow-lg scale-[1.02]" : 
                    isCompleted ? "bg-green-50 border-green-200" : "bg-white/40 border-transparent opacity-60"
                  )}>
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                      isActive ? "bg-primary text-white" : 
                      isCompleted ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                    )}>
                      {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-tight",
                        isActive ? "text-primary" : isCompleted ? "text-green-700" : "text-muted-foreground"
                      )}>Step {step.id}</p>
                      <p className="text-sm font-bold uppercase tracking-tight">{step.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-2">
             <div className="flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Protocol Support</p>
             </div>
             <p className="text-[11px] font-medium leading-relaxed text-foreground/70">
                Data provided via this portal is encrypted and routed directly to the league administration database.
             </p>
          </div>
        </div>

        {/* Right Form Panel */}
        <Card className="lg:col-span-8 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5 min-h-[600px] flex flex-col">
          <div className="h-2 bg-primary w-full" />
          
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="space-y-1">
                <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[8px] tracking-widest">
                  {currentStepInfo.label} Phase
                </Badge>
                <CardTitle className="text-3xl font-black uppercase tracking-tight">
                  {currentStep === 1 && "Identity Verification"}
                  {currentStep === 2 && isUnder18 && "Guardian Validation"}
                  {currentStep === 2 && !isUnder18 && "Identity Complete"}
                  {currentStep === 3 && "Team Affiliation"}
                  {currentStep === 4 && "Final Compliance"}
                </CardTitle>
                <CardDescription className="text-xs font-semibold">
                  {currentStep === 1 && "Start your enrollment by providing basic participant data."}
                  {currentStep === 2 && isUnder18 && "Required documentation for underage athlete participation."}
                  {currentStep === 2 && !isUnder18 && "You are over 18, guardian information not required."}
                  {currentStep === 3 && "If you were recruited by a team, enter their code here."}
                  {currentStep === 4 && "Review legal terms and provide digital signature."}
                </CardDescription>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 flex-1">
              {/* Step 1: Identity */}
              {currentStep === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest">Full Name <span className="text-primary">*</span></Label>
                      <Input 
                        required
                        placeholder="e.g. Marcus Thompson" 
                        value={answers['fullName'] || ''} 
                        onChange={e => handleInputChange('fullName', e.target.value)} 
                        className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest">Email <span className="text-primary">*</span></Label>
                      <Input 
                        required
                        type="email"
                        placeholder="player@email.com" 
                        value={answers['email'] || ''} 
                        onChange={e => handleInputChange('email', e.target.value)} 
                        className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Date of Birth <span className="text-primary">*</span></Label>
                    <Input 
                      required
                      type="date"
                      value={answers['dateOfBirth'] || ''} 
                      onChange={e => handleInputChange('dateOfBirth', e.target.value)} 
                      className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                    />
                    {answers['dateOfBirth'] && (
                      <p className={cn("text-[10px] font-black uppercase tracking-widest mt-2", isUnder18 ? "text-amber-600" : "text-green-600")}>
                        {isUnder18 ? "Guardian information will be required (Under 18)" : "No guardian required (18 or older)"}
                      </p>
                    )}
                  </div>
                  {stepFields.map(field => (
                    <div key={field.id} className="space-y-3">
                      {field.type === 'header' ? (
                        <div className="pt-4 border-b pb-2"><h3 className="font-black text-lg uppercase tracking-tight">{field.label}</h3></div>
                      ) : (
                        <>
                          <div className="flex justify-between items-end px-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest">
                              {field.label} {field.required && <span className="text-primary">*</span>}
                            </Label>
                          </div>
                          {field.type === 'short_text' && (
                            <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" />
                          )}
                          {field.type === 'dropdown' && (
                            <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                              <SelectTrigger className="h-14 rounded-2xl border-2 font-bold bg-muted/5"><SelectValue placeholder="Select choice..." /></SelectTrigger>
                              <SelectContent className="rounded-xl">
                                {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold">{opt}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Step 2: Guardian (if under 18) */}
              {currentStep === 2 && isUnder18 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                    <ShieldCheck className="h-6 w-6 text-amber-600" />
                    <p className="text-sm font-bold text-amber-800">Guardian Information Required (Under 18)</p>
                  </div>
                  {stepFields.map(field => (
                    <div key={field.id} className="space-y-3">
                      <div className="flex justify-between items-end px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest">
                          {field.label} {field.required && <span className="text-primary">*</span>}
                        </Label>
                      </div>
                      {field.type === 'short_text' && (
                        <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" />
                      )}
                      {field.type === 'dropdown' && (
                        <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                          <SelectTrigger className="h-14 rounded-2xl border-2 font-bold bg-muted/5"><SelectValue placeholder="Select choice..." /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold">{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                  {stepFields.length === 0 && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Guardian Full Name <span className="text-primary">*</span></Label>
                        <Input 
                          required
                          placeholder="e.g. Sarah Thompson" 
                          value={answers['guardianName'] || ''} 
                          onChange={e => handleInputChange('guardianName', e.target.value)} 
                          className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest">Guardian Email <span className="text-primary">*</span></Label>
                          <Input 
                            required
                            type="email"
                            placeholder="guardian@email.com" 
                            value={answers['guardianEmail'] || ''} 
                            onChange={e => handleInputChange('guardianEmail', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest">Guardian Phone</Label>
                          <Input 
                            type="tel"
                            placeholder="(555) 000-0000" 
                            value={answers['guardianPhone'] || ''} 
                            onChange={e => handleInputChange('guardianPhone', e.target.value)} 
                            className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && !isUnder18 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <ShieldCheck className="h-16 w-16 text-green-600" />
                  <p className="text-xl font-black uppercase tracking-tight text-green-700">Guardian Not Required</p>
                  <p className="text-sm font-medium text-muted-foreground">You are 18 or older and do not need guardian information.</p>
                </div>
              )}

              {/* Step 3: Team Code Identification */}
              {currentStep === 3 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-primary/10 space-y-6">
                    <div className="space-y-2">
                       <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-primary ml-1">Team Identification Code</Label>
                       <div className="relative">
                          <Input 
                            placeholder="e.g. TGR-24" 
                            value={teamCode} 
                            onChange={e => setTeamCode(e.target.value.toUpperCase())}
                            className="h-20 text-3xl font-black tracking-widest uppercase transition-all border-none bg-white rounded-3xl shadow-xl pl-16 focus:ring-4 focus:ring-primary/20" 
                          />
                          <div className="absolute left-6 top-1/2 -translate-y-1/2">
                            {validatingCode ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Search className="h-6 w-6 text-muted-foreground/30" />}
                          </div>
                       </div>
                       <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-3 ml-2">Provided by your coach or team representative.</p>
                    </div>

                    {validatedTeam ? (
                      <div className="bg-green-600 p-6 rounded-3xl text-white flex items-center gap-6 animate-in zoom-in-95 duration-500 shadow-xl shadow-green-600/20">
                        <div className="h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                           <CheckCircle2 className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Roster Inclusion Verified</p>
                          <h4 className="text-2xl font-black uppercase leading-tight">{validatedTeam.name || validatedTeam.teamName}</h4>
                          <p className="text-xs font-bold mt-1 opacity-70">Coach {validatedTeam.coachName || 'Verified Representative'}</p>
                        </div>
                      </div>
                    ) : teamCode.length >= 3 && !validatingCode ? (
                      <div className="bg-destructive/10 p-6 rounded-3xl text-destructive flex items-center gap-4 border-2 border-destructive/20 animate-in shake duration-500">
                        <AlertCircle className="h-6 w-6 shrink-0" />
                        <p className="text-sm font-black uppercase tracking-tight italic">Invalid Identification Code</p>
                      </div>
                    ) : (
                      <div className="p-12 border-4 border-dashed border-black/5 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4">
                        <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center">
                          <Globe className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-black uppercase tracking-tight">Independent Registration?</p>
                          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed px-10">If you are not affiliated with a specific team, you can skip this step to enter the general recruiting pool.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Compliance & Signature */}
              {currentStep === 4 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                   {(config.require_default_waiver || config.custom_waiver_text) && (
                    <div className="space-y-6">
                      {config.require_default_waiver && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-primary">
                            <ShieldCheck className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Institutional Liability Waiver</p>
                          </div>
                          <ScrollArea className="h-48 p-6 rounded-[2rem] bg-muted/5 border-2 border-black/5 font-medium text-xs leading-relaxed text-foreground/80">
                            {config.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this program. I waive, release, and discharge the organization, its directors, coaches, and facility providers from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'}
                          </ScrollArea>
                        </div>
                      )}

                      {config.custom_waiver_text && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-primary">
                            <FileSignature className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Organization specific Agreement</p>
                          </div>
                          <ScrollArea className="h-48 p-6 rounded-[2rem] bg-primary/5 border-2 border-primary/10 font-medium text-xs leading-relaxed text-primary/80">
                            {config.custom_waiver_text}
                          </ScrollArea>
                        </div>
                      )}

                      <div className="flex items-center space-x-3 p-6 bg-primary/5 rounded-3xl border-2 border-primary/20 group cursor-pointer transition-all hover:bg-white" onClick={() => setWaiverAgreed(!waiverAgreed)}>
                        <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} className="h-6 w-6 rounded-lg" />
                        <Label htmlFor="waiver_agree" className="text-xs font-black uppercase tracking-tight cursor-pointer leading-tight flex-1">
                          I verify that I have read and accept all participation terms and agreements listed above.
                        </Label>
                      </div>

                      <div className="space-y-3 pt-4">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Digital Signature Authentication</Label>
                        <div className="relative">
                           <Input 
                             placeholder="Full Legal Name" 
                             value={signature} 
                             onChange={e => setSignature(e.target.value)} 
                             className="h-20 rounded-[2rem] border-2 font-mono italic text-center text-3xl bg-muted/5 shadow-inner focus:ring-4 focus:ring-primary/10" 
                             required 
                           />
                           <Signature className="absolute right-6 top-1/2 -translate-y-1/2 h-8 w-8 opacity-20" />
                        </div>
                        <p className="text-[8px] font-black uppercase text-center opacity-40 py-2 tracking-[0.3em]">Protocol Handshake v{config.form_version || 1.0}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>

            <CardFooter className="p-8 lg:p-10 flex gap-4 pt-0">
               {currentStep > 1 && (
                 <Button 
                   type="button" 
                   variant="outline" 
                   onClick={() => setCurrentStep(prev => prev - 1)}
                   className="h-16 px-8 rounded-2xl font-black uppercase text-xs"
                 >
                   <ArrowLeft className="h-4 w-4 mr-2" /> Back
                 </Button>
               )}
              <Button type="submit" className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" disabled={isSubmitting || (currentStep === 3 && !!teamCode && !validatedTeam && !validatingCode) || (currentStep === 1 && (!answers['fullName'] || !answers['email'] || !answers['dateOfBirth']))}>
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : 
                 currentStep === totalSteps ? "Dispatch Enrollment" : "Continue to " + currentStepInfo.label}
                 {currentStep < totalSteps && <ArrowRight className="h-5 w-5 ml-2" />}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function PublicLeagueRegistrationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <RegistrationForm />
    </Suspense>
  );
}
