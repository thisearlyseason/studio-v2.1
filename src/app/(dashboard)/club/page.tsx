"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTeam, Team, Member, TeamDocument, DocumentSignature, TeamIncident } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Building, 
  Users, 
  Plus, 
  ChevronRight, 
  ShieldCheck, 
  Trophy, 
  UserPlus, 
  Settings,
  LayoutGrid,
  Search,
  Loader2,
  Mail,
  Zap,
  ArrowUpRight,
  DollarSign,
  TrendingUp,
  Activity,
  ShieldAlert,
  BarChart3,
  Trash2,
  Edit3,
  FileText,
  Clock,
  Download,
  AlertCircle,
  FileSignature,
  Target,
  CheckCircle2,
  XCircle,
  FolderClosed,
  ChevronDown,
  Shield,
  MessageCircle,
  Info,
  X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, where, orderBy, collection, getDocs, limit, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncidentDetailDialog } from '@/app/(dashboard)/coaches-corner/page';
import { format, parseISO } from 'date-fns';

function TeamComplianceCard({ teams, clubDocs }: { teams: Team[], clubDocs: TeamDocument[] }) {
  const db = useFirestore();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  
  const masterProtocols = useMemo(() => clubDocs.filter(d => d.isClubMaster), [clubDocs]);
  
  const sigsQuery = useMemoFirebase(() => {
    if (!db || !selectedTeamId) return null;
    return query(collectionGroup(db, 'signatures'), where('teamId', '==', selectedTeamId));
  }, [db, selectedTeamId]);

  const { data: teamSigs } = useCollection<DocumentSignature>(sigsQuery);

  return (
    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
      <CardHeader className="bg-black text-white p-8">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg"><ShieldCheck className="h-6 w-6 text-white" /></div>
          <div>
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Mandate Verification</CardTitle>
            <CardDescription className="text-white/60 font-bold uppercase text-[10px] tracking-widest">Audit squad-level protocol execution</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger className="h-14 rounded-2xl border-2 font-black text-foreground shadow-inner"><SelectValue placeholder="Pick a team to audit..." /></SelectTrigger>
          <SelectContent className="rounded-2xl">{teams.map(t => (<SelectItem key={t.id} value={t.id} className="font-bold uppercase">{t.name}</SelectItem>))}</SelectContent>
        </Select>

        {selectedTeamId && (
          <div className="space-y-4 animate-in fade-in">
            {masterProtocols.map(protocol => {
              const signature = teamSigs?.find(s => s.documentId === protocol.id);
              const isSigned = !!signature;
              return (
                <div key={protocol.id} className={cn("flex items-center justify-between p-5 rounded-3xl border-2 transition-all", isSigned ? "bg-green-50/50 border-green-100" : "bg-muted/20 border-transparent")}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-colors", isSigned ? "bg-green-500 text-white" : "bg-white text-muted-foreground/30 border")}>{isSigned ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</div>
                    <div className="min-w-0"><p className="text-sm font-black uppercase truncate text-foreground">{protocol.title}</p>{isSigned ? (<p className="text-[9px] font-bold text-green-600 uppercase">Signed by {signature.userName || 'Representative'}</p>) : (<p className="text-[9px] font-bold text-muted-foreground uppercase">Pending Signature</p>)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function ClubManagementPage() {
  const { teams, user, isPrimaryClubAuthority, createNewTeam, setActiveTeam, updateUser, updateTeam, deleteTeam, deployClubProtocol, hasFeature, isSchoolMode, isSchoolAdmin, activeTeam, members, db, createChat, reinstateMember } = useTeam();
  const [selectedCoach, setSelectedCoach] = useState<Member | null>(null);
  
  if (!isPrimaryClubAuthority) {
    return <AccessRestricted type="role" title={isSchoolMode ? "School Hub Locked" : "Club Hub Locked"} description={isSchoolMode ? "This command center is reserved for School Hub Administrators." : "This command center is reserved for Institutional Stakeholders and Club Hub Administrators."} />;
  }

  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditClubOpen, setIsEditOpen] = useState(false);
  const [isDeployProtocolOpen, setIsDeployProtocolOpen] = useState(false);
  const [isSubSquadModalOpen, setIsSubSquadModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [clubForm, setClubForm] = useState({ name: user?.schoolName || user?.clubName || '', description: user?.clubDescription || '', schoolName: user?.schoolName || user?.clubName || '', institutionTitle: user?.institutionTitle || (isSchoolMode ? 'Athletic Director' : '') });
  const [protocolForm, setProtocolForm] = useState({ title: '', content: '', type: 'waiver' as any });
  const [newSquadForm, setNewSquadForm] = useState({ name: '', coachName: '', coachEmail: '' });
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [adminProfiles, setAdminProfiles] = useState<any[]>([]);
  const [viewingIncident, setViewingIncident] = useState<TeamIncident | null>(null);

  // School Hub onboarding note — localStorage-persisted dismiss
  const HUB_NOTE_KEY = 'school_hub_note_dismissed_v1';
  const [hubNoteDismissed, setHubNoteDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(HUB_NOTE_KEY) === 'true';
    }
    return false;
  });
  const dismissHubNote = () => {
    setHubNoteDismissed(true);
    if (typeof window !== 'undefined') localStorage.setItem(HUB_NOTE_KEY, 'true');
  };

  // Improved Hub Resolution: Find an explicit school hub, or fallback to the first pro team if user is on a school plan
  const schoolHub = useMemo(() => {
    const explicit = teams.find(t => t.type === 'school' || t.type === 'school_hub');
    if (explicit) return explicit;
    
    // If no explicit hub but user is on school plan, treat their primary owned team as the hub
    if (isSchoolMode) {
      return teams.find(t => t.ownerUserId === user?.id && t.isPro) || teams[0] || null;
    }
    return null;
  }, [teams, isSchoolMode, user?.id]);

  // School Logic: Get sub-squads relative to the identified hub
  const schoolSquads = useMemo(() => {
    if (schoolHub) {
      // Return teams that are linked to this hub, or all other owned teams if it's a fallback hub
      return teams.filter(t => t.id !== schoolHub.id && (t.schoolId === schoolHub.id || (isSchoolMode && t.ownerUserId === user?.id)));
    }
    return [];
  }, [schoolHub, teams, isSchoolMode, user?.id]);

  const clubTeams = useMemo(() => {
    if (schoolHub) {
        const all = [schoolHub, ...schoolSquads];
        // Ensure unique by ID
        return Array.from(new Map(all.map(t => [t.id, t])).values());
    }
    return teams.filter(t => t.ownerUserId === user?.id && t.isPro);
  }, [teams, user?.id, schoolHub, schoolSquads]);
  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);

  // Get all school team IDs for querying members directly
  const schoolTeamIds = useMemo(() => {
    if (!schoolHub) return [];
    const allTeams = [schoolHub, ...schoolSquads];
    return allTeams.map(t => t.id);
  }, [schoolHub, schoolSquads]);

  // Fetch members from ALL squad sub-collections independently so we don't
  // rely on a collectionGroup+in composite index (which causes partial results).
  const [allRawMembers, setAllRawMembers] = useState<Member[]>([]);

  const fetchAllSquadMembers = useCallback(async () => {
    if (!db || teams.length === 0) return;
    try {
      const results: Member[] = [];
      for (const team of teams) {
        const snap = await getDocs(collection(db, 'teams', team.id, 'members'));
        snap.forEach(d => results.push({ id: d.id, ...d.data() } as Member));
      }
      setAllRawMembers(results);
    } catch (e) {
      console.warn('Failed to fetch squad members:', e);
    }
  }, [db, teams]);

  useEffect(() => {
    fetchAllSquadMembers();
  }, [fetchAllSquadMembers]);

  // Aggregate all members from all school teams
  const clubMembers = useMemo(() => {
    if (!allRawMembers && !schoolHub) return [];
    
    // In school mode, we want members who belong to any of our identified squads or the hub
    const hubId = schoolHub?.id;
    const squadIds = new Set(teams.map(t => t.id)); // Use ALL current teams the user can see
    
    const validMembers = (allRawMembers || []).filter(m => 
      squadIds.has(m.teamId) || m.schoolId === hubId || m.teamId === hubId
    );
    
    // Deduplicate by userId first, fallback to id for placeholders
    const uniqueMap = new Map<string, Member>();
    validMembers.forEach(m => {
      const key = m.userId || m.id;
      if (!uniqueMap.has(key) || (m.userId && !uniqueMap.get(key)?.userId)) {
        uniqueMap.set(key, m);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allRawMembers, schoolHub, teams]);



  const docsQuery = useMemoFirebase(() => (db && user?.id) ? query(collectionGroup(db, 'documents'), where('ownerUserId', '==', user.id)) : null, [db, user?.id]);
  const { data: allDocsRaw } = useCollection<TeamDocument>(docsQuery);

  // Also fetch from the global club-documents path (where deployClubProtocol always writes)
  const globalDocsQuery = useMemoFirebase(() => (db && user?.id) ? collection(db, 'users', user.id, 'clubDocuments') : null, [db, user?.id]);
  const { data: globalDocsRaw } = useCollection<TeamDocument>(globalDocsQuery as any);

  const clubDocs = useMemo(() => {
    const all = [...(allDocsRaw || []), ...(globalDocsRaw || [])];
    // Deduplicate by id — global docs may overlap with team-level copies
    const seen = new Set<string>();
    return all.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
  }, [allDocsRaw, globalDocsRaw]);

  // School Logic: Universal Coach & Staff Roster
  // Always include the Athletic Director (actual user) at the top, then all
  // Admin/coach-position members from every squad — deduplicated by unique userId.
  const allCoaches = useMemo(() => {
    const staffKeywords = ['coach', 'director', 'coordinator', 'staff', 'manager', 'trainer'];

    // Build a deduplicated set, keyed by userId
    const seen = new Set<string>();
    const coaches: Member[] = [];

    // Skip the logged-in account owner — they are the Athletic Director / Club Organizer
    // and should appear only in the Admins tab, not the Coaches list.
    if (user?.id) seen.add(user.id);

    // All coaching staff from all squads (excluding the hub owner)
    for (const m of allRawMembers) {
      if (m.status === 'removed') continue;
      const key = m.userId || m.id;
      if (seen.has(key)) continue;
      const pos = (m.position || '').toLowerCase();
      const role = (m.role || '').toLowerCase();
      const isStaff = staffKeywords.some(kw => pos.includes(kw)) || role === 'admin';
      if (isStaff) {
        seen.add(key);
        coaches.push(m);
      }
    }

    return coaches;
  }, [allRawMembers, user]);

  const incidentsQueryOwner = schoolHub ? schoolHub.ownerUserId : user?.id;
  const incidentsQuery = useMemoFirebase(() => (db && incidentsQueryOwner) ? query(collectionGroup(db, 'incidents'), where('ownerUserId', '==', incidentsQueryOwner), orderBy('createdAt', 'desc')) : null, [db, incidentsQueryOwner]);
  const { data: allIncidentsRaw } = useCollection<TeamIncident>(incidentsQuery);
  const clubIncidents = useMemo(() => (allIncidentsRaw || []), [allIncidentsRaw]);

  const stats = useMemo(() => {
    let owed = 0, total = 0, cleared = 0;
    clubMembers.forEach(m => { owed += m.amountOwed || 0; total += m.totalFees || 0; if (m.medicalClearance) cleared++; });
    const collected = total - owed;
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0;
    const compliance = clubMembers.length > 0 ? Math.round((cleared / clubMembers.length) * 100) : 0;
    return { owed, collected, total, rate, compliance };
  }, [clubMembers]);

  // ─── FISCAL PULSE: Real enrollment fee + fundraiser data ────────────────────
  const [enrollmentEntries, setEnrollmentEntries] = useState<any[]>([]);
  const [fundraiserData, setFundraiserData] = useState<any[]>([]);
  const [isFiscalLoading, setIsFiscalLoading] = useState(false);

  const fetchFiscalData = useCallback(async () => {
    if (!db || clubTeamIds.length === 0) return;
    setIsFiscalLoading(true);
    try {
      // 1. Registration entries — query leagues this hub created OR leagues any sub-squad is in
      const entries: any[] = [];
      const seenLeagueIds = new Set<string>();

      // Primary: leagues created by this hub owner
      const creatorSnap = await getDocs(query(collection(db, 'leagues'), where('creatorId', '==', user?.id)));
      creatorSnap.docs.forEach(d => seenLeagueIds.add(d.id));

      // Secondary: leagues any of the hub's teams are enrolled in (batch by team ID)
      const chunkSize = 10; // Firestore `in` limit
      for (let i = 0; i < clubTeamIds.length; i += chunkSize) {
        const chunk = clubTeamIds.slice(i, i + chunkSize);
        try {
          const memberSnap = await getDocs(query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains-any', chunk)));
          memberSnap.docs.forEach(d => seenLeagueIds.add(d.id));
        } catch { /* ignore — field may not exist on all leagues */ }
      }

      // Fetch entries from all discovered leagues
      for (const leagueId of seenLeagueIds) {
        const leagueDoc = creatorSnap.docs.find(d => d.id === leagueId);
        let leagueName = leagueDoc?.data()?.name || 'League';
        let leagueFee = 0;
        if (!leagueDoc) {
          // Fetch the league doc if we only know its ID from memberTeamIds
          try {
            const ld = await getDoc(doc(db, 'leagues', leagueId));
            if (ld.exists()) {
              leagueName = ld.data()?.name || 'League';
              leagueFee = parseFloat(ld.data()?.registrationCost || ld.data()?.registration_cost || '0') || 0;
            }
          } catch { /* skip */ }
        } else {
          leagueFee = parseFloat(leagueDoc.data()?.registrationCost || leagueDoc.data()?.registration_cost || '0') || 0;
        }

        const entriesSnap = await getDocs(collection(db, 'leagues', leagueId, 'registrationEntries'));
        entriesSnap.forEach(e => {
          const data = e.data();
          // Prefer the snapshotted fee stored in the entry; fall back to current league fee
          const entryFee = parseFloat(data?.registrationCost ?? data?.registration_cost ?? leagueFee) || leagueFee;
          entries.push({
            id: e.id,
            leagueId,
            leagueName,
            registrationCost: entryFee,
            ...data
          });
        });
      }

      setEnrollmentEntries(entries);

      // 2. Fundraiser campaigns + their donations across all squads
      const campaigns: any[] = [];
      for (const tid of clubTeamIds) {
        const teamSnap = clubTeams.find(t => t.id === tid);
        const fundSnap = await getDocs(collection(db, 'teams', tid, 'fundraising'));
        for (const fundDoc of fundSnap.docs) {
          const fundData = fundDoc.data();
          const donationSnap = await getDocs(collection(db, 'teams', tid, 'fundraising', fundDoc.id, 'donations'));
          const donations: any[] = [];
          donationSnap.forEach(d => donations.push({ id: d.id, ...d.data() }));

          // If no sub-collection donations exist but the campaign doc has a
          // denormalized raisedAmount (set by the team's fundraising page),
          // synthesise a single verified donation entry so the hub totals match.
          if (donations.length === 0 && (fundData.raisedAmount || 0) > 0) {
            donations.push({
              id: '_inline',
              amount: fundData.raisedAmount,
              status: 'verified',
              donorName: 'Campaign Total',
              note: 'Inline fundraiser total (no individual donation records)',
            });
          }

          campaigns.push({
            id: fundDoc.id,
            teamId: tid,
            teamName: teamSnap?.name || 'Unknown Squad',
            donations,
            ...fundData
          });
        }
      }
      setFundraiserData(campaigns);
    } catch (e) {
      console.warn('Fiscal fetch error:', e);
    } finally {
      setIsFiscalLoading(false);
    }
  }, [db, clubTeamIds, user?.id, clubTeams]);

  useEffect(() => { fetchFiscalData(); }, [fetchFiscalData]);

  const fiscalSummary = useMemo(() => {
    const enrolled = enrollmentEntries.length;
    const paid = enrollmentEntries.filter(e => e.payment_received).length;
    const unpaid = enrolled - paid;
    const totalEnrollmentRevenue = enrollmentEntries.filter(e => e.payment_received).reduce((s, e) => s + (e.registrationCost || 0), 0);
    const pendingEnrollmentRevenue = enrollmentEntries.filter(e => !e.payment_received).reduce((s, e) => s + (e.registrationCost || 0), 0);
    const totalDonationsConfirmed = fundraiserData.reduce((s, c) => s + c.donations.filter((d: any) => d.status === 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
    const totalDonationsPending = fundraiserData.reduce((s, c) => s + c.donations.filter((d: any) => d.status !== 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
    // Unified fiscal pulse = all confirmed money in (enrollment fees + donations)
    const fiscalPulseTotal = totalEnrollmentRevenue + totalDonationsConfirmed;
    const fiscalPulsePotential = totalEnrollmentRevenue + pendingEnrollmentRevenue + totalDonationsConfirmed + totalDonationsPending;
    const fiscalPulseRate = fiscalPulsePotential > 0 ? Math.round((fiscalPulseTotal / fiscalPulsePotential) * 100) : 0;
    return { enrolled, paid, unpaid, totalEnrollmentRevenue, pendingEnrollmentRevenue, totalDonationsConfirmed, totalDonationsPending, fiscalPulseTotal, fiscalPulsePotential, fiscalPulseRate };
  }, [enrollmentEntries, fundraiserData]);

  const handleTogglePayment = async (leagueId: string, entryId: string, paid: boolean) => {
    if (!db) return;
    await updateDoc(doc(db, 'leagues', leagueId, 'registrationEntries', entryId), { payment_received: !paid });
    setEnrollmentEntries(prev => prev.map(e => e.id === entryId ? { ...e, payment_received: !paid } : e));
    toast({ title: paid ? 'Marked as Unpaid' : 'Marked as Paid' });
  };

  const handleConfirmDonation = async (teamId: string, fundId: string, donationId: string, amount: number) => {
    if (!db) return;
    await updateDoc(doc(db, 'teams', teamId, 'fundraising', fundId, 'donations', donationId), { status: 'verified', amount });
    setFundraiserData(prev => prev.map(c => c.id === fundId && c.teamId === teamId
      ? { ...c, donations: c.donations.map((d: any) => d.id === donationId ? { ...d, status: 'verified', amount } : d) }
      : c
    ));
    toast({ title: 'Donation Confirmed' });
  };
  // ───────────────────────────────────────────────────────────────────────────

  // Fetch admin profiles
  React.useEffect(() => {
    async function fetchAdmins() {
      if (!schoolHub?.schoolAdminIds?.length || !db) {
        setAdminProfiles([]);
        return;
      }
      try {
        const profiles = [];
        for (const uid of schoolHub.schoolAdminIds) {
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            profiles.push({ id: snap.id, ...snap.data() });
          }
        }
        setAdminProfiles(profiles);
      } catch (e) {
        console.warn("Failed to fetch admin profiles", e);
      }
    }
    fetchAdmins();
  }, [schoolHub?.schoolAdminIds, db]);

  const filteredTeams = useMemo(() => clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())), [clubTeams, searchTerm]);

  const hasSchoolHubAccess = isPrimaryClubAuthority || isSchoolAdmin || !!schoolHub || teams.some(t => t.schoolId);
  // Allow primary owners, school admins, and sub-squad members to access the Hub
  if (!hasSchoolHubAccess) return <AccessRestricted type="role" title="Institutional Hub Locked" description="Reserved for institutional staff and account owners." />;

  const handleUpdateClub = async () => {
    const updates: any = { clubName: clubForm.name, clubDescription: clubForm.description };
    if (isSchoolMode && isPrimaryClubAuthority) {
      if (clubForm.schoolName) updates.schoolName = clubForm.schoolName;
      if (clubForm.institutionTitle) updates.institutionTitle = clubForm.institutionTitle;
    }
    await updateUser(updates);
    setIsEditOpen(false);
    toast({ title: isSchoolMode ? "School Identity Updated" : "Club Synchronized" });
  };

  const handleDeployProtocol = async () => {
    if (!protocolForm.title || !protocolForm.content) return;
    setIsCreating(true);
    try {
      if (editingDocId) {
        // Update existing global waiver
        await updateDoc(doc(db, 'users', user!.id, 'clubDocuments', editingDocId), {
          title: protocolForm.title,
          content: protocolForm.content,
          type: protocolForm.type,
        });
      } else {
        await deployClubProtocol({ title: protocolForm.title, content: protocolForm.content, type: protocolForm.type, assignedTo: ['all'] }, clubTeamIds);
      }
    } finally {
      setIsCreating(false);
    }
    setIsDeployProtocolOpen(false); setEditingDocId(null); setProtocolForm({ title: '', content: '', type: 'waiver' });
    toast({ title: editingDocId ? "Protocol Updated" : "Mandate Deployed", description: `Protocol pushed to ${clubTeamIds.length} squads.` });
  };

  const handleToggleWaiver = async (waiverDoc: TeamDocument) => {
    if (!user?.id || !waiverDoc.id) return;
    await updateDoc(doc(db, 'users', user.id, 'clubDocuments', waiverDoc.id), { isActive: !waiverDoc.isActive });
  };

  const handleDeleteWaiver = async (waiverDoc: TeamDocument) => {
    if (!user?.id || !waiverDoc.id || !confirm(`Delete "${waiverDoc.title}"? This cannot be undone.`)) return;
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'users', user.id, 'clubDocuments', waiverDoc.id));
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim() || !db || !schoolHub) return;
    setIsAddingAdmin(true);
    const emailToAdd = newAdminEmail.trim().toLowerCase();
    try {
      const usersQuery = query(collection(db, 'users'), where('email', '==', emailToAdd), limit(1));
      const snaps = await getDocs(usersQuery);
      const currentAdmins = schoolHub.schoolAdminIds || [];
      const pendingEmails: string[] = (schoolHub as any).pendingAdminEmails || [];
      const totalSlots = currentAdmins.length + pendingEmails.length;

      if (!snaps.empty) {
        const newAdminId = snaps.docs[0].id;
        if (currentAdmins.includes(newAdminId) || schoolHub.ownerUserId === newAdminId) {
          toast({ title: 'Already Admin', description: 'This user is already an admin.', variant: 'destructive' });
        } else if (totalSlots >= 3) {
          toast({ title: 'Limit Reached', description: 'You can only have up to 3 additional hub admins.', variant: 'destructive' });
        } else {
          const updatedEmails = pendingEmails.includes(emailToAdd) ? pendingEmails : [...pendingEmails, emailToAdd];
          await updateTeam(schoolHub.id, { schoolAdminIds: [...currentAdmins, newAdminId], pendingAdminEmails: updatedEmails });
          toast({ title: 'Hub Admin Added', description: `${emailToAdd} now has Hub access.` });
          setNewAdminEmail('');
        }
      } else {
        // User doesn't exist yet — store as pending so they auto-get access on signup
        if (pendingEmails.includes(emailToAdd)) {
          toast({ title: 'Already Pending', description: 'An invitation is already pending for this email.', variant: 'destructive' });
        } else if (totalSlots >= 3) {
          toast({ title: 'Limit Reached', description: 'You can only have up to 3 additional hub admins.', variant: 'destructive' });
        } else {
          await updateTeam(schoolHub.id, { pendingAdminEmails: [...pendingEmails, emailToAdd] });
          toast({ title: 'Invitation Saved', description: `${emailToAdd} will get Hub access automatically when they sign up.` });
          setNewAdminEmail('');
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to add hub admin', variant: 'destructive' });
    }
    setIsAddingAdmin(false);
  };

  const handleRemoveAdmin = async (adminId: string) => {
    if (!schoolHub) return;
    const currentAdmins = schoolHub.schoolAdminIds || [];
    await updateTeam(schoolHub.id, { schoolAdminIds: currentAdmins.filter(id => id !== adminId) });
    toast({ title: "Admin Removed", description: "Access revoked." });
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <Card className="bg-black text-white p-10 lg:p-14 rounded-[3.5rem] shadow-2xl relative overflow-hidden group border-none hero-gradient">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Building className="h-64 w-64" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-3">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-[0.2em] text-[10px] h-7 px-4 shadow-lg">Institutional Command</Badge>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.8] text-white">
              {user?.schoolName || user?.clubName || (isSchoolMode ? 'School Hub' : 'Club Hub')}
            </h1>
            <p className="text-white/60 font-bold uppercase tracking-[0.2em] text-[10px] ml-1">
              {user?.institutionTitle || (isSchoolMode ? 'Athletic Director' : 'Club Authority')} &bull; {user?.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white hover:text-black transition-all font-black uppercase text-xs" onClick={() => setIsEditOpen(true)}>
              <Edit3 className="h-4 w-4 mr-2" /> {isSchoolMode ? 'Edit School' : 'Edit Club'}
            </Button>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/40 bg-white text-black hover:bg-primary hover:text-white transition-all border-none" onClick={() => setIsSubSquadModalOpen(true)}>
              <Plus className="h-5 w-5 mr-2" /> {isSchoolMode ? 'Add Sub-Squad' : 'Add Squad'}
            </Button>
          </div>
        </div>
      </Card>

      {/* School Hub onboarding note — only visible in school mode, dismissed via localStorage */}
      {isSchoolMode && !hubNoteDismissed && (
        <div className="relative rounded-[2rem] border-2 border-primary/20 bg-primary/5 p-6 md:p-8 flex gap-5 items-start overflow-hidden group animate-in slide-in-from-top-4 duration-500">
          {/* Subtle background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none rounded-[2rem]" />
          <div className="shrink-0 mt-0.5 w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Info className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">How the School Hub Works</p>
            <h3 className="text-lg font-black uppercase tracking-tight leading-tight text-foreground">
              One Hub. Every Squad. One Master Schedule.
            </h3>
            <div className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">
              <p>
                <strong className="text-foreground">Squads</strong> are individual teams under your institution — e.g. <em>"Varsity Boys Basketball"</em> or <em>"JV Girls Soccer"</em>. Each squad has its own roster, coach, and calendar.
              </p>
              <p>
                <strong className="text-foreground">Programs</strong> are the scheduling containers (leagues) that link squads together for fixtures, standings, and playoffs. A squad can belong to multiple programs at once.
              </p>
              <p>
                Every squad's schedule, including all league games and tournaments across all programs, is automatically visible on the <strong className="text-foreground">Master Calendar</strong> — clearly labelled by program so coaches can distinguish them at a glance.
              </p>
              <p>
                You can provision new squads from this hub and manage all compliance, documents, finances, and rosters from a single place.
              </p>
            </div>
          </div>
          <button
            onClick={dismissHubNote}
            aria-label="Dismiss hub guide"
            className="shrink-0 mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all relative z-10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Dialog open={isSubSquadModalOpen} onOpenChange={setIsSubSquadModalOpen}>
        <DialogContent className="rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-md bg-white">
          <div className="h-2 bg-gradient-to-r from-primary via-black to-primary w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader>
              <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <DialogTitle className="text-4xl font-black uppercase tracking-tighter text-black leading-none">
                {isSchoolMode ? 'Provision Squad' : 'New Squad'}
              </DialogTitle>
              <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-[0.2em] mt-2">
                Operationalizing new pro-tier athletic unit
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Tactical Unit Name</Label>
                <Input 
                  className="h-16 rounded-2xl border-2 border-muted bg-muted/20 font-black text-lg focus:border-primary/50 focus:bg-white transition-all px-6" 
                  placeholder="e.g. Varsity Basketball" 
                  value={newSquadForm.name} 
                  onChange={e => setNewSquadForm({...newSquadForm, name: e.target.value})} 
                />
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Designated Head Coach</Label>
                  <div className="relative">
                    <Input 
                      className="h-14 rounded-2xl border-2 border-muted bg-muted/20 font-bold focus:border-primary/50 focus:bg-white transition-all pl-12" 
                      placeholder="Coach Name" 
                      value={newSquadForm.coachName} 
                      onChange={e => setNewSquadForm({...newSquadForm, coachName: e.target.value})} 
                    />
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary opacity-40" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Secure Contact Email</Label>
                  <div className="relative">
                    <Input 
                      type="email" 
                      className="h-14 rounded-2xl border-2 border-muted bg-muted/20 font-bold focus:border-primary/50 focus:bg-white transition-all pl-12" 
                      placeholder="coach@example.com" 
                      value={newSquadForm.coachEmail} 
                      onChange={e => setNewSquadForm({...newSquadForm, coachEmail: e.target.value})} 
                    />
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary opacity-40" />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button 
                variant="ghost" 
                className="h-14 rounded-2xl font-black uppercase text-xs tracking-widest text-muted-foreground hover:text-black" 
                onClick={() => setIsSubSquadModalOpen(false)}
              >
                Abort
              </Button>
              <Button 
                className="h-14 flex-1 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 bg-black text-white hover:bg-primary transition-all group" 
                disabled={isCreating || !newSquadForm.name || !newSquadForm.coachName} 
                onClick={async () => {
                   if (isCreating) return;
                   setIsCreating(true);
                   try {
                     // Always use the school hub id as the parent schoolId
                     const targetSchoolId = schoolHub?.id;
                     await createNewTeam(
                       newSquadForm.name, 
                       'school_squad', 
                       'Coach', 
                       'School squad', 
                       'squad_organization', // gives 'SCHOOL HUB' + 'DISTRICT' badge
                       undefined, 
                       undefined, 
                       targetSchoolId, 
                       newSquadForm.coachName, 
                       newSquadForm.coachEmail,
                       schoolHub?.ownerUserId // Pass hub owner so coach shows up correctly
                     );
                     setIsSubSquadModalOpen(false);
                     setNewSquadForm({ name: '', coachName: '', coachEmail: '' });
                     toast({ title: 'Operational Unit Provisioned', description: 'Squad and Head Coach profile initialized.' });
                   } catch (err: any) {
                     console.error('[Provisioning Error]:', err);
                     
                     // FIREBASE HARDENING: If it's the known 'ca9' or 'b815' transport panic,
                     // we swallow it and proceed. The write likely succeeded or will sync 
                     // shortly, and showing a red error over a non-app bug is confusing.
                     const isPanic = err.message?.includes('INTERNAL ASSERTION FAILED') || 
                                    err.message?.includes('ca9') || 
                                    err.message?.includes('b815') ||
                                    err.message?.includes('ve: -1');
                     
                     if (isPanic) {
                        setIsSubSquadModalOpen(false);
                        setNewSquadForm({ name: '', coachName: '', coachEmail: '' });
                        toast({ title: 'Squad Provisioned', description: 'Network transport reset, but your squad was initialized.' });
                        return;
                     }

                     toast({ 
                       title: 'Provisioning Failed', 
                       description: err.message || 'Check your institutional quota or network connection.',
                       variant: 'destructive'
                     });
                   } finally {
                     setIsCreating(false);
                   }
                }}>
                {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Plus className="h-5 w-5 mr-3 group-hover:rotate-90 transition-transform" />} 
                Authorize Provisioning
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md bg-primary text-white p-8 space-y-2"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Total Squads</p><p className="text-5xl font-black">{clubTeams.length}</p></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-3">
          <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Fiscal Pulse</p>
          <p className="text-3xl font-black">${fiscalSummary.fiscalPulseTotal.toLocaleString()}</p>
          <Progress value={fiscalSummary.fiscalPulseRate} className="h-1.5 bg-white/10" />
          <div className="flex gap-3 pt-1">
            <p className="text-[8px] font-bold opacity-40 uppercase tracking-widest">
              Fees <span className="text-white/70">${fiscalSummary.totalEnrollmentRevenue.toLocaleString()}</span>
              {' · '}
              Donations <span className="text-white/70">${fiscalSummary.totalDonationsConfirmed.toLocaleString()}</span>
            </p>
          </div>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-2 ring-1 ring-black/5"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Compliance Rating</p><p className="text-5xl font-black text-primary">{stats.compliance}%</p></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-muted/20 p-8 space-y-4"><div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-primary" /><p className="text-[10px] font-black uppercase text-foreground">Safety Oversights</p></div><p className="text-3xl font-black text-foreground">{clubIncidents.length}</p></Card>
      </div>

      <Tabs defaultValue="squads" className="space-y-8">
        <div className="overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2 shadow-inner whitespace-nowrap min-w-max">
          <TabsTrigger value="squads" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-black data-[state=active]:text-white">{schoolHub ? 'Squads' : 'Squad Roster'}</TabsTrigger>
          {schoolHub && (
            <TabsTrigger value="coaches" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Coaches</TabsTrigger>
          )}
          {schoolHub && (
            <TabsTrigger value="admins" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Admins</TabsTrigger>
          )}
          <TabsTrigger value="compliance" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-black data-[state=active]:text-white">Waivers</TabsTrigger>
          <TabsTrigger value="finance" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Finance</TabsTrigger>
          <TabsTrigger value="safety" className="rounded-lg font-black text-xs uppercase px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Safety</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="squads" className="space-y-12 mt-0">
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="space-y-1">
                <h3 className="text-xl font-black uppercase tracking-tight">Active Squads</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Optimized Personnel Layers</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredTeams.map(team => (
                <Card key={team.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 p-6 hover:shadow-xl transition-all group bg-white">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <Avatar className="h-14 w-14 rounded-2xl shadow-lg border-2 border-background shrink-0">
                        <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                        <AvatarFallback className="font-black bg-white text-foreground">{team.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1 transform group-hover:translate-x-2 transition-transform duration-300">
                        <h3 className="text-xl font-black uppercase text-foreground group-hover:text-primary transition-colors">{team.name}</h3>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                          {team.sport} • {clubMembers.filter(m => m.teamId === team.id && m.status !== 'removed').length} Active Athletes • 
                          Code: <span className="text-primary font-black ml-1 select-all">{team.code || team.teamCode || team.inviteCode || '---'}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/5" onClick={() => setTeamToDelete(team)}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-destructive">
                          Decommission Squad
                        </TooltipContent>
                      </Tooltip>
                      <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] text-foreground border-2 hover:bg-black hover:text-white transition-all" onClick={() => { setActiveTeam(team); router.push('/team'); }}>Command Access <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {(clubMembers.some(m => m.status === 'removed')) && (
            <div className="space-y-6">
               <div className="flex items-center justify-between px-2 pt-8 border-t">
                <div className="space-y-1">
                  <h3 className="text-xl font-black uppercase tracking-tight text-red-600/60">Historical Personnel Archive</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Decommissioned Athletes & Staff</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 opacity-75 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                {clubMembers.filter(m => m.status === 'removed').map(member => (
                  <Card key={member.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 p-6 bg-white/50 border-2 border-dashed border-red-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <Avatar className="h-14 w-14 rounded-2xl grayscale shrink-0 opacity-40">
                          <AvatarImage src={member.avatar} className="object-cover" />
                          <AvatarFallback className="font-black bg-muted text-foreground">{member.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <h3 className="text-lg font-black uppercase text-foreground/50">{member.name}</h3>
                          <div className="flex flex-col gap-1">
                            <p className="text-[9px] font-black text-red-600 uppercase tracking-widest">
                               Removed {member.removedAt ? format(new Date(member.removedAt), 'MMM d, yyyy') : 'No Date'}
                            </p>
                            {member.removalReason && (
                              <p className="text-[10px] font-medium text-muted-foreground italic leading-tight max-w-sm">
                                "{member.removalReason}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          className="rounded-xl h-9 px-4 font-black uppercase text-[9px] text-primary border-primary/20 hover:bg-primary hover:text-white transition-all"
                          onClick={() => reinstateMember(member.id)}
                        >
                          Reinstate Personnel
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {schoolHub && (
          <TabsContent value="coaches" className="space-y-6 mt-0">
             <div className="grid grid-cols-1 gap-4">
                {allCoaches.map(coach => (
                  <Card key={coach.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 p-6 bg-white cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all" onClick={() => setSelectedCoach(coach)}>
                     <div className="flex items-center gap-6">
                       <Avatar className="h-14 w-14 rounded-2xl shadow-lg border-2 border-background shrink-0">
                         <AvatarImage src={coach.avatar} className="object-cover" />
                         <AvatarFallback className="font-black bg-primary/10 text-primary">{coach.name[0]}</AvatarFallback>
                       </Avatar>
                       <div className="space-y-0.5 content-center flex-1">
                          <h3 className="text-xl font-black uppercase text-foreground">{coach.name}</h3>
                          <p className="text-[9px] font-black text-primary uppercase tracking-widest">{coach.position || 'Coach'}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                            {coach.userId === user?.id
                              ? (user?.schoolName || user?.clubName || teams[0]?.name || '')
                              : (teams.find(t => t.id === coach.teamId)?.name || '')}
                          </p>
                       </div>
                       <div className="ml-auto flex items-center gap-2">
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 bg-muted/20 hover:bg-primary hover:text-white rounded-xl transition-all">
                               <ChevronRight className="h-4 w-4" />
                             </Button>
                           </TooltipTrigger>
                           <TooltipContent>
                             View Personnel Dossier
                           </TooltipContent>
                         </Tooltip>
                       </div>
                     </div>
                   </Card>
                ))}
                {allCoaches.length === 0 && <div className="text-center py-12 text-muted-foreground font-bold">No Coaches found.</div>}
             </div>
          </TabsContent>
        )}

        {schoolHub && (
          <TabsContent value="admins" className="space-y-6 mt-0 animate-in fade-in">
            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-10">
                <div className="flex items-center gap-6">
                  <div className="bg-primary p-4 rounded-2xl shadow-xl shadow-primary/20">
                    <ShieldCheck className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-black uppercase tracking-tight">Institutional Authorities</CardTitle>
                    <CardDescription className="text-white/60 font-bold uppercase text-[10px] mt-2 tracking-widest">Manage co-administrators for the {schoolHub.name} hub</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-10 space-y-8">
                {schoolHub.ownerUserId === user?.id && (
                  <div className="flex flex-col md:flex-row gap-4">
                    <Input
                      placeholder="Admin Email Address"
                      type="email"
                      className="h-14 rounded-2xl border-2 font-bold focus:border-primary/50 text-foreground"
                      value={newAdminEmail}
                      onChange={e => setNewAdminEmail(e.target.value)}
                    />
                    <Button 
                      className="h-14 px-8 rounded-2xl font-black shadow-xl bg-black text-white hover:bg-primary uppercase"
                      disabled={isAddingAdmin || (schoolHub.schoolAdminIds?.length || 0) >= 3 || !newAdminEmail}
                      onClick={handleAddAdmin}
                    >
                      {isAddingAdmin ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <UserPlus className="h-5 w-5 mr-2" />}
                      Add Hub Admin
                    </Button>
                  </div>
                )}
                
                {schoolHub.ownerUserId !== user?.id && (
                  <div className="bg-muted/20 p-6 rounded-2xl border-2 text-center text-sm font-bold uppercase text-muted-foreground">
                    Only the primary account owner can manage co-administrators.
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4">
                    <span>Hub Administrators {((schoolHub.schoolAdminIds?.length || 0) + ((schoolHub as any).pendingAdminEmails?.length || 0))}/3</span>
                  </div>
                  
                  {/* Primary Owner is always an admin */}
                  <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/10 border-2 border-transparent">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase text-foreground">{user?.name || 'Primary Owner'}</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{user?.email} · {schoolHub.name} Creator</p>
                      </div>
                    </div>
                    <Badge className="bg-black text-white h-6 px-3 uppercase text-[9px] font-black tracking-widest pointer-events-none">Owner</Badge>
                  </div>
                  
                  {adminProfiles.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-6 rounded-3xl bg-white border-2 hover:border-primary/20 transition-all group shadow-sm">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border">
                          <AvatarImage src={admin.avatar} />
                          <AvatarFallback className="font-bold text-primary">{(admin.name || admin.email || 'A')[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-black uppercase text-foreground">{admin.name || admin.email || 'Hub Admin'}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{admin.email}</p>
                        </div>
                      </div>
                      {schoolHub.ownerUserId === user?.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveAdmin(admin.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10">
                              <XCircle className="h-5 w-5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-destructive">Revoke Admin Credentials</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ))}

                  {/* ── Pending Invitations ── users invited but not yet registered */}
                  {((schoolHub as any).pendingAdminEmails?.length > 0) &&
                    ((schoolHub as any).pendingAdminEmails as string[]).map((pendingEmail) => (
                      <div key={pendingEmail} className="flex items-center justify-between p-6 rounded-3xl bg-amber-50 border-2 border-amber-100 group">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                            <Mail className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black uppercase text-foreground">{pendingEmail}</p>
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Invitation Pending · Access granted on sign-up</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="bg-amber-100 text-amber-700 border border-amber-200 h-6 px-3 uppercase text-[9px] font-black tracking-widest pointer-events-none">Pending</Badge>
                          {schoolHub.ownerUserId === user?.id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    const updated = ((schoolHub as any).pendingAdminEmails as string[]).filter((e) => e !== pendingEmail);
                                    await updateTeam(schoolHub.id, { pendingAdminEmails: updated });
                                    toast({ title: 'Invite Revoked', description: `${pendingEmail} removed from pending invitations.` });
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                                >
                                  <XCircle className="h-5 w-5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-destructive">Revoke Invitation</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Coach Detail Modal */}
        <Dialog open={!!selectedCoach} onOpenChange={(open) => !open && setSelectedCoach(null)}>
          <DialogContent className="rounded-[2rem] border-none shadow-2xl p-0 max-w-lg bg-white overflow-y-auto max-h-[90vh]">
            <DialogHeader className="sr-only">
              <DialogTitle>Personnel Dossier: {selectedCoach?.name}</DialogTitle>
              <DialogDescription>Detailed coaching credentials and contact information.</DialogDescription>
            </DialogHeader>
            {selectedCoach && (
              <div className="flex flex-col">
                <div className="w-full bg-black text-white p-8 space-y-6">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-20 w-20 rounded-2xl border-4 border-white/10 shadow-xl">
                      <AvatarImage src={selectedCoach.avatar} className="object-cover" />
                      <AvatarFallback className="text-2xl font-black bg-white/10">{selectedCoach.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">{selectedCoach.name}</h2>
                      <p className="text-primary font-black uppercase tracking-widest text-sm">{selectedCoach.position}</p>
                    </div>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl">
                        <Trophy className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Team</p>
                        <p className="font-bold">{teams.find(t => t.id === selectedCoach.teamId)?.name || 'N/A'}</p>
                      </div>
                    </div>
                    {(selectedCoach as any).email && (
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl">
                          <Mail className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Email</p>
                          <p className="font-bold">{(selectedCoach as any).email}</p>
                        </div>
                      </div>
                    )}
                    {selectedCoach.phone && (
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl">
                          <Activity className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Phone</p>
                          <p className="font-bold">{selectedCoach.phone}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button 
                      className="flex-1 font-black uppercase text-xs h-12 rounded-2xl bg-primary hover:bg-primary/90"
                      onClick={async () => {
                        if (!selectedCoach.userId || !activeTeam) return;
                        try {
                          const chatId = await createChat(`${selectedCoach.name}`, [selectedCoach.userId]);
                          if (chatId) {
                            toast({ title: "Chat Created", description: `Starting conversation with ${selectedCoach.name}` });
                            setSelectedCoach(null);
                            router.push('/chats');
                          }
                        } catch (e) {
                          toast({ title: "Error", description: "Could not start chat", variant: "destructive" });
                        }
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Start Chat
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 font-black uppercase text-xs h-12 rounded-2xl"
                      onClick={() => {
                        const team = teams.find(t => t.id === selectedCoach.teamId);
                        if (team) {
                          setActiveTeam(team);
                          setSelectedCoach(null);
                          router.push('/roster');
                        }
                      }}
                    >
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      View Roster
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <TabsContent value="compliance" className="space-y-8 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8 space-y-6">
              <div className="flex items-center justify-between px-2">
                <div>
                  <h3 className="text-xl font-black uppercase text-foreground">Global Waivers</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Deployed to all squads in your organization</p>
                </div>
                <Button onClick={() => { setEditingDocId(null); setProtocolForm({ title: '', content: '', type: 'waiver' }); setIsDeployProtocolOpen(true); }} className="h-10 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20 border-none"><Plus className="h-4 w-4 mr-2" /> New Waiver</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {clubDocs.filter(d => d.isClubMaster).map(waiverDoc => (
                  <Card key={waiverDoc.id} className={cn("rounded-3xl p-8 bg-white shadow-xl border space-y-4 flex flex-col transition-all", waiverDoc.isActive === false ? "opacity-50 border-dashed" : "hover:ring-2 hover:ring-primary/20")}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <Badge className={cn("font-black text-[8px] h-5 px-2 uppercase tracking-widest shadow mb-2 border-none", waiverDoc.isActive === false ? "bg-muted text-muted-foreground" : "bg-black text-white")}>
                          {waiverDoc.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                        </Badge>
                        <h4 className="text-base font-black uppercase text-foreground truncate">{waiverDoc.title}</h4>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-primary opacity-20 shrink-0" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground line-clamp-3 italic flex-1 leading-relaxed">"{waiverDoc.content}"</p>
                    <div className="pt-4 border-t flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase text-primary tracking-widest">{waiverDoc.signatureCount || 0} Verified Sigs</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 rounded-xl font-black text-[9px] uppercase border-2"
                          onClick={() => { setEditingDocId(waiverDoc.id); setProtocolForm({ title: waiverDoc.title, content: waiverDoc.content || '', type: waiverDoc.type || 'waiver' }); setIsDeployProtocolOpen(true); }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn("h-8 px-3 rounded-xl font-black text-[9px] uppercase border-2", waiverDoc.isActive === false ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-amber-200 text-amber-600 hover:bg-amber-50")}
                          onClick={() => handleToggleWaiver(waiverDoc)}
                        >
                          {waiverDoc.isActive === false ? 'Enable' : 'Disable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-xl text-red-500 hover:bg-red-50"
                          onClick={() => handleDeleteWaiver(waiverDoc)}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {clubDocs.filter(d => d.isClubMaster).length === 0 && (
                  <div className="col-span-full py-20 text-center bg-muted/10 rounded-3xl border-2 border-dashed opacity-30 text-foreground space-y-3">
                    <FileText className="h-12 w-12 mx-auto" />
                    <p className="text-sm font-black uppercase tracking-widest">No global waivers deployed</p>
                    <p className="text-xs font-bold">Click "New Waiver" to create and deploy a waiver to all squads.</p>
                  </div>
                )}
              </div>
            </div>
            <aside className="lg:col-span-4"><TeamComplianceCard teams={clubTeams} clubDocs={clubDocs} /></aside>
          </div>
        </TabsContent>

        {/* ──────────────────── FINANCE TAB ──────────────────── */}
        <TabsContent value="finance" className="space-y-10 mt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-none shadow-md bg-emerald-600 text-white p-6 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Fees Collected</p>
              <p className="text-3xl font-black">${fiscalSummary.totalEnrollmentRevenue.toLocaleString()}</p>
              <p className="text-[9px] font-bold opacity-60 uppercase">{fiscalSummary.paid} paid entries</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-amber-500 text-white p-6 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Fees Outstanding</p>
              <p className="text-3xl font-black">${fiscalSummary.pendingEnrollmentRevenue.toLocaleString()}</p>
              <p className="text-[9px] font-bold opacity-60 uppercase">{fiscalSummary.unpaid} unpaid entries</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-primary text-white p-6 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Donations Confirmed</p>
              <p className="text-3xl font-black">${fiscalSummary.totalDonationsConfirmed.toLocaleString()}</p>
              <p className="text-[9px] font-bold opacity-60 uppercase">Verified contributions</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-muted/30 p-6 space-y-1 ring-1 ring-black/5">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Donations Pending</p>
              <p className="text-3xl font-black text-foreground">${fiscalSummary.totalDonationsPending.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-muted-foreground uppercase">Awaiting confirmation</p>
            </Card>
          </div>

          {/* Per-Squad Breakdown */}
          {clubTeams.length > 0 && (
            <div className="space-y-4">
              <div className="px-1">
                <h3 className="text-lg font-black uppercase tracking-tight">Squad Breakdown</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Individual financial summary per squad</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {clubTeams.map(team => {
                  const teamEntries = enrollmentEntries.filter(e => {
                    // Match entries where the team is the applicant
                    const ans = e.answers || {};
                    return (
                      ans.team_id === team.id ||
                      ans.teamId === team.id ||
                      (team.name && (ans.teamName === team.name || ans.team_name === team.name))
                    );
                  });
                  const teamCampaigns = fundraiserData.filter(c => c.teamId === team.id);
                  const teamPaid = teamEntries.filter(e => e.payment_received).reduce((s: number, e: any) => s + (e.registrationCost || 0), 0);
                  const teamUnpaid = teamEntries.filter(e => !e.payment_received).reduce((s: number, e: any) => s + (e.registrationCost || 0), 0);
                  const teamDonationsConfirmed = teamCampaigns.reduce((s: number, c: any) => s + c.donations.filter((d: any) => d.status === 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
                  const teamDonationsPending = teamCampaigns.reduce((s: number, c: any) => s + c.donations.filter((d: any) => d.status !== 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
                  const grandTotal = teamPaid + teamDonationsConfirmed;
                  return (
                    <Card key={team.id} className="rounded-[2rem] border-none shadow-md bg-white ring-1 ring-black/5 p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-sm uppercase tracking-tight truncate">{team.name}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{teamEntries.length} registrations · {teamCampaigns.length} campaigns</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-[8px] font-black uppercase text-muted-foreground">Total In</p>
                          <p className="font-black text-lg text-emerald-600">${grandTotal.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-emerald-50 rounded-xl p-3 space-y-0.5">
                          <p className="text-[8px] font-black uppercase text-emerald-700/70 tracking-widest">Fees Collected</p>
                          <p className="font-black text-sm text-emerald-700">${teamPaid.toLocaleString()}</p>
                          <p className="text-[7px] font-bold text-emerald-600/60 uppercase">{teamEntries.filter(e => e.payment_received).length} paid</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-3 space-y-0.5">
                          <p className="text-[8px] font-black uppercase text-amber-700/70 tracking-widest">Fees Unpaid</p>
                          <p className="font-black text-sm text-amber-700">${teamUnpaid.toLocaleString()}</p>
                          <p className="text-[7px] font-bold text-amber-600/60 uppercase">{teamEntries.filter(e => !e.payment_received).length} outstanding</p>
                        </div>
                        <div className="bg-primary/5 rounded-xl p-3 space-y-0.5">
                          <p className="text-[8px] font-black uppercase text-primary/70 tracking-widest">Donations ✓</p>
                          <p className="font-black text-sm text-primary">${teamDonationsConfirmed.toLocaleString()}</p>
                          <p className="text-[7px] font-bold text-primary/60 uppercase">verified</p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-3 space-y-0.5">
                          <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Donations ⏳</p>
                          <p className="font-black text-sm">${teamDonationsPending.toLocaleString()}</p>
                          <p className="text-[7px] font-bold text-muted-foreground uppercase">pending</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Enrollment Fee Ledger</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Registration entries across all org leagues</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl h-9 font-black uppercase text-[10px]" onClick={fetchFiscalData} disabled={isFiscalLoading}>
                {isFiscalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                <span className="ml-2">Refresh</span>
              </Button>
            </div>
            <Card className="rounded-[2rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
              {enrollmentEntries.length === 0 ? (
                <div className="p-16 text-center space-y-3 opacity-30">
                  <DollarSign className="h-10 w-10 mx-auto" />
                  <p className="text-sm font-black uppercase tracking-widest">No enrollment entries found</p>
                  <p className="text-xs text-muted-foreground">Registration fees will appear here once teams submit entries to leagues.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr>
                        <th className="px-6 py-4">Team / Applicant</th>
                        <th className="px-4 py-4">League</th>
                        <th className="px-4 py-4">Fee</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4">Submitted</th>
                        <th className="px-4 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted/30">
                      {enrollmentEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-black text-xs uppercase">{entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || '—'}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase">{entry.answers?.email || ''}</p>
                          </td>
                          <td className="px-4 py-4 text-xs font-bold text-muted-foreground uppercase">{entry.leagueName}</td>
                          <td className="px-4 py-4">
                            <span className="font-black text-sm">{entry.registrationCost > 0 ? `$${entry.registrationCost}` : 'Free'}</span>
                          </td>
                          <td className="px-4 py-4">
                            <Badge className={cn('border-none font-black text-[9px] uppercase px-3 h-6',
                              entry.payment_received ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            )}>
                              {entry.payment_received ? '✓ Paid' : '⏳ Unpaid'}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-[9px] font-bold text-muted-foreground uppercase">
                            {(entry.createdAt || entry.created_at) ? (() => { try { return format(new Date(entry.createdAt || entry.created_at), 'MMM d, yyyy'); } catch { return '—'; } })() : '—'}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn('rounded-xl h-8 px-4 font-black uppercase text-[9px] transition-all',
                                entry.payment_received ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              )}
                              onClick={() => handleTogglePayment(entry.leagueId, entry.id, entry.payment_received)}
                            >
                              {entry.payment_received ? 'Mark Unpaid' : 'Mark Paid'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Fundraiser Donation Ledger */}
          <div className="space-y-4">
            <div className="px-1">
              <h3 className="text-lg font-black uppercase tracking-tight">Fundraiser Donations</h3>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">All campaigns across all squads in the organization</p>
            </div>
            {fundraiserData.length === 0 ? (
              <Card className="rounded-[2rem] border-none shadow-xl bg-white ring-1 ring-black/5">
                <div className="p-16 text-center space-y-3 opacity-30">
                  <TrendingUp className="h-10 w-10 mx-auto" />
                  <p className="text-sm font-black uppercase tracking-widest">No fundraiser campaigns found</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {fundraiserData.map(campaign => (
                  <Card key={`${campaign.teamId}-${campaign.id}`} className="rounded-[2rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
                    <div className="px-8 py-5 bg-primary/5 border-b flex items-center justify-between">
                      <div>
                        <p className="font-black text-base uppercase tracking-tight">{campaign.title || campaign.name || 'Campaign'}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{campaign.teamName} · {campaign.donations.length} donations</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase text-muted-foreground">Confirmed</p>
                        <p className="font-black text-primary">${campaign.donations.filter((d: any) => d.status === 'verified').reduce((s: number, d: any) => s + (d.amount || 0), 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {campaign.donations.length === 0 ? (
                      <p className="px-8 py-6 text-[10px] font-bold text-muted-foreground uppercase opacity-40">No donations recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-muted/20 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                            <tr>
                              <th className="px-6 py-3">Donor</th>
                              <th className="px-4 py-3">Amount</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted/20">
                            {campaign.donations.map((donation: any) => (
                              <tr key={donation.id} className="hover:bg-muted/10 transition-colors">
                                <td className="px-6 py-3">
                                  <p className="font-black text-xs uppercase">{donation.donorName || donation.userName || 'Anonymous'}</p>
                                  {donation.note && <p className="text-[9px] text-muted-foreground italic">{donation.note}</p>}
                                </td>
                                <td className="px-4 py-3 font-black text-sm">${(donation.amount || 0).toLocaleString()}</td>
                                <td className="px-4 py-3">
                                  <Badge className={cn('border-none font-black text-[9px] uppercase px-3 h-6',
                                    donation.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                  )}>
                                    {donation.status === 'verified' ? '✓ Confirmed' : '⏳ Pending'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-[9px] font-bold text-muted-foreground uppercase">
                                  {donation.createdAt ? (() => { try { return format(new Date(donation.createdAt), 'MMM d, yyyy'); } catch { return '—'; } })() : '—'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {donation.status !== 'verified' && (
                                    <Button
                                      size="sm"
                                      className="rounded-xl h-8 px-4 font-black uppercase text-[9px] bg-emerald-600 text-white hover:bg-emerald-700"
                                      onClick={() => handleConfirmDonation(campaign.teamId, campaign.id, donation.id, donation.amount || 0)}
                                    >
                                      Confirm
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="safety" className="mt-0">
          <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardHeader className="bg-black text-white p-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-4 rounded-2xl shadow-xl shadow-primary/20">
                  <ShieldAlert className="h-8 w-8 text-white" />
                </div>
                <div><CardTitle className="text-3xl font-black uppercase tracking-tight">Institutional Safety Audit</CardTitle><CardDescription className="text-white/60 font-bold uppercase text-[10px] mt-2 tracking-widest">Aggregate incident reporting across all managed operational units</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                    <tr><th className="px-10 py-6">Incident</th><th className="px-6 py-6">Squad</th><th className="px-6 py-6">Severity</th><th className="px-10 py-6 text-right">Date</th></tr>
                  </thead>
                  <tbody className="divide-y divide-muted/50">
                    {clubIncidents.map(inc => (
                      <tr key={inc.id} onClick={() => setViewingIncident(inc)} className="hover:bg-primary/5 transition-colors group cursor-pointer">
                        <td className="px-10 py-6"><p className="font-black text-sm uppercase text-foreground">{inc.title}</p><p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{inc.location}</p></td>
                        <td className="px-6 py-6 font-black text-xs uppercase text-foreground">{inc.teamName}</td>
                        <td className="px-6 py-6"><Badge className={cn("border-none font-black text-[8px] uppercase px-3 h-5", inc.emergencyServicesCalled ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>{inc.emergencyServicesCalled ? 'CRITICAL' : 'ROUTINE'}</Badge></td>
                        <td className="px-10 py-6 text-right font-black text-xs uppercase text-foreground">
                          {(() => { try { return format(parseISO(inc.date), 'MMMM d, yyyy'); } catch { return inc.date; } })()}
                        </td>
                      </tr>
                    ))}
                    {clubIncidents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center opacity-30 italic text-xs uppercase font-black text-foreground">No institutional safety reports archived.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isEditClubOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[3rem] p-0 overflow-hidden sm:max-w-md border-none shadow-2xl glass text-foreground">
          <div className="h-2 bg-black w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">
                {isSchoolMode ? 'School Identity' : 'Club Architect'}
              </DialogTitle>
              <DialogDescription className="text-primary font-bold uppercase text-[10px] tracking-widest">
                {isSchoolMode ? 'Edit institutional branding & your role' : 'Update institutional identity'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {isSchoolMode ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">School / Institution Name</Label>
                    <Input
                      value={clubForm.schoolName}
                      onChange={e => setClubForm({...clubForm, schoolName: e.target.value, name: e.target.value})}
                      placeholder="e.g. Westfield High School"
                      className="h-14 rounded-2xl border-2 font-black text-lg focus:border-primary/20"
                    />
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest ml-1">Displays in sidebar, hub header, and admin profile</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Your Administrative Title</Label>
                    <Select value={clubForm.institutionTitle} onValueChange={v => setClubForm({...clubForm, institutionTitle: v})}>
                      <SelectTrigger className="h-14 rounded-2xl border-2 font-bold focus:border-primary/20"><SelectValue placeholder="Select your title..." /></SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="Athletic Director" className="font-bold">Athletic Director</SelectItem>
                        <SelectItem value="Principal" className="font-bold">Principal</SelectItem>
                        <SelectItem value="Vice Principal" className="font-bold">Vice Principal</SelectItem>
                        <SelectItem value="Program Director" className="font-bold">Program Director</SelectItem>
                        <SelectItem value="Head of Sport" className="font-bold">Head of Sport</SelectItem>
                        <SelectItem value="Club President" className="font-bold">Club President</SelectItem>
                        <SelectItem value="General Manager" className="font-bold">General Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Mission Narrative</Label>
                    <Textarea value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="min-h-[100px] rounded-2xl border-2 font-medium focus:border-primary/20 p-4 resize-none" placeholder="Describe the school's athletic program..." />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Official Club Name</Label><Input value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-lg focus:border-primary/20" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Mission Narrative</Label><Textarea value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="min-h-[150px] rounded-2xl border-2 font-medium focus:border-primary/20 p-4 resize-none" placeholder="Describe the club's tactical mission..." /></div>
                </>
              )}
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 border-none" onClick={handleUpdateClub}>{isSchoolMode ? 'Save School Identity' : 'Synchronize Hub'}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeployProtocolOpen} onOpenChange={setIsDeployProtocolOpen}>
        <DialogContent className="rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-2xl bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">Deploy Global Waiver</DialogTitle><DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Create or load a template — deploys to all squads in your organization</DialogDescription></DialogHeader>
            <div className="space-y-6">
              {/* Quick Templates */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Quick Templates — Click to Load & Edit</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      label: 'Liability Waiver',
                      content: `PARTICIPANT LIABILITY WAIVER AND RELEASE OF CLAIMS\n\nBy participating in any activity organized, supervised, or sponsored by this institution, I (the participant or parent/guardian of a minor) acknowledge and agree:\n\n1. ASSUMPTION OF RISK: I understand that athletic and recreational activities involve inherent risks of injury, including but not limited to sprains, fractures, concussions, and in rare cases serious injury or death. I voluntarily assume all such risks.\n\n2. RELEASE OF LIABILITY: I hereby release, waive, discharge, and covenant not to sue the organization, its officers, directors, coaches, employees, and volunteers from any and all liability, claims, demands, or causes of action arising out of participation in any program activity.\n\n3. MEDICAL CONSENT: I authorize emergency medical treatment if deemed necessary by medical personnel. I accept financial responsibility for any such treatment.\n\n4. PHOTO/MEDIA: I grant the organization a non-exclusive license to use photographs or video of the participant for promotional purposes.\n\nI have read this document, understand its contents, and agree to its terms.`
                    },
                    {
                      label: 'Code of Conduct',
                      content: `PARTICIPANT CODE OF CONDUCT AGREEMENT\n\nAs a participant in this organization's programs, I agree to abide by the following standards:\n\n1. RESPECT: I will treat all coaches, officials, teammates, and opponents with respect and dignity at all times.\n\n2. SPORTSMANSHIP: I will demonstrate good sportsmanship, accept decisions by officials graciously, and never engage in unsportsmanlike conduct.\n\n3. INTEGRITY: I will not engage in cheating, bullying, harassment, or discriminatory behavior of any kind.\n\n4. COMMITMENT: I will attend scheduled practices and events punctually and notify staff of absences in advance.\n\n5. ZERO TOLERANCE: I understand that violations of this code may result in suspension or removal from the program.\n\nI acknowledge my responsibility to uphold these standards and represent this organization with pride.`
                    },
                    {
                      label: 'Media & Photo Consent',
                      content: `MEDIA AND PHOTO RELEASE CONSENT FORM\n\nI hereby authorize this organization and its designated representatives to photograph, film, record, or otherwise capture the image and likeness of the participant named in this registration.\n\nI grant the organization a perpetual, non-exclusive, royalty-free license to use, reproduce, distribute, and display such materials in:\n- Print media (brochures, flyers, publications)\n- Digital media (website, social media, email newsletters)\n- Video productions (highlight reels, promotional content)\n\nI understand that no compensation will be provided for this use and that the organization retains all rights to the produced materials.\n\nI release the organization from any claims arising from the use of such materials.`
                    }
                  ].map(t => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setProtocolForm({ ...protocolForm, title: t.label, content: t.content })}
                      className="w-full text-left px-4 py-3 rounded-xl border-2 border-muted hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-between gap-3 group"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
                      <span className="text-[9px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">Load Template →</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Waiver Title</Label><Input placeholder="e.g. 2024 Seasonal Liability Waiver" value={protocolForm.title} onChange={e => setProtocolForm({...protocolForm, title: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-lg" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Waiver Text (Editable)</Label><Textarea value={protocolForm.content} onChange={e => setProtocolForm({...protocolForm, content: e.target.value})} className="min-h-[200px] rounded-2xl border-2 font-medium p-6 bg-muted/5 focus:bg-white transition-all resize-none text-sm leading-relaxed" placeholder="Enter or edit waiver text here..." /></div>
              <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                  This waiver will be saved globally to your hub and pushed to all squad compliance vaults. It will appear in the Institutional Mandates ledger immediately.
                </p>
              </div>
            </div>
            <DialogFooter><Button className="w-full h-14 rounded-[2rem] text-base font-black shadow-xl shadow-primary/20 border-none" onClick={handleDeployProtocol} disabled={isCreating || !protocolForm.title}>{isCreating ? <Loader2 className="h-6 w-6 animate-spin" /> : editingDocId ? 'Save Changes' : 'Save & Deploy Waiver'}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!teamToDelete} onOpenChange={o => !o && setTeamToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0 bg-white">
          <div className="h-2 bg-red-600 w-full" />
          <div className="p-10 space-y-6">
            <AlertDialogHeader><AlertDialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Decommission Squad?</AlertDialogTitle><AlertDialogDescription className="font-bold text-foreground/80 leading-relaxed pt-2">This will remove <strong>{teamToDelete?.name}</strong> from your institutional oversight permanently. This action is irreversible.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="rounded-xl font-bold border-2 h-12 flex-1">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={async () => { if(teamToDelete) await deleteTeam(teamToDelete.id); setTeamToDelete(null); toast({ title: "Squad Decommissioned" }); }} className="rounded-xl font-black bg-red-600 hover:bg-red-700 h-12 flex-1 shadow-lg shadow-red-600/20 border-none">Purge Permanently</AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <IncidentDetailDialog incident={viewingIncident} isOpen={!!viewingIncident} onOpenChange={(o) => !o && setViewingIncident(null)} />
    </div>
  );
}