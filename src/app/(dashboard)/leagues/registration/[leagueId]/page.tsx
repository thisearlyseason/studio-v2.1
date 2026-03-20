"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, orderBy, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
  FileSignature, 
  Share2, 
  Copy, 
  AlertTriangle, 
  LayoutGrid, 
  UserPlus, 
  MessageSquare, 
  DollarSign, 
  CreditCard,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  UserCheck,
  GraduationCap,
  History,
  Info,
  ArrowRight
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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
  
  // TACTICAL MEMO: We use explicit identity resolution to prevent 403 ghost queries.
  const configRef = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    return doc(db, 'leagues', leagueId as string, 'registration', configId);
  }, [db, leagueId, configId, isAuthResolved]);

  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => {
    if (!db || !leagueId || !isAuthResolved) return null;
    // We use a flat query structure to satisfy Firestore List Proving
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
  }, [config, configId]);

  const canRegister = hasFeature('league_registration') || (activeTeam?.isPro && isStaff);

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

  if (!canRegister) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-8 rounded-[3rem] shadow-2xl">
            <ClipboardList className="h-20 w-20 text-primary" />
          </div>
          <div className="absolute -top-3 -right-3 bg-black text-white p-2.5 rounded-full shadow-lg border-4 border-background">
            <Lock className="h-5 w-5" />
          </div>
        </div>
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-black uppercase tracking-tight text-foreground">Registration Hub Locked</h1>
          <p className="text-muted-foreground font-bold leading-relaxed text-lg uppercase tracking-wide">
            Automated enrollment pipelines are reserved for <strong>Elite Pro</strong> squads.
          </p>
        </div>
        <Button className="h-14 px-10 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>Unlock Recruitment Hub</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leagues')} className="rounded-full h-10 w-10 text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1">
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3">Recruitment Engine</Badge>
            <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">Institutional Pipeline</h1>
          </div>
        </div>
        
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 shadow-inner">
          <Button variant={pipelineType === 'player' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('player'); setActiveTab('entries'); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Player Pool
          </Button>
          <Button variant={pipelineType === 'team' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => { setPipelineType('team'); setActiveTab('entries'); }}>
            <Target className="h-4 w-4 mr-2" /> Team Pool
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
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                {pipelineType === 'player' ? <Users className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{pipelineType === 'player' ? 'Roster Pool' : 'Squad Pool'}</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase">{(entries || []).length} Verified Applicants</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
                {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                  <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
                ))}
              </div>
              
              {pipelineType === 'team' && (
                <Dialog open={isManualAddOpen} onOpenChange={setIsManualAddOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
                      <Plus className="h-4 w-4 mr-2" /> Enroll Squad
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-md bg-white text-foreground">
                    <div className="h-2 bg-primary w-full" />
                    <div className="p-8 lg:p-10 space-y-8">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Manual Enrollment</DialogTitle>
                        <DialogDescription className="font-bold text-primary uppercase text-[10px]">Direct Standing Injection</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Team Name</Label>
                          <Input placeholder="e.g. Metro Tigers" value={manualForm.teamName} onChange={e => setManualForm({...manualForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Coach Name</Label>
                          <Input placeholder="John Smith" value={manualForm.coachName} onChange={e => setManualForm({...manualForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Contact Email</Label>
                          <Input type="email" placeholder="coach@team.com" value={manualForm.email} onChange={e => setManualForm({...manualForm, email: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleManualAdd} disabled={isManualProcessing || !manualForm.teamName}>
                          {isManualProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Authorize & Inject"}
                        </Button>
                      </DialogFooter>
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
                  <div className="py-20 text-center animate-pulse flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Synchronizing Recruit Pool...</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr>
                        <th className="px-8 py-5">Applicant Details</th>
                        {pipelineType === 'player' && <th className="px-4 py-5">Tactical Specs</th>}
                        <th className="px-4 py-5 text-center">Status</th>
                        <th className="px-8 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted/50">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border bg-white shadow-sm">
                                {pipelineType === 'player' ? <UserCheck className="h-5 w-5 text-primary" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-sm uppercase tracking-tight truncate text-foreground">
                                  {entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || 'Untitled Entry'}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground truncate">{entry.answers?.email || 'No Email'}</p>
                              </div>
                            </div>
                          </td>
                          {pipelineType === 'player' && (
                            <td className="px-4 py-6">
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge variant="outline" className="text-[7px] font-black uppercase border-primary/20 text-primary">{entry.answers?.age_grade || 'N/A'}</Badge>
                                  <Badge variant="outline" className="text-[7px] font-black uppercase">{entry.answers?.position || 'Player'}</Badge>
                                </div>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase">Prev: {entry.answers?.last_team || 'None'}</p>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-6 text-center">
                            <Badge className={cn(
                              "border-none font-black text-[8px] uppercase px-2 h-5",
                              entry.status === 'pending' ? "bg-amber-100 text-amber-700" : 
                              entry.status === 'assigned' ? "bg-primary text-white" : 
                              entry.status === 'accepted' ? "bg-green-100 text-green-700" : 
                              "bg-muted text-muted-foreground"
                            )}>
                              {entry.status}
                            </Badge>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border hover:bg-primary hover:text-white transition-all">
                                    <UserPlus className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="rounded-3xl border-none shadow-2xl p-8 max-w-2xl bg-white text-foreground">
                                  <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Recruit Intelligence</DialogTitle></DialogHeader>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                                    <div className="space-y-4">
                                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Detailed Specs</p>
                                      <ScrollArea className="h-[300px] pr-4 border-2 rounded-2xl p-4 bg-muted/10 text-foreground">
                                        <div className="space-y-4">
                                          {Object.entries(entry.answers || {}).map(([key, val]) => (
                                            <div key={key} className="space-y-1">
                                              <p className="text-[8px] font-black uppercase opacity-40">{key.replace(/_/g, ' ')}</p>
                                              <p className="text-sm font-bold">{val?.toString()}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </ScrollArea>
                                    </div>
                                    <div className="space-y-6">
                                      <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Dispatch to Squad</Label>
                                        <Select 
                                          value={entry.assigned_team_id || 'unassigned'} 
                                          onValueChange={(tid) => assignEntryToTeam(leagueId as string, entry.id, tid === 'unassigned' ? null : tid)}
                                        >
                                          <SelectTrigger className="h-14 rounded-xl border-2 font-black text-foreground">
                                            <SelectValue placeholder="Select team..." />
                                          </SelectTrigger>
                                          <SelectContent className="rounded-xl text-foreground">
                                            <SelectItem value="unassigned">Unassigned Pool</SelectItem>
                                            {activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).map(id => (
                                              <SelectItem key={id} value={id}>Squad {id.slice(-6)}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 space-y-3">
                                        <p className="text-[10px] font-black uppercase text-primary">Strategic Dispatch</p>
                                        <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                                          Assignments alert the squad's coach for final roster verification and fee collection.
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/5"
                                onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEntries.length === 0 && !isEntriesLoading && (
                        <tr>
                          <td colSpan={pipelineType === 'player' ? 4 : 3} className="py-20 text-center opacity-30 italic text-xs uppercase font-black text-foreground">
                            No active applicants in this sector.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8 text-foreground">
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-primary/5 border-b p-8 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-primary p-3 rounded-2xl text-white shadow-lg"><Globe className="h-6 w-6" /></div>
                  <div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">{localConfig?.title || 'Pipeline Protocol'}</CardTitle>
                    <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Protocol Version {localConfig?.form_version || 1}</CardDescription>
                  </div>
                </div>
                <Switch checked={localConfig?.is_active || false} onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} />
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Title</Label>
                    <Input value={localConfig?.title || ''} onChange={e => handleUpdateConfig({ title: e.target.value })} className="h-12 rounded-xl border-2 font-bold focus:border-primary/20" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enrollment Fee ($)</Label>
                    <Input type="number" value={localConfig?.registration_cost || '0'} onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} className="h-12 rounded-xl font-black border-2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Brief</Label>
                  <Textarea value={localConfig?.description || ''} onChange={e => handleUpdateConfig({ description: e.target.value })} className="rounded-xl min-h-[100px] border-2 font-medium" placeholder="Define the recruitment scope..." />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-8 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-primary p-3 rounded-2xl text-white shadow-lg"><LayoutGrid className="h-6 w-6" /></div>
                  <div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">Form Architect</CardTitle>
                    <CardDescription className="font-bold text-white/60 text-[10px] uppercase tracking-widest">Data Structure Protocols</CardDescription>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="rounded-full h-10 px-6 font-black uppercase text-[10px]"><Plus className="h-4 w-4 mr-2" /> Add Spec</Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl border-none shadow-2xl p-8 bg-white text-foreground">
                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">New Data Spec</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label className="text-[10px] uppercase font-black ml-1">Field Label</Label><Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl border-2 font-bold" /></div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Input Protocol</Label>
                        <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold text-foreground"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl text-foreground">
                            <SelectItem value="short_text" className="font-bold">Short Text</SelectItem>
                            <SelectItem value="long_text" className="font-bold">Long Text</SelectItem>
                            <SelectItem value="dropdown" className="font-bold">Dropdown</SelectItem>
                            <SelectItem value="header" className="font-bold">Section Header</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl shadow-primary/20" onClick={handleAddField}>Inject into Protocol</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {formSchema.map((field, i) => (
                  <div key={field.id} className="p-6 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="text-[10px] font-black text-muted-foreground w-6 opacity-40">{i + 1}</div>
                      <div>
                        <p className="font-black text-sm uppercase">{field.label}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60 tracking-widest">{field.type.replace('_', ' ')}</p>
                      </div>
                    </div>
                    {i > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: formSchema.filter(f => f.id !== field.id) }, true)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white overflow-hidden group">
              <CardContent className="p-8 space-y-6">
                <div className="bg-white/20 p-4 rounded-2xl w-fit group-hover:scale-110 transition-transform"><Share2 className="h-8 w-8 text-white" /></div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight uppercase leading-none">Public Endpoint</h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">Live Recruitment Portal</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 text-center">
                  <p className="text-[8px] font-black uppercase opacity-60 mb-1">Authenticated URL</p>
                  <p className="text-[10px] font-bold truncate">/register/league/{leagueId}?protocol={configId}</p>
                </div>
                <Button 
                  className="w-full h-14 rounded-2xl bg-white text-primary font-black uppercase text-xs shadow-xl active:scale-95 transition-all hover:bg-white/90"
                  onClick={() => {
                    const url = `${window.location.origin}/register/league/${leagueId}?protocol=${configId}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Portal Link Copied" });
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy Portal Link
                </Button>
              </CardContent>
            </Card>

            <div className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed border-muted-foreground/20 space-y-4">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Operational Memo</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                All applicants are stored in the recruitment pool until assigned to a participating squad by an authorized coordinator.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
