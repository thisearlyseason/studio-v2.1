
"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, Team } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ShieldCheck, 
  CheckCircle2, 
  Loader2, 
  Users, 
  Signature, 
  FileSignature,
  Zap,
  ArrowRight,
  Info
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

function RapidJoinForm() {
  const { teamId } = useParams();
  const router = useRouter();
  const { user, db, joinTeamWithCode, firebaseUser, isPlayer, isParent, myChildren } = useTeam();

  const teamRef = useMemoFirebase(() => db ? doc(db, 'teams', teamId as string) : null, [db, teamId]);
  const { data: team, isLoading: isTeamLoading } = useDoc<any>(teamRef);
  
  const protocolsRef = useMemoFirebase(() => db ? query(collection(db, 'teams', teamId as string, 'documents'), where('isActive', '==', true)) : null, [db, teamId]);
  const { data: protocols, isLoading: isProtosLoading } = useCollection<any>(protocolsRef);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    dateOfBirth: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    playerId: ''
  });

  const isUnder18 = useMemo(() => {
    if (!formData.dateOfBirth) return false;
    const birthDate = new Date(formData.dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age < 18;
  }, [formData.dateOfBirth]);

  const totalSteps = useMemo(() => {
    return isUnder18 ? 3 : 2; // Identity -> Guardian (if <18) -> Compliance
  }, [isUnder18]);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({ ...prev, name: user.name, email: user.email }));
    }
  }, [user]);

  const activeWaiver = protocols?.find(p => p.type === 'waiver' || p.id.startsWith('default_')) || protocols?.[0];

  const handleNextStep = () => {
    if (step === 1 && isUnder18) {
      setStep(2);
    } else if (step === 1 && !isUnder18) {
      setStep(2);
    } else if (step === 2 && isUnder18) {
      setStep(3);
    } else {
      setStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handlePrevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!team || isSubmitting) return;

    if (activeWaiver && (!waiverAgreed || !signature.trim())) {
      toast({ title: "Compliance Required", description: "Please sign the required documentation.", variant: "destructive" });
      return;
    }

    if (isParent && !formData.playerId) {
      toast({ title: "Player Required", description: "Please select which player is joining.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const playerId = isPlayer ? `p_${user?.id}` : formData.playerId;
      const role = isParent ? 'Parent' : 'Player';
      
      // 1. Join the team
      const success = await joinTeamWithCode(team.teamCode || team.code, playerId, role);
      
      if (!success) throw new Error("Join failed");

      // 2. Archive the waiver signature if applicable
      if (activeWaiver && signature) {
        // We could call a more specific 'signWaiver' here, but for 'rapid join' 
        // we'll just archive it via the team's membership or documents
        // Using TeamProvider's signTeamDocument logic (simplified)
        // For now, let's assume joining is enough for 'quick' flow, 
        // but we should store the signature somewhere.
        // The joinTeamWithCode doesn't take a signature.
        
        // Let's use a custom write to archived_waivers
        const archId = `arch_join_${Date.now()}_${playerId}`;
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'teams', teamId as string, 'archived_waivers', archId), {
            id: archId,
            playerId,
            signer: signature,
            signedAt: new Date().toISOString(),
            protocolId: activeWaiver.id,
            protocolTitle: activeWaiver.title,
            type: 'Rapid Entry Waiver'
        });
      }

      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      toast({ title: "Enrollment Failed", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isTeamLoading || isProtosLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Syncing with Squad...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full border-none shadow-2xl rounded-[3rem] bg-white p-12">
          <Info className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-black uppercase text-black">Squad Not Found</h2>
          <Button className="mt-6 w-full h-12 rounded-xl" onClick={() => router.push('/')}>Return to Hub</Button>
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
          <h2 className="text-3xl font-black uppercase tracking-tighter">You're in the Squad</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Member Registry Updated</p>
          
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Confirmation</p>
            <p className="text-sm font-bold mt-1 leading-relaxed">
              Your enrollment in {team.teamName || team.name} is complete. You can now access schedules, rosters, and team communications in your dashboard.
            </p>
          </div>

          <Button className="mt-10 w-full h-16 rounded-2xl font-black uppercase shadow-xl" onClick={() => router.push('/')}>Open Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-6 text-foreground">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-primary px-4 py-1.5 rounded-full text-white shadow-lg overflow-hidden">
             <Zap className="h-4 w-4 fill-white" />
             <span className="text-[10px] font-black uppercase tracking-widest">Rapid Join Portal</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter uppercase leading-[0.8]">{team.teamName || team.name}</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px]">Onboarding Handshake</p>
        </div>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="bg-muted p-3 rounded-2xl">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">
                      {step === 1 ? 'Personal Data' : step === 2 && isUnder18 ? 'Guardian Info' : 'Compliance'}
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Step {step} of {totalSteps}</CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                    <div key={s} className={cn("h-2 rounded-full transition-all duration-300", step >= s ? "w-8 bg-primary" : "w-4 bg-muted")} />
                  ))}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-8">
              {step === 1 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Full Name</Label>
                      <Input 
                        required 
                        value={formData.name} 
                        onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                        className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Email Address</Label>
                      <Input 
                        required 
                        type="email"
                        value={formData.email} 
                        onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                        className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date of Birth <span className="text-primary">*</span></Label>
                    <Input 
                      required
                      type="date"
                      value={formData.dateOfBirth} 
                      onChange={e => setFormData(p => ({ ...p, dateOfBirth: e.target.value }))}
                      className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                    />
                    {formData.dateOfBirth && (
                      <p className={cn("text-[10px] font-black uppercase tracking-widest mt-2", isUnder18 ? "text-amber-600" : "text-green-600")}>
                        {isUnder18 ? "Guardian information will be required (Under 18)" : "No guardian required (18 or older)"}
                      </p>
                    )}
                  </div>

                  {isParent && (
                    <div className="space-y-3 pt-4 border-t">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Active Player <span className="text-primary">*</span></Label>
                      <div className="grid grid-cols-1 gap-3">
                        {myChildren.map(child => (
                          <div 
                            key={child.id}
                            onClick={() => setFormData(p => ({ ...p, playerId: child.id }))}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer",
                              formData.playerId === child.id ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/5 border-transparent hover:border-black/5"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("h-4 w-4 rounded-full border-2 p-0.5", formData.playerId === child.id ? "border-primary" : "border-muted-foreground/30")}>
                                {formData.playerId === child.id && <div className="h-full w-full rounded-full bg-primary" />}
                              </div>
                              <span className="font-black uppercase text-xs tracking-tight">{child.firstName} {child.lastName}</span>
                            </div>
                            <CheckCircle2 className={cn("h-5 w-5", formData.playerId === child.id ? "text-primary opacity-100" : "opacity-0")} />
                          </div>
                        ))}
                        {myChildren.length === 0 && (
                            <p className="text-[10px] font-bold text-muted-foreground uppercase italic px-1">No players found in your registry. Please add them in the family dashboard.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && isUnder18 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                    <ShieldCheck className="h-6 w-6 text-amber-600" />
                    <p className="text-sm font-bold text-amber-800">Guardian Information Required (Under 18)</p>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Full Name <span className="text-primary">*</span></Label>
                      <Input 
                        required
                        placeholder="e.g. Sarah Thompson" 
                        value={formData.guardianName} 
                        onChange={e => setFormData(p => ({ ...p, guardianName: e.target.value }))}
                        className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Email <span className="text-primary">*</span></Label>
                        <Input 
                          required
                          type="email"
                          placeholder="guardian@email.com" 
                          value={formData.guardianEmail} 
                          onChange={e => setFormData(p => ({ ...p, guardianEmail: e.target.value }))}
                          className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Guardian Phone</Label>
                        <Input 
                          type="tel"
                          placeholder="(555) 000-0000" 
                          value={formData.guardianPhone} 
                          onChange={e => setFormData(p => ({ ...p, guardianPhone: e.target.value }))}
                          className="h-12 rounded-xl border-2 font-bold bg-muted/10" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && !isUnder18 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <ShieldCheck className="h-16 w-16 text-green-600" />
                    <p className="text-xl font-black uppercase tracking-tight text-green-700">Guardian Not Required</p>
                    <p className="text-sm font-medium text-muted-foreground">You are 18 or older and do not need guardian information.</p>
                  </div>
                </div>
              )}

              {activeWaiver && ((step === 3 && isUnder18) || (step === 2 && !isUnder18)) && (
                <div className="space-y-6 pt-8 border-t animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex items-center gap-3"><Signature className="h-6 w-6 text-primary" /><h4 className="text-lg font-black uppercase tracking-tight">Compliance Protocol</h4></div>
                  
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">{activeWaiver.title}</p>
                    <ScrollArea className="h-48 p-5 rounded-2xl bg-muted/10 border-2 font-medium text-xs leading-relaxed text-foreground/80">
                      {activeWaiver.content}
                    </ScrollArea>
                  </div>

                  <div 
                    className={cn(
                        "flex items-center space-x-3 p-5 rounded-2xl border-2 transition-all cursor-pointer",
                        waiverAgreed ? "bg-primary/5 border-primary/20" : "bg-muted/5 border-transparent"
                    )}
                    onClick={() => setWaiverAgreed(!waiverAgreed)}
                  >
                    <Checkbox id="waiver_agree" checked={waiverAgreed} onCheckedChange={v => setWaiverAgreed(!!v)} />
                    <Label htmlFor="waiver_agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight flex-1">
                      I verify that I have read and accept all participation terms and institutional agreements.
                    </Label>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Digital Execution (Full Legal Name)</Label>
                    <Input 
                        placeholder="Type legal name to execute..." 
                        value={signature} 
                        onChange={e => setSignature(e.target.value)} 
                        className="h-16 rounded-xl border-2 font-mono italic text-center text-2xl bg-muted/10 focus:bg-white transition-all shadow-inner" 
                        required 
                    />
                    <p className="text-[8px] font-black uppercase text-center opacity-30 mt-2">Time-Stamped Institutional Handshake Protocol</p>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0 flex gap-4">
              {step > 1 && (
                <Button type="button" variant="outline" className="h-14 px-8 rounded-xl border-2 font-black uppercase text-xs" onClick={handlePrevStep}>
                  Back
                </Button>
              )}
              <Button type="button" className="flex-1 h-14 rounded-xl text-base font-black shadow-2xl shadow-primary/20" disabled={isSubmitting || (step === 1 && (!formData.name || !formData.email || !formData.dateOfBirth)) || (step === 2 && isUnder18 && (!formData.guardianName || !formData.guardianEmail))} onClick={handleNextStep}>
                {step < totalSteps ? 'Continue' : 'Execute Join Portal'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/40">Secure Institutional Handshake</p>
      </div>
    </div>
  );
}

export default function RapidJoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <RapidJoinForm />
    </Suspense>
  );
}
