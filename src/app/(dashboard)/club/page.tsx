"use client";

import React, { useState, useMemo } from 'react';
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
  MessageCircle
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, where, orderBy, collection, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IncidentDetailDialog } from '@/app/(dashboard)/coaches-corner/page';

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
  const { teams, user, isPrimaryClubAuthority, createNewTeam, setActiveTeam, updateUser, updateTeam, deleteTeam, deployClubProtocol, hasFeature, isSchoolMode, isSchoolAdmin, activeTeam, members, db, createChat } = useTeam();
  const [selectedCoach, setSelectedCoach] = useState<Member | null>(null);
  
  if (!isPrimaryClubAuthority) {
    return <AccessRestricted type="role" title={isSchoolMode ? "School Hub Locked" : "Organization Hub Locked"} description={isSchoolMode ? "This command center is reserved for School Administrators." : "This command center is reserved for Institutional Stakeholders and Club Administrators."} />;
  }

  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditClubOpen, setIsEditOpen] = useState(false);
  const [isDeployProtocolOpen, setIsDeployProtocolOpen] = useState(false);
  const [isSubSquadModalOpen, setIsSubSquadModalOpen] = useState(false);
  const [clubForm, setClubForm] = useState({ name: user?.clubName || '', description: user?.clubDescription || '' });
  const [protocolForm, setProtocolForm] = useState({ title: '', content: '', type: 'waiver' as any });
  const [newSquadForm, setNewSquadForm] = useState({ name: '', coachName: '', coachEmail: '' });
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [adminProfiles, setAdminProfiles] = useState<any[]>([]);
  const [viewingIncident, setViewingIncident] = useState<TeamIncident | null>(null);

  const schoolHub = useMemo(() => teams.find(t => t.type === 'school'), [teams]);

  // School Logic: Get sub-squads relative to the identified hub
  const schoolSquads = useMemo(() => {
    if (schoolHub) {
      return teams.filter(t => t.schoolId === schoolHub.id);
    }
    return [];
  }, [schoolHub, teams]);

  const clubTeams = useMemo(() => {
    if (isSchoolMode || schoolHub) {
        // In school mode, include the hub and all squads
        const host = teams.find(t => t.type === 'school');
        const squads = teams.filter(t => t.type === 'school_squad' || t.schoolId === host?.id);
        const all = host ? [host, ...squads] : squads;
        // Ensure unique by ID
        return Array.from(new Map(all.map(t => [t.id, t])).values());
    }
    return teams.filter(t => t.ownerUserId === user?.id && t.isPro);
  }, [teams, user?.id, isSchoolMode, schoolHub]);
  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);

  // Get all school team IDs for querying members directly
  const schoolTeamIds = useMemo(() => {
    if (!schoolHub) return [];
    const host = teams.find(t => t.type === 'school');
    const squads = teams.filter(t => t.type === 'school_squad' || t.schoolId === host?.id);
    const allTeams = host ? [host, ...squads] : squads;
    return allTeams.map(t => t.id);
  }, [schoolHub, teams]);

  // Query members for each school team individually - more reliable than collectionGroup
  const hubMembersQuery = useMemoFirebase(() => {
    if (!db || !schoolHub || schoolTeamIds.length === 0) return null;
    return query(collection(db, 'teams', schoolTeamIds[0], 'members'), where('ownerUserId', '==', schoolHub.ownerUserId));
  }, [db, schoolHub, schoolTeamIds]);
  const { data: hubMembers } = useCollection<Member>(hubMembersQuery);

  const squad1MembersQuery = useMemoFirebase(() => {
    if (!db || !schoolHub || schoolTeamIds.length < 2) return null;
    return query(collection(db, 'teams', schoolTeamIds[1], 'members'), where('ownerUserId', '==', schoolHub.ownerUserId));
  }, [db, schoolHub, schoolTeamIds]);
  const { data: squad1Members } = useCollection<Member>(squad1MembersQuery);

  const squad2MembersQuery = useMemoFirebase(() => {
    if (!db || !schoolHub || schoolTeamIds.length < 3) return null;
    return query(collection(db, 'teams', schoolTeamIds[2], 'members'), where('ownerUserId', '==', schoolHub.ownerUserId));
  }, [db, schoolHub, schoolTeamIds]);
  const { data: squad2Members } = useCollection<Member>(squad2MembersQuery);

  const squad3MembersQuery = useMemoFirebase(() => {
    if (!db || !schoolHub || schoolTeamIds.length < 4) return null;
    return query(collection(db, 'teams', schoolTeamIds[3], 'members'), where('ownerUserId', '==', schoolHub.ownerUserId));
  }, [db, schoolHub, schoolTeamIds]);
  const { data: squad3Members } = useCollection<Member>(squad3MembersQuery);

  // Aggregate all members from all school teams
  const clubMembers = useMemo(() => {
    const allMembers = [
      ...(hubMembers || []),
      ...(squad1Members || []),
      ...(squad2Members || []),
      ...(squad3Members || [])
    ];
    // Deduplicate by id
    return Array.from(new Map(allMembers.map(m => [m.id, m])).values());
  }, [hubMembers, squad1Members, squad2Members, squad3Members]);

  // Need allMembersRaw for the coaches calculation - use clubMembers
  const allMembersRaw = clubMembers;

  const docsQuery = useMemoFirebase(() => (db && user?.id) ? query(collectionGroup(db, 'documents'), where('ownerUserId', '==', user.id)) : null, [db, user?.id]);
  const { data: allDocsRaw } = useCollection<TeamDocument>(docsQuery);
  const clubDocs = useMemo(() => (allDocsRaw || []), [allDocsRaw]);

  // School Logic: Universal Coach Roster
  // Uses schoolHub (not isSchoolMode) so coaches always appear regardless of which squad is active
  const allCoaches = useMemo(() => {
    if (!schoolHub) return [];
    const coachPositions = ['Coach', 'Assistant Coach', 'Manager', 'Squad Leader', 'Head Coach', 'Athletic Director', 'Staff'];
    // Get all valid team IDs for this school (hub + all squads)
    const host = teams.find(t => t.type === 'school');
    const squads = teams.filter(t => t.type === 'school_squad' || t.schoolId === host?.id);
    const allSchoolTeams = host ? [host, ...squads] : squads;
    const validTeamIds = new Set(allSchoolTeams.map(t => t.id));
    
    // Search ALL raw members (not just clubMembers) to avoid double-filtering
    // Match members who: (a) have a coach position AND (b) belong to a school team
    return (allMembersRaw || []).filter(m => 
      coachPositions.includes(m.position) && 
      (validTeamIds.has(m.teamId) || m.schoolId === schoolHub.id)
    );
  }, [schoolHub, teams, allMembersRaw]);

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
  if (!hasSchoolHubAccess) return <div className="py-24 text-center space-y-6"><div className="bg-muted/30 p-10 rounded-[3rem] opacity-20"><Building className="h-20 w-20 mx-auto" /></div><h1 className="text-3xl font-black uppercase tracking-tight text-foreground">Institutional Hub Locked</h1><p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">Reserved for institutional staff and account owners.</p></div>;

  const handleUpdateClub = async () => { await updateUser({ clubName: clubForm.name, clubDescription: clubForm.description }); setIsEditOpen(false); toast({ title: "Club Synchronized" }); };

  const handleDeployProtocol = async () => {
    if (!protocolForm.title || !protocolForm.content) return;
    setIsCreating(true);
    await deployClubProtocol({ title: protocolForm.title, content: protocolForm.content, type: protocolForm.type, assignedTo: ['all'] }, clubTeamIds);
    setIsDeployProtocolOpen(false); setIsCreating(false); setProtocolForm({ title: '', content: '', type: 'waiver' });
    toast({ title: "Mandate Deployed", description: `Protocol pushed to ${clubTeamIds.length} squads.` });
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim() || !db || !schoolHub) return;
    setIsAddingAdmin(true);
    try {
      // Find user by email
      const usersQuery = query(collection(db, 'users'), where('email', '==', newAdminEmail.trim().toLowerCase()), limit(1));
      const snaps = await getDocs(usersQuery);
      
      if (snaps.empty) {
        toast({ title: "User Not Found", description: "No user found with that email address. They must create an account first.", variant: "destructive" });
        setIsAddingAdmin(false);
        return;
      }
      
      const newAdminId = snaps.docs[0].id;
      const currentAdmins = schoolHub.schoolAdminIds || [];
      
      if (currentAdmins.includes(newAdminId) || schoolHub.ownerUserId === newAdminId) {
        toast({ title: "Already Admin", description: "This user is already an admin.", variant: "destructive" });
      } else if (currentAdmins.length >= 3) {
        toast({ title: "Limit Reached", description: "You can only have up to 3 additional school admins.", variant: "destructive" });
      } else {
        await updateTeam(schoolHub.id, { schoolAdminIds: [...currentAdmins, newAdminId] });
        toast({ title: "Admin Added", description: "They now have School Hub access." });
        setNewAdminEmail('');
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to add admin", variant: "destructive" });
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
              {user?.clubName || 'Club Command'}
            </h1>
            <p className="text-white/60 font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Master Governance Hub</p>
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
                   setIsCreating(false);
                   setIsSubSquadModalOpen(false);
                   setNewSquadForm({ name: '', coachName: '', coachEmail: '' });
                   toast({ title: 'Operational Unit Provisioned', description: 'Squad and Head Coach profile initialized.' });
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
        <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-4"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Fiscal Pulse</p><p className="text-3xl font-black">${stats.collected.toLocaleString()}</p><Progress value={stats.rate} className="h-1.5 bg-white/10" /></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-2 ring-1 ring-black/5"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Compliance Rating</p><p className="text-5xl font-black text-primary">{stats.compliance}%</p></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-muted/20 p-8 space-y-4"><div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-primary" /><p className="text-[10px] font-black uppercase text-foreground">Safety Oversights</p></div><p className="text-3xl font-black text-foreground">{clubIncidents.length}</p></Card>
      </div>

      <Tabs defaultValue="squads" className="space-y-8">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2 shadow-inner">
          <TabsTrigger value="squads" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">{schoolHub ? 'Squads' : 'Squad Roster'}</TabsTrigger>
          {schoolHub && (
            <TabsTrigger value="coaches" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Coaches</TabsTrigger>
          )}
          {schoolHub && (
            <TabsTrigger value="admins" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Admins</TabsTrigger>
          )}
          <TabsTrigger value="compliance" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Waivers</TabsTrigger>
          <TabsTrigger value="safety" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Safety</TabsTrigger>
        </TabsList>

        <TabsContent value="squads" className="space-y-6 mt-0">
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
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{team.sport} • {clubMembers.filter(m => m.teamId === team.id).length} Athletes • Code: {team.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/5" onClick={() => setTeamToDelete(team)}><Trash2 className="h-5 w-5" /></Button>
                    <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] text-foreground border-2 hover:bg-black hover:text-white transition-all" onClick={() => { setActiveTeam(team); router.push('/team'); }}>Command Access <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
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
                       <div className="space-y-1 content-center flex-1">
                          <h3 className="text-xl font-black uppercase text-foreground">{coach.name}</h3>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{coach.position} • {teams.find(t => t.id === coach.teamId)?.name}</p>
                       </div>
                       <div className="ml-auto flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 bg-muted/20 hover:bg-primary hover:text-white rounded-xl transition-all">
                           <ChevronRight className="h-4 w-4" />
                         </Button>
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
                      Add Admin
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
                    <span>Active Administrators {(schoolHub.schoolAdminIds?.length || 0)}/3</span>
                  </div>
                  
                  {/* Primary Owner is always an admin */}
                  <div className="flex items-center justify-between p-6 rounded-3xl bg-muted/10 border-2 border-transparent">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Shield className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase text-foreground">Primary Owner</p>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{schoolHub.name} Creator</p>
                      </div>
                    </div>
                    <Badge className="bg-black text-white h-6 px-3 uppercase text-[9px] font-black tracking-widest pointer-events-none line-clamp-1 truncate max-w-[150px]">Owner</Badge>
                  </div>
                  
                  {adminProfiles.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between p-6 rounded-3xl bg-white border-2 hover:border-primary/20 transition-all group shadow-sm">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border">
                          <AvatarImage src={admin.avatar} />
                          <AvatarFallback className="font-bold text-primary">{admin.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-black uppercase text-foreground">{admin.name || 'Unknown User'}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{admin.email}</p>
                        </div>
                      </div>
                      {schoolHub.ownerUserId === user?.id && (
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveAdmin(admin.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10">
                          <XCircle className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Coach Detail Modal */}
        <Dialog open={!!selectedCoach} onOpenChange={(open) => !open && setSelectedCoach(null)}>
          <DialogContent className="rounded-[2rem] border-none shadow-2xl p-0 max-w-lg bg-white overflow-y-auto max-h-[90vh]">
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
                <h3 className="text-xl font-black uppercase text-foreground">Institutional Mandates</h3>
                <Button onClick={() => setIsDeployProtocolOpen(true)} className="h-10 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20 border-none"><Plus className="h-4 w-4 mr-2" /> Deploy Global Protocol</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {clubDocs.filter(d => d.isClubMaster).map(doc => (
                  <Card key={doc.id} className="rounded-3xl p-8 bg-white shadow-xl border space-y-6 flex flex-col group hover:ring-2 hover:ring-primary/20 transition-all">
                    <div className="flex justify-between items-start">
                      <Badge className="bg-black text-white font-black text-[8px] h-5 px-2 uppercase tracking-widest shadow-lg">CLUB MASTER</Badge>
                      <ShieldCheck className="h-5 w-5 text-primary opacity-20" />
                    </div>
                    <h4 className="text-lg font-black uppercase text-foreground">{doc.title}</h4>
                    <p className="text-xs font-medium text-muted-foreground line-clamp-3 italic flex-1 leading-relaxed">"{doc.content}"</p>
                    <div className="pt-6 border-t flex justify-between items-center"><span className="text-[10px] font-black uppercase text-primary tracking-widest">{doc.signatureCount || 0} Verified Signatures</span><Button variant="ghost" size="sm" className="font-black text-[10px] uppercase text-foreground hover:bg-muted/50">Audit Ledger</Button></div>
                  </Card>
                ))}
                {clubDocs.filter(d => d.isClubMaster).length === 0 && (
                  <div className="col-span-full py-20 text-center bg-muted/10 rounded-3xl border-2 border-dashed opacity-30 text-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">No global mandates established.</p>
                  </div>
                )}
              </div>
            </div>
            <aside className="lg:col-span-4"><TeamComplianceCard teams={clubTeams} clubDocs={clubDocs} /></aside>
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
                        <td className="px-10 py-6 text-right font-black text-xs uppercase text-foreground">{inc.date}</td>
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
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">Club Architect</DialogTitle><DialogDescription className="text-primary font-bold uppercase text-[10px] tracking-widest">Update institutional identity</DialogDescription></DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Official Club Name</Label><Input value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-lg focus:border-primary/20" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Mission Narrative</Label><Textarea value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="min-h-[150px] rounded-2xl border-2 font-medium focus:border-primary/20 p-4 resize-none" placeholder="Describe the club's tactical mission..." /></div>
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 border-none" onClick={handleUpdateClub}>Synchronize Hub</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeployProtocolOpen} onOpenChange={setIsDeployProtocolOpen}>
        <DialogContent className="rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-lg glass text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">Deploy Mandate</DialogTitle><DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Deploy atomic institutional protocol</DialogDescription></DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Protocol Title</Label><Input placeholder="e.g. 2024 Seasonal Liability Waiver" value={protocolForm.title} onChange={e => setProtocolForm({...protocolForm, title: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-lg" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Legal Execution Text</Label><Textarea value={protocolForm.content} onChange={e => setProtocolForm({...protocolForm, content: e.target.value})} className="min-h-[250px] rounded-2xl border-2 font-medium p-6 bg-muted/5 focus:bg-white transition-all resize-none" placeholder="Define terms and conditions..." /></div>
              <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 flex items-start gap-4">
                <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                  Deploying this protocol will instantly push it to the <strong>Compliance Vault</strong> of every Pro squad in your organization.
                </p>
              </div>
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 border-none" onClick={handleDeployProtocol} disabled={isCreating}>{isCreating ? <Loader2 className="h-6 w-6 animate-spin" /> : "Authorize Atomic Deployment"}</Button></DialogFooter>
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