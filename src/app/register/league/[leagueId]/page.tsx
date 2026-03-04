
"use client";

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  DollarSign
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
import { toast } from '@/hooks/use-toast';

export default function PublicLeagueRegistrationPage() {
  const { leagueId } = useParams();
  const { submitRegistrationEntry } = useTeam();
  const db = useFirestore();

  const configRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string, 'registration', 'config') : null, [db, leagueId]);
  const { data: config, isLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitRegistrationEntry(leagueId as string, answers, config.form_version || 0);
      setIsSuccess(true);
    } catch (error) {
      toast({ title: "Submission Failed", description: "Please verify connectivity and try again.", variant: "destructive" });
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

  if (!config || !config.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl">
          <XCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Portal Inactive</h2>
          <p className="text-muted-foreground font-medium mt-2 leading-relaxed">
            Registration for this league is currently closed or the link is invalid. Please contact the league organizer for details.
          </p>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter leading-tight">Registration Successful</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Roster review in progress</p>
          
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 space-y-4 text-left">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Settlement Protocol</p>
              </div>
              {config.registration_cost && (
                <Badge className="bg-primary text-white font-black text-xs h-6">{config.registration_cost}</Badge>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-black text-primary uppercase tracking-widest">Action Required: Payment due ASAP</p>
              <p className="text-xs font-medium text-foreground/80 leading-relaxed italic">
                {config.payment_instructions || 'Please coordinate with the league organizer regarding the registration fee.'}
              </p>
            </div>
          </div>
          
          <p className="text-xs font-medium text-muted-foreground mt-8">
            Your application has been received. Please ensure payment is settled promptly to finalize your squad enrollment.
          </p>
        </Card>
      </div>
    );
  }

  const formSchema = config.form_schema || [];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-12">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Official Recruitment</Badge>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{config.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">League Enrollment Portal</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border-2 border-white shadow-xl space-y-4">
              <p className="text-sm font-medium leading-relaxed text-foreground/80">{config.description}</p>
            </div>

            {config.registration_cost && (
              <div className="bg-primary text-white p-6 rounded-3xl shadow-xl shadow-primary/20 flex items-center justify-between group overflow-hidden relative">
                <DollarSign className="absolute -right-2 -bottom-2 h-20 w-20 opacity-10 -rotate-12" />
                <div className="relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Registration Fee</p>
                  <p className="text-4xl font-black tracking-tighter">{config.registration_cost}</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm relative z-10">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            )}
          </div>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Logistics</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Once submitted, your application enters the squad review pool. Assignments are managed by official league coordinators and approved by head coaches.
            </p>
          </div>
        </div>

        <Card className="lg:col-span-7 rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4">
                <div className="bg-muted p-3 rounded-2xl">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Enrollment Data</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Version {config.form_version || 1}.0</CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              {formSchema.length > 0 ? formSchema.map(field => (
                <div key={field.id} className="space-y-3">
                  {field.type === 'header' ? (
                    <div className="pt-4 border-b pb-2">
                      <h3 className="font-black text-lg uppercase tracking-tight">{field.label}</h3>
                      {field.description && <p className="text-[10px] font-bold text-muted-foreground uppercase">{field.description}</p>}
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-end px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest">
                          {field.label} {field.required && <span className="text-primary">*</span>}
                        </Label>
                        {field.description && <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">{field.description}</p>}
                      </div>

                      {field.type === 'short_text' && (
                        <Input 
                          required={field.required} 
                          value={answers[field.id] || ''} 
                          onChange={e => handleInputChange(field.id, e.target.value)}
                          className="h-12 rounded-xl border-2 font-bold bg-muted/10 focus:bg-white transition-all"
                        />
                      )}

                      {field.type === 'long_text' && (
                        <Textarea 
                          required={field.required} 
                          value={answers[field.id] || ''} 
                          onChange={e => handleInputChange(field.id, e.target.value)}
                          className="rounded-xl min-h-[100px] border-2 font-medium bg-muted/10 focus:bg-white transition-all"
                        />
                      )}

                      {field.type === 'dropdown' && (
                        <Select 
                          required={field.required} 
                          onValueChange={v => handleInputChange(field.id, v)}
                        >
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold bg-muted/10"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}

                      {field.type === 'yes_no' && (
                        <RadioGroup 
                          className="flex gap-6 p-1" 
                          onValueChange={v => handleInputChange(field.id, v)}
                          required={field.required}
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="yes" id={`${field.id}_yes`} />
                            <Label htmlFor={`${field.id}_yes`} className="font-black text-xs uppercase">Affirmative</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no" id={`${field.id}_no`} />
                            <Label htmlFor={`${field.id}_no`} className="font-black text-xs uppercase">Negative</Label>
                          </div>
                        </RadioGroup>
                      )}

                      {field.type === 'checkbox' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/10 p-4 rounded-2xl">
                          {field.options?.map(opt => {
                            const current = answers[field.id] || [];
                            return (
                              <div key={opt} className="flex items-center space-x-3">
                                <Checkbox 
                                  checked={current.includes(opt)} 
                                  onCheckedChange={(v) => {
                                    const next = v ? [...current, opt] : current.filter((o: string) => o !== opt);
                                    handleInputChange(field.id, next);
                                  }} 
                                />
                                <Label className="text-[10px] font-black uppercase tracking-tight">{opt}</Label>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {field.type === 'image' && (
                        <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/5 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all relative">
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const r = new FileReader();
                                r.onload = ev => handleInputChange(field.id, ev.target?.result);
                                r.readAsDataURL(f);
                              }
                            }}
                          />
                          {answers[field.id] ? (
                            <img src={answers[field.id]} className="h-24 mx-auto rounded-xl shadow-lg" alt="Preview" />
                          ) : (
                            <>
                              <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform">
                                <Plus className="h-6 w-6 text-primary" />
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Add Image Attachment</p>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )) : (
                <div className="text-center py-12 opacity-30">
                  <p className="text-sm font-black uppercase">Standard Enrollment Enabled</p>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Send In Registration"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] mt-12 opacity-40">SquadForge Institutional Enrollment v1.0</p>
    </div>
  );
}
