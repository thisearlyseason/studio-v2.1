"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTeam, Team, Member, TeamDocument, TeamIncident } from '@/components/providers/team-provider';
import { HubStripeSettings } from '@/components/finance/HubStripeSettings';
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
import { useFirestore, useCollection, useMemoFirebase, useAuth } from '@/firebase';
import { collectionGroup, query, where, collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { authHeader, getAuthToken } from '@/lib/client-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncidentDetailDialog } from '@/app/(dashboard)/coaches-corner/incident-detail-dialog';
import { format, parseISO } from 'date-fns';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import {
  calculateGlobalWaiverCompletion,
  groupGlobalWaiverDeployments,
  type GlobalWaiverCompletion,
  type GlobalWaiverDeployment,
} from '@/lib/global-waiver-policy';

import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function ClubManagementPage() {
  const { isPrimaryClubAuthority, isSchoolMode } = useTeam();

  if (!isPrimaryClubAuthority) {
    return <AccessRestricted type="role" title={isSchoolMode ? "School Hub Locked" : "Club Hub Locked"} description={isSchoolMode ? "This command center is reserved for School Hub Administrators." : "This command center is reserved for Institutional Stakeholders and Club Hub Administrators."} />;
  }

  return <AuthorizedClubManagementPage />;
}

function AuthorizedClubManagementPage() {
  const { teams, user, isPrimaryClubAuthority, createNewTeam, setActiveTeam, updateUser, deployClubProtocol, hasFeature, isSchoolMode, isSchoolAdmin, activeTeam, members, db, createChat, reinstateMember, isEliteAccount, isSuperAdmin, proQuotaStatus } = useTeam();
  const [selectedCoach, setSelectedCoach] = useState<Member | null>(null);

  const router = useRouter();
  const firebaseAuth = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditClubOpen, setIsEditOpen] = useState(false);
  const [isDeployProtocolOpen, setIsDeployProtocolOpen] = useState(false);
  const [isSubSquadModalOpen, setIsSubSquadModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [clubForm, setClubForm] = useState({ name: user?.schoolName || user?.clubName || '', description: user?.clubDescription || '', schoolName: user?.schoolName || user?.clubName || '', institutionTitle: user?.institutionTitle || (isSchoolMode ? 'Athletic Director' : '') });
  const [protocolForm, setProtocolForm] = useState({ title: '', content: '', type: 'waiver' as any, waiverAudience: 'participant' as 'participant' | 'team' });
  const [newSquadForm, setNewSquadForm] = useState({ name: '', coachName: '', coachEmail: '' });
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [updatingSquadId, setUpdatingSquadId] = useState<string | null>(null);
  const [organizationCapacity, setOrganizationCapacity] = useState<{ allocated: number; limit: number; remaining: number } | null>(null);
  
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [adminProfiles, setAdminProfiles] = useState<any[]>([]);
  const [viewingIncident, setViewingIncident] = useState<TeamIncident | null>(null);
  const [inspectingGlobalWaiver, setInspectingGlobalWaiver] = useState<GlobalWaiverDeployment | null>(null);
  const [participantWaiverSignatures, setParticipantWaiverSignatures] = useState<any[]>([]);
  const [coachWaiverSignatures, setCoachWaiverSignatures] = useState<any[]>([]);

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


  // Membership records intentionally contain only a subset of team fields. Hub
  // totals must use the authoritative team documents or ownership/school links
  // can be missing and the dashboard will count only the currently active team.
  const [resolvedTeams, setResolvedTeams] = useState<Team[]>([]);
  const [isHubDataLoading, setIsHubDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolveHubTeams = async () => {
      if (!db || teams.length === 0) {
        if (!cancelled) {
          setResolvedTeams(teams);
          setIsHubDataLoading(false);
        }
        return;
      }

      setIsHubDataLoading(true);
      const authoritative = await Promise.all(teams.map(async membership => {
        try {
          const snapshot = await getDoc(doc(db, 'teams', membership.id));
          return snapshot.exists()
            ? ({ ...membership, ...snapshot.data(), id: snapshot.id } as Team)
            : membership;
        } catch {
          // Preserve the accessible membership record if a legacy document
          // cannot be resolved; never expand beyond the user's membership list.
          return membership;
        }
      }));

      if (!cancelled) {
        setResolvedTeams(authoritative);
        setIsHubDataLoading(false);
      }
    };

    resolveHubTeams();
    return () => { cancelled = true; };
  }, [db, teams]);

  const schoolHub = useMemo(() => {
    const explicit = resolvedTeams.find(t => t.type === 'school' || t.type === 'school_hub');
    if (explicit) return explicit;
    
    // If no explicit hub but user is on school plan, treat their primary owned team as the hub
    if (isSchoolMode) {
      return resolvedTeams.find(t => t.ownerUserId === user?.id && t.isPro) || resolvedTeams[0] || null;
    }
    // For elite multi-team organizers, treat their primary owned Pro team as the hub
    if (isEliteAccount && isPrimaryClubAuthority) {
      return resolvedTeams.find(t => t.ownerUserId === user?.id && t.isPro) || resolvedTeams[0] || null;
    }
    return null;
  }, [resolvedTeams, isSchoolMode, isEliteAccount, isPrimaryClubAuthority, user?.id]);

  const organizationOwnerId = schoolHub?.ownerUserId || user?.id;
  const organizationSquadCandidates = useMemo(() => {
    return Array.from(new Map(
      resolvedTeams
        .filter(t =>
          isBillableSquadSeat(t) &&
          (!isSchoolMode || !schoolHub?.id || t.schoolId === schoolHub.id)
        )
        .map(t => [t.id, t])
    ).values());
  }, [resolvedTeams, isSchoolMode, schoolHub?.id]);

  // Use the organizer's membership projections for seat allocation so the Hub
  // agrees with the squad switcher. The resolved team documents still provide
  // authoritative squad details for members, incidents, and operations.
  const allocatedMembershipIds = useMemo(
    () => new Set(teams.filter(team => team.isPro === true).map(team => team.id)),
    [teams]
  );
  const clubTeams = useMemo(() => organizationSquadCandidates.filter(team => {
    if (!allocatedMembershipIds.has(team.id)) return false;
    if (isSchoolMode && schoolHub?.id) return team.schoolId === schoolHub.id;
    return true;
  }), [organizationSquadCandidates, allocatedMembershipIds, isSchoolMode, schoolHub?.id]);
  const schoolSquads = clubTeams;
  const organizationTeamIds = useMemo(() => organizationSquadCandidates.map(t => t.id), [organizationSquadCandidates]);
  const availableStarterSquads = useMemo(
    () => organizationSquadCandidates.filter(team => !clubTeams.some(active => active.id === team.id)),
    [organizationSquadCandidates, clubTeams]
  );
  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);
  const organizationSeatLimit = organizationCapacity?.limit ?? proQuotaStatus.limit;
  const allocatedSquadCount = clubTeams.length;
  const remainingSquadSeats = Math.max(0, organizationSeatLimit - allocatedSquadCount);

  useEffect(() => {
    if (!firebaseAuth || !organizationOwnerId) return;
    let cancelled = false;
    const loadCapacity = async () => {
      try {
        const token = await getAuthToken(firebaseAuth);
        if (!token) return;
        const hubParam = isSchoolMode && schoolHub?.type && ['school', 'school_hub'].includes(schoolHub.type)
          ? `?hubTeamId=${encodeURIComponent(schoolHub.id)}`
          : '';
        const response = await fetch(`/api/organizations/squads${hubParam}`, {
          headers: authHeader(token),
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          const limit = Number(payload.limit);
          const remaining = Number(payload.remaining);
          const allocated = Number.isInteger(payload.allocated)
            ? payload.allocated
            : Math.max(0, limit - remaining);
          setOrganizationCapacity({ allocated, limit, remaining });
        }
      } catch {
        // The canonical mutation endpoint still enforces capacity if this
        // supplementary display request is interrupted.
      }
    };
    loadCapacity();
    return () => { cancelled = true; };
  }, [firebaseAuth, organizationOwnerId, isSchoolMode, schoolHub?.id, schoolHub?.type, clubTeams.length]);

  // Fetch members from ALL squad sub-collections independently so we don't
  // rely on a collectionGroup+in composite index (which causes partial results).
  const [allRawMembers, setAllRawMembers] = useState<Member[]>([]);

  const fetchAllSquadMembers = useCallback(async () => {
    if (!db || organizationSquadCandidates.length === 0) {
      setAllRawMembers([]);
      return;
    }
    try {
      const results: Member[] = [];
      for (const team of organizationSquadCandidates) {
        const snap = await getDocs(collection(db, 'teams', team.id, 'members'));
        snap.forEach(d => results.push({ id: d.id, ...d.data() } as Member));
      }
      setAllRawMembers(results);
    } catch (e) {
      console.warn('Failed to fetch squad members:', e);
    }
  }, [db, organizationSquadCandidates]);

  // Hub Broadcast Channel state
  const [hubChannel, setHubChannel] = useState<{ id: string; name: string; memberIds: string[] } | null>(null);
  const [hubChannelLoading, setHubChannelLoading] = useState(false);
  const [isCreatingHubChannel, setIsCreatingHubChannel] = useState(false);

  // Query for existing hub broadcast channel on mount (needs schoolHub to be resolved first)
  // For elite: the channel may be under any of the owned teams — search all of them.
  const [hubChannelTeamId, setHubChannelTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (!db) return;
    // Determine candidate teams to search
    const candidateTeamId = schoolHub?.id;
    const candidateTeams = isEliteAccount
      ? clubTeams.map(t => t.id)
      : candidateTeamId ? [candidateTeamId] : [];
    if (candidateTeams.length === 0) return;

    const fetchHubChannel = async () => {
      setHubChannelLoading(true);
      try {
        for (const tid of candidateTeams) {
          const snap = await getDocs(query(collection(db, 'teams', tid, 'groupChats'), where('isHubChannel', '==', true)));
          if (!snap.empty) {
            const d = snap.docs[0];
            setHubChannelTeamId(tid);
            setHubChannel({ id: d.id, name: d.data().name || 'Hub Channel', memberIds: d.data().memberIds || [] });
            return;
          }
        }
        setHubChannelTeamId(null);
        setHubChannel(null);
      } catch (e) {
        console.warn('Failed to fetch hub channel:', e);
      } finally {
        setHubChannelLoading(false);
      }
    };
    fetchHubChannel();
  }, [db, schoolHub?.id, isEliteAccount, clubTeams]);

  // The team that actually holds the hub channel (may differ from schoolHub for elite)
  const hubTeam = useMemo(() => {
    if (hubChannelTeamId) return resolvedTeams.find(t => t.id === hubChannelTeamId) || schoolHub;
    return schoolHub;
  }, [hubChannelTeamId, resolvedTeams, schoolHub]);

  const handleCreateHubChannel = async () => {
    // For elite, use the first owned Pro team as hub. For school, use the institution.
    const targetHub = hubTeam || schoolHub;
    if (!targetHub || !db || !user) return;
    setIsCreatingHubChannel(true);
    try {
      const staffKeywords = ['coach', 'director', 'coordinator', 'staff', 'manager', 'trainer'];
      const memberUserIds = new Set<string>();
      const staffMetadata: Record<string, { name: string; position: string; avatar: string }> = {};

      if (user.id) {
        memberUserIds.add(user.id);
        staffMetadata[user.id] = {
          name: user.name || (isEliteAccount ? 'League Organizer' : 'Athletic Director'),
          position: isEliteAccount ? 'League Organizer' : 'Athletic Director',
          avatar: user.avatar || '',
        };
      }
      (targetHub.schoolAdminIds || []).forEach((id: string) => memberUserIds.add(id));

      for (const m of allRawMembers) {
        if (m.status === 'removed' || !m.userId) continue;
        const pos = (m.position || '').toLowerCase();
        const role = (m.role || '').toLowerCase();
        const isStaff = staffKeywords.some(kw => pos.includes(kw)) || role === 'admin';
        if (isStaff) {
          memberUserIds.add(m.userId);
          if (!staffMetadata[m.userId]) {
            const squadName = clubTeams.find(t => t.id === m.teamId)?.name || clubTeams.find(t => t.id === m.teamId)?.teamName || '';
            staffMetadata[m.userId] = {
              name: m.name || m.userId,
              position: m.position || role,
              avatar: m.avatar || '',
              ...(squadName ? { squadName } : {}),
            };
          }
        }
      }

      const memberIdsArray = Array.from(memberUserIds);
      const channelName = `${user?.schoolName || user?.clubName || (isSchoolMode ? 'School Hub' : (isEliteAccount ? 'Apex Academy' : 'Club Hub'))} — Broadcast Channel`;
      const chatId = await createChat(channelName, memberIdsArray);
      if (chatId && db) {
        await updateDoc(doc(db, 'teams', targetHub.id, 'groupChats', chatId), {
          isHubChannel: true,
          hubTeamId: targetHub.id,
          staffMetadata,
        });
        setHubChannelTeamId(targetHub.id);
      }
      setHubChannel({ id: chatId, name: channelName, memberIds: memberIdsArray });
      toast({ title: 'Hub Channel Created', description: `${memberIdsArray.length} staff members added to the broadcast channel.` });
    } catch (e: any) {
      console.error('Failed to create hub channel:', e);
      toast({ title: 'Error Creating Channel', description: e.message, variant: 'destructive' });
    } finally {
      setIsCreatingHubChannel(false);
    }
  };

  useEffect(() => {
    fetchAllSquadMembers();
  }, [fetchAllSquadMembers]);

  // Aggregate all members from all school teams
  const clubMembers = useMemo(() => {
    const squadIds = new Set(organizationTeamIds);
    
    const validMembers = (allRawMembers || []).filter(m => squadIds.has(m.teamId));
    
    // Deduplicate by userId first, fallback to id for placeholders
    const uniqueMap = new Map<string, Member>();
    validMembers.forEach(m => {
      const key = m.userId || m.id;
      if (!uniqueMap.has(key) || (m.userId && !uniqueMap.get(key)?.userId)) {
        uniqueMap.set(key, m);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allRawMembers, organizationTeamIds]);



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

  const globalWaiverDeployments = useMemo(
    () => groupGlobalWaiverDeployments(clubDocs),
    [clubDocs]
  );

  useEffect(() => {
    let cancelled = false;
    const loadWaiverSignatures = async () => {
      if (!db || clubTeamIds.length === 0) {
        if (!cancelled) {
          setParticipantWaiverSignatures([]);
          setCoachWaiverSignatures([]);
        }
        return;
      }
      const results = await Promise.all(clubTeamIds.map(async teamId => {
        const [participantSnapshot, coachSnapshot] = await Promise.all([
          getDocs(collection(db, 'teams', teamId, 'protocol_signatures')),
          getDocs(collection(db, 'teams', teamId, 'coachWaiverSignatures')),
        ]);
        return {
          participants: participantSnapshot.docs.map(snapshot => ({ id: snapshot.id, teamId, ...snapshot.data() })),
          coaches: coachSnapshot.docs.map(snapshot => ({ id: snapshot.id, teamId, ...snapshot.data() })),
        };
      }));
      if (!cancelled) {
        setParticipantWaiverSignatures(results.flatMap(result => result.participants));
        setCoachWaiverSignatures(results.flatMap(result => result.coaches));
      }
    };
    void loadWaiverSignatures();
    return () => { cancelled = true; };
  }, [db, clubTeamIds]);

  const globalWaiverCompletion = useMemo(() => {
    const completion = new Map<string, GlobalWaiverCompletion>();
    globalWaiverDeployments.forEach(deployment => {
      completion.set(deployment.deploymentId, calculateGlobalWaiverCompletion({
        deployment,
        teamIds: clubTeamIds,
        members: allRawMembers,
        participantSignatures: participantWaiverSignatures,
        coachSignatures: coachWaiverSignatures,
      }));
    });
    return completion;
  }, [globalWaiverDeployments, clubTeamIds, allRawMembers, participantWaiverSignatures, coachWaiverSignatures]);

  // School Logic: Universal Coach & Staff Roster
  const allCoaches = useMemo(() => {
    const staffKeywords = ['coach', 'director', 'coordinator', 'staff', 'manager', 'trainer'];

    const seen = new Set<string>();
    const coaches: Member[] = [];

    if (user?.id) seen.add(user.id);

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

  const [clubIncidents, setClubIncidents] = useState<TeamIncident[]>([]);
  useEffect(() => {
    let cancelled = false;
    const fetchClubIncidents = async () => {
      if (!db || organizationTeamIds.length === 0) {
        if (!cancelled) setClubIncidents([]);
        return;
      }
      try {
        const snapshots = await Promise.allSettled(
          organizationTeamIds.map(teamId => getDocs(collection(db, 'teams', teamId, 'incidents')))
        );
        const incidents = snapshots.flatMap((result, index) => {
          if (result.status !== 'fulfilled') {
            console.warn(`Failed to load incidents for squad ${organizationTeamIds[index]}:`, result.reason);
            return [];
          }
          const snapshot = result.value;
          const teamId = organizationTeamIds[index];
          const teamName = organizationSquadCandidates.find(team => team.id === teamId)?.name || 'Unknown Squad';

          return snapshot.docs.map(incident => {
            const data = incident.data();
            return {
              id: incident.id,
              ...data,
              teamId: data.teamId || teamId,
              teamName: data.teamName || teamName,
            } as TeamIncident;
          });
        });
        const unique = Array.from(new Map(incidents.map(incident => [`${incident.teamId || ''}:${incident.id}`, incident])).values());
        unique.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        if (!cancelled) setClubIncidents(unique);
      } catch (error) {
        console.warn('Failed to fetch hub incidents:', error);
        if (!cancelled) setClubIncidents([]);
      }
    };
    fetchClubIncidents();
    return () => { cancelled = true; };
  }, [db, organizationTeamIds, organizationSquadCandidates]);

  const stats = useMemo(() => {
    let owed = 0, total = 0, cleared = 0;
    const activeMembers = clubMembers.filter(m => m.status !== 'removed' && (m as any).isDeleted !== true);
    activeMembers.forEach(m => { owed += m.amountOwed || 0; total += m.totalFees || 0; if (m.medicalClearance) cleared++; });
    const collected = total - owed;
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0;
    const compliance = organizationTeamIds.length > 0 && activeMembers.length > 0 ? Math.round((cleared / activeMembers.length) * 100) : 0;
    return { owed, collected, total, rate, compliance };
  }, [clubMembers, organizationTeamIds]);

  // ─── FISCAL PULSE: Real enrollment fee + fundraiser data ────────────────────
  const [enrollmentEntries, setEnrollmentEntries] = useState<any[]>([]);
  const [fundraiserData, setFundraiserData] = useState<any[]>([]);
  const [isFiscalLoading, setIsFiscalLoading] = useState(false);

  const fetchFiscalData = useCallback(async () => {
    if (!db || clubTeamIds.length === 0) return;
    setIsFiscalLoading(true);
    try {
      const entries: any[] = [];
      const seenLeagueIds = new Set<string>();

      const creatorSnap = await getDocs(query(collection(db, 'leagues'), where('creatorId', '==', user?.id)));
      creatorSnap.docs.forEach(d => seenLeagueIds.add(d.id));

      try {
        const ownerSnap = await getDocs(query(collection(db, 'leagues'), where('ownerUserId', '==', user?.id)));
        ownerSnap.docs.forEach(d => seenLeagueIds.add(d.id));
      } catch { /* field may not exist on older documents */ }

      const chunkSize = 10;
      for (let i = 0; i < clubTeamIds.length; i += chunkSize) {
        const chunk = clubTeamIds.slice(i, i + chunkSize);
        try {
          const memberSnap = await getDocs(query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains-any', chunk)));
          memberSnap.docs.forEach(d => seenLeagueIds.add(d.id));
        } catch { /* ignore */ }
      }

      for (const leagueId of seenLeagueIds) {
        const leagueDoc = creatorSnap.docs.find(d => d.id === leagueId);
        let leagueName = leagueDoc?.data()?.name || 'League';
        let leagueFee = 0;
        if (!leagueDoc) {
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
          const entryFee = parseFloat(data?.registrationCost ?? data?.registration_cost ?? leagueFee) || leagueFee;
          entries.push({ id: e.id, leagueId, leagueName, registrationCost: entryFee, ...data });
        });
      }

      setEnrollmentEntries(entries);

      const campaigns: any[] = [];
      for (const tid of clubTeamIds) {
        const teamSnap = clubTeams.find(t => t.id === tid);
        const fundSnap = await getDocs(collection(db, 'teams', tid, 'fundraising'));
        for (const fundDoc of fundSnap.docs) {
          const fundData = fundDoc.data();
          const donationSnap = await getDocs(collection(db, 'teams', tid, 'fundraising', fundDoc.id, 'donations'));
          const donations: any[] = [];
          donationSnap.forEach(d => donations.push({ id: d.id, ...d.data() }));

          if (donations.length === 0 && (fundData.raisedAmount || 0) > 0) {
            donations.push({ id: '_inline', amount: fundData.raisedAmount, status: 'verified', donorName: 'Campaign Total', note: 'Inline fundraiser total' });
          }

          campaigns.push({ id: fundDoc.id, teamId: tid, teamName: teamSnap?.name || 'Unknown Squad', donations, ...fundData });
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
          const snap = await getDoc(doc(db, 'teams', schoolHub.id, 'members', uid));
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
  }, [schoolHub?.id, schoolHub?.schoolAdminIds, db]);

  const filteredTeams = useMemo(() => clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())), [clubTeams, searchTerm]);

  const hasSchoolHubAccess = isPrimaryClubAuthority || isSchoolAdmin || !!schoolHub || teams.some(t => t.schoolId);
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
        if (!firebaseAuth) throw new Error('Your session is unavailable.');
        const token = await getAuthToken(firebaseAuth);
        if (!token) throw new Error('Your session has expired.');
        const response = await fetch('/api/organizations/waivers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({
            documentId: editingDocId,
            title: protocolForm.title,
            content: protocolForm.content,
            waiverAudience: protocolForm.waiverAudience,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Unable to update this waiver.');
      } else {
        await deployClubProtocol({ ...protocolForm, assignedTo: ['all'], isActive: true }, clubTeamIds);
      }
      setIsDeployProtocolOpen(false); setEditingDocId(null); setProtocolForm({ title: '', content: '', type: 'waiver', waiverAudience: 'participant' });
      toast({ title: editingDocId ? "Protocol Updated" : "Mandate Deployed", description: `Protocol synchronized across ${clubTeamIds.length} squads.` });
    } catch (error) {
      toast({ title: 'Waiver Update Failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleWaiver = async (waiverDoc: TeamDocument) => {
    if (!waiverDoc.id || !firebaseAuth) return;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/organizations/waivers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ documentId: waiverDoc.id, isActive: waiverDoc.isActive === false }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update this waiver.');
    } catch (error) {
      toast({ title: 'Waiver Update Failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDeleteWaiver = async (waiverDoc: TeamDocument) => {
    if (!waiverDoc.id || !firebaseAuth || !confirm(`Delete "${waiverDoc.title}" from the hub and every sub-squad? This cannot be undone.`)) return;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/organizations/waivers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ documentId: waiverDoc.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to delete this waiver.');
      toast({ title: 'Global Waiver Deleted', description: 'Removed from the hub and all sub-squads.' });
    } catch (error) {
      toast({ title: 'Waiver Delete Failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim() || !schoolHub || !firebaseAuth) return;
    setIsAddingAdmin(true);
    const emailToAdd = newAdminEmail.trim().toLowerCase();
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/schools/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ teamId: schoolHub.id, email: emailToAdd }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to add Hub administrator.');
      toast({
        title: payload.status === 'added' ? 'Hub Admin Added' : 'Invitation Saved',
        description: payload.status === 'added'
          ? `${emailToAdd} now has Hub access.`
          : `${emailToAdd} will get Hub access automatically when they sign up.`,
      });
      setNewAdminEmail('');
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Administrator Update Failed', description: e.message || 'Failed to add Hub administrator.', variant: 'destructive' });
    }
    setIsAddingAdmin(false);
  };

  const handleRemoveAdmin = async (adminId: string) => {
    if (!schoolHub || !firebaseAuth) return;
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/schools/admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ teamId: schoolHub.id, userId: adminId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to revoke Hub access.');
      toast({ title: 'Admin Removed', description: 'Access revoked.' });
    } catch (e: any) {
      toast({ title: 'Access Revoke Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleSquadSeatUpdate = async (team: Team, allocated: boolean) => {
    if (!firebaseAuth || updatingSquadId) return false;
    setUpdatingSquadId(team.id);
    try {
      const token = await getAuthToken(firebaseAuth);
      if (!token) throw new Error('Your session has expired.');
      const response = await fetch('/api/organizations/squads', {
        method: allocated ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          teamId: team.id,
          ...(isSchoolMode && schoolHub?.type && ['school', 'school_hub'].includes(schoolHub.type)
            ? { hubTeamId: schoolHub.id }
            : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update this squad seat.');
      setOrganizationCapacity(current => current
        ? { ...current, allocated: payload.allocated, remaining: payload.remaining }
        : current
      );
      toast({
        title: allocated ? 'Squad Added to Organization' : 'Squad Returned to Starter',
        description: allocated
          ? `${team.name} now uses a Pro squad seat.`
          : `${team.name} kept its data, lost Pro features, and released its paid seat.`,
      });
      return true;
    } catch (error) {
      toast({
        title: 'Squad Seat Update Failed',
        description: error instanceof Error ? error.message : 'Unable to update this squad seat.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setUpdatingSquadId(null);
      setTeamToDelete(null);
    }
  };

  return (
    <div className="space-y-5 md:space-y-8 pb-24 animate-in fade-in duration-700 w-full" style={{maxWidth:'100%', overflowX:'hidden'}}>

      {/* ── HERO CARD ── */}
      <Card className="bg-black text-white p-5 md:p-10 lg:p-14 rounded-[2rem] md:rounded-[3rem] shadow-2xl relative overflow-hidden group border-none hero-gradient">
        <div className="absolute top-0 right-0 p-4 md:p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Building className="h-28 w-28 md:h-56 md:w-56" />
        </div>
        <div className="relative z-10 flex flex-col gap-4 md:gap-6">
          <div className="space-y-2">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-[0.2em] text-[9px] md:text-[10px] h-6 md:h-7 px-3 md:px-4 shadow-lg">Organization Overview</Badge>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-black tracking-tighter uppercase leading-[0.9] text-white break-words">
              {user?.schoolName || user?.clubName || (isSchoolMode ? 'School Hub' : 'Club Hub')}
            </h1>
            <p className="text-white/60 font-bold uppercase tracking-[0.15em] text-[9px] md:text-[10px]">
              {user?.institutionTitle || (isSchoolMode ? 'Athletic Director' : 'Club Authority')} &bull; {user?.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10 md:h-12 px-4 md:px-6 rounded-2xl border-white/20 bg-white/10 text-white hover:bg-white hover:text-black transition-all font-black uppercase text-[10px] md:text-xs" onClick={() => setIsEditOpen(true)}>
              <Edit3 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" /> {isSchoolMode ? 'Edit School' : 'Edit Club'}
            </Button>
            <Button className="h-10 md:h-12 px-4 md:px-6 rounded-2xl font-black uppercase text-[10px] md:text-sm shadow-xl shadow-primary/40 bg-white text-black hover:bg-primary hover:text-white transition-all border-none" onClick={() => setIsSubSquadModalOpen(true)}>
              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" /> {isSchoolMode ? 'Add Sub-Squad' : 'Add Squad'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── School Hub Onboarding Note ── */}
      {isSchoolMode && !hubNoteDismissed && (
        <div className="relative rounded-[1.5rem] border-2 border-primary/20 bg-primary/5 p-4 md:p-6 flex gap-3 md:gap-5 items-start overflow-hidden group animate-in slide-in-from-top-4 duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none rounded-[1.5rem]" />
          <div className="shrink-0 mt-0.5 w-9 h-9 md:w-11 md:h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Info className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1.5 relative z-10 min-w-0">
            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] text-primary">How the School Hub Works</p>
            <h3 className="text-sm md:text-base font-black uppercase tracking-tight leading-tight text-foreground">
              One Hub. Every Squad. One Master Schedule.
            </h3>
            <div className="text-[11px] md:text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <p><strong className="text-foreground">Squads</strong> are individual teams — e.g. <em>"Varsity Basketball"</em>. Each has its own roster, coach, and calendar.</p>
              <p><strong className="text-foreground">Programs</strong> are scheduling containers that link squads for fixtures and standings.</p>
              <p>All schedules are visible on the <strong className="text-foreground">Master Calendar</strong> — labelled by program.</p>
            </div>
          </div>
          <button
            onClick={dismissHubNote}
            aria-label="Dismiss hub guide"
            className="shrink-0 mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all relative z-10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Provision Sub-Squad Dialog ── */}
      <Dialog open={isSubSquadModalOpen} onOpenChange={setIsSubSquadModalOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden w-[calc(100vw-2rem)] sm:max-w-md bg-white">
          <div className="h-2 bg-gradient-to-r from-primary via-black to-primary w-full" />
          <div className="p-5 sm:p-8 space-y-6 w-full">
            <DialogHeader>
              <div className="bg-primary/10 w-14 h-14 rounded-2xl flex items-center justify-center mb-3">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <DialogTitle className="text-3xl font-black uppercase tracking-tighter text-black leading-none">
                {isSchoolMode ? 'Provision Squad' : 'New Squad'}
              </DialogTitle>
              <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-[0.2em] mt-1">
                Operationalizing new athletic unit
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Tactical Unit Name</Label>
                <Input 
                  className="h-14 rounded-2xl border-2 border-muted bg-muted/20 font-black text-base focus:border-primary/50 focus:bg-white transition-all px-4" 
                  placeholder="e.g. Varsity Basketball" 
                  value={newSquadForm.name} 
                  onChange={e => setNewSquadForm({...newSquadForm, name: e.target.value})} 
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Designated Head Coach</Label>
                <div className="relative">
                  <Input 
                    className="h-12 rounded-2xl border-2 border-muted bg-muted/20 font-bold focus:border-primary/50 focus:bg-white transition-all pl-10" 
                    placeholder="Coach Name" 
                    value={newSquadForm.coachName} 
                    onChange={e => setNewSquadForm({...newSquadForm, coachName: e.target.value})} 
                  />
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-black/40 ml-1">Coach Email</Label>
                <div className="relative">
                  <Input 
                    type="email" 
                    className="h-12 rounded-2xl border-2 border-muted bg-muted/20 font-bold focus:border-primary/50 focus:bg-white transition-all pl-10" 
                    placeholder="coach@example.com" 
                    value={newSquadForm.coachEmail} 
                    onChange={e => setNewSquadForm({...newSquadForm, coachEmail: e.target.value})} 
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
              <Button 
                variant="ghost" 
                className="h-12 rounded-2xl font-black uppercase text-xs tracking-widest text-muted-foreground hover:text-black" 
                onClick={() => setIsSubSquadModalOpen(false)}
              >
                Abort
              </Button>
              <Button 
                className="h-12 flex-1 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 bg-black text-white hover:bg-primary transition-all group" 
                disabled={isCreating || !newSquadForm.name || !newSquadForm.coachName} 
                onClick={async () => {
                   if (isCreating) return;
                   setIsCreating(true);
                   try {
                     const targetSchoolId = schoolHub?.id;
                     const teamId = await createNewTeam(
                       newSquadForm.name, 
                       'school_squad', 
                       'Coach', 
                       'School squad', 
                       'squad_organization',
                       undefined, 
                       undefined, 
                       targetSchoolId, 
                       newSquadForm.coachName, 
                       newSquadForm.coachEmail,
                       schoolHub?.ownerUserId
                     );
                     if (!teamId) throw new Error('The squad could not be created.');
                     const allocated = await handleSquadSeatUpdate({ id: teamId, name: newSquadForm.name } as Team, true);
                     if (!allocated) return;
                     setIsSubSquadModalOpen(false);
                     setNewSquadForm({ name: '', coachName: '', coachEmail: '' });
                     toast({ title: 'Operational Unit Provisioned', description: 'Squad and Head Coach profile initialized.' });
                   } catch (err: any) {
                     console.error('[Provisioning Error]:', err);
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
                {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />} 
                Authorize Provisioning
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Hub Broadcast Channel ── */}
      {(isSchoolMode || !isSchoolMode) && schoolHub && (
        <Card className="rounded-2xl border-none bg-white ring-1 ring-black/5 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 md:p-2.5 rounded-xl text-primary shrink-0">
              <MessageCircle className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-tight leading-tight">Hub Broadcast Channel</p>
              <p className="text-[9px] md:text-[10px] font-bold text-muted-foreground">Open tactical chat · All coaches & admins</p>
            </div>
            {hubChannel && (
              <Badge className="bg-primary/10 text-primary font-black uppercase text-[8px] tracking-widest border-none shrink-0">
                {hubChannel.memberIds.length} Members
              </Badge>
            )}
            {hubChannelLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            ) : hubChannel ? (
              <Button
                size="sm"
                onClick={() => {
                  const teamId = hubTeam?.id || schoolHub?.id;
                  const url = `/chats/${hubChannel.id}${teamId ? `?teamId=${teamId}` : ''}`;
                  router.push(url);
                }}
                className="rounded-xl font-black uppercase text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shadow-md shadow-primary/20 shrink-0"
              >
                <MessageCircle className="h-3 w-3 mr-1" /> Open
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleCreateHubChannel}
                disabled={isCreatingHubChannel}
                className="rounded-xl font-black uppercase text-[9px] md:text-[10px] h-8 md:h-9 px-3 md:px-4 shadow-md shadow-primary/20 shrink-0"
              >
                {isCreatingHubChannel ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Creating...</>
                ) : (
                  <>Set Up Channel</>
                )}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-3 md:gap-5">
        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-md bg-primary text-white p-4 md:p-6 space-y-1">
          <p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Pro Squads</p>
          <p className="text-3xl md:text-4xl font-black" aria-live="polite">
            {isHubDataLoading ? <Loader2 className="h-7 w-7 animate-spin" aria-label="Loading squad total" /> : allocatedSquadCount}
          </p>
          <p className="text-[8px] font-bold uppercase opacity-60">
            {remainingSquadSeats} of {organizationSeatLimit} seats available
          </p>
        </Card>
        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-md bg-black text-white p-4 md:p-6 space-y-2">
          <p className="text-[9px] font-black uppercase opacity-60 tracking-widest">Fiscal Pulse</p>
          <p className="text-xl md:text-2xl font-black">${fiscalSummary.fiscalPulseTotal.toLocaleString()}</p>
          <Progress value={fiscalSummary.fiscalPulseRate} className="h-1 bg-white/10" />
          <p className="text-[7px] font-bold opacity-40 uppercase tracking-widest">
            Fees <span className="text-white/70">${fiscalSummary.totalEnrollmentRevenue.toLocaleString()}</span>
            {' · '}
            Donations <span className="text-white/70">${fiscalSummary.totalDonationsConfirmed.toLocaleString()}</span>
          </p>
        </Card>
        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-md bg-white p-4 md:p-6 space-y-1 ring-1 ring-black/5">
          <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Compliance Rating</p>
          <p className="text-3xl md:text-4xl font-black text-primary">{stats.compliance}%</p>
        </Card>
        <Card className="rounded-[1.5rem] md:rounded-[2rem] border-none shadow-md bg-muted/20 p-4 md:p-6 space-y-2">
          <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /><p className="text-[9px] font-black uppercase text-foreground">Safety Oversights</p></div>
          <p className="text-3xl font-black text-foreground">{clubIncidents.length}</p>
        </Card>
      </div>

      {/* ── TABS ── */}
      <Tabs defaultValue="squads" className="space-y-5">
        {/*
          Mobile: CSS grid — tabs wrap naturally into rows, all visible, no scroll.
            • School hub (6 tabs) → 3-col grid = 2 rows of 3
            • Club only  (4 tabs) → 2-col grid = 2 rows of 2
          sm+: single-row flex pill (original look).
          Triggers appear exactly ONCE in the DOM so Radix focus management stays intact.
        */}
        <TabsList className={cn(
          "bg-muted/40 border shadow-inner p-1 h-auto gap-1 w-full",
          // Mobile grid: columns depend on how many tabs are shown
          schoolHub ? "grid grid-cols-3 rounded-2xl" : "grid grid-cols-2 rounded-2xl",
          // sm+: single pill row
          "sm:flex sm:flex-row sm:flex-nowrap sm:h-11 sm:rounded-xl sm:w-auto sm:inline-flex sm:items-center sm:gap-0.5 sm:p-1"
        )}>
          <TabsTrigger
            value="squads"
            className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-black data-[state=active]:text-white"
          >
            Squads
          </TabsTrigger>

          {schoolHub && (
            <TabsTrigger
              value="coaches"
              className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              Coaches
            </TabsTrigger>
          )}

          {schoolHub && (
            <TabsTrigger
              value="admins"
              className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              Admins
            </TabsTrigger>
          )}

          <TabsTrigger
            value="compliance"
            className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-black data-[state=active]:text-white"
          >
            Waivers
          </TabsTrigger>

          <TabsTrigger
            value="finance"
            className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Finance
          </TabsTrigger>

          <TabsTrigger
            value="safety"
            className="rounded-xl sm:rounded-lg font-black text-[9px] sm:text-[10px] uppercase py-2.5 sm:py-0 sm:px-4 h-9 sm:h-auto data-[state=active]:bg-primary data-[state=active]:text-white"
          >
            Safety
          </TabsTrigger>
        </TabsList>

        {/* ── SQUADS TAB ── */}
        <TabsContent value="squads" className="space-y-8 mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-lg md:text-xl font-black uppercase tracking-tight">Active Squads</h3>
                <p className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Optimized Personnel Layers</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {filteredTeams.map(team => (
                <Card key={team.id} className="rounded-[1.5rem] border-none shadow-sm ring-1 ring-black/5 p-4 md:p-5 hover:shadow-xl transition-all group bg-white">
                  <div className="flex items-center gap-3 md:gap-5">
                    <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-2xl shadow-md border-2 border-background shrink-0">
                      <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                      <AvatarFallback className="font-black bg-white text-foreground">{team.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base md:text-lg font-black uppercase text-foreground group-hover:text-primary transition-colors truncate">{team.name}</h3>
                      <p className="text-[8px] md:text-[9px] font-black text-muted-foreground uppercase tracking-widest truncate">
                        {team.sport} · {clubMembers.filter(m => m.teamId === team.id && m.status !== 'removed').length} Athletes · Code: <span className="text-primary font-black select-all">{team.code || team.teamCode || team.inviteCode || '---'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/5 rounded-xl" onClick={() => setTeamToDelete(team)} disabled={updatingSquadId === team.id}>
                            {updatingSquadId === team.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-destructive">Remove from organization</TooltipContent>
                      </Tooltip>
                      <Button variant="outline" className="rounded-xl h-9 px-3 md:px-5 font-black uppercase text-[9px] text-foreground border-2 hover:bg-black hover:text-white transition-all whitespace-nowrap" onClick={() => { setActiveTeam(team); router.push('/team'); }}>
                        Access <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
              {!isHubDataLoading && filteredTeams.length === 0 && (
                <div className="rounded-2xl border border-dashed p-6 text-center">
                  <p className="text-sm font-black uppercase">No Pro squads allocated</p>
                  <p className="mt-1 text-xs text-muted-foreground">Add an available Starter squad to use an organization seat.</p>
                </div>
              )}
            </div>
          </div>

          {availableStarterSquads.length > 0 && (
            <div className="space-y-4 border-t pt-6">
              <div className="px-1">
                <h3 className="text-base font-black uppercase tracking-tight">Available Starter Squads</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Not counted in this Hub and no Pro features</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {availableStarterSquads.map(team => (
                  <div key={team.id} className="flex items-center gap-3 rounded-2xl border bg-muted/10 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black uppercase">{team.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Starter squad</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-9 rounded-xl px-3 text-[9px] font-black uppercase"
                      disabled={remainingSquadSeats < 1 || updatingSquadId === team.id}
                      onClick={() => handleSquadSeatUpdate(team, true)}
                    >
                      {updatingSquadId === team.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                      Add to Hub
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(clubMembers.some(m => m.status === 'removed')) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1 pt-4 border-t">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-red-600/60">Historical Archive</h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Decommissioned Athletes & Staff</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 opacity-75">
                {clubMembers.filter(m => m.status === 'removed').map(member => (
                  <Card key={member.id} className="rounded-[1.5rem] border-none shadow-sm ring-1 ring-black/5 p-4 bg-white/50 border-2 border-dashed border-red-100">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11 rounded-2xl grayscale shrink-0 opacity-40">
                        <AvatarImage src={member.avatar} className="object-cover" />
                        <AvatarFallback className="font-black bg-muted text-foreground">{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-black uppercase text-foreground/50 truncate">{member.name}</h3>
                        <p className="text-[8px] font-black text-red-600 uppercase tracking-widest">
                          Removed {member.removedAt ? format(new Date(member.removedAt), 'MMM d, yyyy') : 'No Date'}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        className="rounded-xl h-8 px-3 font-black uppercase text-[9px] text-primary border-primary/20 hover:bg-primary hover:text-white transition-all shrink-0"
                        onClick={() => reinstateMember(member.id)}
                      >
                        Reinstate
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── COACHES TAB ── */}
        {schoolHub && (
          <TabsContent value="coaches" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 gap-3">
              {allCoaches.map(coach => (
                <Card key={coach.id} className="rounded-[1.5rem] border-none shadow-sm ring-1 ring-black/5 p-4 bg-white cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all" onClick={() => setSelectedCoach(coach)}>
                  <div className="flex items-center gap-3 md:gap-4">
                    <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-2xl shadow-md border-2 border-background shrink-0">
                      <AvatarImage src={coach.avatar} className="object-cover" />
                      <AvatarFallback className="font-black bg-primary/10 text-primary">{coach.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black uppercase text-foreground truncate">{coach.name}</h3>
                      <p className="text-[8px] font-black text-primary uppercase tracking-widest">{coach.position || 'Coach'}</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                        {coach.userId === user?.id
                          ? (user?.schoolName || user?.clubName || teams[0]?.name || '')
                          : (teams.find(t => t.id === coach.teamId)?.name || '')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Card>
              ))}
              {allCoaches.length === 0 && <div className="text-center py-12 text-muted-foreground font-bold text-sm">No Coaches found.</div>}
            </div>
          </TabsContent>
        )}

        {/* ── ADMINS TAB ── */}
        {schoolHub && (
          <TabsContent value="admins" className="space-y-5 mt-0 animate-in fade-in">
            <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-5 md:p-8">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="bg-primary p-2.5 md:p-3 rounded-2xl shadow-xl shadow-primary/20 shrink-0">
                    <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg md:text-2xl font-black uppercase tracking-tight">Institutional Authorities</CardTitle>
                    <CardDescription className="text-white/60 font-bold uppercase text-[9px] mt-1 tracking-widest">Manage co-administrators for the {schoolHub.name} hub</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-8 space-y-6">
                {schoolHub.ownerUserId === user?.id && (
                  <div className="flex flex-col gap-3">
                    <Input
                      placeholder="Admin Email Address"
                      type="email"
                      className="h-12 rounded-2xl border-2 font-bold focus:border-primary/50 text-foreground"
                      value={newAdminEmail}
                      onChange={e => setNewAdminEmail(e.target.value)}
                    />
                    <Button 
                      className="h-12 px-6 rounded-2xl font-black shadow-xl bg-black text-white hover:bg-primary uppercase"
                      disabled={isAddingAdmin || (schoolHub.schoolAdminIds?.length || 0) >= 3 || !newAdminEmail}
                      onClick={handleAddAdmin}
                    >
                      {isAddingAdmin ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                      Add Hub Admin
                    </Button>
                  </div>
                )}
                
                {schoolHub.ownerUserId !== user?.id && (
                  <div className="bg-muted/20 p-4 rounded-2xl border-2 text-center text-xs font-bold uppercase text-muted-foreground">
                    Only the primary account owner can manage co-administrators.
                  </div>
                )}
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2">
                    <span>Hub Administrators {((schoolHub.schoolAdminIds?.length || 0) + ((schoolHub as any).pendingAdminEmails?.length || 0))}/3</span>
                  </div>
                  
                  {/* Primary Owner */}
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/10 border-2 border-transparent">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase text-foreground truncate">{user?.name || 'Primary Owner'}</p>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase truncate">{user?.email} · Creator</p>
                    </div>
                    <Badge className="bg-black text-white h-6 px-3 uppercase text-[9px] font-black tracking-widest pointer-events-none shrink-0">Owner</Badge>
                  </div>
                  
                  {adminProfiles.map((admin) => (
                    <div key={admin.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white border-2 hover:border-primary/20 transition-all group shadow-sm">
                      <Avatar className="h-10 w-10 border shrink-0">
                        <AvatarImage src={admin.avatar} />
                        <AvatarFallback className="font-bold text-primary">{(admin.name || admin.email || 'A')[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase text-foreground truncate">{admin.name || admin.email || 'Hub Admin'}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase truncate">{admin.email}</p>
                      </div>
                      {schoolHub.ownerUserId === user?.id && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveAdmin(admin.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 h-9 w-9 rounded-xl shrink-0">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-destructive">Revoke Admin Credentials</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ))}

                  {/* Pending Invitations */}
                  {((schoolHub as any).pendingAdminEmails?.length > 0) &&
                    ((schoolHub as any).pendingAdminEmails as string[]).map((pendingEmail) => (
                      <div key={pendingEmail} className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-100 group">
                        <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <Mail className="h-4 w-4 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase text-foreground truncate">{pendingEmail}</p>
                          <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Pending · Granted on sign-up</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className="bg-amber-100 text-amber-700 border border-amber-200 h-6 px-2 uppercase text-[8px] font-black tracking-widest pointer-events-none">Pending</Badge>
                          {schoolHub.ownerUserId === user?.id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    try {
                                      const token = await getAuthToken(firebaseAuth);
                                      if (!token) throw new Error('Your session has expired.');
                                      const response = await fetch('/api/schools/admins', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
                                        body: JSON.stringify({ teamId: schoolHub.id, email: pendingEmail }),
                                      });
                                      const payload = await response.json();
                                      if (!response.ok) throw new Error(payload.error || 'Failed to revoke the invitation.');
                                      toast({ title: 'Invite Revoked', description: `${pendingEmail} removed from pending invitations.` });
                                    } catch (e: any) {
                                      toast({ title: 'Invite Revoke Failed', description: e.message, variant: 'destructive' });
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 h-8 w-8 rounded-xl"
                                >
                                  <XCircle className="h-4 w-4" />
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
          <DialogContent className="rounded-[2rem] border-none shadow-2xl p-0 w-[calc(100vw-2rem)] max-w-lg bg-white overflow-y-auto max-h-[90vh]">
            <DialogHeader className="sr-only">
              <DialogTitle>Personnel Dossier: {selectedCoach?.name}</DialogTitle>
              <DialogDescription>Detailed coaching credentials and contact information.</DialogDescription>
            </DialogHeader>
            {selectedCoach && (
              <div className="flex flex-col">
                <div className="w-full bg-black text-white p-6 md:p-8 space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 md:h-20 md:w-20 rounded-2xl border-4 border-white/10 shadow-xl shrink-0">
                      <AvatarImage src={selectedCoach.avatar} className="object-cover" />
                      <AvatarFallback className="text-2xl font-black bg-white/10">{selectedCoach.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight truncate">{selectedCoach.name}</h2>
                      <p className="text-primary font-black uppercase tracking-widest text-xs md:text-sm">{selectedCoach.position}</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 md:p-8 space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl shrink-0"><Trophy className="h-4 w-4 text-primary" /></div>
                      <div><p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Team</p><p className="font-bold text-sm">{teams.find(t => t.id === selectedCoach.teamId)?.name || 'N/A'}</p></div>
                    </div>
                    {(selectedCoach as any).email && (
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl shrink-0"><Mail className="h-4 w-4 text-primary" /></div>
                        <div><p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Email</p><p className="font-bold text-sm break-all">{(selectedCoach as any).email}</p></div>
                      </div>
                    )}
                    {selectedCoach.phone && (
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-xl shrink-0"><Activity className="h-4 w-4 text-primary" /></div>
                        <div><p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Phone</p><p className="font-bold text-sm">{selectedCoach.phone}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 font-black uppercase text-[10px] h-11 rounded-2xl bg-primary hover:bg-primary/90"
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
                      <MessageCircle className="h-3.5 w-3.5 mr-2" />
                      Start Chat
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 font-black uppercase text-[10px] h-11 rounded-2xl"
                      onClick={() => {
                        const team = teams.find(t => t.id === selectedCoach.teamId);
                        if (team) {
                          setActiveTeam(team);
                          setSelectedCoach(null);
                          router.push('/roster');
                        }
                      }}
                    >
                      <LayoutGrid className="h-3.5 w-3.5 mr-2" />
                      View Roster
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── COMPLIANCE / WAIVERS TAB ── */}
        <TabsContent value="compliance" className="space-y-6 mt-0">
          <div className="space-y-6">
            {/* Waivers list */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-base md:text-lg font-black uppercase text-foreground">Global Waivers</h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Deployed to all squads</p>
                </div>
                <Button onClick={() => { setEditingDocId(null); setProtocolForm({ title: '', content: '', type: 'waiver', waiverAudience: 'participant' }); setIsDeployProtocolOpen(true); }} className="h-9 md:h-10 px-4 md:px-6 font-black uppercase text-[9px] md:text-[10px] shadow-lg shadow-primary/20 border-none">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New Waiver
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {globalWaiverDeployments.map(deployment => {
                  const waiverDoc = deployment.document as TeamDocument;
                  const completion = globalWaiverCompletion.get(deployment.deploymentId);
                  return (
                  <Card key={deployment.deploymentId} onClick={() => setInspectingGlobalWaiver(deployment)} className={cn("rounded-2xl p-5 md:p-6 bg-white shadow-lg border space-y-3 flex flex-col transition-all cursor-pointer", waiverDoc.isActive === false ? "opacity-50 border-dashed" : completion?.isComplete ? "border-emerald-300 ring-1 ring-emerald-200" : "hover:ring-2 hover:ring-primary/20")}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <Badge className={cn("font-black text-[8px] h-5 px-2 uppercase tracking-widest shadow mb-1.5 border-none", waiverDoc.isActive === false ? "bg-muted text-muted-foreground" : "bg-black text-white")}>
                          {waiverDoc.isActive === false ? 'INACTIVE' : 'ACTIVE'}
                        </Badge>
                        <h4 className="text-sm font-black uppercase text-foreground truncate">{waiverDoc.title}</h4>
                      </div>
                      {completion?.isComplete
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-1" />
                        : <ShieldCheck className="h-4 w-4 text-primary opacity-20 shrink-0 mt-1" />}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground line-clamp-2 italic flex-1 leading-relaxed">"{waiverDoc.content}"</p>
                    <div className="pt-3 border-t flex items-center justify-between gap-2">
                      <div>
                        <span className={cn("text-[9px] font-black uppercase tracking-widest", completion?.isComplete ? "text-emerald-600" : "text-primary")}>{completion?.signed || 0}/{completion?.required || 0} Signed</span>
                        <p className="text-[7px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">{completion?.audience === 'team' ? 'One staff per squad' : 'All participants'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 px-2.5 rounded-xl font-black text-[8px] uppercase border-2" onClick={(event) => { event.stopPropagation(); setEditingDocId(waiverDoc.id); setProtocolForm({ title: waiverDoc.title, content: waiverDoc.content || '', type: waiverDoc.type || 'waiver', waiverAudience: waiverDoc.waiverAudience === 'team' ? 'team' : 'participant' }); setIsDeployProtocolOpen(true); }}>Edit</Button>
                        <Button variant="outline" size="sm" className={cn("h-7 px-2.5 rounded-xl font-black text-[8px] uppercase border-2", waiverDoc.isActive === false ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-amber-200 text-amber-600 hover:bg-amber-50")} onClick={(event) => { event.stopPropagation(); void handleToggleWaiver(waiverDoc); }}>{waiverDoc.isActive === false ? 'Enable' : 'Disable'}</Button>
                        <Button aria-label={`Delete ${waiverDoc.title}`} variant="ghost" size="sm" className="h-7 w-7 rounded-xl text-red-500 hover:bg-red-50" onClick={(event) => { event.stopPropagation(); void handleDeleteWaiver(waiverDoc); }}>×</Button>
                      </div>
                    </div>
                  </Card>
                  );
                })}
                {globalWaiverDeployments.length === 0 && (
                  <div className="col-span-full py-16 text-center bg-muted/10 rounded-2xl border-2 border-dashed opacity-30 text-foreground space-y-3">
                    <FileText className="h-10 w-10 mx-auto" />
                    <p className="text-xs font-black uppercase tracking-widest">No global waivers deployed</p>
                    <p className="text-xs font-bold">Click "New Waiver" to create and deploy a waiver.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </TabsContent>

        {/* ── FINANCE TAB ── */}
        <TabsContent value="finance" className="space-y-6 mt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-2xl border-none shadow-md bg-emerald-600 text-white p-4 space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Fees Collected</p>
              <p className="text-xl md:text-2xl font-black">${fiscalSummary.totalEnrollmentRevenue.toLocaleString()}</p>
              <p className="text-[8px] font-bold opacity-60 uppercase">{fiscalSummary.paid} paid</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-amber-500 text-white p-4 space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Fees Outstanding</p>
              <p className="text-xl md:text-2xl font-black">${fiscalSummary.pendingEnrollmentRevenue.toLocaleString()}</p>
              <p className="text-[8px] font-bold opacity-60 uppercase">{fiscalSummary.unpaid} unpaid</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-primary text-white p-4 space-y-1">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Donations ✓</p>
              <p className="text-xl md:text-2xl font-black">${fiscalSummary.totalDonationsConfirmed.toLocaleString()}</p>
              <p className="text-[8px] font-bold opacity-60 uppercase">Verified</p>
            </Card>
            <Card className="rounded-2xl border-none shadow-md bg-muted/30 p-4 space-y-1 ring-1 ring-black/5">
              <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Donations ⏳</p>
              <p className="text-xl md:text-2xl font-black text-foreground">${fiscalSummary.totalDonationsPending.toLocaleString()}</p>
              <p className="text-[8px] font-bold text-muted-foreground uppercase">Pending</p>
            </Card>
          </div>

          {/* Per-Squad Breakdown */}
          {clubTeams.length > 0 && (
            <div className="space-y-3">
              <div className="px-1">
                <h3 className="text-base font-black uppercase tracking-tight">Squad Breakdown</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Individual financial summary per squad</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {clubTeams.map(team => {
                  const teamEntries = enrollmentEntries.filter(e => {
                    const ans = e.answers || {};
                    return (ans.team_id === team.id || ans.teamId === team.id || (team.name && (ans.teamName === team.name || ans.team_name === team.name)));
                  });
                  const teamCampaigns = fundraiserData.filter(c => c.teamId === team.id);
                  const teamPaid = teamEntries.filter(e => e.payment_received).reduce((s: number, e: any) => s + (e.registrationCost || 0), 0);
                  const teamUnpaid = teamEntries.filter(e => !e.payment_received).reduce((s: number, e: any) => s + (e.registrationCost || 0), 0);
                  const teamDonationsConfirmed = teamCampaigns.reduce((s: number, c: any) => s + c.donations.filter((d: any) => d.status === 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
                  const teamDonationsPending = teamCampaigns.reduce((s: number, c: any) => s + c.donations.filter((d: any) => d.status !== 'verified').reduce((ds: number, d: any) => ds + (d.amount || 0), 0), 0);
                  const grandTotal = teamPaid + teamDonationsConfirmed;
                  return (
                    <Card key={team.id} className="rounded-[1.5rem] border-none shadow-md bg-white ring-1 ring-black/5 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-xs uppercase tracking-tight truncate">{team.name}</p>
                          <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{teamEntries.length} registrations · {teamCampaigns.length} campaigns</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-[8px] font-black uppercase text-muted-foreground">Total In</p>
                          <p className="font-black text-base text-emerald-600">${grandTotal.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-emerald-50 rounded-xl p-2.5 space-y-0.5">
                          <p className="text-[7px] font-black uppercase text-emerald-700/70 tracking-widest">Fees ✓</p>
                          <p className="font-black text-sm text-emerald-700">${teamPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-2.5 space-y-0.5">
                          <p className="text-[7px] font-black uppercase text-amber-700/70 tracking-widest">Fees ⏳</p>
                          <p className="font-black text-sm text-amber-700">${teamUnpaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-primary/5 rounded-xl p-2.5 space-y-0.5">
                          <p className="text-[7px] font-black uppercase text-primary/70 tracking-widest">Donations ✓</p>
                          <p className="font-black text-sm text-primary">${teamDonationsConfirmed.toLocaleString()}</p>
                        </div>
                        <div className="bg-muted/20 rounded-xl p-2.5 space-y-0.5">
                          <p className="text-[7px] font-black uppercase text-muted-foreground tracking-widest">Donations ⏳</p>
                          <p className="font-black text-sm">${teamDonationsPending.toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Enrollment Fee Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-base font-black uppercase tracking-tight">Enrollment Ledger</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Registration entries across all org leagues</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl h-8 font-black uppercase text-[9px]" onClick={fetchFiscalData} disabled={isFiscalLoading}>
                {isFiscalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                <span className="ml-1.5">Refresh</span>
              </Button>
            </div>
            <Card className="rounded-[1.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
              {enrollmentEntries.length === 0 ? (
                <div className="p-12 text-center space-y-3 opacity-30">
                  <DollarSign className="h-8 w-8 mx-auto" />
                  <p className="text-xs font-black uppercase tracking-widest">No enrollment entries found</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-left" style={{minWidth:'560px'}}>
                    <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr>
                        <th className="px-4 py-3">Team / Applicant</th>
                        <th className="px-3 py-3">League</th>
                        <th className="px-3 py-3">Fee</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted/30">
                      {enrollmentEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-black text-xs uppercase">{entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || '—'}</p>
                            <p className="text-[9px] text-muted-foreground font-bold uppercase">{entry.answers?.email || ''}</p>
                          </td>
                          <td className="px-3 py-3 text-xs font-bold text-muted-foreground uppercase">{entry.leagueName}</td>
                          <td className="px-3 py-3"><span className="font-black text-sm">{entry.registrationCost > 0 ? `$${entry.registrationCost}` : 'Free'}</span></td>
                          <td className="px-3 py-3">
                            <Badge className={cn('border-none font-black text-[8px] uppercase px-2 h-5', entry.payment_received ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                              {entry.payment_received ? '✓ Paid' : '⏳ Unpaid'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-[9px] font-bold text-muted-foreground uppercase">
                            {(entry.createdAt || entry.created_at) ? (() => { try { return format(new Date(entry.createdAt || entry.created_at), 'MMM d, yy'); } catch { return '—'; } })() : '—'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn('rounded-xl h-7 px-3 font-black uppercase text-[8px] transition-all', entry.payment_received ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50')}
                              onClick={() => handleTogglePayment(entry.leagueId, entry.id, entry.payment_received)}
                            >
                              {entry.payment_received ? 'Unpaid' : 'Paid'}
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

          {/* Fundraiser Donations */}
          <div className="space-y-3">
            <div className="px-1">
              <h3 className="text-base font-black uppercase tracking-tight">Fundraiser Donations</h3>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">All campaigns across all squads</p>
            </div>
            {fundraiserData.length === 0 ? (
              <Card className="rounded-[1.5rem] border-none shadow-xl bg-white ring-1 ring-black/5">
                <div className="p-12 text-center space-y-3 opacity-30">
                  <TrendingUp className="h-8 w-8 mx-auto" />
                  <p className="text-xs font-black uppercase tracking-widest">No fundraiser campaigns found</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {fundraiserData.map(campaign => (
                  <Card key={`${campaign.teamId}-${campaign.id}`} className="rounded-[1.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
                    <div className="px-5 py-4 bg-primary/5 border-b flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-sm uppercase tracking-tight truncate">{campaign.title || campaign.name || 'Campaign'}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{campaign.teamName} · {campaign.donations.length} donations</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[8px] font-black uppercase text-muted-foreground">Confirmed</p>
                        <p className="font-black text-sm text-primary">${campaign.donations.filter((d: any) => d.status === 'verified').reduce((s: number, d: any) => s + (d.amount || 0), 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {campaign.donations.length === 0 ? (
                      <p className="px-5 py-5 text-[10px] font-bold text-muted-foreground uppercase opacity-40">No donations recorded yet.</p>
                    ) : (
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full text-left" style={{minWidth:'480px'}}>
                          <thead className="bg-muted/20 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                            <tr>
                              <th className="px-4 py-2.5">Donor</th>
                              <th className="px-3 py-2.5">Amount</th>
                              <th className="px-3 py-2.5">Status</th>
                              <th className="px-3 py-2.5">Date</th>
                              <th className="px-3 py-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted/20">
                            {campaign.donations.map((donation: any) => (
                              <tr key={donation.id} className="hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-black text-xs uppercase">{donation.donorName || donation.userName || 'Anonymous'}</p>
                                  {donation.note && <p className="text-[9px] text-muted-foreground italic">{donation.note}</p>}
                                </td>
                                <td className="px-3 py-3 font-black text-sm">${(donation.amount || 0).toLocaleString()}</td>
                                <td className="px-3 py-3">
                                  <Badge className={cn('border-none font-black text-[8px] uppercase px-2 h-5', donation.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                                    {donation.status === 'verified' ? '✓ Done' : '⏳ Pending'}
                                  </Badge>
                                </td>
                                <td className="px-3 py-3 text-[9px] font-bold text-muted-foreground uppercase">
                                  {donation.createdAt ? (() => { try { return format(new Date(donation.createdAt), 'MMM d, yy'); } catch { return '—'; } })() : '—'}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {donation.status !== 'verified' && (
                                    <Button
                                      size="sm"
                                      className="rounded-xl h-7 px-3 font-black uppercase text-[8px] bg-emerald-600 text-white hover:bg-emerald-700"
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

          {/* Payments / Stripe Settings belong exclusively to Finance. */}
          {schoolHub?.id && user?.id && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">
                  {isSchoolMode ? 'School Hub' : 'Club Hub'}
                </Badge>
                <h2 className="text-2xl font-black uppercase tracking-tight">Payment Settings</h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Configure how Stripe online payments work across your {isSchoolMode ? 'school' : 'club'}
                </p>
              </div>
              <HubStripeSettings
                userId={user.id}
                hubTeamId={schoolHub.id}
                subSquads={schoolSquads.map(s => ({ id: s.id, name: s.name }))}
                isSchoolMode={isSchoolMode}
                isDemo={user.isDemo === true && !isSuperAdmin}
              />
            </div>
          )}
        </TabsContent>

        {/* ── SAFETY TAB ── */}
        <TabsContent value="safety" className="mt-0">
          <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardHeader className="bg-black text-white p-5 md:p-8">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="bg-primary p-2.5 md:p-3 rounded-2xl shadow-xl shadow-primary/20 shrink-0">
                  <ShieldAlert className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg md:text-2xl font-black uppercase tracking-tight">Institutional Safety Audit</CardTitle>
                  <CardDescription className="text-white/60 font-bold uppercase text-[9px] mt-1 tracking-widest">Aggregate incident reporting across all managed units</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-w-full">
                <table className="w-full text-left" style={{minWidth:'480px'}}>
                  <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 md:px-6 py-3 md:py-4">Incident</th>
                      <th className="px-3 md:px-5 py-3 md:py-4">Squad</th>
                      <th className="px-3 md:px-5 py-3 md:py-4">Severity</th>
                      <th className="px-4 md:px-6 py-3 md:py-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/50">
                    {clubIncidents.map(inc => (
                      <tr key={inc.id} onClick={() => setViewingIncident(inc)} className="hover:bg-primary/5 transition-colors group cursor-pointer">
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <p className="font-black text-xs uppercase text-foreground">{inc.title}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">{inc.location}</p>
                        </td>
                        <td className="px-3 md:px-5 py-3 md:py-4 font-black text-xs uppercase text-foreground">{inc.teamName}</td>
                        <td className="px-3 md:px-5 py-3 md:py-4">
                          <Badge className={cn("border-none font-black text-[8px] uppercase px-2 h-5", inc.emergencyServicesCalled ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground")}>
                            {inc.emergencyServicesCalled ? 'CRITICAL' : 'ROUTINE'}
                          </Badge>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-right font-black text-xs uppercase text-foreground">
                          {(() => { try { return format(parseISO(inc.date), 'MMM d, yyyy'); } catch { return inc.date; } })()}
                        </td>
                      </tr>
                    ))}
                    {clubIncidents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-16 text-center opacity-30 italic text-xs uppercase font-black text-foreground">No institutional safety reports archived.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {viewingIncident && (
        <IncidentDetailDialog 
          incident={viewingIncident} 
          isOpen={!!viewingIncident} 
          onOpenChange={(o) => { if (!o) setViewingIncident(null); }} 
        />
      )}

      <Dialog open={!!inspectingGlobalWaiver} onOpenChange={(open) => !open && setInspectingGlobalWaiver(null)}>
        <DialogContent className="rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden w-[calc(100vw-2rem)] sm:max-w-xl bg-white">
          {inspectingGlobalWaiver && (() => {
            const completion = globalWaiverCompletion.get(inspectingGlobalWaiver.deploymentId);
            return (
              <>
                <div className={cn("px-6 py-5 text-white", completion?.isComplete ? "bg-emerald-600" : "bg-black")}>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight pr-8">{inspectingGlobalWaiver.document.title}</DialogTitle>
                    <DialogDescription className="text-white/70 font-bold uppercase text-[9px] tracking-widest">
                      {completion?.audience === 'team' ? 'Team waiver · One staff signature per squad' : 'Participant waiver · Every active participant'}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                  <div className={cn("rounded-2xl border p-4 flex items-center gap-3", completion?.isComplete ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200")}>
                    {completion?.isComplete ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <Clock className="h-6 w-6 text-amber-600" />}
                    <div>
                      <p className="text-sm font-black uppercase">{completion?.isComplete ? 'All signatures complete' : 'Signatures still required'}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">{completion?.signed || 0} of {completion?.required || 0} required signatures · {completion?.completedTeams || 0} of {completion?.totalTeams || 0} squads complete</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {completion?.teams.map(team => (
                      <div key={team.teamId} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase truncate">{clubTeams.find(candidate => candidate.id === team.teamId)?.name || 'Sub-squad'}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">{team.signed}/{team.required} signed</p>
                        </div>
                        {team.isComplete ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <Clock className="h-5 w-5 text-amber-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Club/School Dialog */}
      <Dialog open={isEditClubOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden w-[calc(100vw-2rem)] sm:max-w-md border-none shadow-2xl glass text-foreground">
          <div className="h-2 bg-black w-full" />
          <div className="p-5 sm:p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl md:text-3xl font-black uppercase tracking-tight">
                {isSchoolMode ? 'School Identity' : 'Club Architect'}
              </DialogTitle>
              <DialogDescription className="text-primary font-bold uppercase text-[10px] tracking-widest">
                {isSchoolMode ? 'Edit institutional branding & your role' : 'Update institutional identity'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {isSchoolMode ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="school-name" className="text-[10px] font-black uppercase tracking-widest text-foreground">School / Institution Name</Label>
                    <Input id="school-name" value={clubForm.schoolName} onChange={e => setClubForm({...clubForm, schoolName: e.target.value, name: e.target.value})} placeholder="e.g. Westfield High School" className="h-12 rounded-2xl border-2 font-black text-base focus:border-primary/20" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="institution-title" className="text-[10px] font-black uppercase tracking-widest text-foreground">Your Administrative Title</Label>
                    <Select value={clubForm.institutionTitle} onValueChange={v => setClubForm({...clubForm, institutionTitle: v})}>
                      <SelectTrigger id="institution-title" className="h-12 rounded-2xl border-2 font-bold focus:border-primary/20"><SelectValue placeholder="Select your title..." /></SelectTrigger>
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
                    <Label htmlFor="school-mission" className="text-[10px] font-black uppercase tracking-widest text-foreground">Mission Narrative</Label>
                    <Textarea id="school-mission" value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="min-h-[80px] rounded-2xl border-2 font-medium focus:border-primary/20 p-4 resize-none" placeholder="Describe the school's athletic program..." />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2"><Label htmlFor="club-name" className="text-[10px] font-black uppercase tracking-widest text-foreground">Official Club Name</Label><Input id="club-name" value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} className="h-12 rounded-2xl border-2 font-black text-base focus:border-primary/20" /></div>
                  <div className="space-y-2"><Label htmlFor="club-mission" className="text-[10px] font-black uppercase tracking-widest text-foreground">Mission Narrative</Label><Textarea id="club-mission" value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="min-h-[120px] rounded-2xl border-2 font-medium focus:border-primary/20 p-4 resize-none" placeholder="Describe the club's tactical mission..." /></div>
                </>
              )}
            </div>
            <DialogFooter><Button className="w-full h-13 rounded-2xl text-base font-black shadow-xl shadow-primary/20 border-none" onClick={handleUpdateClub}>{isSchoolMode ? 'Save School Identity' : 'Synchronize Hub'}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deploy Protocol Dialog */}
      <Dialog open={isDeployProtocolOpen} onOpenChange={setIsDeployProtocolOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden w-[calc(100vw-2rem)] sm:max-w-2xl bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-5 sm:p-8 space-y-6 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Deploy Global Waiver</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Create or load a template — deploys to all squads</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {/* Quick Templates */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Quick Templates</p>
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
                      <span className="text-[9px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">Load →</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Waiver Title</Label><Input placeholder="e.g. 2024 Seasonal Liability Waiver" value={protocolForm.title} onChange={e => setProtocolForm({...protocolForm, title: e.target.value})} className="h-12 rounded-2xl border-2 font-black text-base" /></div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-foreground">Who must sign?</Label>
                <Select value={protocolForm.waiverAudience} onValueChange={(value: 'participant' | 'team') => setProtocolForm({ ...protocolForm, waiverAudience: value })}>
                  <SelectTrigger className="h-12 rounded-2xl border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="participant" className="font-bold">Every participant in every sub-squad</SelectItem>
                    <SelectItem value="team" className="font-bold">One coach or staff member per sub-squad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Waiver Text (Editable)</Label><Textarea value={protocolForm.content} onChange={e => setProtocolForm({...protocolForm, content: e.target.value})} className="min-h-[180px] rounded-2xl border-2 font-medium p-4 bg-muted/5 focus:bg-white transition-all resize-none text-sm leading-relaxed" placeholder="Enter or edit waiver text here..." /></div>
              <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20 flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">This waiver will be saved globally and pushed to all squad compliance vaults immediately.</p>
              </div>
            </div>
            <DialogFooter><Button className="w-full h-12 rounded-[1.5rem] text-sm font-black shadow-xl shadow-primary/20 border-none" onClick={handleDeployProtocol} disabled={isCreating || !protocolForm.title}>{isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : editingDocId ? 'Save Changes' : 'Save & Deploy Waiver'}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Organization seat release */}
      <AlertDialog open={!!teamToDelete} onOpenChange={o => !o && setTeamToDelete(null)}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl overflow-hidden p-0 bg-white w-[calc(100vw-2rem)] max-w-md">
          <div className="h-2 bg-red-600 w-full" />
          <div className="p-5 sm:p-8 space-y-5">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Remove from Organization?</AlertDialogTitle>
              <AlertDialogDescription className="font-bold text-foreground/80 leading-relaxed pt-1"><strong>{teamToDelete?.name}</strong> will keep its roster and data, but it will return to the free Starter plan and lose Pro features. The paid squad seat becomes available immediately.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-2 flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="rounded-xl font-bold border-2 h-11 flex-1">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={async () => { if (teamToDelete) await handleSquadSeatUpdate(teamToDelete, false); }} className="rounded-xl font-black bg-red-600 hover:bg-red-700 h-11 flex-1 shadow-lg shadow-red-600/20 border-none">Return to Starter</AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
