
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, TeamEvent } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Users, 
  Signature, 
  Clock, 
  MapPin,
  ChevronDown,
  FileText,
  Calendar,
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
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';

export default function PublicTournamentWaiverPage() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const { signPublicTournamentWaiver } = useTeam();

  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [coachName, setCoachName] = useState('');
  const [signDate, setSignDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigned, setIsSigned] = useState(false);

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  const unsignedTeams = useMemo(() => {
    if (!event?.tournamentTeams) return [];
    return event.tournamentTeams.filter(t => !event.teamAgreements?.[t]?.agreed);
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !coachName || !agreed || isSubmitting) return;

    setIsSubmitting(true);
    const success = await signPublicTournamentWaiver(teamId as string, eventId as string, selectedTeam, coachName);
    if (success) {
      setIsSigned(true);
    } else {
      alert("Verification failed. Please ensure the host squad is active.");
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Accessing Vault...</p>
      </div>
    );
  }

  if (!event || !event.isTournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Hub Not Found</h2>
          <p className="text-muted-foreground font-medium mt-2">The tournament signature link is no longer active.</p>
        </Card>
      </div>
    );
  }

  if (isSigned) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Verification Complete</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-6">Signature Logged Successfully</p>
          <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed space-y-2 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Certified Receipt</p>
            <p className="text-sm font-bold">Squad: {selectedTeam}</p>
            <p className="text-sm font-bold">Signer: {coachName}</p>
            <p className="text-[10px] font-medium opacity-60">Timestamp: {format(new Date(), 'MMM d, yyyy h:mm a')}</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-8">Your squad is now officially cleared for participation in <strong>{event.title}</strong>.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 md:p-12">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      
      <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6 lg:sticky lg:top-12">
          <div className="space-y-2">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Elite Infrastructure</Badge>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tighter uppercase leading-[0.9]">{event.title}</h1>
            <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Official Participation Agreement</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center gap-4 bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
              <Clock className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase opacity-40">Start Date</p>
                <p className="text-sm font-black uppercase">{format(new Date(event.date), 'EEEE, MMM d')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-white shadow-sm">
              <MapPin className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase opacity-40">Official Venue</p>
                <p className="text-sm font-black uppercase truncate">{event.location}</p>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-3xl border-2 border-primary/10 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Host Organization</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              This agreement is issued by the tournament coordinator. Your signature verifies that your entire squad roster understands and accepts all coordination protocols and liability terms.
            </p>
          </div>
        </div>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
          <div className="h-2 bg-primary w-full" />
          <form onSubmit={handleSubmit}>
            <CardHeader className="p-8 lg:p-10 pb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-muted p-3 rounded-2xl">
                  <Signature className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Execute Agreement</CardTitle>
              </div>
              <div className="p-1 bg-muted rounded-2xl border-2">
                <ScrollArea className="h-48 p-5 bg-white rounded-xl">
                  {event.teamWaiverText ? (
                    <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap text-foreground/80">{event.teamWaiverText}</p>
                  ) : (
                    <div className="text-center py-10 opacity-40 space-y-2">
                      <FileText className="h-8 w-8 mx-auto" />
                      <p className="text-[10px] font-black uppercase">Standard Participation Terms</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 lg:p-10 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Your Squad</Label>
                <Select value={selectedTeam} onValueChange={setSelectedTeam} required>
                  <SelectTrigger className="h-12 rounded-xl border-2 bg-muted/30 font-bold focus:bg-white transition-all">
                    <SelectValue placeholder="Select from roster..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {unsignedTeams.map(t => (
                      <SelectItem key={t} value={t} className="font-bold">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Representative Name</Label>
                  <Input 
                    placeholder="Full Legal Name..." 
                    value={coachName}
                    onChange={e => setCoachName(e.target.value)}
                    className="h-12 rounded-xl border-2 font-bold bg-muted/30 focus:bg-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Current Date</Label>
                  <Input 
                    type="date"
                    value={signDate}
                    onChange={e => setSignDate(e.target.value)}
                    className="h-12 rounded-xl border-2 font-bold bg-muted/30 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 group cursor-pointer" onClick={() => setAgreed(!agreed)}>
                <Checkbox 
                  id="agree" 
                  checked={agreed} 
                  onCheckedChange={(v) => setAgreed(!!v)} 
                  className="h-6 w-6 rounded-lg border-2" 
                />
                <Label htmlFor="agree" className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                  I verify that I have authority to sign for this squad and accept all terms.
                </Label>
              </div>
            </CardContent>

            <CardFooter className="p-8 lg:p-10 pt-0">
              <Button 
                type="submit" 
                className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                disabled={!selectedTeam || !coachName || !agreed || isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Verify & Sign Legally"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <footer className="mt-12 text-center">
        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">The Squad Compliance Ledger v1.0 • thesquad.pro</p>
      </footer>
    </div>
  );
}
