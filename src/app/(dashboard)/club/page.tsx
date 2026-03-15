"use client";

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTeam, Team, Member, TeamDocument, DocumentSignature } from '@/components/providers/team-provider';
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
  ChevronDown
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
import { collectionGroup, query, where, orderBy, collection } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function TeamComplianceCard({ teams, clubDocs }: { teams: Team[], clubDocs: TeamDocument[] }) {
  const db = useFirestore();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  
  // Filter for master protocols only
  const masterProtocols = useMemo(() => clubDocs.filter(d => d.isClubMaster), [clubDocs]);
  
  // Query signatures for the selected team
  const sigsQuery = useMemoFirebase(() => {
    if (!db || !selectedTeamId) return null;
    return query(collectionGroup(db, 'signatures'), where('teamId', '==', selectedTeamId));
  }, [db, selectedTeamId]);

  const { data: teamSigs } = useCollection<DocumentSignature>(sigsQuery);
  const signedDocIds = useMemo(() => (teamSigs || []).map(s => s.documentId), [teamSigs]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  return (
    <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
      <CardHeader className="bg-black text-white p-8">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Mandate Verification</CardTitle>
            <CardDescription className="text-white/60 font-bold uppercase text-[10px] tracking-widest">Audit squad-level protocol execution</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-8">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Select Squad to Audit</Label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="h-14 rounded-2xl border-2 font-black">
              <SelectValue placeholder="Pick a team..." />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id} className="font-bold uppercase">{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTeamId ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Global Mandates</p>
              <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">
                {signedDocIds.filter(id => masterProtocols.some(p => p.id === id)).length} / {masterProtocols.length} VERIFIED
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {masterProtocols.map(protocol => {
                const signature = teamSigs?.find(s => s.documentId === protocol.id);
                const isSigned = !!signature;

                return (
                  <div key={protocol.id} className={cn(
                    "flex items-center justify-between p-5 rounded-3xl border-2 transition-all group",
                    isSigned ? "bg-green-50/50 border-green-100" : "bg-muted/20 border-transparent"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                        isSigned ? "bg-green-500 text-white" : "bg-white text-muted-foreground/30 border"
                      )}>
                        {isSigned ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-tight truncate">{protocol.title}</p>
                        {isSigned ? (
                          <p className="text-[9px] font-bold text-green-600 uppercase">Signed by {signature.userName}</p>
                        ) : (
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">Pending Coach Signature</p>
                        )}
                      </div>
                    </div>
                    {isSigned && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-green-100 text-green-600">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {masterProtocols.length === 0 && (
                <div className="text-center py-10 opacity-30 border-2 border-dashed rounded-3xl">
                  <p className="text-[10px] font-black uppercase">No global mandates deployed.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-20 text-center bg-muted/10 border-2 border-dashed rounded-[2.5rem] opacity-40">
            <Target className="h-12 w-12 mx-auto mb-4" />
            <p className="text-xs font-black uppercase tracking-widest">Select a squad to audit legal status</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClubManagementPage() {
  const { teams, user, isClubManager, createNewTeam, setActiveTeam, updateUser, deleteTeam, deployClubProtocol } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [isEditClubOpen, setIsEditOpen] = useState(false);
  const [isDeployProtocolOpen, setIsDeployProtocolOpen] = useState(false);
  const [clubForm, setClubForm] = useState({ name: user?.clubName || '', description: user?.clubDescription || '' });
  const [protocolForm, setProtocolForm] = useState({ title: '', content: '', type: 'waiver' as any });
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  // TACTICAL AUDIT: Identify squads where user has management authority
  const clubTeams = useMemo(() => {
    return teams.filter(t => t.ownerUserId === user?.id && t.isPro);
  }, [teams, user?.id]);

  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);

  // LIVE ANALYTICS: Fetch all members across all club teams for real-time fiscal auditing
  const membersQuery = useMemoFirebase(() => {
    if (!db || clubTeamIds.length === 0) return null;
    return query(collectionGroup(db, 'members'));
  }, [db, clubTeamIds.length]);

  const { data: allMembersRaw } = useCollection<Member>(membersQuery);
  const clubMembers = useMemo(() => {
    if (!allMembersRaw) return [];
    return allMembersRaw.filter(m => clubTeamIds.includes(m.teamId));
  }, [allMembersRaw, clubTeamIds]);

  // COMPLIANCE AUDIT: Fetch all documents across club squads
  const docsQuery = useMemoFirebase(() => {
    if (!db || clubTeamIds.length === 0) return null;
    return query(collectionGroup(db, 'documents'));
  }, [db, clubTeamIds.length]);

  const { data: allDocsRaw } = useCollection<TeamDocument>(docsQuery);
  const clubDocs = useMemo(() => {
    if (!allDocsRaw) return [];
    return allDocsRaw.filter(d => clubTeamIds.includes(d.teamId));
  }, [allDocsRaw, clubTeamIds]);

  const stats = useMemo(() => {
    let owed = 0;
    let total = 0;
    let cleared = 0;
    
    clubMembers.forEach(m => {
      owed += m.amountOwed || 0;
      total += m.totalFees || 0;
      if (m.medicalClearance) cleared++;
    });

    const collected = total - owed;
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0;
    const compliance = clubMembers.length > 0 ? Math.round((cleared / clubMembers.length) * 100) : 0;

    return { owed, collected, total, rate, compliance };
  }, [clubMembers]);

  const filteredTeams = useMemo(() => {
    return clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clubTeams, searchTerm]);

  if (!isClubManager) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 animate-in fade-in duration-500">
        <div className="bg-muted/30 p-10 rounded-[3rem] opacity-20">
          <Building className="h-20 w-20" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tight">Institutional Hub Locked</h1>
        <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest max-w-sm">This command center is reserved for multi-squad managers on Elite or Club tiers.</p>
        <Button onClick={() => router.push('/pricing')} className="rounded-full px-10 h-12 shadow-lg shadow-primary/20">Explore Institutional Solutions</Button>
      </div>
    );
  }

  const handleUpdateClub = async () => {
    await updateUser({ clubName: clubForm.name, clubDescription: clubForm.description });
    setIsEditOpen(false);
    toast({ title: "Club Protocol Synchronized" });
  };

  const handleDeployProtocol = async () => {
    if (!protocolForm.title || !protocolForm.content) return;
    setIsCreating(true);
    try {
      await deployClubProtocol({ 
        title: protocolForm.title, 
        content: protocolForm.content, 
        type: protocolForm.type,
        assignedTo: ['all'] 
      }, clubTeamIds);
      setIsDeployProtocolOpen(false);
      setProtocolForm({ title: '', content: '', type: 'waiver' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setIsCreating(true);
    try {
      await createNewTeam(newTeamName, 'adult', 'Coach', `Official club squad managed by ${user?.name}`, 'squad_pro');
      setIsCreating(false);
      setNewTeamName('');
      toast({ title: "Club Squad Enrolled" });
    } catch (e) {
      setIsCreating(false);
      toast({ title: "Enrollment Failed", variant: "destructive" });
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    await deleteTeam(teamToDelete.id);
    setTeamToDelete(null);
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Institutional Command</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">{user?.clubName || 'Club Command'}</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Managing {clubTeams.length} Operational Units</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="h-14 px-6 rounded-2xl border-2 font-black uppercase text-xs tracking-widest" onClick={() => setIsEditOpen(true)}>
            <Edit3 className="h-4 w-4 mr-2" /> Edit Club
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                <Plus className="h-5 w-5 mr-2" /> Add Club Team
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl overflow-hidden p-0">
              <DialogTitle className="sr-only">New Club Squad Enrollment</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 lg:p-10 space-y-8">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Club Squad</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Scale your institutional roster</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Name</Label>
                    <Input placeholder="e.g. U14 Regional Stars" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 rounded-xl font-bold border-2 focus:border-primary/20 transition-all" />
                  </div>
                </div>
                <DialogFooter>
                  <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleCreateTeam} disabled={isCreating || !newTeamName.trim()}>
                    {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <ShieldCheck className="h-5 w-5 mr-2" />}
                    Enroll Squad
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-primary text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <Trophy className="h-24 w-24" />
          </div>
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Total Squads</p>
            <p className="text-5xl font-black leading-none">{clubTeams.length}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Active Pro Seats</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-black text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <DollarSign className="h-24 w-24 text-primary" />
          </div>
          <CardContent className="p-8 space-y-4 relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Fiscal Pulse</p>
              <p className="text-3xl font-black leading-none">${stats.collected.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest">
                <span>Dues Collection</span>
                <span>{stats.rate}%</span>
              </div>
              <Progress value={stats.rate} className="h-1.5 bg-white/10" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden relative group">
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Compliance Rating</p>
            <p className="text-5xl font-black leading-none text-primary">{stats.compliance}%</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">Medical Verified</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-muted/20 overflow-hidden">
          <CardContent className="p-8 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest">Admin Oversight</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-black truncate uppercase">{user?.name}</p>
              <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Master Organization Lead</p>
            </div>
            <Button variant="outline" className="w-full h-8 rounded-lg text-[8px] font-black uppercase border-primary/20 text-primary hover:bg-primary hover:text-white transition-all" onClick={() => router.push('/settings')}>Master Settings</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <Tabs defaultValue="squads" className="space-y-8">
            <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2">
              <TabsTrigger value="squads" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-black data-[state=active]:text-white">Squad Roster</TabsTrigger>
              <TabsTrigger value="compliance" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Global Compliance</TabsTrigger>
              <TabsTrigger value="fiscal" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-black data-[state=active]:text-white">Fiscal Ledger</TabsTrigger>
            </TabsList>

            <TabsContent value="squads" className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Managed Operational Units</h2>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input 
                    placeholder="Search squads..." 
                    className="h-9 pl-9 rounded-full bg-muted/50 border-none text-[10px] font-bold"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredTeams.map((team) => {
                  const teamMembers = clubMembers.filter(m => m.teamId === team.id);
                  const teamOwed = teamMembers.reduce((sum, m) => sum + (m.amountOwed || 0), 0);
                  
                  return (
                    <Card key={team.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:shadow-xl hover:ring-primary/20 transition-all group overflow-hidden bg-white">
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row items-stretch">
                          <div className="w-full md:w-24 bg-muted/30 flex items-center justify-center p-6 border-r group-hover:bg-primary/5 transition-colors shrink-0">
                            <Avatar className="h-14 w-14 rounded-2xl shadow-lg border-2 border-background ring-2 ring-primary/10 transition-transform group-hover:scale-110">
                              <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                              <AvatarFallback className="font-black bg-white text-xs">{team.name[0]}</AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1">
                              <h3 className="text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors uppercase">{team.name}</h3>
                              <div className="flex items-center gap-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" /> {teamMembers.length} Athletes</span>
                                <span className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> Status: Elite</span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-[8px] font-black uppercase text-muted-foreground">Dues Owed</p>
                                <p className="text-sm font-black text-primary">${teamOwed.toLocaleString()}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-destructive hover:text-white shadow-sm ring-1 ring-black/5 transition-all" onClick={() => setTeamToDelete(team)}>
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="rounded-full h-12 w-12 hover:bg-primary hover:text-white shadow-sm ring-1 ring-black/5 transition-all"
                                  onClick={() => { setActiveTeam(team); router.push('/team'); }}
                                >
                                  <ArrowUpRight className="h-5 w-5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-black uppercase tracking-tight">Institutional Vault</h2>
                </div>
                <Dialog open={isDeployProtocolOpen} onOpenChange={setIsDeployProtocolOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                      <Plus className="h-4 w-4 mr-2" /> Deploy Global Protocol
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] sm:max-w-lg p-0 overflow-hidden border-none shadow-2xl">
                    <DialogTitle className="sr-only">Deploy Institutional Mandate</DialogTitle>
                    <div className="h-2 bg-primary w-full" />
                    <div className="p-8 space-y-8">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Deploy Mandate</DialogTitle>
                        <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Push protocol to all club squads</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Title</Label>
                          <Input value={protocolForm.title} onChange={e => setProtocolForm({...protocolForm, title: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="e.g. Club Membership Agreement" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Type</Label>
                          <Select value={protocolForm.type} onValueChange={v => setProtocolForm({...protocolForm, type: v})}>
                            <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="waiver" className="font-bold">Liability Waiver</SelectItem>
                              <SelectItem value="policy" className="font-bold">Institutional Policy</SelectItem>
                              <SelectItem value="info" className="font-bold">Information Release</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Protocol Content</Label>
                          <Textarea value={protocolForm.content} onChange={e => setProtocolForm({...protocolForm, content: e.target.value})} className="min-h-[150px] rounded-xl border-2 font-medium" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleDeployProtocol} disabled={isCreating || !protocolForm.title}>
                          {isCreating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Target className="h-5 w-5 mr-2" />}
                          Deploy to All Squads
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {clubDocs.map(doc => (
                  <Card key={doc.id} className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden flex flex-col group hover:ring-primary/20 transition-all">
                    <CardHeader className="p-8 pb-4">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-2">
                          <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest border-primary/20 text-primary">{doc.type}</Badge>
                          {doc.isClubMaster && <Badge className="bg-black text-white border-none font-black text-[8px] uppercase tracking-widest px-2">CLUB MASTER</Badge>}
                        </div>
                        <div className="bg-primary/5 p-2 rounded-lg text-primary shadow-inner">
                          <FileText className="h-4 w-4" />
                        </div>
                      </div>
                      <CardTitle className="text-xl font-black uppercase tracking-tight pt-4 leading-none">{doc.title}</CardTitle>
                      <CardDescription className="text-[9px] font-bold uppercase tracking-widest mt-1">Squad: {clubTeams.find(t => t.id === doc.teamId)?.name}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 flex-1 space-y-6">
                      <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground line-clamp-3">"{doc.content}"</p>
                      <div className="pt-4 border-t space-y-4">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="text-muted-foreground">Execution Status</span>
                          <span className="text-primary">{doc.signatureCount} Verified</span>
                        </div>
                        <Progress value={Math.min((doc.signatureCount / 15) * 100, 100)} className="h-1.5" />
                      </div>
                    </CardContent>
                    <CardFooter className="p-8 pt-0">
                      <Button variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[9px] tracking-widest border-2" onClick={() => { setActiveTeam(clubTeams.find(t => t.id === doc.teamId)!); router.push('/coaches-corner'); }}>
                        Audit Ledger
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
                {clubDocs.length === 0 && (
                  <div className="col-span-full py-24 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
                    <FileText className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">No institutional protocols established.</p>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-tighter mt-2">Use the "Deploy Global Protocol" action to initialize mandates.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="fiscal" className="space-y-8 animate-in fade-in duration-500">
              <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white">
                <CardHeader className="bg-black text-white p-10">
                  <div className="flex items-center gap-6">
                    <div className="bg-primary p-4 rounded-2xl shadow-xl shadow-primary/20">
                      <DollarSign className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none">Fiscal Ledger</CardTitle>
                      <CardDescription className="text-white/60 font-bold uppercase tracking-widest text-[10px] mt-2">Aggregated organization financial audit</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                        <tr>
                          <th className="px-10 py-6">Athlete</th>
                          <th className="px-6 py-6">Squad</th>
                          <th className="px-6 py-6 text-center">Status</th>
                          <th className="px-10 py-6 text-right">Owed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted/50">
                        {clubMembers.map(m => (
                          <tr key={m.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                <Avatar className="h-10 w-10 rounded-xl border shadow-sm shrink-0">
                                  <AvatarImage src={m.avatar} />
                                  <AvatarFallback className="font-black text-xs">{m.name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-black text-sm uppercase tracking-tight">{m.name}</p>
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{m.position} • #{m.jersey}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-6">
                              <p className="text-xs font-black uppercase">{clubTeams.find(t => t.id === m.teamId)?.name}</p>
                            </td>
                            <td className="px-6 py-6 text-center">
                              <Badge className={cn("border-none font-black text-[8px] uppercase px-2 h-5", m.feesPaid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                                {m.feesPaid ? 'CLEARED' : 'PENDING'}
                              </Badge>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <span className={cn("font-black text-sm", m.amountOwed! > 0 ? "text-primary" : "text-green-600")}>
                                ${m.amountOwed?.toLocaleString() || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="lg:col-span-4 space-y-8">
          <TeamComplianceCard teams={clubTeams} clubDocs={clubDocs} />
          
          <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <FolderClosed className="h-24 w-24 text-primary" />
            </div>
            <CardContent className="p-8 space-y-6 relative z-10">
              <div className="space-y-1">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[8px] h-5 px-2">Archival</Badge>
                <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">Institutional Library</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                  Access structured folders for every squad's signed legal agreements.
                </p>
              </div>
              <Button asChild className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-primary hover:text-white transition-all shadow-xl">
                <Link href="/files">Open Master Vault <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={isEditClubOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-md p-0 border-none shadow-2xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Club Architect</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Define your institutional identity</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Official Club Name</Label>
                <Input value={clubForm.name} onChange={e => setClubForm({...clubForm, name: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Mission Narrative</Label>
                <Textarea value={clubForm.description} onChange={e => setClubForm({...clubForm, description: e.target.value})} className="rounded-xl min-h-[120px] border-2 font-medium" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateClub}>Synchronize Hub</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!teamToDelete} onOpenChange={(o) => !o && setTeamToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="h-2 bg-red-600 w-full" />
          <AlertDialogHeader className="p-10 pb-4">
            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Decommission Squad?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/80 leading-relaxed">
              This will remove <strong>{teamToDelete?.name}</strong> from your club command hub. This action is irreversible and deletes institutional oversight references.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-10 pt-4 bg-muted/10 border-t flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="rounded-xl font-bold border-2 h-12">Cancel Protocol</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTeam} className="rounded-xl font-black bg-red-600 hover:bg-red-700 h-12 shadow-xl shadow-red-600/20">Decommission Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative mt-12">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <ShieldCheck className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7 uppercase tracking-widest">Institutional Oversight</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Master Organization Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            Club Hub provides a singular point of control for multi-squad managers. Centralize your fiscal ledgers, verify compliance signatures across the entire organization, and manage the lifecycle of your squads from inception to decommissioning.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
