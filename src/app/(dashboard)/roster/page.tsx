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
  Lock,
  Play,
  Video,
  Plus,
  Bookmark,
  MessageSquare,
  Shield,
  Mail,
  Users,
  Phone,
  ArrowRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useTeam, Member, TeamDocument } from '@/components/providers/team-provider';
import { EmailExportDialog } from '@/components/team/EmailExportDialog';
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
import { generateBrandedPDF } from '@/lib/pdf-utils';
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
import { collection, query, orderBy, where, onSnapshot } from 'firebase/firestore';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format, differenceInYears } from 'date-fns';

const STANDARD_WAIVERS = [
  { id: 'medical', label: 'Medical Clearance', icon: HeartPulse, docId: 'default_medical' },
  { id: 'travel', label: 'Travel Consent', icon: Plane, docId: 'default_travel' },
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
  const { activeTeam, user, members, isMembersLoading, isStaff, updateStaffEvaluation, getStaffEvaluation, updateMember, updateTeam, purchasePro, getLeagueMembers, createChat } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId) || null, [members, selectedMemberId]);
  const [staffNote, setStaffNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingPosition, setIsSavingPosition] = useState(false);
  const [isEditPositionOpen, setIsEditPositionOpen] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const [customPosition, setCustomPosition] = useState('');

  const isPartOfLeague = useMemo(() => {
    return activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).length > 0;
  }, [activeTeam]);

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

  const [videos, setVideos] = useState<any[]>([]);
  const [activeVideo, setActiveVideo] = useState<any | null>(null);

  useEffect(() => {
    if (!db || !selectedMember?.playerId) {
      setVideos([]);
      return;
    }
    const q = query(collection(db, 'players', selectedMember.playerId, 'videos'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setVideos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [db, selectedMember?.playerId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedMember && isStaff) {
      getStaffEvaluation(selectedMember.id).then(setStaffNote);
      const pos = selectedMember.position || '';
      // Initialize position state correctly for custom values
      setNewPosition(pos);
      if (pos && !POSITION_OPTIONS.includes(pos)) {
        setCustomPosition(pos);
      } else {
        setCustomPosition('');
      }
    }
  }, [selectedMember, isStaff, getStaffEvaluation]);

  const recruitmentUrl = useMemo(() => {
    if (!activeTeam || typeof window === 'undefined') return '';
    if (activeTeam.registrationProtocolId) {
      return `${window.location.origin}/register/league/${activeTeam.id}?protocol=${activeTeam.registrationProtocolId}`;
    }
    return `${window.location.origin}/teams/join?code=${activeTeam.code}`;
  }, [activeTeam, mounted]);

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
    if (!selectedMember) return;
    setIsSavingPosition(true);
    try {
      const finalPosition = newPosition === 'Custom' ? customPosition : newPosition;
      if (!finalPosition) return;
      await updateMember(selectedMember.id, { position: finalPosition });
      setIsEditPositionOpen(false);
      toast({ title: "Role Provisioned", description: `${selectedMember.name} has been assigned as ${finalPosition}` });
    } catch (e) {
      toast({ title: "Provisioning Error", variant: "destructive" });
    } finally {
      setIsSavingPosition(false);
    }
  };

  const parents = useMemo(() => {
    const pMap = new Map<string, { email: string; name: string; children: string[]; parentId?: string; phone?: string }>();
    members.forEach(m => {
      if (m.parentEmail) {
        const key = m.parentEmail.toLowerCase();
        if (!pMap.has(key)) {
          pMap.set(key, {
            email: m.parentEmail,
            name: `Guardian of ${m.name}`,
            children: [m.name],
            parentId: m.parentId,
            phone: m.phone // This might be the player's phone, but we'll use it as contact if available
          });
        } else {
          const p = pMap.get(key)!;
          if (!p.children.includes(m.name)) {
            p.children.push(m.name);
            if (p.children.length > 2) {
              p.name = `Guardian of ${p.children[0]}, ${p.children[1]} +${p.children.length - 2}`;
            } else {
              p.name = `Guardian of ${p.children.join(' & ')}`;
            }
          }
        }
      }
    });
    return Array.from(pMap.values());
  }, [members]);

  const handleChatWithParent = async (parent: any) => {
    if (!parent.parentId) {
      toast({ 
        title: "Strategic Restriction", 
        description: "This guardian has not yet initialized their account. They must join the squad to enable direct messaging.", 
        variant: "destructive" 
      });
      return;
    }
    try {
      const chatId = await createChat(`Direct: ${parent.name}`, [parent.parentId]);
      if (chatId) {
        router.push(`/messages?chatId=${chatId}`);
        toast({ title: "Secure Channel Established", description: `You are now in a direct encrypted chat with ${parent.name}.` });
      }
    } catch (e) {
      toast({ title: "Communication Error", description: "Failed to establish secure channel.", variant: "destructive" });
    }
  };

  const handleExportPortfolio = useCallback(() => {
    if (!selectedMember) return;
    
    generateBrandedPDF({
      title: "VERIFIED ATHLETE PORTFOLIO",
      subtitle: "SQUADFORGE RECRUITING COURIER • INSTITUTIONAL DATA",
      filename: `SCOUTING_REPORT_${selectedMember.name.replace(/\s+/g, '_')}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Main Content Header
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(selectedMember.name.toUpperCase(), 20, startY);
      
      doc.setFontSize(11);
      doc.setTextColor(150, 150, 150);
      doc.text(`${selectedMember.position}  |  #${selectedMember.jersey}`, 20, startY + 8);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(20, startY + 13, pageWidth - 20, startY + 13);

      // --- Stats Grid ---
      let y = startY + 25;
      const drawStat = (label: string, value: string, x: number, currentY: number) => {
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text(label.toUpperCase(), x, currentY);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.text(value || 'N/A', x, currentY + 6);
      };

      drawStat("Graduation Class", selectedMember.gradYear || 'N/A', 20, y);
      drawStat("Academic GPA", selectedMember.gpa || 'N/A', 80, y);
      drawStat("Recruit Status", selectedMember.medicalClearance ? 'CLEARED' : 'VERIFIED', 140, y);
      
      y += 20;
      drawStat("Sanctioned Sport", activeTeam?.sport || 'General', 20, y);
      drawStat("Age Group", calculateAgeGroup(selectedMember.birthdate) || 'U18', 80, y);
      drawStat("Institutional ID", selectedMember.id.slice(-8), 140, y);

      // --- Narrative Section ---
      y += 25;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("ATHLETE NARRATIVE & EVALUATION", 20, y);
      
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const bioLines = doc.splitTextToSize(selectedMember.notes || "This athlete is currently maintaining an active profile within the squad ecosystem.", pageWidth - 40);
      doc.text(bioLines, 20, y);
      
      y += (bioLines.length * 6) + 10;
      
      // Staff Commentary
      if (staffNote) {
        doc.setFont("helvetica", "bold");
        doc.text("COMMANDER'S FIELD NOTES", 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const noteLines = doc.splitTextToSize(staffNote, pageWidth - 40);
        doc.text(noteLines, 20, y);
        y += (noteLines.length * 6) + 10;
      }

      // Compliance Tracking
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("INSTITUTIONAL COMPLIANCE", 20, y);
      y += 7;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Medical Clearance: ${selectedMember.medicalClearance ? 'VALID' : 'PENDING'}`, 20, y);
      doc.text(`Institutional Waiver: ${signedDocIds.includes('default_medical') || signedDocIds.length > 0 ? 'EXECUTED' : 'PENDING'}`, 80, y);

      return y + 20;
    });
    
    toast({ title: "Professional Portfolio Exported", description: "Modern PDF generated successfully." });
  }, [selectedMember, staffNote, activeTeam, signedDocIds]);

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
              <EmailExportDialog 
                members={members} 
                teamName={activeTeam.name} 
                getLeagueMembers={getLeagueMembers}
                leagueIds={activeTeam.leagueIds}
              />
            )}
            {isStaff && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button 
                    size="sm" 
                    disabled={activeTeam.rosterLimit ? members.filter(m => m.role === 'Member').length >= activeTeam.rosterLimit : false}
                    className="rounded-full px-6 font-black uppercase text-[10px] lg:text-xs h-10 lg:h-11 tracking-widest shadow-lg shadow-primary/20"
                  >
                    {activeTeam.rosterLimit && members.filter(m => m.role === 'Member').length >= activeTeam.rosterLimit ? (
                      <Badge className="bg-red-600 text-white h-5 mr-2 -ml-2 border-none text-[8px] font-black uppercase">FULL</Badge>
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    {activeTeam.rosterLimit && members.filter(m => m.role === 'Member').length >= activeTeam.rosterLimit ? 'Squad Full' : 'Invite'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-0 overflow-y-auto bg-white text-foreground">
                  <DialogTitle className="sr-only">Invite Teammates</DialogTitle>
                  <DialogDescription className="sr-only">Enroll new teammates via squad code or recruitment link</DialogDescription>
                  <div className="h-2 bg-primary w-full" />
                  <div className="p-8 space-y-8">
                    <DialogHeader>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Recruit Hub</DialogTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <DialogDescription className="font-bold text-primary uppercase text-[10px] shrink-0">Enroll new teammates to {activeTeam.name}</DialogDescription>
                        <div className="h-px bg-primary/20 flex-1 ml-2" />
                      </div>
                    </DialogHeader>
                    
                    <div className="space-y-6">
                      <div className="bg-black/5 p-6 rounded-3xl border-2 border-dashed space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Personnel Cap (Coach Controlled)</Label>
                          <Badge className="bg-primary text-white border-none font-black text-[9px] h-5 px-3 uppercase tracking-widest">{members.filter(m => m.role === 'Member').length} / {activeTeam.rosterLimit || '∞'} Seats</Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input 
                            type="number" 
                            placeholder="Set Seat Limit..."
                            value={activeTeam.rosterLimit || ''}
                            onChange={(e) => updateTeam(activeTeam.id, { rosterLimit: parseInt(e.target.value) || 0 })}
                            className="h-12 rounded-[1.5rem] border-2 font-black text-lg bg-white"
                          />
                          <div className="p-3 bg-white rounded-2xl border-2 text-muted-foreground/30">
                            <Settings className="h-5 w-5" />
                          </div>
                        </div>
                        <p className="text-[9px] font-medium text-muted-foreground italic leading-relaxed"> Define the total number of athletes permitted in the squad personnel pool.</p>
                      </div>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="outline" className="rounded-xl h-12 w-12 shrink-0 border-2" onClick={handleCopyRecruitmentUrl}>
                                <LinkIcon className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Copy Recruitment Link
                            </TooltipContent>
                          </Tooltip>
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

        {activeTeam.type === 'youth' && (
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/50 flex items-start gap-3 shadow-sm">
            <div className="p-2 bg-amber-100 rounded-xl shrink-0">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">U18 Safety Protocol Active</p>
              <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                This is classified as an Under 18 team. Parental features **must** be initiated for all athletes. Ensure every student has a verified guardian linked to their roster profile for compliance and safety.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredRoster.map((member) => (
          <Card key={member.id} className="overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-[2rem] cursor-pointer group hover:shadow-md bg-white" onClick={() => setSelectedMemberId(member.id)}>
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
                    {member.medicalClearance && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-green-500 rounded-full h-1.5 w-1.5 animate-pulse shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Squad Protocol: Cleared
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">{member.position}</p>
                    {member.medicalClearance && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="h-4 px-1 text-primary border-none bg-primary/5 -mt-0.5">
                            <FileSignature className="h-3 w-3" />
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Execution Confirmed
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Parents & Guardians Section */}
      {isStaff && parents.length > 0 && (
        <div className="space-y-6 pt-12 pb-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="h-12 w-12 rounded-[1.25rem] bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                 <Users className="h-6 w-6" />
               </div>
               <div>
                 <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tight">Parents & Guardians</h2>
                 <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 opacity-70">Logistical Support & Emergency Coordination</p>
               </div>
            </div>
            <Badge variant="outline" className="rounded-full px-4 border-primary/20 text-primary font-black text-[10px] uppercase">
              {parents.length} Active Guardians
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {parents.map((parent, idx) => (
              <Card key={idx} className="overflow-hidden border-none shadow-sm transition-all duration-300 ring-1 ring-black/5 rounded-[2rem] cursor-pointer group hover:shadow-md bg-white" onClick={() => handleChatWithParent(parent)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                      <AvatarFallback className="rounded-2xl font-black bg-primary/5 text-primary text-xs flex flex-col items-center justify-center">
                        <Users className="h-6 w-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-black truncate text-lg tracking-tight group-hover:text-primary transition-colors text-foreground">{parent.name}</h3>
                        <Badge variant="outline" className="text-[9px] h-5 border-primary/20 text-primary font-black uppercase">Guardian</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">
                          {parent.children.length > 2 ? `Guardian of ${parent.children[0]}, ${parent.children[1]} +${parent.children.length-2}` : `Guardian of ${parent.children.join(' & ')}`}
                        </p>
                        {parent.parentId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="h-4 px-1 text-primary border-none bg-primary/5 -mt-0.5">
                                <MessageSquare className="h-3 w-3" />
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Direct Messaging Enabled
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={cn("h-5 w-5 text-primary transition-all", parent.parentId ? "opacity-20 group-hover:opacity-100" : "opacity-5")} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!selectedMemberId} onOpenChange={(open) => !open && setSelectedMemberId(null)}>
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
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <p className="text-primary font-black uppercase tracking-[0.2em] text-sm">{selectedMember.position} • #{selectedMember.jersey}</p>
                          {activeTeam?.role === 'Admin' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white shrink-0" onClick={() => setIsEditPositionOpen(true)}>
                                  <Settings className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Provision New Role
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      <div className="flex flex-col gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest">
                        {selectedMember.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            <span>{selectedMember.email}</span>
                          </div>
                        )}
                        {selectedMember.parentEmail && (
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            <span>Guardian: {selectedMember.parentEmail}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {isPro && (
                    <div className="w-full pt-4 border-t border-white/10 space-y-4">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Recruiting Portfolio</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleExportPortfolio}>
                              <Download className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Export Intelligence Report
                          </TooltipContent>
                        </Tooltip>
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
                          {(teamDocs || []).filter(d => d.isActive !== false).map(w => {
                            const isParentalWaiver = w.id === 'default_parental';
                            const isAdult = selectedMember.birthdate && differenceInYears(new Date(), new Date(selectedMember.birthdate)) >= 18;
                            if (isParentalWaiver && isAdult) return null;
                            
                            const signatureRecord = (memberSigs || []).find(s => s.docId === w.id);
                            const isSigned = !!signatureRecord;
                            
                            // Check if assigned to this member
                            const isAssigned = w.assignedTo?.includes('all') || w.assignedTo?.includes(selectedMember.id);
                            if (!isAssigned) return null;

                            return (
                              <div key={w.id} className="bg-muted/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between border border-transparent gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase text-foreground relative top-0.5">{w.title || 'Custom Waiver'}</span>
                                    {signatureRecord?.signedByParent && (
                                      <Badge variant="outline" className="h-4 px-1.5 text-[6px] border-primary/20 text-primary font-black uppercase tracking-tighter">Parent Signature</Badge>
                                    )}
                                  </div>
                                  {isSigned && signatureRecord.signedAt && (
                                    <div className="space-y-0.5 mt-1">
                                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {format(new Date(signatureRecord.signedAt), 'MMM d, yyyy h:mm a')}
                                      </p>
                                      {signatureRecord.signedByParent && signatureRecord.parentName && (
                                        <p className="text-[8px] font-black text-primary uppercase tracking-[0.1em]">
                                          Signed by {signatureRecord.parentName}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                  {isSigned ? (
                                    <>
                                      {signatureRecord?.signedByParent && <ShieldCheck className="h-4 w-4 text-primary opacity-40 shrink-0" />}
                                      <Badge className="bg-green-100 text-green-700 border-none rounded-xl px-3 py-1 font-black text-[9px] uppercase flex items-center gap-1 shadow-sm">
                                        <CheckCircle2 className="h-3 w-3" /> Signed
                                      </Badge>
                                    </>
                                  ) : (
                                    <Badge className="bg-red-100 text-red-700 border-none rounded-xl px-3 py-1 font-black text-[9px] uppercase flex items-center gap-1 shadow-sm">
                                      <XCircle className="h-3 w-3" /> Pending
                                    </Badge>
                                  )}
                                </div>
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
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-xl text-primary"><GraduationCap className="h-5 w-5" /></div>
                          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Institutional Audit</h4>
                        </div>
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

                    <div className="space-y-6 pt-6 border-t">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl text-primary"><Video className="h-5 w-5" /></div>
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Highlight Reel</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {videos.length > 0 ? (
                          videos.map(v => (
                            <Card key={v.id} className="rounded-2xl border bg-muted/20 p-4 space-y-3 group hover:ring-1 hover:ring-primary cursor-pointer transition-all" onClick={() => setActiveVideo(v)}>
                              <div className="bg-black aspect-video rounded-xl flex items-center justify-center relative overflow-hidden">
                                <Play className="h-8 w-8 text-white fill-current opacity-60" />
                                <Badge className="absolute top-2 left-2 bg-primary/80 border-none font-black text-[7px] uppercase h-4">{v.type}</Badge>
                              </div>
                              <p className="text-[10px] font-black uppercase truncate">{v.title}</p>
                            </Card>
                          ))
                        ) : (
                          <div className="col-span-full py-10 text-center opacity-30 italic text-xs uppercase font-black">No reel archived.</div>
                        )}
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
                  {newPosition && newPosition !== 'Custom' && !POSITION_OPTIONS.includes(newPosition) && (
                    <SelectItem key={newPosition} value={newPosition} className="font-bold text-foreground">{newPosition}</SelectItem>
                  )}
                  {POSITION_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={opt} className="font-bold text-foreground">{opt}</SelectItem>
                  ))}
                  <SelectItem value="Custom" className="font-black text-primary uppercase text-[10px]">Set Custom Role...</SelectItem>
                </SelectContent>
              </Select>
              {newPosition === 'Custom' && (
                <div className="space-y-4 animate-in slide-in-from-top duration-300">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Specify Unique Role</Label>
                   <Input 
                     autoFocus
                     value={customPosition}
                     placeholder="e.g. Offensive Tactician..." 
                     className="h-14 rounded-2xl border-2 font-black text-foreground bg-muted/10"
                     onChange={(e) => setCustomPosition(e.target.value)}
                   />
                </div>
              )}
              <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20 space-y-2">
                <p className="text-[10px] font-black text-primary uppercase">Governance Tip</p>
                <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                  Promoting a member to <strong>Team Representative</strong> or <strong>Coach</strong> grants them authority to record match results and manage squad itineraries.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdatePosition} disabled={isSavingPosition}>
                {isSavingPosition ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6 mr-2" />}
                Commit Position Update
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeVideo} onOpenChange={() => setActiveVideo(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-4xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          {activeVideo && (
            <div className="bg-black aspect-video relative flex items-center justify-center">
                <iframe
                  src={activeVideo.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/').split('&')[0]}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}