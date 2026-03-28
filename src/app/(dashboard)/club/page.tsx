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
  Shield
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
  const { teams, user, isClubManager, createNewTeam, setActiveTeam, updateUser, deleteTeam, deployClubProtocol } = useTeam();
  
  if (!isClubManager) {
    return <AccessRestricted type="role" title="Organization Hub Locked" description="This command center is reserved for Institutional Stakeholders and Club Administrators." />;
  }

  const db = useFirestore();
  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditClubOpen, setIsEditOpen] = useState(false);
  const [isDeployProtocolOpen, setIsDeployProtocolOpen] = useState(false);
  const [clubForm, setClubForm] = useState({ name: user?.clubName || '', description: user?.clubDescription || '' });
  const [protocolForm, setProtocolForm] = useState({ title: '', content: '', type: 'waiver' as any });
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  const clubTeams = useMemo(() => teams.filter(t => t.ownerUserId === user?.id && t.isPro), [teams, user?.id]);
  const clubTeamIds = useMemo(() => clubTeams.map(t => t.id), [clubTeams]);

  const membersQuery = useMemoFirebase(() => (db && user?.id) ? query(collectionGroup(db, 'members'), where('ownerUserId', '==', user.id)) : null, [db, user?.id]);
  const { data: allMembersRaw } = useCollection<Member>(membersQuery);
  const clubMembers = useMemo(() => (allMembersRaw || []), [allMembersRaw]);

  const docsQuery = useMemoFirebase(() => (db && user?.id) ? query(collectionGroup(db, 'documents'), where('ownerUserId', '==', user.id)) : null, [db, user?.id]);
  const { data: allDocsRaw } = useCollection<TeamDocument>(docsQuery);
  const clubDocs = useMemo(() => (allDocsRaw || []), [allDocsRaw]);

  const incidentsQuery = useMemoFirebase(() => (db && user?.id) ? query(collectionGroup(db, 'incidents'), where('ownerUserId', '==', user.id), orderBy('createdAt', 'desc')) : null, [db, user?.id]);
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

  const filteredTeams = useMemo(() => clubTeams.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())), [clubTeams, searchTerm]);

  if (!isClubManager) return <div className="py-24 text-center space-y-6"><div className="bg-muted/30 p-10 rounded-[3rem] opacity-20"><Building className="h-20 w-20 mx-auto" /></div><h1 className="text-3xl font-black uppercase tracking-tight text-foreground">Institutional Hub Locked</h1></div>;

  const handleUpdateClub = async () => { await updateUser({ clubName: clubForm.name, clubDescription: clubForm.description }); setIsEditOpen(false); toast({ title: "Club Synchronized" }); };

  const handleDeployProtocol = async () => {
    if (!protocolForm.title || !protocolForm.content) return;
    setIsCreating(true);
    await deployClubProtocol({ title: protocolForm.title, content: protocolForm.content, type: protocolForm.type, assignedTo: ['all'] }, clubTeamIds);
    setIsDeployProtocolOpen(false); setIsCreating(false); setProtocolForm({ title: '', content: '', type: 'waiver' });
    toast({ title: "Mandate Deployed", description: `Protocol pushed to ${clubTeamIds.length} squads.` });
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
              <Edit3 className="h-4 w-4 mr-2" /> Edit Club
            </Button>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/40 bg-white text-black hover:bg-primary hover:text-white transition-all border-none" onClick={() => createNewTeam('New Squad', 'youth', 'Coach', 'Club squad', 'squad_pro')}>
              <Plus className="h-5 w-5 mr-2" /> Add Squad
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md bg-primary text-white p-8 space-y-2"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Total Squads</p><p className="text-5xl font-black">{clubTeams.length}</p></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-4"><p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Fiscal Pulse</p><p className="text-3xl font-black">${stats.collected.toLocaleString()}</p><Progress value={stats.rate} className="h-1.5 bg-white/10" /></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-2 ring-1 ring-black/5"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Compliance Rating</p><p className="text-5xl font-black text-primary">{stats.compliance}%</p></Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-muted/20 p-8 space-y-4"><div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-primary" /><p className="text-[10px] font-black uppercase text-foreground">Safety Oversights</p></div><p className="text-3xl font-black text-foreground">{clubIncidents.length}</p></Card>
      </div>

      <Tabs defaultValue="squads" className="space-y-8">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2 shadow-inner">
          <TabsTrigger value="squads" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Squad Roster</TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Institutional Vault</TabsTrigger>
          <TabsTrigger value="safety" className="rounded-lg font-black text-xs uppercase px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Safety & Incidents</TabsTrigger>
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
                      <tr key={inc.id} className="hover:bg-primary/5 transition-colors group cursor-pointer">
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
    </div>
  );
}