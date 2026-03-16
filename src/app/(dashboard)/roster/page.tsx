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
  Clock,
  ShieldCheck,
  HeartPulse,
  Plane,
  Camera,
  Target,
  Trophy,
  Star,
  Settings,
  Save,
  UserCog,
  ExternalLink,
  Link as LinkIcon,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeam, Member, TeamDocument } from '@/components/providers/team-provider';
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
import { format, differenceInYears } from 'date-fns';

const STANDARD_WAIVERS = [
  { id: 'medical', label: 'Medical Clearance', icon: HeartPulse, docId: 'default_medical' },
  { id: 'travel', label: 'Travel Consent', icon: Plane, docId: 'default_travel' },
  { id: 'parental', label: 'Parental Waiver', icon: ShieldCheck, minorOnly: true, docId: 'default_parental' },
  { id: 'photography', label: 'Photography Release', icon: Camera, docId: 'default_photography' }
];

const POSITION_OPTIONS = [
  'Coach', 
  'Assistant Coach', 
  'Team Representative', 
  'Forward', 
  'Midfield', 
  'Defense', 
  'Goalkeeper', 
  'Utility', 
  'Squad Leader'
];

export default function RosterPage() {
  const { activeTeam, user, members, isMembersLoading, isStaff, updateStaffEvaluation, getStaffEvaluation, updateMember, purchasePro } = useTeam();
  const db = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isEditPositionOpen, setIsEditPositionOpen] = useState(false);
  const [newPosition, setNewPosition] = useState('');

  // Fetch team protocols to see what's "turned on"
  const docsQuery = useMemoFirebase(() => (db && activeTeam?.id) ? query(collection(db, 'teams', activeTeam.id, 'documents')) : null, [db, activeTeam?.id]);
  const { data: teamDocs } = useCollection<TeamDocument>(docsQuery);
  
  // Filter for ONLY active protocols
  const activeProtocolsMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    (teamDocs || []).forEach(d => {
      if (d.isActive !== false) map[d.id] = true;
    });
    return map;
  }, [teamDocs]);

  // Fetch signatures for compliance tracking
  const memberSigsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id || !selectedMember?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'members', selectedMember.id, 'signatures'));
  }, [db, activeTeam?.id, selectedMember?.id]);
  const { data: memberSigs } = useCollection(memberSigsQuery);
  const signedDocIds = useMemo(() => (memberSigs || []).map(s => s.docId), [memberSigs]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedMember && isStaff) {
      getStaffEvaluation(selectedMember.id).then(setStaffNote);
      setNewPosition(selectedMember.position);
    }
  }, [selectedMember, isStaff, getStaffEvaluation]);

  const recruitmentUrl = useMemo(() => {
    if (!activeTeam) return '';
    if (activeTeam.registrationProtocolId) {
      return `${window.location.origin}/register/league/${activeTeam.id}?protocol=${activeTeam.registrationProtocolId}`;
    }
    return `${window.location.origin}/teams/join?code=${activeTeam.code}`;
  }, [activeTeam]);

  const handleCopyRecruitmentUrl = async () => {
    try {
      await navigator.clipboard.writeText(recruitmentUrl);
      toast({ title: "Recruitment Link Copied" });
    } catch (e) {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  const calculateAgeGroup = (dob?: string) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return `U${age + 1}`;
  };

  const handleUpdatePosition = async () => {
    if (!selectedMember || !newPosition) return;
    setIsSavingNote(true);
    await updateMember(selectedMember.id, { position: newPosition });
    setSelectedMember(prev => prev ? { ...prev, position: newPosition } : null);
    setIsSavingNote(false);
    setIsEditPositionOpen(false);
    toast({ title: "Role Provisioned", description: `${selectedMember.name} is now ${newPosition}.` });
  };

  const handleExportPortfolio = useCallback(() => {
    if (!selectedMember) return;
    const headers = [
      "PLAYER PROFILE - THE SQUAD CERTIFIED",
      "",
      "Name", "Position", "Jersey", "Class", "GPA", "Clearance", "School", "Highlights", "Contact", "Evaluations"
    ];
    const row = [
      "", "",
      selectedMember.name,
      selectedMember.position,
      selectedMember.jersey,
      selectedMember.gradYear || 'N/A',
      selectedMember.gpa || 'N/A',
      selectedMember.medicalClearance ? 'CLEARED' : 'PENDING',
      selectedMember.school || 'N/A',
      selectedMember.highlightUrl || 'N/A',
      selectedMember.phone || selectedMember.parentEmail || 'N/A',
      staffNote.replace(/,/g, ';').replace(/\n/g, ' ')
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, row].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `RECRUITING_PACK_${selectedMember.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Recruiting Pack Generated", description: "Professional CSV portfolio exported." });
  }, [selectedMember, staffNote]);

  if (!mounted || !activeTeam || isMembersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  const isPro = activeTeam.isPro;
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
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-y-auto bg-white text-foreground">
                  <DialogTitle className="sr-only">Invite Teammates</DialogTitle>
                  <DialogDescription className="sr-only">Enroll new teammates via squad code or recruitment link</DialogDescription>
                  <div className="h-2 bg-primary w-full" />
                  <div className="p-8 space-y-8">
                    <DialogHeader>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Recruit Hub</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase text-[10px]">Enroll new teammates to {activeTeam.name}</DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6">
                      <div className="p-8 bg-primary/5 rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(activeTeam.code); toast({ title: "Code Copied" }); }}>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Squad Identity Code</p>
                        <div className="flex items-center justify-center gap-4">
                          <p className="text-5xl font-black text-primary tracking-widest">{activeTeam.code}</p>
                          <Copy className="h-6 w-6 text-primary opacity-30" />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Recruitment Pipeline Link</Label>
                        <div className="flex gap-2">
                          <Input value={recruitmentUrl} readOnly className="h-12 rounded-xl bg-muted/30 border-none font-bold text-xs truncate text-foreground" />
                          <Button size="icon" variant="outline" className="rounded-xl h-12 w-12 shrink-0 border-2" onClick={handleCopyRecruitmentUrl}><LinkIcon className="h-4 w-4" /></Button>
                        </div>
                        <p className="text-[9px] font-medium text-muted-foreground italic px-1 leading-relaxed">
                          {activeTeam.registrationProtocolId 
                            ? "This link sends recruits to your custom multi-step enrollment form." 
                            : "This link sends recruits to the public hub to enter your squad code."}
                        </p>
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
          <Input placeholder="Search squad roster..." className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner font-black text-sm text-foreground" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-[2rem] cursor-pointer group hover:shadow-md bg-white" onClick={() => setSelectedMember(member)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="rounded-2xl font-black bg-muted text-xs">{member.name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-black truncate text-lg tracking-tight group-hover:text-primary transition-colors text-foreground">{member.name}</h3>
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
        <DialogContent className="rounded-[3rem] sm:max-w-5xl border-none shadow-2xl p-0 flex flex-col bg-white overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogTitle className="sr-only">Player Profile: {selectedMember?.name}</DialogTitle>
          <DialogDescription className="sr-only">Detailed athletic portfolio and personnel evaluation for {selectedMember?.name}</DialogDescription>
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
                    <div className="flex items-center gap-2">
                      <p className="text-primary font-black uppercase tracking-[0.2em] text-sm">{selectedMember.position} • #{selectedMember.jersey}</p>
                      {activeTeam.role === 'Admin' && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => setIsEditPositionOpen(true)}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isPro && (
                    <div className="w-full pt-4 border-t border-white/10 space-y-4">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Recruiting Portfolio</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleExportPortfolio}><Download className="h-4 w-4" /></Button>
                      </div>
                      <Button className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] shadow-xl hover:bg-white/90" onClick={handleExportPortfolio}>Generate Recruiting Pack</Button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 p-8 lg:p-12 space-y-10 bg-white text-foreground">
                {isPro ? (
                  <>
                    <div className="space-y-6">
                      <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Award className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Athlete Narrative</h4></div>
                      <div className="bg-muted/30 p-6 rounded-[2.5rem] border-2 border-dashed">
                        <p className="text-sm font-medium leading-relaxed italic text-foreground/80">
                          {selectedMember.notes || "This athlete has not yet established a squad bio. Visit Settings to update."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Star className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Operational Skills & Achievements</h4></div>
                      <div className="flex flex-wrap gap-2">
                        {(selectedMember.skills || ['Speed', 'Communication', 'Technical Control']).map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="rounded-xl px-4 py-1.5 font-black text-[10px] uppercase">{skill}</Badge>
                        ))}
                        {(selectedMember.achievements || ['MVP 2023', 'District Finals 2024']).map((award, idx) => (
                          <Badge key={idx} className="bg-amber-100 text-amber-700 border-none rounded-xl px-4 py-1.5 font-black text-[10px] uppercase flex items-center gap-2">
                            <Trophy className="h-3 w-3" /> {award}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                      <div className="space-y-6">
                        <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><ShieldCheck className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Vital Stats</h4></div>
                        <div className="grid grid-cols-1 gap-3">
                          {STANDARD_WAIVERS.map(w => {
                            if (!activeProtocolsMap[w.docId]) return null;
                            const isAdult = selectedMember.birthdate && differenceInYears(new Date(), new Date(selectedMember.birthdate)) >= 18;
                            if (w.minorOnly && isAdult) return null;
                            const isSigned = signedDocIds.includes(w.docId);
                            return (
                              <div key={w.id} className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                                <span className="text-[10px] font-black uppercase opacity-40 text-foreground">{w.label}</span>
                                {isSigned ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                              </div>
                            );
                          })}
                          <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                            <span className="text-[10px] font-black uppercase opacity-40 text-foreground">Age Group</span>
                            <span className="text-sm font-black uppercase text-foreground">{calculateAgeGroup(selectedMember.birthdate) || 'U18'}</span>
                          </div>
                          <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                            <span className="text-[10px] font-black uppercase opacity-40 text-foreground">Grad Class</span>
                            <span className="text-sm font-black uppercase text-foreground">{selectedMember.gradYear || '2028'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><GraduationCap className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Institutional Audit</h4></div>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                            <span className="text-[10px] font-black uppercase opacity-40 text-foreground">Active Dues</span>
                            <span className={cn("text-sm font-black", selectedMember.feesPaid ? "text-green-600" : "text-primary")}>${selectedMember.amountOwed || 0}</span>
                          </div>
                          <div className="bg-muted/30 p-4 rounded-2xl flex items-center justify-between border border-transparent">
                            <span className="text-[10px] font-black uppercase opacity-40 text-foreground">Academic GPA</span>
                            <span className="text-sm font-black uppercase text-foreground">{selectedMember.gpa || '3.8'}</span>
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
                            className="min-h-[150px] bg-white rounded-2xl border-none font-bold p-6 text-base shadow-inner resize-none text-foreground" 
                          />
                          <Button className="w-full h-14 rounded-xl text-xs font-black uppercase shadow-lg shadow-primary/20" onClick={handleSaveNote} disabled={isSavingNote}>
                            {isSavingNote ? <Loader2 className="h-5 w-5 animate-spin" /> : "Commit Evaluation"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="bg-primary/10 p-8 rounded-[3rem] relative">
                      <Lock className="h-16 w-16 text-primary" />
                      <div className="absolute -top-2 -right-2 bg-black text-white p-2 rounded-full border-4 border-white shadow-xl">
                        <Zap className="h-4 w-4 fill-current" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Pro Insights Locked</h3>
                      <p className="text-muted-foreground font-medium text-sm max-w-sm mx-auto leading-relaxed">
                        Upgrade to <strong>Squad Pro</strong> to unlock recruiting portfolios, automated compliance tracking, and tactical staff evaluations.
                      </p>
                    </div>
                    <Button onClick={purchasePro} className="rounded-full px-10 h-14 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all">
                      Unlock Elite Hub
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditPositionOpen} onOpenChange={setIsEditPositionOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Provision Role</DialogTitle>
          <DialogDescription className="sr-only">Update organizational authority and team position</DialogDescription>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <UserCog className="h-6 w-6 text-primary" />
                <DialogTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Provision Role</DialogTitle>
              </div>
              <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px]">Modify organizational authority for {selectedMember?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">New Position / Title</Label>
              <Select value={newPosition} onValueChange={setNewPosition}>
                <SelectTrigger className="h-14 rounded-2xl border-2 font-bold text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {POSITION_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt} className="font-bold text-foreground">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20 space-y-2">
                <p className="text-[10px] font-black text-primary uppercase">Governance Tip</p>
                <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                  Promoting a member to <strong>Team Representative</strong> or <strong>Coach</strong> grants them authority to record match results and manage squad itineraries.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdatePosition} disabled={isSavingNote}>
                {isSavingNote ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6 mr-2" />}
                Commit Position Update
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}