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
  AlertCircle,
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
  const { activeTeam, user, members, isMembersLoading, isStaff, updateStaffEvaluation, getStaffEvaluation, updateMember, updateTeam, purchasePro, getLeagueMembers, createChat, removeMember, getRecruitingProfile, getAthleticMetrics, getPlayerStats, getEvaluations, getRecruitingContact } = useTeam();

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

  const handleUpdateMemberField = async (field: keyof Member, value: any) => {
    if (!selectedMember) return;
    try {
      await updateMember(selectedMember.id, { [field]: value });
      toast({ title: "Profile Synchronized", description: `${field.toUpperCase()} has been updated for ${selectedMember.name}` });
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    }
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
    members.filter(m => m.status !== 'removed').forEach(m => {
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

  const handleExportPortfolio = useCallback(async () => {
    if (!selectedMember) return;

    toast({ title: "Building Scouting Pack", description: "Fetching full athlete profile..." });

    // Fetch full recruiting data if playerId exists
    let profile: any = {};
    let metrics: any = {};
    let stats: any[] = [];
    let evals: any[] = [];
    let contact: any = {};

    if (selectedMember.playerId) {
      try {
        const [p, m, s, e, c] = await Promise.all([
          getRecruitingProfile(selectedMember.playerId),
          getAthleticMetrics(selectedMember.playerId),
          getPlayerStats(selectedMember.playerId),
          getEvaluations(selectedMember.playerId),
          getRecruitingContact(selectedMember.playerId),
        ]);
        if (p) profile = p;
        if (m) metrics = m;
        stats = s || [];
        evals = e || [];
        if (c) contact = c;
      } catch (err) {
        console.warn('Could not fetch scouting data:', err);
      }
    }
    
    generateBrandedPDF({
      title: "VERIFIED ATHLETE SCOUTING PACK",
      subtitle: "SQUADFORGE RECRUITING COURIER • INSTITUTIONAL DATA",
      filename: `SCOUTING_${selectedMember.name.replace(/\s+/g, '_').toUpperCase()}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const checkPageBreak = (currentY: number, needed = 20) => {
        if (currentY + needed > pageHeight - 25) { doc.addPage(); return 30; }
        return currentY;
      };

      const sectionHeader = (label: string, y: number) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 80, 255);
        doc.text(label.toUpperCase(), 20, y);
        doc.setDrawColor(200, 200, 200);
        doc.line(20, y + 2, pageWidth - 20, y + 2);
        return y + 10;
      };

      const drawField = (label: string, value: string, x: number, y: number, colWidth = 55) => {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(150, 150, 150);
        doc.text(label.toUpperCase(), x, y);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        const val = String(value || '—');
        doc.text(val.length > 18 ? val.slice(0, 17) + '…' : val, x, y + 6);
      };

      // ── HEADER ─────────────────────────────────────────────
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text((profile.fullName || selectedMember.name).toUpperCase(), 20, startY);
      
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      const subline = [
        selectedMember.position,
        selectedMember.jersey ? `#${selectedMember.jersey}` : null,
        activeTeam?.sport || null,
        activeTeam?.name || null
      ].filter(Boolean).join('  ·  ');
      doc.text(subline, 20, startY + 9);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(20, startY + 14, pageWidth - 20, startY + 14);

      // ── IDENTITY GRID ──────────────────────────────────────
      let y = startY + 24;
      y = sectionHeader('Identity & Academic', y);
      drawField('Graduation Year', String(profile.graduationYear || metrics.graduationYear || selectedMember.gradYear || '—'), 20, y);
      drawField('GPA', String(profile.academicGPA || metrics.academicGPA || selectedMember.gpa || '—'), 75, y);
      drawField('Intended Major', profile.intendedMajor || '—', 130, y);
      drawField('Recruit Status', (profile.status || 'Active').toUpperCase(), 185, y);
      y += 18;
      drawField('School', profile.school || metrics.school || '—', 20, y);
      drawField('Hometown', profile.hometown || '—', 75, y);
      drawField('Height', metrics.height || '—', 130, y);
      drawField('Weight', metrics.weight || '—', 185, y);
      y += 18;

      // ── CONTACT ────────────────────────────────────────────
      if (contact.email || contact.phone || contact.coachName) {
        y = checkPageBreak(y);
        y = sectionHeader('Recruiting Contact', y);
        if (contact.coachName) { drawField('Coaching Contact', contact.coachName, 20, y); }
        if (contact.email) { drawField('Email', contact.email, 75, y); }
        if (contact.phone) { drawField('Phone', contact.phone, 150, y); }
        y += 18;
      }

      // ── BIO ────────────────────────────────────────────────
      y = checkPageBreak(y, 25);
      y = sectionHeader('Athlete Narrative', y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const bio = profile.bio || selectedMember.notes || 'No narrative on file.';
      const bioLines = doc.splitTextToSize(`"${bio}"`, pageWidth - 40);
      doc.text(bioLines, 20, y);
      y += bioLines.length * 5 + 10;

      // ── ATHLETIC METRICS ───────────────────────────────────
      const metricFields = [
        ['40-Yard Dash', metrics.fortyYard], ['Vertical', metrics.vertical],
        ['Bench Press', metrics.benchPress], ['Squat', metrics.squat],
        ['Shuttle', metrics.shuttleRun], ['Speed Rating', metrics.speedRating],
        ['Strength', metrics.strengthRating], ['Agility', metrics.agilityRating],
        ['IQ Rating', metrics.footballIQ || metrics.basketballIQ || metrics.soccerIQ],
        ['Passing', metrics.throwingAccuracy], ['Ball Handling', metrics.ballHandling],
      ].filter(([_, v]) => v);

      if (metricFields.length > 0) {
        y = checkPageBreak(y);
        y = sectionHeader('Athletic Metrics', y);
        metricFields.forEach(([label, val], i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          if (col === 0 && i > 0) y += 16;
          drawField(label as string, String(val), 20 + col * 47, y);
        });
        y += 24;
      }

      // ── SEASONAL STATS ─────────────────────────────────────
      if (stats.length > 0) {
        y = checkPageBreak(y, 30);
        y = sectionHeader('Seasonal Analytics', y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('SEASON', 20, y); doc.text('GP', 75, y); doc.text('PTS', 95, y); doc.text('AST', 115, y); doc.text('REB/YDS', 135, y); doc.text('EFF', 165, y);
        y += 4;
        doc.setDrawColor(230, 230, 230);
        doc.line(20, y, pageWidth - 20, y);
        y += 5;
        stats.forEach(s => {
          y = checkPageBreak(y, 8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(20, 20, 20);
          doc.text(s.season || '—', 20, y);
          doc.text(String(s.gamesPlayed || '—'), 75, y);
          doc.text(String(s.points || '—'), 95, y);
          doc.text(String(s.assists || '—'), 115, y);
          doc.text(String(s.rebounds || s.yards || '—'), 135, y);
          const eff = s.gamesPlayed > 0 ? Math.round(((s.points || 0) + (s.assists || 0)) / s.gamesPlayed) : 0;
          doc.text(`${eff} AVG`, 165, y);
          y += 7;
        });
        y += 6;
      }

      // ── EVALUATIONS ────────────────────────────────────────
      if (evals.length > 0) {
        y = checkPageBreak(y, 30);
        y = sectionHeader('Staff Evaluations', y);
        evals.slice(0, 3).forEach(ev => {
          y = checkPageBreak(y, 20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          doc.text(`${ev.coachName || 'Staff'} — Overall: ${ev.overall || '—'}/10  ·  Athleticism: ${ev.athleticism || '—'}  ·  Skill: ${ev.skillLevel || '—'}  ·  Coachability: ${ev.coachability || '—'}`, 20, y);
          if (ev.notes) {
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            const evalLines = doc.splitTextToSize(`"${ev.notes}"`, pageWidth - 40);
            doc.text(evalLines, 20, y);
            y += evalLines.length * 4.5;
          }
          y += 6;
        });
      }

      // ── SKILLS & ACHIEVEMENTS ─────────────────────────────
      const skills = selectedMember.skills || [];
      const achievements = selectedMember.achievements || [];
      if (skills.length > 0 || achievements.length > 0) {
        y = checkPageBreak(y);
        y = sectionHeader('Skills & Achievements', y);
        if (skills.length > 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(120, 80, 255);
          doc.text('SKILLS:', 20, y);
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
          doc.text(skills.join('  ·  '), 44, y);
          y += 8;
        }
        if (achievements.length > 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(200, 140, 0);
          doc.text('AWARDS:', 20, y);
          doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
          doc.text(achievements.join('  ·  '), 44, y);
          y += 8;
        }
        y += 4;
      }

      // ── STAFF NOTES ────────────────────────────────────────
      if (staffNote) {
        y = checkPageBreak(y, 20);
        y = sectionHeader("Commander's Field Notes", y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
        const noteLines = doc.splitTextToSize(staffNote, pageWidth - 40);
        doc.text(noteLines, 20, y);
        y += noteLines.length * 5 + 8;
      }

      // ── COMPLIANCE ─────────────────────────────────────────
      y = checkPageBreak(y, 18);
      y = sectionHeader('Institutional Compliance', y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(20, 20, 20);
      doc.text(`Medical Clearance: ${selectedMember.medicalClearance ? 'VALID' : 'PENDING'}`, 20, y);
      doc.text(`Waivers: ${signedDocIds.length > 0 ? `${signedDocIds.length} EXECUTED` : 'PENDING'}`, 100, y);
      doc.text(`Fees: ${selectedMember.feesPaid ? 'PAID' : 'OUTSTANDING'}`, 170, y);

      return y + 20;
    });
    
    toast({ title: "Scouting Pack Exported", description: `Full profile for ${selectedMember.name} generated successfully.` });
  }, [selectedMember, staffNote, activeTeam, signedDocIds, getRecruitingProfile, getAthleticMetrics, getPlayerStats, getEvaluations, getRecruitingContact]);

  if (!mounted || !activeTeam || isMembersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calling the squad...</p>
      </div>
    );
  }

  const isPro = activeTeam.isPro;
  const filteredRoster = members.filter(member => 
    member.status !== 'removed' && 
    member.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveNote = async () => {
    if (!selectedMember) return;
    setIsSavingNote(true);
    try {
      await updateStaffEvaluation(selectedMember.id, staffNote);
      toast({ title: "Evaluation Synchronized", description: "This note is now archived in the athlete's institutional dossier." });
    } catch (e) {
      toast({ title: "Sync Failed", variant: "destructive" });
    } finally {
      setIsSavingNote(false);
    }
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
                      <div className="p-8 bg-primary/5 rounded-[2.5rem] text-center space-y-4 border-2 border-dashed border-primary/20 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(activeTeam.code || activeTeam.teamCode || activeTeam.inviteCode || ''); toast({ title: "Code Copied" }); }}>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Squad Identity Code</p>
                        <div className="flex items-center justify-center gap-3">
                          <p className={cn(
                            "font-black text-primary break-all leading-tight flex-1",
                            (activeTeam.code || "").length > 14 ? "text-2xl" : (activeTeam.code || "").length > 10 ? "text-4xl" : "text-5xl"
                          )}>{activeTeam.code || activeTeam.teamCode || activeTeam.inviteCode}</p>
                          <Copy className="h-6 w-6 text-primary opacity-30 shrink-0" />
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
        <DialogContent className="rounded-t-[3rem] sm:rounded-[3rem] sm:max-w-5xl border-none shadow-2xl p-0 flex flex-col bg-white overflow-y-auto max-h-[95dvh] sm:max-h-[90vh] custom-scrollbar text-foreground">
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
                            <div className="flex gap-2">
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

                              {/* Decommission UI removed from here, moving to header for better visibility */}
                            </div>
                          )}
                        </div>
                      <div className="flex flex-col gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest">
                        {selectedMember.division && (
                          <div className="flex items-center gap-2">
                            <Target className="h-3 w-3" />
                            <span>Division: {selectedMember.division}</span>
                          </div>
                        )}
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
                    <div className="w-full pt-4 border-t border-white/10 space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Personnel Actions</span>
                        <div className="flex gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleExportPortfolio}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Export Portfolio
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <Button className="w-full h-11 rounded-xl bg-white text-black font-black uppercase text-[10px] shadow-xl hover:bg-white/90" onClick={handleExportPortfolio}>Generate Scouting Pack</Button>
                        
                        {activeTeam?.role === 'Admin' && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="w-full h-11 rounded-xl border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white font-black uppercase text-[10px] transition-all">Decommission Athlete</Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-[2.5rem] p-8 border-none bg-white max-w-md text-foreground">
                              <DialogHeader>
                                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Personnel Decommission</DialogTitle>
                                <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Permanent Archive Request for {selectedMember.name}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-6">
                                <div className="space-y-3">
                                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Archive Reason <span className="opacity-40 normal-case">(Required for Audit)</span></Label>
                                  <Textarea 
                                    id="removal-reason-main"
                                    placeholder="e.g. Seasonal turnover, voluntary withdrawal..." 
                                    className="min-h-[100px] bg-muted/20 border-none rounded-2xl font-bold p-4 text-sm text-foreground"
                                  />
                                </div>
                                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-2">
                                  <p className="text-[10px] font-black text-red-700 uppercase">Warning</p>
                                  <p className="text-[10px] font-medium text-red-600 leading-relaxed italic">Decommissioned personnel are immediately removed from active rosters and communications. Their profile remains in the administrative archives for 7 years.</p>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button 
                                  className="w-full h-14 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest shadow-xl shadow-red-600/20"
                                  onClick={async () => {
                                    const reason = (document.getElementById('removal-reason-main') as HTMLTextAreaElement)?.value;
                                    if (!reason) {
                                      toast({ title: "Reason Required", description: "Please provide an audit reason for decommissioning.", variant: "destructive" });
                                      return;
                                    }
                                    await removeMember(selectedMember.id, reason);
                                    setSelectedMemberId(null);
                                    toast({ title: "Personnel Decommissioned" });
                                  }}
                                >
                                  Authorize Full Decommission
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 p-8 lg:p-12 space-y-10 bg-white text-foreground">
                {isPro ? (
                  <>
                    <div className="space-y-6">
                      <div className="flex items-center gap-3"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Award className="h-5 w-5" /></div><h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Athlete Narrative</h4></div>
                      
                      {isStaff && (
                         <div className="bg-black/5 p-6 rounded-3xl border-2 border-dashed space-y-4 mb-6">
                           <div className="flex items-center justify-between">
                             <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Institutional Tier / Division</Label>
                           </div>
                           <Input 
                             placeholder="e.g. Varsity, Junior Varsity, Elite..."
                             value={selectedMember.division || ''}
                             onChange={(e) => handleUpdateMemberField('division', e.target.value)}
                             className="h-12 rounded-[1.5rem] border-2 font-black text-lg bg-white"
                           />
                           <p className="text-[9px] font-medium text-muted-foreground italic leading-relaxed">Assign this athlete to a specific competitive division for league and tournament sorting.</p>
                         </div>
                      )}

                      <div className="bg-muted/30 p-6 rounded-[2.5rem] border-2 border-dashed">
                        <p className="text-sm font-medium leading-relaxed italic text-foreground/80">
                          {selectedMember.notes || "This athlete has not yet established a squad bio. Visit Settings to update."}
                        </p>
                      </div>
                    </div>

                    {/* Skills & Achievements — read-only in roster, editable in Pack Architect */}
                    {((selectedMember.skills?.length || 0) > 0 || (selectedMember.achievements?.length || 0) > 0) && (
                      <div className="space-y-3 pt-4 border-t border-muted/30">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-primary" />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Skills &amp; Achievements</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(selectedMember.skills || []).map((skill, idx) => (
                            <Badge key={idx} variant="secondary" className="rounded-xl px-3 py-1 font-black text-[10px] uppercase">{skill}</Badge>
                          ))}
                          {(selectedMember.achievements || []).map((award, idx) => (
                            <Badge key={idx} className="bg-amber-100 text-amber-700 border-none rounded-xl px-3 py-1 font-black text-[10px] uppercase flex items-center gap-1.5">
                              <Trophy className="h-3 w-3" /> {award}
                            </Badge>
                          ))}
                        </div>
                        {isStaff && <p className="text-[9px] font-bold text-muted-foreground opacity-40 uppercase tracking-widest">Edit skills in Pack Architect (Coaches Corner &rarr; Recruit tab &rarr; Skills)</p>}
                      </div>
                    )}
                    {selectedMember.playerId && (
                      <a href={`/recruit/player/${selectedMember.playerId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary hover:underline pt-2">
                        <ExternalLink className="h-3 w-3" /> View Public Scout Portal
                      </a>
                    )}

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
                                        {format(new Date(signatureRecord.signedAt), 'MMMM d, yyyy h:mm a')}
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
                                      <AlertCircle className="h-3 w-3" /> Pending
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