"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField, LeagueArchiveWaiver, TeamDocument } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, orderBy, where, deleteDoc, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  Users, 
  ShieldCheck, 
  Globe, 
  Share2, 
  Loader2,
  UserCheck,
  History,
  Zap,
  CheckCircle2,
  Terminal,
  ChevronRight,
  Wallet,
  Sparkles,
  FileSignature,
  Download,
  Mail,
  Calendar,
  Fingerprint,
  Lock,
  CreditCard,
  ArrowRight,
  UserPlus,
  Smartphone,
  ShieldAlert
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter, 
  DialogClose
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import jsPDF from 'jspdf';
import { format } from 'date-fns';

// CRITICAL BUILD FIX: Prevent static generation failures for dynamic enrollment routes
export const dynamic = 'force-dynamic';

export default function LeagueRegistrationAdminPage() {
  const { leagueId } = useParams();
  const router = useRouter();
  const { isAuthResolved, user: authUser } = useUser();
  const { 
    saveLeagueRegistrationConfig, 
    assignEntryToTeam, 
    activeTeam, 
    submitRegistrationEntry 
  } = useTeam();
  const db = useFirestore();

  // --- STATE ---
  const [pipelineType, setPipelineType] = useState<'player' | 'team'>('player');
  const [activeTab, setActiveTab] = useState<'entries' | 'config'>('entries');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'accepted'>('all');
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ teamName: '', coachName: '', email: '', inviteCode: '' });
  const [isManualProcessing, setIsManualProcessing] = useState(false);

  // --- SYNC ---
  const configId = useMemo(() => pipelineType === 'player' ? 'player_config' : 'team_config', [pipelineType]);
  
  const configRef = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    return doc(db, 'leagues', leagueId as string, 'registration', configId);
  }, [db, leagueId, configId, isAuthResolved]);

  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    return query(collection(db, 'leagues', leagueId as string, 'registrationEntries'), orderBy('created_at', 'desc'));
  }, [db, leagueId, isAuthResolved]);

  const { data: rawEntries, isLoading: isEntriesLoading } = useCollection<RegistrationEntry>(entriesQuery);

  const filteredEntries = useMemo(() => {
    const raw = rawEntries || [];
    return raw.filter(e => {
      const matchesProtocol = e.protocol_id === configId;
      const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
      return matchesProtocol && matchesStatus;
    });
  }, [rawEntries, configId, filterStatus]);

  const [localConfig, setLocalConfig] = useState<Partial<LeagueRegistrationConfig> | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- LEAGUE DATA ---
  const activeLeagueDocRef = useMemo(() => leagueId ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: leagueData } = useDoc(activeLeagueDocRef);
  const activeLeague = useMemo(() => leagueData || null, [leagueData]);

  // --- TEAM WAIVERS FETCHING ---
  const targetTeamId = useMemo(() => activeLeague?.teamId || activeTeam?.id, [activeLeague?.teamId, activeTeam?.id]);
  const teamWaiversQuery = useMemo(() => {
    if (!db || !targetTeamId) return null;
    return query(collection(db, 'teams', targetTeamId, 'documents'));
  }, [db, targetTeamId]);
  const { data: teamWaiversData } = useCollection<TeamDocument>(teamWaiversQuery);
  const teamWaivers = useMemo(() => (teamWaiversData || []).filter(d => d.type === 'waiver'), [teamWaiversData]);

  const waiversQuery = useMemoFirebase(() => {
    if (!db || !leagueId) return null;
    return query(collection(db, 'leagues', leagueId as string, 'archived_waivers'), orderBy('signedAt', 'desc'));
  }, [db, leagueId]);
  const { data: waiversData } = useCollection<LeagueArchiveWaiver>(waiversQuery);
  const archivedWaivers = useMemo(() => waiversData || [], [waiversData]);

  const [inspectingEntryId, setInspectingEntryId] = useState<string | null>(null);
  const inspectingEntry = useMemo(() => filteredEntries.find(e => e.id === inspectingEntryId), [filteredEntries, inspectingEntryId]);

  const exportAllWaivers = () => {
    if (archivedWaivers.length === 0) {
      toast({ title: "No waivers found", description: "This league has no signed waivers yet." });
      return;
    }
    const pdf = new jsPDF();
    pdf.setFontSize(22);
    pdf.text(`Official Waiver Archive: ${activeLeague?.name || 'League'}`, 20, 20);
    pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
    pdf.setFontSize(12);
    pdf.text(`Total Records: ${archivedWaivers.length}`, 20, 38);
    pdf.setDrawColor(200);
    pdf.line(20, 45, 190, 45);

    archivedWaivers.forEach((waiver) => {
      pdf.addPage();
      pdf.setFontSize(24);
      pdf.setTextColor(0, 0, 0);
      pdf.text("WAIVER RECORD", 20, 30);
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(`UID: ${waiver.id}`, 20, 38);
      
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.5);
      pdf.line(20, 45, 190, 45);

      pdf.setFontSize(14);
      pdf.setTextColor(0);
      pdf.text("PARTICIPANT INFO", 20, 60);
      pdf.setFontSize(11);
      pdf.text(`Name: ${waiver.signer}`, 20, 70);
      pdf.text(`Affiliation: ${waiver.teamName || 'Independent'}`, 20, 78);
      pdf.text(`Signed At: ${format(new Date(waiver.signedAt), 'PPP p')}`, 20, 86);
      pdf.text(`Type: ${waiver.type.toUpperCase()}`, 20, 94);

      pdf.setFontSize(14);
      pdf.text("WAIVER TEXT", 20, 115);
      pdf.setFontSize(8);
      pdf.setTextColor(50);
      const splitWaiver = pdf.splitTextToSize(waiver.waiverText, 170);
      pdf.text(splitWaiver, 20, 125);

      pdf.setFontSize(14);
      pdf.setTextColor(0);
      const lastLine = 125 + (splitWaiver.length * 3.5);
      pdf.text("EXECUTION LOG", 20, lastLine + 15);
      pdf.setFontSize(9);
      pdf.text(`The user ${waiver.signer} confirmed their identity and agreed to the above terms via electronic signature on ${format(new Date(waiver.signedAt), 'PPP p')}.`, 20, lastLine + 25, { maxWidth: 170 });
    });

    pdf.save(`${activeLeague?.name || 'League'}_Waiver_Archive.pdf`);
    toast({ title: "Archive Generated" });
  };


  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    } else if (!isConfigLoading && !config) {
      const defaultPlayerSchema: RegistrationFormField[] = [
        { id: 'f_phone', label: 'Phone Number', type: 'short_text', required: true, step: 'identity' },
        { id: 'f_position', label: 'Position/Role', type: 'dropdown', required: false, options: ['Forward', 'Midfield', 'Defense', 'Goalkeeper', 'General'], step: 'identity' },
        { id: 'f_emer_name', label: 'Emergency Contact Name', type: 'short_text', required: true, step: 'identity' },
        { id: 'f_emer_phone', label: 'Emergency Contact Phone', type: 'short_text', required: true, step: 'identity' },
      ];
      const defaultTeamSchema: RegistrationFormField[] = [
        { id: 'f_team_name', label: 'Team Name', type: 'short_text', required: true, step: 'identity' },
        { id: 'f_coach_name', label: 'Coach Name', type: 'short_text', required: true, step: 'identity' },
        { id: 'f_contact_email', label: 'Contact Email', type: 'short_text', required: true, step: 'identity' },
        { id: 'f_team_color', label: 'Team Color', type: 'short_text', required: false, step: 'additional' },
      ];
      setLocalConfig({
        id: configId,
        type: pipelineType,
        title: pipelineType === 'player' ? 'Athlete Registration' : 'Squad Registration',
        is_active: false,
        form_schema: pipelineType === 'player' ? defaultPlayerSchema : defaultTeamSchema,
        form_version: 1
      });
    }
  }, [config, isConfigLoading, configId, pipelineType]);

  const handleUpdateConfig = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!leagueId) return;
    const defaultPlayerSchema: RegistrationFormField[] = [
      { id: 'f_phone', label: 'Phone Number', type: 'short_text', required: true, step: 'identity' },
      { id: 'f_position', label: 'Position/Role', type: 'dropdown', required: false, options: ['Forward', 'Midfield', 'Defense', 'Goalkeeper', 'General'], step: 'identity' },
      { id: 'f_emer_name', label: 'Emergency Contact Name', type: 'short_text', required: true, step: 'identity' },
      { id: 'f_emer_phone', label: 'Emergency Contact Phone', type: 'short_text', required: true, step: 'identity' },
    ];
    const defaultTeamSchema: RegistrationFormField[] = [
      { id: 'f_team_name', label: 'Team Name', type: 'short_text', required: true, step: 'identity' },
      { id: 'f_coach_name', label: 'Coach Name', type: 'short_text', required: true, step: 'identity' },
      { id: 'f_contact_email', label: 'Contact Email', type: 'short_text', required: true, step: 'identity' },
      { id: 'f_team_color', label: 'Team Color', type: 'short_text', required: false, step: 'additional' },
    ];
    const base = localConfig || config || { 
      id: configId, 
      type: pipelineType, 
      title: pipelineType === 'player' ? 'Athlete Registration' : 'Squad Registration', 
      is_active: false, 
      form_schema: pipelineType === 'player' ? defaultPlayerSchema : defaultTeamSchema, 
      form_version: 1 
    };
    const updated = { ...base, ...updates } as LeagueRegistrationConfig;
    
    // If team waivers are being selected, fetch their content
    if (updates.selected_team_waivers) {
      const selectedIds = updates.selected_team_waivers;
      const contents = (selectedIds.map(id => {
        const w = teamWaivers.find(tw => tw.id === id);
        return w ? { id: w.id, title: w.title, content: w.content } : null;
      }).filter(Boolean)) as { id: string; title: string; content: string }[];
      updated.team_waivers_content = contents;
    }

    setLocalConfig(updated);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    const performSync = async () => { await saveLeagueRegistrationConfig(leagueId as string, configId, updated); };
    if (immediate) performSync(); else syncTimeoutRef.current = setTimeout(performSync, 1500);
  };

  const handleAddField = () => {
    const schema = localConfig?.form_schema || config?.form_schema || [];
    if (!editingField?.label || !editingField?.type) return;
    const newField = { ...editingField, id: `f_${Date.now()}` } as RegistrationFormField;
    handleUpdateConfig({ form_schema: [...schema, newField], form_version: (localConfig?.form_version || 0) + 1 }, true);
    setEditingField(null);
  };

  const handleManualAdd = async () => {
    if (!manualForm.teamName || !manualForm.coachName || !manualForm.email || !leagueId) return;
    setIsManualProcessing(true);
    try {
      await submitRegistrationEntry(leagueId as string, 'team_config', { ...manualForm, manual_enrollment: true, name: manualForm.coachName }, 0, 'Manual Enrollment', 'leagues');
      setIsManualAddOpen(false);
      setManualForm({ teamName: '', coachName: '', email: '', inviteCode: '' });
      toast({ title: "Squad Enrolled" });
    } finally { setIsManualProcessing(false); }
  };

  if (isConfigLoading) return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-6 animate-pulse">
      <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground">Synchronizing Protocols...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leagues')} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
          <div><Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3">Recruit Hub</Badge><h1 className="text-3xl font-black uppercase tracking-tight mt-1">Personnel Pool</h1></div>
        </div>
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 shadow-inner">
          <Button variant={pipelineType === 'player' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('player'); setActiveTab('entries'); }}><Users className="h-4 w-4 mr-2" /> Players</Button>
          <Button variant={pipelineType === 'team' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('team'); setActiveTab('entries'); }}><Zap className="h-4 w-4 mr-2" /> Squads</Button>
          <Button variant="ghost" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] ml-4 bg-white/50 border-white" onClick={exportAllWaivers}><Download className="h-4 w-4 mr-2" /> Export Waivers</Button>
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl border-2 flex items-center shadow-sm w-fit">
        <Button variant={activeTab === 'entries' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('entries')}>Recruit Ledger</Button>
        <Button variant={activeTab === 'config' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('config')}>Protocol Architect</Button>
      </div>

      {activeTab === 'entries' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
              {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
              ))}
            </div>
            {pipelineType === 'team' && <Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-xl" onClick={() => setIsManualAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Enroll Squad</Button>}
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {isEntriesLoading ? (
                  <div className="py-32 text-center flex flex-col items-center gap-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-[0.3em]">Synchronizing...</p></div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-10 py-6">Applicant</th><th className="px-4 py-6 text-center">Recruit Code</th><th className="px-4 py-6 text-center">Status</th><th className="px-10 py-6 text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-muted/50">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border-2 bg-white shadow-sm">{pipelineType === 'player' ? <UserCheck className="h-6 w-6 text-primary" /> : <ShieldCheck className="h-6 w-6 text-primary" />}</div>
                              <div className="min-w-0"><p className="font-black text-sm uppercase truncate">{entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || 'Untitled'}</p><p className="text-[10px] font-bold text-muted-foreground truncate uppercase">{entry.answers?.email || 'No Email'}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center">
                            {(entry.answers?.inviteCode || entry.answers?.teamCode || entry.answers?.recruiter_code || entry.answers?.code) ? (
                              <Badge variant="outline" className="border-primary/20 text-primary font-black text-[9px] h-6 px-3">{entry.answers?.inviteCode || entry.answers?.teamCode || entry.answers?.recruiter_code || entry.answers?.code}</Badge>
                            ) : (
                              <span className="text-[10px] font-bold text-muted-foreground/30">—</span>
                            )}
                          </td>
                          <td className="px-4 py-6 text-center"><Badge className={cn("border-none font-black text-[8px] uppercase px-3 h-6", entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'assigned' ? "bg-primary text-white" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted")}>{entry.status}</Badge></td>
                          <td className="px-10 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border-2 bg-white hover:bg-primary hover:text-white" onClick={() => setInspectingEntryId(entry.id)}><Terminal className="h-5 w-5" /></Button>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEntries.length === 0 && !isEntriesLoading && (
                        <tr><td colSpan={4} className="py-32 text-center opacity-20"><History className="h-16 w-16 mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-[0.3em]">Ledger Empty</p></td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto pb-32">
          <div className="space-y-16 relative">
            <div className="flex bg-black text-white p-8 rounded-[3rem] items-center justify-between border-2 border-white/10 shadow-2xl mb-12">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Protocol Neural Flow</Badge>
                  <Badge variant="outline" className="border-white/20 text-white/40 font-black uppercase text-[8px] h-6 px-3">{localConfig?.form_version ? `Rev 0${localConfig.form_version}` : 'Rev 01'}</Badge>
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tighter">System Architect</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Active Deployment for {activeLeague?.name || 'League'}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right hidden md:block">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-widest mb-1">Bridge Endpoint</p>
                  <p className="text-[9px] font-mono text-primary font-bold">/register/league/{leagueId}</p>
                </div>
                <Button 
                  className="h-14 px-8 rounded-2xl bg-white text-black font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-all flex items-center gap-2" 
                  onClick={() => { 
                    const url = `${window.location.origin}/register/league/${leagueId}?protocol=${configId}`;
                    navigator.clipboard.writeText(url); 
                    toast({ title: "Portal Link Copied", description: "Protocol link injected into clipboard." }); 
                  }}
                >
                  <Share2 className="h-4 w-4" /> Share Portal
                </Button>
              </div>
            </div>

            {/* PHASE 01: PORTAL BASELINE */}
            <div id="phase-01" className="relative z-10 space-y-10 group">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-[2.5rem] bg-black text-white border-4 border-white/10 flex items-center justify-center text-3xl font-black shadow-2xl transition-transform group-hover:scale-110 shrink-0">1</div>
                <div className="h-px bg-primary/20 flex-1" />
              </div>
              
              <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardHeader className="bg-primary/5 border-b p-8 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-2xl text-white shadow-lg"><Globe className="h-6 w-6" /></div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Portal Baseline</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-primary mt-1">Institutional Identity & Meta-Data</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end gap-1 mr-4">
                      <span className="text-[9px] font-black uppercase text-muted-foreground">Portal Status</span>
                      <span className={cn("text-[10px] font-black uppercase transition-colors", localConfig?.is_active ? "text-green-600" : "text-rose-600")}>
                        {localConfig?.is_active ? "Live" : "Draft"}
                      </span>
                    </div>
                    <Switch checked={localConfig?.is_active || false} onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} />
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Headline</Label>
                      <Input value={localConfig?.title || ''} onChange={e => handleUpdateConfig({ title: e.target.value })} className="h-14 rounded-2xl border-2 font-black shadow-sm" placeholder="e.g. 2024 Spring Season Recruitment" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enrollment Fee (USD)</Label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-primary">$</span>
                        <Input type="number" value={localConfig?.registration_cost || '0'} onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} className="h-14 pl-10 rounded-2xl border-2 font-black text-primary bg-primary/5 border-primary/20" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Portal Description</Label>
                    <Textarea value={localConfig?.description || ''} onChange={e => handleUpdateConfig({ description: e.target.value })} className="rounded-3xl min-h-[100px] border-2 font-medium bg-muted/5 p-6 focus:bg-white transition-all" placeholder="Explain the registration process..." />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* PHASE 02: IDENTITY HUB */}
            <div id="phase-02" className="relative z-10 space-y-10 group">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-[2.5rem] bg-indigo-600 text-white flex items-center justify-center text-3xl font-black shadow-2xl shadow-indigo-600/20 ring-8 ring-indigo-600/5 transition-transform group-hover:scale-110 shrink-0">2</div>
                <div className="h-px bg-indigo-600/20 flex-1" />
              </div>

              <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardHeader className="bg-indigo-50/50 border-b p-8 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg"><Fingerprint className="h-6 w-6" /></div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Identity Hub</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mt-1">Participant Data Injection</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-xl h-11 px-6 border-indigo-200 text-indigo-700 font-black uppercase text-[10px] shadow-sm hover:bg-indigo-50 transition-all hover:scale-105" onClick={() => setEditingField({ step: 'identity', type: 'short_text', required: true })}>
                    <Plus className="h-4 w-4 mr-2" /> Inject Field
                  </Button>
                </CardHeader>
                <CardContent className="p-8 space-y-12">
                    {/* AUTO INJECTED FIELDS */}
                    <div className="space-y-5">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Institutional Baseline (Global Injection)</p>
                        <Badge variant="outline" className="text-[8px] font-black uppercase opacity-60">System Enforced</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Full Name', detail: 'Legal Identity', icon: Users },
                          { label: 'Primary Email', detail: 'System Relay', icon: Mail },
                          { label: 'Date of Birth', detail: 'Eligibility Proto', icon: Calendar },
                          { label: 'Mobile Phone', detail: 'Direct Link', icon: Smartphone }
                        ].map(f => (
                          <div key={f.label} className="p-5 rounded-2xl bg-muted/40 border-2 border-transparent flex flex-col gap-3 relative group/base">
                            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                              <f.icon className="h-5 w-5 opacity-40 text-black" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase text-black leading-none">{f.label}</p>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase mt-1">{f.detail}</p>
                            </div>
                            <Lock className="absolute top-4 right-4 h-3 w-3 opacity-10" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CUSTOM FIELDS */}
                    <div className="space-y-5">
                      <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest px-1">Organization Protocol Specs</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {((localConfig?.form_schema || []).filter(f => f.step === 'identity' || !f.step)).map(f => (
                            <div key={f.id} className="p-6 rounded-3xl border-2 border-indigo-100 bg-indigo-50/10 flex items-center justify-between group/f hover:border-indigo-400 transition-all shadow-sm">
                              <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-black uppercase flex items-center gap-2">
                                  {f.label}
                                  {f.required && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title="Required" />}
                                </span>
                                <Badge className="w-fit bg-indigo-600 text-white hover:bg-indigo-600 border-none text-[8px] font-black uppercase h-5 px-2">
                                  {f.type === 'signature' ? 'Digital Signature' : f.type.replace('_', ' ')}
                                </Badge>
                              </div>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-rose-500 opacity-0 group-hover/f:opacity-100 hover:bg-rose-50 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(field => field.id !== f.id) }, true)}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          ))}
                          {((localConfig?.form_schema || []).filter(f => f.step === 'identity' || !f.step)).length === 0 && (
                            <div className="md:col-span-2 py-12 text-center border-2 border-dashed rounded-[3rem] border-indigo-100 bg-indigo-50/5">
                              <Fingerprint className="h-10 w-10 mx-auto mb-3 opacity-10 text-indigo-600" />
                              <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">Awaiting Custom Input Injection</p>
                            </div>
                          )}
                      </div>
                    </div>
                </CardContent>
              </Card>
            </div>

            {/* PHASE 03: GUARDIAN BRIDGE */}
            {pipelineType === 'player' && (
              <div id="phase-03" className="relative z-10 space-y-10 group">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 rounded-[2.5rem] bg-amber-600 text-white flex items-center justify-center text-3xl font-black shadow-2xl shadow-amber-600/20 ring-8 ring-amber-600/5 transition-transform group-hover:scale-110 shrink-0">3</div>
                  <div className="h-px bg-amber-600/20 flex-1" />
                </div>

                <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <CardHeader className="bg-amber-50/50 border-b p-8 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-amber-600 p-3 rounded-2xl text-white shadow-lg"><UserCheck className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tight">Guardian Bridge</CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-1">Minor Logic & Field Injection</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" className="rounded-xl h-11 px-6 border-amber-200 text-amber-700 font-black uppercase text-[10px] shadow-sm hover:bg-amber-50 transition-all hover:scale-105" onClick={() => setEditingField({ step: 'guardian', type: 'short_text', required: true })}>
                      <Plus className="h-4 w-4 mr-2" /> Inject Field
                    </Button>
                  </CardHeader>
                  <CardContent className="p-8 space-y-12">
                    <div className="bg-amber-50 rounded-[2.5rem] p-8 border border-amber-100 flex flex-col md:flex-row items-center gap-8 shadow-sm">
                      <div className="h-20 w-20 rounded-3xl bg-amber-600 text-white flex items-center justify-center shadow-lg shrink-0">
                        <ShieldCheck className="h-10 w-10" />
                      </div>
                      <div className="text-center md:text-left space-y-2">
                        <div className="text-[14px] font-black uppercase text-amber-900 tracking-tight flex items-center justify-center md:justify-start gap-4">
                          Automated Trigger: Minor Safety Mode
                          <Badge className="bg-amber-600 text-white border-none font-black uppercase text-[8px] h-6 px-3">Enrolled</Badge>
                        </div>
                        <p className="text-xs font-medium text-amber-800/70 leading-relaxed max-w-xl">System detects participant age via Phase 02 and automatically enforces guardian identity and legal consent to satisfy compliance standards.</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-5">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Baseline Guardian Protocol (Locked)</p>
                          <Badge variant="outline" className="text-[8px] font-black uppercase opacity-60">Compliance Enforced</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {[
                            { label: 'Guardian Full Name', icon: Users, detail: 'Legal Identity', req: true },
                            { label: 'Primary Email', icon: Mail, detail: 'Communications Bridge', req: true },
                            { label: 'Cellular Device', icon: Smartphone, detail: 'Emergency Port', req: true },
                            { label: 'Rel. Type', icon: UserPlus, detail: 'Kinship Logic', req: true }
                          ].map(f => (
                            <div key={f.label} className="p-5 rounded-2xl bg-amber-500/5 border-2 border-transparent flex flex-col gap-3 relative transition-all hover:bg-amber-500/10 hover:border-amber-500/20">
                              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-amber-600 border border-amber-100">
                                <f.icon className="h-5 w-5" />
                              </div>
                              <div className="flex items-center justify-between pr-4">
                                  <div>
                                      <p className="text-[10px] font-black uppercase text-amber-900 leading-none">{f.label}</p>
                                      <p className="text-[8px] font-bold text-amber-600/40 uppercase mt-1">{f.detail}</p>
                                  </div>
                                  <Lock className="h-3 w-3 opacity-20" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest px-1">Experimental Guardian Specs</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {((localConfig?.form_schema || []).filter(f => f.step === 'guardian')).map(f => (
                            <div key={f.id} className="p-6 border-2 border-amber-100 rounded-3xl flex items-center justify-between group/f bg-amber-50/10 hover:border-amber-400 transition-all shadow-sm">
                              <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-black uppercase">{f.label}</span>
                                <Badge className="w-fit bg-amber-600 text-white hover:bg-amber-600 border-none text-[8px] font-black uppercase h-5 px-2">
                                  {f.type.replace('_', ' ')}
                                </Badge>
                              </div>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-rose-500 opacity-0 group-hover/f:opacity-100 hover:bg-rose-50 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(field => field.id !== f.id) }, true)}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          ))}
                          {((localConfig?.form_schema || []).filter(f => f.step === 'guardian')).length === 0 && (
                            <div className="md:col-span-2 py-12 text-center border-2 border-dashed rounded-[3rem] border-amber-100 bg-amber-50/5">
                              <Plus className="h-10 w-10 mx-auto mb-3 opacity-10 text-amber-600" />
                              <p className="text-[10px] font-black uppercase text-amber-300 tracking-widest">Inject Supplemental Guardian Requirements</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* PHASE 04: SYNAPSE DISPATCH */}
            {pipelineType === 'player' && (
              <div id="phase-04" className="relative z-10 space-y-10 group">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 rounded-[2.5rem] bg-indigo-600 text-white flex items-center justify-center text-3xl font-black shadow-2xl shadow-indigo-600/20 ring-8 ring-indigo-600/5 transition-transform group-hover:scale-110 shrink-0">4</div>
                  <div className="h-px bg-indigo-600/20 flex-1" />
                </div>

                <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <CardHeader className="bg-indigo-50/50 border-b p-8 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg"><Zap className="h-6 w-6" /></div>
                      <div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tight">Synapse Dispatch</CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 mt-1">Recruitment Code & Squadron Access</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" className="rounded-xl h-11 px-6 border-indigo-200 text-indigo-700 font-black uppercase text-[10px] shadow-sm hover:bg-indigo-50 transition-all hover:scale-105" onClick={() => setEditingField({ step: 'team_code', type: 'short_text', required: true })}>
                      <Plus className="h-4 w-4 mr-2" /> Inject Field
                    </Button>
                  </CardHeader>
                  <CardContent className="p-8 space-y-12">
                      <div className="space-y-5">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Digital Synapse Baseline (Locked)</p>
                          <Badge variant="outline" className="text-[8px] font-black uppercase opacity-60">Identity Bridge</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {[
                            { label: 'Recruitment Identification', detail: 'Primary Squad Logical Sync', icon: Zap, req: true },
                            { label: 'Invite Link Vector', detail: 'URL-Encoded Cryptographic Verification', icon: Globe, req: false }
                          ].map(f => (
                            <div key={f.label} className="p-6 rounded-[2.5rem] bg-indigo-500/5 border-2 border-transparent flex items-center gap-6 relative transition-all hover:bg-indigo-500/10 hover:border-indigo-500/20">
                              <div className="h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-lg text-indigo-600 shrink-0 border border-indigo-100">
                                <f.icon className="h-7 w-7" />
                              </div>
                              <div className="flex-1">
                                  <p className="text-[12px] font-black uppercase text-indigo-900 leading-none">{f.label}</p>
                                  <p className="text-[9px] font-bold text-indigo-600/40 uppercase mt-2">{f.detail}</p>
                              </div>
                              <Lock className="absolute top-6 right-8 h-4 w-4 opacity-20" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest px-1">Custom Synapse Payloads</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {((localConfig?.form_schema || []).filter(f => f.step === 'team_code')).map(f => (
                            <div key={f.id} className="p-6 border-2 border-indigo-100 rounded-3xl flex items-center justify-between group/f bg-indigo-50/10 hover:border-indigo-400 transition-all shadow-sm">
                              <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-black uppercase flex items-center gap-2">
                                  {f.label}
                                  {f.required && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                                </span>
                                <Badge className="w-fit bg-indigo-600 text-white hover:bg-indigo-600 border-none text-[8px] font-black uppercase h-5 px-2">
                                  {f.type.replace('_', ' ')}
                                </Badge>
                              </div>
                              <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl text-rose-500 opacity-0 group-hover/f:opacity-100 hover:bg-rose-50 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(field => field.id !== f.id) }, true)}><Trash2 className="h-6 w-6" /></Button>
                            </div>
                          ))}
                          {((localConfig?.form_schema || []).filter(f => f.step === 'team_code')).length === 0 && (
                            <div className="md:col-span-2 py-12 text-center border-2 border-dashed rounded-[3rem] border-indigo-100 bg-indigo-50/5">
                              <Plus className="h-10 w-10 mx-auto mb-3 opacity-10 text-indigo-600" />
                              <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest">Inject Tactical Verification Logic</p>
                            </div>
                          )}
                        </div>
                      </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* PHASE 05: INSTITUTIONAL SHIELD */}
            <div id="phase-05" className="relative z-10 space-y-10 group">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-[2.5rem] bg-rose-600 text-white flex items-center justify-center text-3xl font-black shadow-2xl shadow-rose-600/20 ring-8 ring-rose-600/5 transition-transform group-hover:scale-110 shrink-0">
                  {pipelineType === 'player' ? '5' : '3'}
                </div>
                <div className="h-px bg-rose-600/20 flex-1" />
              </div>

              <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardHeader className="bg-rose-50/50 border-b p-8 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-rose-600 p-3 rounded-2xl text-white shadow-lg"><ShieldCheck className="h-6 w-6" /></div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Institutional Shield</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mt-1">Compliance & Risk Ledger</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 lg:p-10 space-y-12">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-rose-600 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group/sh">
                      <ShieldCheck className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 rotate-12 transition-transform group-hover/sh:scale-125" />
                      <div className="space-y-6 relative z-10">
                        <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/20">
                          <Lock className="h-7 w-7" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-rose-200 tracking-widest px-1 mb-2">Institutional Compliance Briefing</p>
                          <h4 className="text-xl font-black uppercase leading-tight">Secured Legal Binding Protocol</h4>
                        </div>
                        <p className="text-xs font-bold text-rose-100/60 leading-relaxed italic">The Institutional Shield protocol enforces legal binding between the organization and the participant. All signed documents are SHA-256 encrypted and stored in the permanent recruitment vault.</p>
                      </div>
                    </div>
                    
                    <div className="space-y-6 flex flex-col justify-center bg-muted/5 p-8 rounded-[2.5rem] border-2 border-dashed border-muted">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm border"><History className="h-5 w-5 text-rose-600" /></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Permanent Audit Log</span>
                      </div>
                      <p className="text-[11px] font-bold text-muted-foreground/60 leading-relaxed">System automatically archives every unique execution of this phase, including sub-IP origin and timestamp data for legal verification.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-12">
                      <div className="space-y-10">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-8 rounded-[2.5rem] bg-white border-2 border-rose-100 shadow-sm transition-all hover:border-rose-400 hover:shadow-xl group/u">
                              <div className="flex items-center gap-6">
                                <div className="h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 transition-transform group-hover/u:rotate-12">
                                  <Globe className="h-7 w-7" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-lg font-black uppercase text-rose-900 leading-none">Universal Hub Release</Label>
                                  <p className="text-[9px] font-bold text-rose-700/60 uppercase tracking-widest mt-1">Global system-level baseline waiver</p>
                                </div>
                              </div>
                              <Switch checked={localConfig?.require_default_waiver} onCheckedChange={(v) => handleUpdateConfig({ require_default_waiver: v }, true)} />
                            </div>

                            {localConfig?.require_default_waiver && (
                              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500 bg-rose-50/30 p-8 rounded-[2.5rem] border-2 border-rose-50 shadow-inner">
                                <div className="flex items-center justify-between px-2">
                                   <div className="flex items-center gap-2">
                                     <Terminal className="h-3 w-3 text-rose-400" />
                                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-900/40">Default Release Payload (Encrypted)</Label>
                                   </div>
                                   <Badge variant="outline" className="text-[8px] font-black uppercase text-rose-400 border-rose-100">Global Standard</Badge>
                                </div>
                                <ScrollArea className="h-[150px] pr-4">
                                  <p className="text-[11px] font-bold leading-relaxed text-rose-800/70 italic bg-white/50 p-6 rounded-2xl border border-rose-100">
                                    {localConfig?.default_waiver_text || "The standard Institutional Release covers liability, medical consent, and media participation for all organizational events. This text is managed at the system level and ensures a baseline of compliance for all participants regardless of specific league settings."}
                                  </p>
                                </ScrollArea>
                                <div className="flex items-center gap-2 px-2">
                                  <div className="h-1 w-1 rounded-full bg-rose-300" />
                                  <p className="text-[8px] font-bold text-rose-400 uppercase tracking-widest">Protocol-Locked Payload</p>
                                </div>
                              </div>
                            )}
                        </div>

                        <div className="space-y-3">
                           <div className="flex items-center justify-between px-2">
                              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-900">Custom Waiver Text</Label>
                              <Badge className="bg-rose-600 text-white border-none font-black uppercase text-[8px] h-5 px-2">Custom Injection</Badge>
                           </div>
                           <Textarea 
                            value={localConfig?.custom_waiver_text || ''} 
                            onChange={e => handleUpdateConfig({ custom_waiver_text: e.target.value })} 
                            className="rounded-[2.5rem] border-2 min-h-[220px] text-[11px] font-medium leading-relaxed bg-white/50 p-8 focus:bg-white focus:border-rose-400 transition-all shadow-sm border-rose-100" 
                            placeholder="Enter your custom waiver text here..." 
                           />
                           <div className="flex items-center gap-2 justify-center mt-4">
                             <div className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                             <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Permanent Record: Archive on Signature</p>
                           </div>
                        </div>
                      </div>

                      <div className="space-y-8">
                         <div className="flex items-center justify-between px-1">
                            <div className="space-y-1">
                               <p className="text-[11px] font-black uppercase text-rose-700 tracking-widest">Coaches Corner Libraries</p>
                               <p className="text-[8px] font-bold text-rose-400 uppercase tracking-widest opacity-60">Syncing External Vaults</p>
                            </div>
                            <Badge className="bg-rose-600 text-white border-none font-black uppercase text-[8px] h-6 px-3 shadow-lg shadow-rose-600/20">Sync v2.1</Badge>
                         </div>
                         
                         <div className="space-y-4">
                            {(localConfig?.selected_team_waivers || []).map(wid => {
                              const waiver = teamWaivers.find(w => w.id === wid);
                              return (
                                <div key={wid} className="p-6 bg-white rounded-3xl border-2 border-rose-100 flex items-center justify-between shadow-sm group/w transition-all hover:border-rose-400 hover:shadow-md">
                                  <div className="flex items-center gap-4 overflow-hidden">
                                    <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                                      <FileSignature className="h-6 w-6" />
                                    </div>
                                    <div className="flex flex-col gap-1 overflow-hidden">
                                      <span className="text-[12px] font-black uppercase text-rose-900 truncate">{waiver?.title || "Unknown Specification"}</span>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[7px] font-bold text-rose-400 p-0 border-none hover:bg-transparent uppercase tracking-widest">CRC-ENCRYPTED: {wid.slice(0, 12)}</Badge>
                                        <div className="h-1 w-1 rounded-full bg-rose-200" />
                                        <span className="text-[7px] font-black text-rose-300 uppercase">Vault Ready</span>
                                      </div>
                                    </div>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-rose-500 hover:bg-rose-50 shrink-0 transition-opacity" onClick={() => handleUpdateConfig({ selected_team_waivers: (localConfig?.selected_team_waivers || []).filter(id => id !== wid) }, true)}><Trash2 className="h-5 w-5" /></Button>
                                </div>
                              );
                            })}
                            
                            <div className="pt-4 space-y-6">
                              <Select onValueChange={(v) => handleUpdateConfig({ selected_team_waivers: [...(localConfig?.selected_team_waivers || []), v] }, true)}>
                                <SelectTrigger className="rounded-[2.5rem] border-dashed border-2 h-20 text-[10px] font-black uppercase text-rose-400 bg-rose-50/10 hover:border-rose-400 hover:text-rose-600 transition-all hover:bg-rose-50/30">
                                  <div className="flex items-center gap-4 px-4">
                                    <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-rose-100"><Plus className="h-5 w-5" /></div>
                                    <SelectValue placeholder="Inject Waiver from Coaches Corner" />
                                  </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-3xl shadow-2xl border-2 max-h-[400px]">
                                  {teamWaivers.filter(tw => !(localConfig?.selected_team_waivers || []).includes(tw.id)).map(tw => (
                                    <SelectItem key={tw.id} value={tw.id} className="text-[10px] font-black uppercase py-4 px-6">{tw.title}</SelectItem>
                                  ))}
                                  {teamWaivers.length === 0 && (
                                    <div className="p-8 text-center text-rose-400 italic text-[10px] uppercase font-black opacity-40">No available waivers in organizational library</div>
                                  )}
                                </SelectContent>
                              </Select>
                              
                              <div className="p-8 rounded-[2.5rem] bg-muted/20 border-2 border-transparent text-center space-y-4">
                                <ShieldCheck className="h-10 w-10 mx-auto text-rose-200" />
                                <p className="text-[9px] font-bold text-rose-400/60 uppercase tracking-tight px-6 italic leading-relaxed">
                                  You are viewing active documents from the administrative team connected to this league. Injected waivers will appear as separate signing steps for participants.
                                </p>
                              </div>
                            </div>
                         </div>
                      </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* PHASE 06: ADDITIONAL ARCHITECT */}
            <div id="phase-06" className="relative z-10 space-y-10 group">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-[2.5rem] bg-green-600 text-white flex items-center justify-center text-3xl font-black shadow-2xl shadow-green-600/20 ring-8 ring-green-600/5 transition-transform group-hover:scale-110 shrink-0">
                  {pipelineType === 'player' ? '6' : '4'}
                </div>
                <div className="h-px bg-green-600/20 flex-1" />
              </div>

              <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardHeader className="bg-green-50/50 border-b p-8 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-green-600 p-3 rounded-2xl text-white shadow-lg"><Plus className="h-6 w-6" /></div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Additional Specs</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-green-600 mt-1">Terminal Capture Extensions</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" className="rounded-xl h-11 px-6 border-green-200 text-green-700 font-black uppercase text-[10px] shadow-sm hover:bg-green-50 transition-all hover:scale-105" onClick={() => setEditingField({ step: 'additional', type: 'short_text', required: false })}>
                    <Plus className="h-4 w-4 mr-2" /> Inject Field
                  </Button>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {((localConfig?.form_schema || []).filter(f => f.step === 'additional')).map(f => (
                      <div key={f.id} className="p-6 border-2 border-green-100 rounded-3xl flex items-center justify-between group/f bg-green-50/10 hover:border-green-400 transition-all shadow-sm">
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-black uppercase flex items-center gap-2">
                            {f.label}
                            {f.required && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" title="Required" />}
                          </span>
                          <Badge className="w-fit bg-green-600 text-white hover:bg-indigo-600 border-none text-[8px] font-black uppercase h-5 px-2">
                            {f.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-rose-500 opacity-0 group-hover/f:opacity-100 hover:bg-rose-50 transition-all" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(field => field.id !== f.id) }, true)}><Trash2 className="h-5 w-5" /></Button>
                      </div>
                    ))}
                    {((localConfig?.form_schema || []).filter(f => f.step === 'additional')).length === 0 && (
                      <div className="md:col-span-2 py-16 text-center border-2 border-dashed rounded-[3rem] border-green-100 bg-green-50/5">
                        <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-10 text-green-600" />
                        <p className="text-[10px] font-black uppercase text-green-400 tracking-[0.2em]">Awaiting Custom Spec Injection</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* SHARED FIELD ARCHITECT */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden max-w-sm">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
              <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Field Architect</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black ml-1">Field Label</Label>
                  <Input placeholder="e.g. Jersey Size" value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl border-2 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black ml-1">Field Type</Label>
                  <Select value={editingField?.type || 'short_text'} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="short_text" className="font-bold text-[10px] uppercase text-primary">Short Text</SelectItem>
                      <SelectItem value="long_text" className="font-bold text-[10px] uppercase">Long Text</SelectItem>
                      <SelectItem value="multi_select" className="font-bold text-[10px] uppercase">Multi-Select</SelectItem>
                      <SelectItem value="radio" className="font-bold text-[10px] uppercase">Radio Options</SelectItem>
                      <SelectItem value="checkbox" className="font-bold text-[10px] uppercase">Single Checkbox</SelectItem>
                      <SelectItem value="signature" className="font-bold text-[10px] uppercase text-rose-600">Digital Signature</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black ml-1">Phase Placement</Label>
                  <Select value={editingField?.step || 'identity'} onValueChange={(v: any) => setEditingField({ ...editingField, step: v })}>
                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="identity" className="font-bold text-[10px] uppercase">
                        {pipelineType === 'player' ? 'Phase 2: Identity' : 'Step 2: Identity'}
                      </SelectItem>
                      {pipelineType === 'player' && (
                        <>
                          <SelectItem value="guardian" className="font-bold text-[10px] uppercase">Phase 3: Guardian Bridge</SelectItem>
                          <SelectItem value="team_code" className="font-bold text-[10px] uppercase">Phase 4: Synapse Dispatch</SelectItem>
                        </>
                      )}
                      <SelectItem value="additional" className="font-bold text-[10px] uppercase">
                        {pipelineType === 'player' ? 'Phase 6: Additional specs' : 'Step 4: Additional specs'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(editingField?.type === ('multi_select' as any) || editingField?.type === 'radio') && (
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black ml-1">Choice Options (comma separated)</Label>
                    <Input placeholder="Small, Medium, Large" value={editingField?.options?.join(', ') || ''} onChange={e => setEditingField({ ...editingField, options: e.target.value.split(',').map(s => s.trim()) })} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-2">
                   <Checkbox id="req" checked={editingField?.required} onCheckedChange={(v) => setEditingField({...editingField, required: !!v})} className="rounded-md h-5 w-5 border-2" />
                   <Label htmlFor="req" className="text-[10px] font-black uppercase">Mandatory Injection</Label>
                </div>
              </div>
              <Button className="w-full h-14 rounded-2xl font-black uppercase shadow-xl" onClick={handleAddField} disabled={!editingField?.label}>Confirm Protocol Spec</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inspectingEntryId} onOpenChange={(open) => !open && setInspectingEntryId(null)}>
        <DialogContent className="rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden max-w-4xl max-h-[90vh] flex flex-col">
          <div className="h-3 bg-primary w-full shrink-0" />
          <ScrollArea className="flex-1">
            <div className="p-10 space-y-12">
              <div className="flex items-center justify-between">
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-4 rounded-3xl text-white shadow-xl"><Terminal className="h-8 w-8" /></div>
                    <div>
                      <DialogTitle className="text-4xl font-black uppercase tracking-tighter">Institutional Audit</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase text-xs tracking-widest mt-1">Verification Lead for {inspectingEntry?.answers?.name || 'Applicant'}</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="text-right">
                   <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Entry UID</p>
                   <p className="text-[11px] font-mono font-bold text-primary">{inspectingEntry?.id || '--'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-10">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center"><Download className="h-4 w-4" /></div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Payload Analysis (Form Data)</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(inspectingEntry?.answers || {}).map(([key, val]) => (
                        <div key={key} className="p-5 rounded-2xl bg-muted/20 border-2 border-transparent transition-all hover:bg-muted/30">
                          <p className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">{key.replace(/_/g, ' ')}</p>
                          <p className="text-sm font-bold text-foreground leading-tight">{val?.toString() || '--'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center"><ShieldCheck className="h-4 w-4" /></div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Compliance Record (Signed Waivers)</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 font-black uppercase text-[8px] h-6 px-3 border-none">Verified Execution</Badge>
                    </div>
                    <div className="space-y-3">
                      {archivedWaivers.filter(w => (w as any).email === inspectingEntry?.answers?.email).length > 0 ? (
                        archivedWaivers.filter(w => (w as any).email === inspectingEntry?.answers?.email).map(w => (
                          <div key={w.id} className="p-6 rounded-[2rem] bg-green-50 border-2 border-green-100 flex items-center justify-between">
                             <div className="flex items-center gap-4">
                               <FileSignature className="h-6 w-6 text-green-600" />
                               <div>
                                 <p className="text-xs font-black uppercase text-green-900">{w.type.replace(/_/g, ' ')}</p>
                                 <p className="text-[9px] font-bold text-green-600/60 uppercase tracking-widest mt-1">Signed {format(new Date(w.signedAt), 'PPP')}</p>
                               </div>
                             </div>
                             <Button variant="ghost" size="sm" className="h-8 rounded-lg font-black uppercase text-[8px] text-green-700 hover:bg-green-100 border border-green-200" onClick={() => {
                                const doc = new jsPDF();
                                doc.text("COMPLIANCE VERIFICATION", 20, 20);
                                doc.text(`Signer: ${w.signer}`, 20, 30);
                                doc.text(`Date: ${new Date(w.signedAt).toLocaleString()}`, 20, 40);
                                doc.text(w.waiverText, 20, 60, { maxWidth: 170 });
                                doc.save(`Waiver_${w.id}.pdf`);
                             }}>View Record</Button>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 rounded-[2rem] border-2 border-dashed border-muted text-center opacity-40">
                           <ShieldAlert className="h-10 w-10 mx-auto mb-3" />
                           <p className="text-[10px] font-black uppercase tracking-widest">No Archived Signatures Detected</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-12">
                  <div className="space-y-6">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Squad Assignment</p>
                    <div className="p-8 rounded-[2.5rem] bg-primary text-white space-y-6 shadow-xl relative overflow-hidden group/as">
                      <Users className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 rotate-12 transition-transform group-hover/as:scale-110" />
                      <div className="space-y-4 relative z-10">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary-foreground/40 ml-1">Dispatch Target</Label>
                        <Select value={inspectingEntry?.assigned_team_id || 'unassigned'} onValueChange={(tid) => assignEntryToTeam(leagueId as string, inspectingEntry?.id!, tid === 'unassigned' ? null : tid)}>
                          <SelectTrigger className="h-14 rounded-2xl border-none bg-white/10 backdrop-blur-xl font-black shadow-inner focus:ring-0"><SelectValue placeholder="Select Squad..." /></SelectTrigger>
                          <SelectContent className="rounded-2xl border-2">
                            <SelectItem value="unassigned" className="font-bold uppercase text-[10px]">Unassigned Pool</SelectItem>
                            {activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).map(id => (
                              <SelectItem key={id} value={id} className="font-bold uppercase text-[10px]">Squad {id.slice(-6)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[9px] font-bold text-primary-foreground/60 px-1 leading-relaxed">Assigning this applicant will automatically bridge their credentials to the target squadron ledger.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Administrative Actions</p>
                    <Button variant="outline" className="w-full h-14 rounded-2xl border-2 font-black uppercase text-xs hover:bg-muted" onClick={() => setInspectingEntryId(null)}>Close Briefing</Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={isManualAddOpen} onOpenChange={setIsManualAddOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Manual Enrollment</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label><Input placeholder="e.g. Metro Tigers" value={manualForm.teamName} onChange={e => setManualForm({...manualForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Coach Name</Label><Input placeholder="Full Name" value={manualForm.coachName} onChange={e => setManualForm({...manualForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label><Input type="email" placeholder="coach@org.com" value={manualForm.email} onChange={e => setManualForm({...manualForm, email: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Override Invite Code</Label>
                  <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-40 italic">Opt-Out for auto-gen</span>
                </div>
                <Input placeholder="AUTO" maxLength={6} value={manualForm.inviteCode} onChange={e => setManualForm({...manualForm, inviteCode: e.target.value.toUpperCase()})} className="h-12 rounded-xl border-2 font-black text-center tracking-widest placeholder:font-bold placeholder:tracking-normal" />
              </div>
            </div>
            <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleManualAdd} disabled={isManualProcessing}>{isManualProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Inject Squad"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}