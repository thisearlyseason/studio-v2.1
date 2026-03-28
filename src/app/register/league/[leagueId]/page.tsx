
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
  Sparkles
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
  const { submitRegistrationEntry } = useTeam();
  const db = useFirestore();

  const configRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string, 'registration', protocolId) : null, [db, leagueId, protocolId]);
  const leagueRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);
  const { data: league, isLoading: isLeagueLoading } = useDoc<any>(leagueRef);

  const isLoading = isConfigLoading || isLeagueLoading;

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
      await submitRegistrationEntry(leagueId as string, config.id, answers, config.form_version || 0, signature, 'leagues');
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

  if (!config || !config.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6 text-foreground">
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl bg-white">
          <XCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Portal Inactive</h2>
          <p className="text-muted-foreground font-medium mt-2 leading-relaxed">Registration for this pipeline is currently closed.</p>
        </Card>
      </div>
    );
  }

  const formSchema = config.form_schema || [];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6 text-foreground">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Recruitment Hub</Badge>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{config.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Enrollment Pipeline</p>
          </div>

          <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border-2 border-white shadow-xl space-y-4">
            <h3 className="font-black text-xs uppercase tracking-widest text-primary mb-2">League Context</h3>
            <p className="text-sm font-medium leading-relaxed text-foreground/80">{league?.description || config.description}</p>
            
            {(league?.startDate || league?.endDate || league?.ages || league?.contactEmail || league?.contactPhone || league?.socialLinks) && (
              <div className="pt-4 border-t border-black/5 grid grid-cols-2 gap-4">
                {league?.ages && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Divisions</p>
                    <p className="font-bold text-sm uppercase">{league.ages}</p>
                  </div>
                )}
                {(league?.startDate || league?.endDate) && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Timeline</p>
                    <p className="font-bold text-sm uppercase">
                      {league?.startDate ? format(new Date(league.startDate), 'MMM d') : 'TBD'} 
                      {league?.endDate ? ` - ${format(new Date(league.endDate), 'MMM d')}` : ''}
                    </p>
                  </div>
                )}
                {(league?.contactEmail || league?.contactPhone) && (
                  <div className="col-span-2 space-y-1 pt-2">
                    <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Administration</p>
                    <div className="flex flex-wrap gap-4">
                      {league?.contactEmail && <p className="font-bold text-sm text-primary">{league.contactEmail}</p>}
                      {league?.contactPhone && <p className="font-bold text-sm">{league.contactPhone}</p>}
                    </div>
                  </div>
                )}
                {(league?.socialLinks?.twitter || league?.socialLinks?.instagram) && (
                  <div className="col-span-2 space-y-2 pt-2">
                    <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Social Channels</p>
                    <div className="flex gap-2">
                      {league?.socialLinks?.twitter && (
                        <a href={league.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="bg-black text-white h-8 w-8 rounded-lg flex items-center justify-center hover:scale-105 transition-transform"><Globe className="h-4 w-4" /></a>
                      )}
                      {league?.socialLinks?.instagram && (
                        <a href={league.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="bg-pink-600 text-white h-8 w-8 rounded-lg flex items-center justify-center hover:scale-105 transition-transform"><AlertCircle className="h-4 w-4" /></a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-primary/10 space-y-4 shadow-sm relative overflow-hidden group">
            {config.registration_cost && parseFloat(config.registration_cost) > 0 && (
              <div className="absolute -bottom-4 -right-4 p-4 opacity-5 rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700 font-black text-6xl text-primary">${config.registration_cost}</div>
            )}
            <div className="flex items-center gap-3"><div className="bg-primary p-2 rounded-xl text-white shadow-lg"><Wallet className="h-5 w-5" /></div><h4 className="text-xl font-black uppercase tracking-tight text-foreground">Enrollment Fee</h4></div>
            {config.registration_cost && parseFloat(config.registration_cost) > 0 ? (
              <p className="text-2xl font-black text-primary">${config.registration_cost} <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-2">Institutional Season</span></p>
            ) : (
              <p className="text-sm font-black text-primary uppercase tracking-widest">Fee Structure: TBD</p>
            )}
            <div className="pt-4 border-t border-primary/10 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Disbursement Protocol</p>
              <div className="bg-white/50 p-4 rounded-2xl text-[11px] font-medium leading-relaxed border border-primary/5 text-foreground/80 whitespace-pre-wrap">
                {league?.paymentInstructions || config.offline_payment_instructions || 'Enrollment fees are currently processed via bank transfer or institutional check. Please coordinate with league administration for terminal validation.'}
              </div>
              <div className="flex items-center gap-2 bg-amber-100/50 p-3 rounded-xl border border-amber-200">
                <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-[9px] font-black uppercase text-amber-700 tracking-widest">Online Checkout Pipeline: In Active Development</p>
              </div>
            </div>
          </div>

          <div className="bg-black text-white p-8 rounded-[2.5rem] shadow-xl space-y-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              {config.type === 'player' ? <UserCheck className="h-32 w-32" /> : <ShieldCheck className="h-32 w-32" />}
            </div>
            <h4 className="text-lg font-black uppercase tracking-tight relative z-10">
              {config.type === 'player' ? 'Athlete Protocol' : 'Squad Protocol'}
            </h4>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed relative z-10">
              Verified institutional recruitment for sanctioned competitive seasons.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-muted p-3 rounded-2xl">
                  {config.type === 'player' ? <Users className="h-6 w-6 text-primary" /> : <Target className="h-6 w-6 text-primary" />}
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Application Data</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Required Information</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              {formSchema.map(field => (
                <div key={field.id} className="space-y-3">
                  {field.type === 'header' ? (
                    <div className="pt-4 border-b pb-2"><h3 className="font-black text-lg uppercase tracking-tight">{field.label}</h3></div>
                  ) : (
                    <>
                      <div className="flex justify-between items-end px-1"><Label className="text-[10px] font-black uppercase tracking-widest">{field.label} {field.required && <span className="text-primary">*</span>}</Label></div>
                      {field.type === 'short_text' && (
                        <Input required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white transition-all" />
                      )}
                      {field.type === 'long_text' && (
                        <Textarea required={field.required} value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="rounded-xl min-h-[100px] border-2 font-medium bg-muted/10 focus:bg-white transition-all" />
                      )}
                      {field.type === 'dropdown' && (
                        <Select required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-muted/10"><SelectValue placeholder="Select choice..." /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {field.options?.map((opt: string) => <SelectItem key={opt} value={opt} className="font-bold">{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {field.type === 'radio' && (
                        <RadioGroup required={field.required} value={answers[field.id] || ''} onValueChange={v => handleInputChange(field.id, v)} className="flex flex-col gap-3 py-2">
                          {field.options?.map((opt: string) => (
                            <div key={opt} className="flex items-center space-x-3 bg-muted/5 p-3 rounded-xl border-2 cursor-pointer hover:bg-white transition-all">
                              <RadioGroupItem value={opt} id={`${field.id}_${opt}`} />
                              <Label htmlFor={`${field.id}_${opt}`} className="font-bold text-[10px] uppercase cursor-pointer flex-1">{opt}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                      {field.type === 'checkbox' && (
                        <div className="flex flex-col gap-3 py-2">
                          {field.options?.map((opt: string) => (
                            <div key={opt} className="flex items-center space-x-3 bg-muted/5 p-3 rounded-xl border-2 hover:bg-white transition-all">
                              <Checkbox 
                                id={`${field.id}_${opt}`} 
                                checked={(answers[field.id] || []).includes(opt)} 
                                onCheckedChange={(checked) => {
                                  const current = Array.isArray(answers[field.id]) ? answers[field.id] : [];
                                  const updated = checked ? [...current, opt] : current.filter((i: string) => i !== opt);
                                  handleInputChange(field.id, updated);
                                }} 
                              />
                              <Label htmlFor={`${field.id}_${opt}`} className="font-bold text-[10px] uppercase cursor-pointer flex-1">{opt}</Label>
                            </div>
                          ))}
                        </div>
                      )}
                      {field.type === 'signature' && (
                        <div className="space-y-2">
                           <Input required={field.required} placeholder="Type Full Legal Name to Sign..." value={answers[field.id] || ''} onChange={e => handleInputChange(field.id, e.target.value)} className="h-14 rounded-xl border-2 font-mono italic text-center text-lg bg-muted/5 shadow-inner" />
                           <p className="text-[7px] font-black uppercase text-center opacity-40">Digital Signature Handshake v{config.form_version || 1}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {(config.require_default_waiver || config.custom_waiver_text) && (
                <div className="space-y-6 pt-8 border-t">
                  <div className="flex items-center gap-3"><Signature className="h-6 w-6 text-primary" /><h4 className="text-lg font-black uppercase tracking-tight">Required Agreements</h4></div>
                  
                  {config.require_default_waiver && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Universal Institutional Liability Waiver</p>
                      <ScrollArea className="h-40 p-5 rounded-2xl bg-muted/10 border-2 font-medium text-xs leading-relaxed">
                        {config.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this program. I waive, release, and discharge the organization, its directors, coaches, and facility providers from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'}
                      </ScrollArea>
                    </div>
                  )}

                  {config.custom_waiver_text && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Organization Specific Agreement</p>
                      <ScrollArea className="h-40 p-5 rounded-2xl bg-primary/5 border border-primary/20 font-medium text-xs leading-relaxed text-primary/90">
                        {config.custom_waiver_text}
                      </ScrollArea>
                    </div>
                  )}

                  <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 group cursor-pointer" onClick={() => setWaiverAgreed(!waiverAgreed)}>
                    <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} />
                    <Label htmlFor="waiver_agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                      I verify that I have read and accept all participation terms and agreements listed above.
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Digital Signature (Legal Name)</Label>
                    <Input placeholder="Type name to sign..." value={signature} onChange={e => setSignature(e.target.value)} className="h-14 rounded-xl border-2 font-mono italic text-center text-xl bg-muted/10" required />
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button type="submit" className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Dispatch Enrollment"}
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
