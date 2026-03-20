"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, orderBy, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  Settings, 
  Users, 
  Lock, 
  ClipboardList, 
  Target, 
  Globe, 
  Share2, 
  Copy, 
  Loader2,
  ShieldCheck,
  UserCheck,
  History,
  Info,
  ArrowRight,
  UserPlus,
  Zap,
  XCircle,
  CheckCircle2
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

export default function LeagueRegistrationAdminPage() {
  const { leagueId } = useParams();
  const router = useRouter();
  const { isAuthResolved } = useUser();
  const { 
    saveLeagueRegistrationConfig, 
    assignEntryToTeam, 
    activeTeam, 
    hasFeature, 
    isStaff, 
    submitRegistrationEntry,
    purchasePro 
  } = useTeam();
  const db = useFirestore();

  const [pipelineType, setPipelineType] = useState<'player' | 'team'>('player');
  const [activeTab, setActiveTab] = useState<'entries' | 'config'>('entries');
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'accepted'>('all');

  const configId = pipelineType === 'player' ? 'player_config' : 'team_config';
  
  const configRef = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    return doc(db, 'leagues', leagueId as string, 'registration', configId);
  }, [db, leagueId, configId, isAuthResolved]);

  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    // Explicitly scope the query by protocol_id to satisfy security rules Provable Hierarchy
    return query(
      collection(db, 'leagues', leagueId as string, 'registrationEntries'), 
      where('protocol_id', '==', configId),
      orderBy('created_at', 'desc')
    );
  }, [db, leagueId, configId, isAuthResolved]);

  const { data: entries, isLoading: isEntriesLoading } = useCollection<RegistrationEntry>(entriesQuery);

  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ teamName: '', coachName: '', email: '' });
  const [isManualProcessing, setIsManualProcessing] = useState(false);

  const [localConfig, setLocalConfig] = useState<Partial<LeagueRegistrationConfig> | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (config) setLocalConfig(config);
    else setLocalConfig(null);
  }, [config]);

  const canRegister = isStaff && (hasFeature('league_registration') || activeTeam?.isPro);

  const handleUpdateConfig = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!leagueId) return;
    
    const base = localConfig || config || {
      id: configId,
      type: pipelineType,
      title: pipelineType === 'player' ? 'Player Recruitment' : 'Squad Enrollment',
      description: '',
      registration_cost: '0',
      is_active: false,
      form_schema: [
        { id: 'name', type: 'short_text', label: 'Full Name', required: true },
        { id: 'email', type: 'short_text', label: 'Email Address', required: true }
      ],
      form_version: 1
    };

    const updated = { ...base, ...updates } as LeagueRegistrationConfig;
    setLocalConfig(updated);

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    const performSync = async () => {
      try {
        await saveLeagueRegistrationConfig(leagueId as string, configId, updated);
      } catch (e) {
        console.error("Config sync failure", e);
      }
    };

    if (immediate) performSync();
    else syncTimeoutRef.current = setTimeout(performSync, 1500);
  };

  const formSchema = localConfig?.form_schema || config?.form_schema || [];

  const filteredEntries = useMemo(() => {
    const raw = entries || [];
    if (filterStatus === 'all') return raw;
    return raw.filter(e => e.status === filterStatus);
  }, [entries, filterStatus]);

  const handleAddField = () => {
    if (!editingField?.label || !editingField?.type) return;
    const newField = { ...editingField, id: `f_${Date.now()}` } as RegistrationFormField;
    const updatedSchema = [...formSchema, newField];
    handleUpdateConfig({ 
      form_schema: updatedSchema, 
      form_version: (localConfig?.form_version || config?.form_version || 0) + 1 
    }, true); 
    setEditingField(null);
  };

  const handleManualAdd = async () => {
    if (!manualForm.teamName || !manualForm.coachName || !manualForm.email || !leagueId) return;
    setIsManualProcessing(true);
    try {
      await submitRegistrationEntry(
        leagueId as string, 
        'team_config', 
        { teamName: manualForm.teamName, name: manualForm.coachName, email: manualForm.email, manual_enrollment: true }, 
        0, 
        'Manual Admin Enrollment', 
        'leagues'
      );
      setIsManualAddOpen(false);
      setManualForm({ teamName: '', coachName: '', email: '' });
      toast({ title: "Squad Enrolled" });
    } catch (error) {
      toast({ title: "Enrollment Failed", variant: "destructive" });
    } finally {
      setIsManualProcessing(false);
    }
  };

  if (!isStaff) return <div className="py-24 text-center"><ShieldCheck className="h-16 w-16 mx-auto opacity-20" /><h1 className="text-2xl font-black mt-4 uppercase">Command Required</h1></div>;

  if (!canRegister) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-8 rounded-[3rem] shadow-2xl"><ClipboardList className="h-20 w-20 text-primary" /></div>
          <div className="absolute -top-3 -right-3 bg-black text-white p-2.5 rounded-full shadow-lg border-4 border-background"><Lock className="h-5 w-5" /></div>
        </div>
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-black uppercase tracking-tight">Recruitment Locked</h1>
          <p className="text-muted-foreground font-bold leading-relaxed text-lg uppercase tracking-wide">Automated enrollment pipelines are reserved for <strong>Elite Pro</strong> squads.</p>
        </div>
        <Button className="h-14 px-10 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>Unlock Recruitment Hub</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leagues')} className="rounded-full h-10 w-10"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="space-y-1">
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Recruitment Hub</Badge>
            <h1 className="text-3xl font-black uppercase tracking-tight">Recruit Pool</h1>
          </div>
        </div>
        
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 shadow-inner">
          <Button variant={pipelineType === 'player' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('player'); setActiveTab('entries'); }}>
            <Users className="h-4 w-4 mr-2" /> Players
          </Button>
          <Button variant={pipelineType === 'team' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('team'); setActiveTab('entries'); }}>
            <Target className="h-4 w-4 mr-2" /> Squads
          </Button>
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl border-2 flex items-center shadow-sm w-fit">
        <Button variant={activeTab === 'entries' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('entries')}>Recruit Ledger</Button>
        <Button variant={activeTab === 'config' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('config')}>Protocol Architect</Button>
      </div>

      {activeTab === 'entries' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary">{pipelineType === 'player' ? <Users className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">{pipelineType === 'player' ? 'Roster Pool' : 'Squad Pool'}</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{(entries || []).length} Verified Applicants</p></div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
                {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                  <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
                ))}
              </div>
              
              {pipelineType === 'team' && (
                <Dialog open={isManualAddOpen} onOpenChange={setIsManualAddOpen}>
                  <DialogTrigger asChild><Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-xl shadow-primary/20"><Plus className="h-4 w-4 mr-2" /> Enroll Squad</Button></DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-md bg-white text-foreground">
                    <div className="h-2 bg-primary w-full" /><div className="p-8 lg:p-10 space-y-8">
                      <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Manual Enrollment</DialogTitle></DialogHeader>
                      <div className="space-y-5">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Team Name</Label><Input placeholder="e.g. Metro Tigers" value={manualForm.teamName} onChange={e => setManualForm({...manualForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Coach Name</Label><Input placeholder="John Smith" value={manualForm.coachName} onChange={e => setManualForm({...manualForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Contact Email</Label><Input type="email" placeholder="coach@team.com" value={manualForm.email} onChange={e => setManualForm({...manualForm, email: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
                      </div>
                      <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleManualAdd} disabled={isManualProcessing || !manualForm.teamName}>{isManualProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Authorize & Inject"}</Button></DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {isEntriesLoading ? (
                  <div className="py-32 text-center flex flex-col items-center gap-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-[0.3em]">Synchronizing Recruit Pool...</p></div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr><th className="px-10 py-6">Applicant</th><th className="px-4 py-6 text-center">Status</th><th className="px-10 py-6 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-muted/50">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border-2 bg-white shadow-sm transition-transform group-hover:scale-110">
                                {pipelineType === 'player' ? <UserCheck className="h-6 w-6 text-primary" /> : <ShieldCheck className="h-6 w-6 text-primary" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-sm uppercase truncate text-foreground">{entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || 'Untitled Entry'}</p>
                                <p className="text-[10px] font-bold text-muted-foreground truncate uppercase">{entry.answers?.email || 'No Email'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center">
                            <Badge className={cn(
                              "border-none font-black text-[8px] uppercase px-3 h-6 shadow-sm",
                              entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'assigned' ? "bg-primary text-white" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                            )}>{entry.status}</Badge>
                          </td>
                          <td className="px-10 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Dialog>
                                <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border-2 bg-white hover:bg-primary hover:text-white transition-all"><UserPlus className="h-5 w-5" /></Button></DialogTrigger>
                                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden max-w-2xl bg-white text-foreground">
                                  <div className="h-2 bg-primary w-full" /><div className="p-8 lg:p-10 space-y-8">
                                    <DialogHeader><DialogTitle className="text-3xl font-black uppercase">Recruit Intelligence</DialogTitle></DialogHeader>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                      <div className="space-y-6">
                                        <p className="text-[10px] font-black uppercase text-primary tracking-[0.2em] px-1">Institutional Audit</p>
                                        <ScrollArea className="h-[300px] border-2 rounded-[2rem] p-6 bg-muted/10 shadow-inner">
                                          <div className="space-y-6">
                                            {Object.entries(entry.answers || {}).map(([key, val]) => (
                                              <div key={key} className="space-y-1.5"><p className="text-[8px] font-black uppercase opacity-40">{key.replace(/_/g, ' ')}</p><p className="text-sm font-bold leading-relaxed">{val?.toString() || '--'}</p></div>
                                            ))}
                                          </div>
                                        </ScrollArea>
                                      </div>
                                      <div className="space-y-8">
                                        <div className="space-y-3">
                                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Assign to Operational Unit</Label>
                                          <Select value={entry.assigned_team_id || 'unassigned'} onValueChange={(tid) => assignEntryToTeam(leagueId as string, entry.id, tid === 'unassigned' ? null : tid)}>
                                            <SelectTrigger className="h-14 rounded-2xl border-2 font-black shadow-inner"><SelectValue placeholder="Select team..." /></SelectTrigger>
                                            <SelectContent className="rounded-2xl border-2">
                                              <SelectItem value="unassigned" className="font-bold uppercase text-[10px]">Unassigned Pool</SelectItem>
                                              {activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).map(id => (<SelectItem key={id} value={id} className="font-bold uppercase text-[10px]">Squad {id.slice(-6)}</SelectItem>))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="bg-primary/5 p-6 rounded-[2rem] border-2 border-dashed border-primary/20 space-y-4"><div className="flex items-center gap-3"><Zap className="h-5 w-5 text-primary" /><p className="text-[10px] font-black uppercase text-primary tracking-widest">Command Note</p></div><p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">Assignments alert the squad's coach for final roster verification and fee collection. This action is recorded in the master ledger.</p></div>
                                      </div>
                                    </div>
                                    <DialogFooter className="pt-4"><DialogClose asChild><Button variant="outline" className="w-full h-14 rounded-xl border-2 font-black uppercase text-xs">Close Intelligence Report</Button></DialogClose></DialogFooter>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEntries.length === 0 && !isEntriesLoading && (
                        <tr><td colSpan={3} className="py-32 text-center opacity-20 flex flex-col items-center gap-4"><History className="h-16 w-16 mx-auto" /><p className="text-sm font-black uppercase tracking-[0.3em]">Sector Ledger Clear</p></td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-700">
          <div className="lg:col-span-2 space-y-8">
            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-primary/5 border-b p-8 lg:p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-primary p-4 rounded-3xl text-white shadow-xl shadow-primary/20"><Globe className="h-8 w-8" /></div>
                  <div><CardTitle className="text-3xl font-black uppercase tracking-tight">{localConfig?.title || 'Pipeline Protocol'}</CardTitle><CardDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Institutional Blueprint v{localConfig?.form_version || 1}</CardDescription></div>
                </div>
                <Switch checked={localConfig?.is_active || false} onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} className="data-[state=checked]:bg-primary" />
              </CardHeader>
              <CardContent className="p-8 lg:p-10 space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Headline</Label><Input value={localConfig?.title || ''} onChange={e => handleUpdateConfig({ title: e.target.value })} className="h-14 rounded-2xl border-2 font-black text-lg shadow-inner" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enrollment Fee ($)</Label><Input type="number" value={localConfig?.registration_cost || '0'} onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} className="h-14 rounded-2xl font-black border-2 text-xl shadow-inner text-primary" /></div>
                </div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Brief</Label><Textarea value={localConfig?.description || ''} onChange={e => handleUpdateConfig({ description: e.target.value })} className="rounded-3xl min-h-[150px] border-2 font-medium p-6 bg-muted/10 focus:bg-white transition-all resize-none shadow-inner" placeholder="Define the recruitment scope..." /></div>
              </CardContent>
            </Card>

            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-8 lg:p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-primary p-3 rounded-2xl text-white shadow-lg"><Users className="h-6 w-6" /></div><div><CardTitle className="text-2xl font-black uppercase tracking-tight">Form Architect</CardTitle></div></div>
                <Dialog>
                  <DialogTrigger asChild><Button variant="secondary" className="rounded-full h-11 px-6 font-black uppercase text-[10px]"><Plus className="h-4 w-4 mr-2" /> Add Data Point</Button></DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-8 max-w-sm bg-white text-foreground">
                    <DialogHeader className="mb-6"><DialogTitle className="text-2xl font-black uppercase">New Data Point</DialogTitle></DialogHeader>
                    <div className="space-y-6 py-2">
                      <div className="space-y-2"><Label className="text-[10px] uppercase font-black ml-1">Field Headline</Label><Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl border-2 font-bold" /></div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Input Mechanism</Label>
                        <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select type..." /></SelectTrigger>
                          <SelectContent className="rounded-xl border-2">
                            <SelectItem value="short_text" className="font-bold text-[10px] uppercase">Short Text</SelectItem>
                            <SelectItem value="long_text" className="font-bold text-[10px] uppercase">Long Narrative</SelectItem>
                            <SelectItem value="dropdown" className="font-bold text-[10px] uppercase">Options Matrix</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter className="pt-4"><Button className="w-full h-14 rounded-2xl font-black shadow-xl shadow-primary/20" onClick={handleAddField} disabled={!editingField?.label}>Inject Spec</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {formSchema.map((field, i) => (
                  <div key={field.id} className="p-8 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-6"><div className="text-[10px] font-black text-muted-foreground w-8 opacity-40 text-center">{i + 1}</div><div className="space-y-1"><p className="font-black text-base uppercase tracking-tight">{field.label}</p><Badge variant="outline" className="text-[8px] font-black uppercase">{field.type.replace('_', ' ')}</Badge></div></div>
                    {i > 1 && (<Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleUpdateConfig({ form_schema: formSchema.filter(f => f.id !== field.id) }, true)}><Trash2 className="h-5 w-5" /></Button>)}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><Share2 className="h-48 w-48" /></div>
              <CardContent className="p-8 lg:p-10 space-y-8 relative z-10">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Public Deployment</Badge>
                <h3 className="text-3xl font-black tracking-tighter uppercase leading-[0.9]">Recruitment Portal</h3>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <p className="text-xs font-mono font-bold truncate opacity-80">/register/league/{leagueId}</p>
                  <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-xs shadow-xl" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${leagueId}?protocol=${configId}`); toast({ title: "Link Copied" }); }}>Copy Deployment Link</Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}