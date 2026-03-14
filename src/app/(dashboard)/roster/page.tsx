"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  ChevronRight, 
  ShieldAlert, 
  Loader2, 
  Download,
  Zap,
  Award,
  GraduationCap,
  CheckCircle2,
  XCircle,
  UserPlus,
  Copy,
  FileSignature,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeam, Member } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { format } from 'date-fns';

function MemberComplianceLedger({ teamId, memberId }: { teamId: string, memberId: string }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => {
    if (!db || !teamId || !memberId) return null;
    return query(collection(db, 'teams', teamId, 'members', memberId, 'signatures'), orderBy('signedAt', 'desc'));
  }, [db, teamId, memberId]);

  const { data: signatures, isLoading } = useCollection(q);

  const handleDownload = (sig: any) => {
    const content = `CERTIFICATE OF VERIFIED SIGNATURE\n\nDocument: ${sig.title}\nTimestamp: ${sig.signedAt}\nLegal Signature: "${sig.signatureText}"\n\nThis document was digitally executed within the SquadForge platform.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Signed_${sig.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />;

  return (
    <div className="space-y-3">
      {signatures?.map(sig => (
        <div key={sig.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 group/sig">
          <div className="min-w-0">
            <p className="font-black text-[10px] uppercase text-white truncate">{sig.title || 'Waiver'}</p>
            <div className="flex items-center gap-2 opacity-40 mt-0.5">
              <Clock className="h-2 w-2" />
              <span className="text-[8px] font-bold uppercase">{format(new Date(sig.signedAt), 'MMM d, yyyy')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover/sig:opacity-100 text-white" onClick={() => handleDownload(sig)}>
              <Download className="h-3 w-3" />
            </Button>
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          </div>
        </div>
      ))}
      {(!signatures || signatures.length === 0) && (
        <p className="text-[9px] font-bold text-white/30 uppercase text-center py-2 italic">No signatures recorded.</p>
      )}
    </div>
  );
}

export default function RosterPage() {
  const { activeTeam, user, members, isMembersLoading, isStaff, updateStaffEvaluation, getStaffEvaluation } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedMember && isStaff) {
      getStaffEvaluation(selectedMember.id).then(setStaffNote);
    }
  }, [selectedMember, isStaff, getStaffEvaluation]);

  const calculateAge = (dob?: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return `U${age + 1}`;
  };

  const handleExportPortfolio = useCallback(() => {
    if (!selectedMember) return;
    const headers = ["Player", "Position", "Jersey", "Status", "Contact", "Evaluations"];
    const row = [
      selectedMember.name,
      selectedMember.position,
      selectedMember.jersey,
      selectedMember.medicalClearance ? 'Cleared' : 'Pending',
      selectedMember.phone || selectedMember.parentEmail || 'N/A',
      staffNote.replace(/,/g, ';')
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, row].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedMember.name.replace(/\s+/g, '_')}_Recruiting_Portfolio.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Portfolio Generated" });
  }, [selectedMember, staffNote]);

  if (!mounted || !activeTeam || isMembersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  const filteredRoster = members.filter(member => member.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSaveNote = async () => {
    if (!selectedMember) return;
    setIsSavingNote(true);
    await updateStaffEvaluation(selectedMember.id, staffNote);
    setIsSavingNote(false);
    toast({ title: "Evaluation Synchronized" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight uppercase leading-none">Roster</h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Squad Directory & Intelligence</p>
          </div>
          <div className="flex gap-2">
            {isStaff && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-full px-6 font-black uppercase text-[10px] lg:text-xs h-10 lg:h-11 tracking-widest shadow-lg shadow-primary/20">
                    <UserPlus className="h-4 w-4 mr-2" /> Invite
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-y-auto">
                  <div className="h-2 bg-primary w-full" />
                  <div className="p-8 space-y-6">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black uppercase tracking-tight">Recruitment Code</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase text-[10px]">Invite new teammates to {activeTeam.name}</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 bg-primary/5 rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(activeTeam.code); toast({ title: "Code Copied" }); }}>
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Official Join Code</p>
                      <div className="flex items-center justify-center gap-4">
                        <p className="text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                        <Copy className="h-6 w-6 text-primary opacity-30" />
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search squad roster..." className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner font-black text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-[2rem] cursor-pointer group hover:shadow-md" onClick={() => setSelectedMember(member)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl font-black bg-muted text-xs">{member.name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-black truncate text-lg tracking-tight group-hover:text-primary transition-colors">{member.name}</h3>
                    {member.jersey !== 'HQ' && <Badge variant="outline" className="text-[9px] h-5 border-primary/20 text-primary font-black uppercase">#{member.jersey}</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">{member.position}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-5xl border-none shadow-2xl p-0 flex flex-col bg-white overflow-y-auto">
          <DialogTitle className="sr-only">Player Profile: {selectedMember?.name}</DialogTitle>
          {selectedMember && (
            <div className="flex flex-col lg:flex-row">
              <div className="w-full lg:w-5/12 bg-black text-white p-8 lg:p-12 space-y-8 shrink-0 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none">
                  <Zap className="h-48 w-48" />
                </div>
                <div className="relative z-10 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
                  <Avatar className="h-32 w-32 lg:h-40 lg:w-40 rounded-[2.5rem] border-4 border-white/10 shadow-2xl">
                    <AvatarImage src={selectedMember.avatar} className="object-cover" />
                    <AvatarFallback className="text-4xl font-black bg-white/10">{selectedMember.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <Badge className="bg-primary text-white border-none font-black text-[10px] uppercase h-6 px-4 mb-2">Verified Athlete</Badge>
                    <h2 className="text-4xl font-black tracking-tighter leading-none uppercase">{selectedMember.name}</h2>
                    <p className="text-primary font-black uppercase tracking-[0.2em] text-sm">{selectedMember.position} • #{selectedMember.jersey}</p>
                  </div>

                  <div className="w-full space-y-4 pt-4 border-t border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Compliance Ledger</p>
                    <MemberComplianceLedger teamId={activeTeam.id} memberId={selectedMember.id} />
                  </div>

                  <div className="w-full pt-4 border-t border-white/10 space-y-4">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span>Recruiting Portfolio</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleExportPortfolio}><Download className="h-4 w-4" /></Button>
                    </div>
                    <Button className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] shadow-xl hover:bg-white/90" onClick={handleExportPortfolio}>Generate Scouting Pack</Button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 p-8 lg:p-12 space-y-10 bg-white">
                <div className="space-y-6">
                  <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Award className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em]">Athlete Narrative</h4></div>
                  <div className="bg-muted/30 p-6 rounded-[2.5rem] border-2 border-dashed">
                    <p className="text-sm font-medium leading-relaxed italic text-foreground/80">
                      {selectedMember.notes || "This athlete has not yet established a squad bio. Visit Settings to update."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><ShieldCheck className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em]">Vital Stats</h4></div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                        <span className="text-[10px] font-black uppercase opacity-40">Medical Clearance</span>
                        {selectedMember.medicalClearance ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                      </div>
                      <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                        <span className="text-[10px] font-black uppercase opacity-40">Age Group</span>
                        <span className="text-sm font-black uppercase">{calculateAge(selectedMember.birthdate) || 'U18'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><GraduationCap className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em]">Institutional Audit</h4></div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                        <span className="text-[10px] font-black uppercase opacity-40">Active Dues</span>
                        <span className={cn("text-sm font-black", selectedMember.feesPaid ? "text-green-600" : "text-primary")}>${selectedMember.amountOwed || 0}</span>
                      </div>
                      <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                        <span className="text-[10px] font-black uppercase opacity-40">Season Compliance</span>
                        <Badge className="bg-black text-white h-5 text-[8px] font-black uppercase">94% Attendance</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {isStaff && (
                  <div className="space-y-6 pt-10 border-t">
                    <div className="flex items-center gap-3 text-primary"><ShieldAlert className="h-5 w-5" /><h4 className="text-xs font-black uppercase tracking-[0.2em]">Elite Personnel Evaluation</h4></div>
                    <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-6">
                      <Textarea 
                        placeholder="Log tactical performance reviews, coachability notes, or scout observations..." 
                        value={staffNote} 
                        onChange={e => setStaffNote(e.target.value)} 
                        className="min-h-[150px] bg-white rounded-2xl border-none font-bold p-6 text-base shadow-inner resize-none" 
                      />
                      <Button className="w-full h-14 rounded-xl text-xs font-black uppercase shadow-lg shadow-primary/20" onClick={handleSaveNote} disabled={isSavingNote}>
                        {isSavingNote ? <Loader2 className="h-5 w-5 animate-spin" /> : "Commit Evaluation"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}