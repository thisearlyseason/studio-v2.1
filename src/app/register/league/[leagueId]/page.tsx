"use client";

import React, { useState, useMemo, useEffect, Suspense, useCallback } from 'react';
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
  Check,
  Activity,
  MapPin,
  Lock,
  ChevronRight
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

const REQUIRED_STEPS = [
  { id: 'identity', name: 'Identity', icon: Users, label: 'Identity' },
  { id: 'contact', name: 'Contact', icon: MapPin, label: 'Contact' },
  { id: 'medical', name: 'Medical', icon: Activity, label: 'Medical' },
  { id: 'guardian', name: 'Guardian', icon: ShieldCheck, label: 'Guardian' },
  { id: 'team_code', name: 'Team Code', icon: Zap, label: 'Team Code' },
  { id: 'compliance', name: 'Compliance', icon: FileSignature, label: 'Compliance' }
];

function RegistrationForm() {

  const { leagueId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const protocolId = searchParams.get('protocol') || 'player_config';
  const { submitRegistrationEntry, getTeamByCode, db } = useTeam();

  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const [teamCode, setTeamCode] = useState('');
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatedTeam, setValidatedTeam] = useState<any>(null);

  const configRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string, 'registration', protocolId) : null, [db, leagueId, protocolId]);
  const leagueRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);
  const { data: league, isLoading: isLeagueLoading } = useDoc<any>(leagueRef);

  const isLoading = isConfigLoading || isLeagueLoading;

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

  const activeSteps = useMemo(() => {
    // Standard 6-step flow for league registration
    return [...REQUIRED_STEPS];
  }, []);

  const totalSteps = activeSteps.length;

  const currentStepInfo = useMemo(() => {
    return activeSteps[currentStep - 1] || activeSteps[0];
  }, [activeSteps, currentStep]);

  const stepFields = useMemo(() => {
    const stepId = activeSteps[currentStep - 1]?.id;
    if (!stepId) return [];

    // Helper to intelligently suggest a step for uncategorized fields
    const getSuggestedStep = (field: RegistrationFormField) => {
      const label = (field.label || '').toLowerCase();
      const id = (field.id || '').toLowerCase();
      
      if (label.includes('phone') || label.includes('address') || label.includes('city') || label.includes('zip') || label.includes('state') || label.includes('contact')) return 'contact';
      if (label.includes('medical') || label.includes('allergy') || label.includes('condition') || label.includes('health') || label.includes('insurance') || id.includes('med')) return 'medical';
      if (label.includes('waiver') || label.includes('agreement') || label.includes('signature') || label.includes('policy')) return 'compliance';
      if (label.includes('identity') || label.includes('name') || label.includes('email') || label.includes('dob') || label.includes('birth')) return 'identity';
      
      return 'identity'; // Fallback
    };

    return formSchema.filter(f => {
      const assignedStep = f.step || getSuggestedStep(f);
      return assignedStep === stepId;
    });
  }, [formSchema, activeSteps, currentStep]);

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
  }, [teamCode, getTeamByCode, leagueId]);

  const handleInputChange = useCallback((id: string, value: any) => {
    setAnswers(prev => {
      if (prev[id] === value) return prev;
      return { ...prev, [id]: value };
    });
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || isSubmitting) return;

    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
      return;
    }

    if ((config.require_default_waiver || config.custom_waiver_text || (config.team_waivers_content && config.team_waivers_content.length > 0)) && (!waiverAgreed || !signature.trim())) {
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
        <div className="lg:col-span-4 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-4">
            <div><Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3">Portals</Badge><h1 className="text-3xl font-black uppercase tracking-tight mt-1">{config?.title || "League Registration"}</h1></div>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official {config?.type || "Enrollment"} pipeline</p>
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-end px-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black">Progression</p>
              <p className="text-[10px] font-black text-primary uppercase">{currentStep} / {totalSteps}</p>
            </div>
            <div className="space-y-3">
              {activeSteps.map((step, idx) => {
                const Icon = step.icon;
                const stepNumber = idx + 1;
                const isCompleted = currentStep > stepNumber;
                const isActive = currentStep === stepNumber;
                
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
                      )}>Step {stepNumber}</p>
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

        <Card className="lg:col-span-8 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5 min-h-[600px] flex flex-col">
          <div className="h-2 bg-primary w-full" />
          
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="space-y-1">
                <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[8px] tracking-widest">
                  {currentStepInfo.label} Phase
                </Badge>
                <CardTitle className="text-3xl font-black uppercase tracking-tight">
                  {currentStepInfo.name} Verification
                </CardTitle>
                <CardDescription className="text-xs font-semibold">
                  {activeSteps[currentStep-1]?.id === 'identity' && "Start your enrollment by providing basic participant data."}
                  {activeSteps[currentStep-1]?.id === 'contact' && "Provide primary contact and deployment address info."}
                  {activeSteps[currentStep-1]?.id === 'medical' && "Verified health clearances and emergency medical data."}
                  {activeSteps[currentStep-1]?.id === 'guardian' && "Guardian authorization is mandatory for minor participants."}
                  {activeSteps[currentStep-1]?.id === 'team_code' && "Enter your squad's recruitment code to auto-assign rosters."}
                  {activeSteps[currentStep-1]?.id === 'compliance' && "Finalize your institutional agreements and waivers."}
                </CardDescription>

              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 flex-1">
              {/* Standard Fields Rendering */}
              {activeSteps[currentStep - 1]?.id !== 'guardian' && activeSteps[currentStep - 1]?.id !== 'team_code' && activeSteps[currentStep - 1]?.id !== 'compliance' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  {activeSteps[currentStep - 1]?.id === 'identity' && (
                    <div className="space-y-3">
                      {(answers['dateOfBirth'] || answers['dob']) ? (
                        <div className={cn(
                          "flex items-center gap-2 p-3 rounded-xl border-2 animate-in fade-in slide-in-from-top-1 duration-300",
                          isUnder18 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-800"
                        )}>
                          {isUnder18 ? <ShieldCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          <p className="text-[10px] font-black uppercase tracking-widest">
                            {isUnder18 ? "Guardian Authorization Required (Minor)" : "Adult Participant - Self-Authorization Enabled"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}
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
                            <Input 
                              required={field.required} 
                              value={answers[field.id] || ''} 
                              onChange={e => handleInputChange(field.id, e.target.value)} 
                              className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                            />
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

                  {/* Fallback Core Fields for Contact and Medical if schema is sparse */}
                  {activeSteps[currentStep - 1]?.id === 'contact' && stepFields.length === 0 && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Primary Contact Phone <span className="text-primary">*</span></Label>
                        <Input 
                          required
                          placeholder="(555) 000-0000" 
                          value={answers['primary_phone'] || ''} 
                          onChange={e => setAnswers(p => ({ ...p, primary_phone: e.target.value }))}
                          className="h-14 rounded-2xl border-2 font-bold bg-muted/5" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Current Residence Address</Label>
                        <Input 
                          placeholder="Street, City, State, Zip" 
                          value={answers['residence_address'] || ''} 
                          onChange={e => setAnswers(p => ({ ...p, residence_address: e.target.value }))}
                          className="h-14 rounded-2xl border-2 font-bold bg-muted/5" 
                        />
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep - 1]?.id === 'medical' && stepFields.length === 0 && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Allergies or Medical Conditions</Label>
                        <Textarea 
                          placeholder="e.g. Asthma, Penicillin allergy... (Enter 'None' if applicable)" 
                          value={answers['medical_notes'] || ''} 
                          onChange={e => setAnswers(p => ({ ...p, medical_notes: e.target.value }))}
                          className="min-h-[120px] rounded-2xl border-2 font-bold bg-muted/5 resize-none p-4" 
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Guardian */}
              {activeSteps[currentStep - 1]?.id === 'guardian' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  {isUnder18 ? (
                    <>
                      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                        <ShieldCheck className="h-6 w-6 text-amber-600" />
                        <div>
                          <p className="text-sm font-bold text-amber-800 uppercase tracking-tight">Guardian Authorization Required</p>
                          <p className="text-[10px] font-medium text-amber-600 uppercase tracking-widest">Participant is under 18 years of age</p>
                        </div>
                      </div>
                      
                      {stepFields
                        .filter(field => {
                          // Prevent duplication of hardcoded guardian fields
                          const id = field.id.toLowerCase();
                          const label = field.label.toLowerCase();
                          return !id.includes('guardian_name') && !id.includes('guardian_email') && 
                                 !id.includes('guardian_phone') && !id.includes('guardian_relationship') &&
                                 !label.includes('guardian full name') && !label.includes('guardian phone') &&
                                 !label.includes('guardian email');
                        })
                        .map(field => (
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

                      <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Full Name <span className="text-primary">*</span></Label>
                            <Input 
                              required
                              placeholder="e.g. Sarah Thompson" 
                              value={answers['guardian_name'] || ''} 
                              onChange={e => setAnswers(p => ({ ...p, guardian_name: e.target.value }))}
                              className="h-14 rounded-2xl border-2 font-bold bg-muted/5 focus:bg-white transition-all shadow-sm" 
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Email <span className="text-primary">*</span></Label>
                            <Input 
                              type="email"
                              required
                              placeholder="guardian@email.com" 
                              value={answers['guardian_email'] || ''} 
                              onChange={e => setAnswers(p => ({ ...p, guardian_email: e.target.value }))}
                              className="h-14 rounded-2xl border-2 font-bold bg-muted/5 shadow-sm" 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Phone <span className="text-primary">*</span></Label>
                            <Input 
                              required
                              placeholder="(555) 000-0000" 
                              value={answers['guardian_phone'] || ''} 
                              onChange={e => setAnswers(p => ({ ...p, guardian_phone: e.target.value }))}
                              className="h-14 rounded-2xl border-2 font-bold bg-muted/5 shadow-sm" 
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Relationship to Player <span className="text-primary">*</span></Label>
                          <Select 
                            required 
                            value={answers['guardian_relationship'] || ''} 
                            onValueChange={v => setAnswers(p => ({ ...p, guardian_relationship: v }))}
                          >
                            <SelectTrigger className="h-14 rounded-2xl border-2 font-bold bg-muted/5">
                              <SelectValue placeholder="Select Relationship..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="Father" className="font-bold">Father</SelectItem>
                              <SelectItem value="Mother" className="font-bold">Mother</SelectItem>
                              <SelectItem value="Legal Guardian" className="font-bold">Legal Guardian</SelectItem>
                              <SelectItem value="Grandparent" className="font-bold">Grandparent</SelectItem>
                              <SelectItem value="Stepparent" className="font-bold">Stepparent</SelectItem>
                              <SelectItem value="Other" className="font-bold">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 duration-500">
                      <div className="h-24 w-24 bg-green-50 rounded-full flex items-center justify-center border-4 border-dashed border-green-200">
                        <CheckCircle2 className="h-12 w-12 text-green-600" />
                      </div>
                      <div className="space-y-2 max-w-sm">
                        <h3 className="text-2xl font-black uppercase tracking-tight">Step Not Required</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider leading-relaxed">
                          As an adult participant (18+), you are authorized to self-sign all registration documents. Guardian information is not necessary for this profile.
                        </p>
                      </div>
                      <Button 
                        type="button" 
                        onClick={() => setCurrentStep(prev => prev + 1)}
                        className="h-14 px-10 rounded-2xl font-black uppercase text-xs"
                      >
                        Skip to Next Step <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Team Code */}
              {activeSteps[currentStep - 1]?.id === 'team_code' && (
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
                          <h2 className="text-lg font-black uppercase tracking-tight">Portals Access Key</h2>
                          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed px-10">If you are not affiliated with a specific team, you can skip this step to enter the general recruiting pool.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Compliance */}
              {activeSteps[currentStep - 1]?.id === 'compliance' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                   {(config.require_default_waiver || config.custom_waiver_text || (config.team_waivers_content && config.team_waivers_content.length > 0)) && (
                    <div className="space-y-6">
                      {config.require_default_waiver && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-primary">
                            <ShieldCheck className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Institutional Liability Waiver</p>
                          </div>
                          <ScrollArea className="h-48 rounded-[2.5rem] bg-muted/5 border-2 border-black/5 shadow-inner">
                            <div className="p-14 font-medium text-xs leading-relaxed text-foreground/80">
                              {config.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this program. I waive, release, and discharge the organization, its directors, coaches, and facility providers from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {config.custom_waiver_text && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-primary">
                            <FileSignature className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Organization specific Agreement</p>
                          </div>
                          <ScrollArea className="h-48 rounded-[2.5rem] bg-primary/5 border-2 border-primary/10 shadow-inner">
                            <div className="p-14 font-medium text-xs leading-relaxed text-primary/80">
                              {config.custom_waiver_text}
                            </div>
                          </ScrollArea>
                        </div>
                      )}

                      {config.team_waivers_content?.map((waiver) => (
                        <div key={waiver.id} className="space-y-3">
                          <div className="flex items-center gap-2 text-rose-600">
                            <FileSignature className="h-4 w-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest">{waiver.title}</p>
                          </div>
                          <ScrollArea className="h-48 rounded-[2.5rem] bg-rose-50 border-2 border-rose-100 shadow-inner">
                            <div className="p-14 font-medium text-xs leading-relaxed text-rose-800">
                              {waiver.content}
                            </div>
                          </ScrollArea>
                        </div>
                      ))}

                      <div className="flex items-center space-x-3 p-6 bg-primary/5 rounded-3xl border-2 border-primary/20 transition-all hover:bg-white">
                        <Checkbox 
                          id="waiver_agree" 
                          checked={waiverAgreed} 
                          onCheckedChange={v => setWaiverAgreed(!!v)} 
                          className="h-6 w-6 rounded-lg" 
                        />
                        <Label 
                          htmlFor="waiver_agree" 
                          className="text-xs font-black uppercase tracking-tight cursor-pointer leading-tight flex-1"
                        >
                          I verify that I have read and accept all participation terms and agreements listed above.
                        </Label>
                      </div>

                      <div className="space-y-3 pt-4">
                        <div className="flex justify-between items-center ml-1">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"> Digital Signature Authentication</Label>
                          {isUnder18 && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-amber-200 text-amber-600 bg-amber-50">
                              Guardian Required
                            </Badge>
                          )}
                        </div>
                        <div className="relative">
                           <Input 
                             placeholder={isUnder18 ? "Guardian's Full Legal Name" : "Participant's Full Legal Name"} 
                             value={signature} 
                             onChange={e => setSignature(e.target.value)} 
                             className="h-20 rounded-[2rem] border-2 font-mono italic text-center text-3xl bg-muted/5 shadow-inner focus:ring-4 focus:ring-primary/10" 
                             required 
                           />
                           <Signature className="absolute right-6 top-1/2 -translate-y-1/2 h-8 w-8 opacity-20" />
                        </div>
                        <p className="text-[8px] font-black uppercase text-center opacity-40 py-2 tracking-[0.3em]">
                          {isUnder18 ? "I certify that I am the legal guardian and authorized to sign for the minor participant." : "Protocol Handshake v" + (config.form_version || 1.0)}
                        </p>
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
              <Button 
                type="submit" 
                className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" 
                disabled={
                  isSubmitting || 
                  (activeSteps[currentStep-1]?.id === 'team_code' && !!teamCode && !validatedTeam && !validatingCode) || 
                  (stepFields.some(f => f.required && !answers[f.id])) ||
                  (activeSteps[currentStep-1]?.id === 'guardian' && isUnder18 && (!answers.guardian_name || !answers.guardian_email || !answers.guardian_phone || !answers.guardian_relationship)) ||
                  (activeSteps[currentStep-1]?.id === 'contact' && stepFields.length === 0 && !answers.primary_phone)
                }
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : 
                 currentStep === totalSteps ? "Dispatch Enrollment" : `Continue to ${activeSteps[currentStep]?.name || 'Next'}`}
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
