"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField, TeamEvent, TeamDocument } from '@/components/providers/team-provider';
import { useAuth, useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, orderBy, where, setDoc, updateDoc, getDocs, addDoc } from 'firebase/firestore';
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
  Trophy,
  Target,
  FileSignature,
  Info,
  FilePlus2,
  Layers
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
import { authHeader, getAuthToken } from '@/lib/client-auth';

// CRITICAL BUILD FIX: Prevent static generation failures for dynamic enrollment routes
export const dynamic = 'force-dynamic';

const BASE_REGISTRATION_ANSWER_LABELS: Record<string, string> = {
  teamName: 'Official Team Name',
  teamOrigin: 'Origin Organization / City',
  experience: 'Team Competitive Experience',
  name: 'Head Coach Full Name',
  email: 'Direct Email',
  phone: 'Cell Phone Number',
};

export default function TournamentRegistrationAdminPage() {
  const { teamId, eventId } = useParams();
  const router = useRouter();
  const { isAuthResolved } = useUser();
  const auth = useAuth();
  const { submitRegistrationEntry } = useTeam();
  const db = useFirestore();

  // --- STATE ---
  const searchParams = useSearchParams();
  const returnPath = searchParams.get('from') === 'competition' ? '/competition' : '/manage-tournaments';
  const [activeTab, setActiveTab] = useState<'entries' | 'config'>('entries');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'accepted'>('all');
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ teamName: '', coachName: '', email: '' });
  const [isManualProcessing, setIsManualProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [isGeneratingRegistrationCode, setIsGeneratingRegistrationCode] = useState(false);
  // Multi-form state
  const [formsListMode, setFormsListMode] = useState(true); // start on forms list
  const [allForms, setAllForms] = useState<{ id: string; title: string; is_active: boolean; form_version?: number }[]>([]);
  const [isCreatingForm, setIsCreatingForm] = useState(false);
  const [newFormName, setNewFormName] = useState('');

  // configId driven by URL param — defaults to 'team_config'
  const configId = searchParams?.get('protocol') || 'team_config';
  const setConfigId = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('protocol', id);
    router.replace(url.pathname + url.search);
  };

  // Division field — always prepended, non-removable system field
  const DIVISION_FIELD: RegistrationFormField = {
    id: 'f_sys_division',
    label: 'Division',
    type: 'dropdown',
    required: false,
    step: 'identity',
    options: ['Unassigned'],
  } as any;

  // Fetch all forms in the registration subcollection
  useEffect(() => {
    if (!db || !teamId || !eventId || !isAuthResolved) return;
    const registrationCol = collection(db, 'teams', teamId as string, 'events', eventId as string, 'registration');
    getDocs(registrationCol).then(snap => {
      const forms = snap.docs.map(d => ({
        id: d.id,
        title: (d.data() as any).title || d.id,
        is_active: (d.data() as any).is_active || false,
        form_version: (d.data() as any).form_version || 1,
      }));
      // Ensure team_config always exists in the list
      if (!forms.find(f => f.id === 'team_config')) {
        forms.unshift({ id: 'team_config', title: 'Default Registration Form', is_active: false, form_version: 1 });
      }
      setAllForms(forms);
    });
  }, [db, teamId, eventId, isAuthResolved, configId, isSaving]);

  const handleCreateForm = async () => {
    if (!newFormName.trim() || !db || !teamId || !eventId) return;
    const slug = newFormName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const newId = `form_${slug}_${Date.now().toString(36)}`;
    const newForm: Partial<LeagueRegistrationConfig> = {
      id: newId,
      type: 'team',
      title: newFormName.trim(),
      is_active: false,
      form_schema: [DIVISION_FIELD],
      form_version: 1,
    };
    await setDoc(doc(db, 'teams', teamId as string, 'events', eventId as string, 'registration', newId), newForm);
    setNewFormName('');
    setIsCreatingForm(false);
    setConfigId(newId);
    setFormsListMode(false);
    toast({ title: 'Form Created', description: `"${newFormName}" form is ready to configure.` });
  };

  // --- SYNC ---
  
  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId || !isAuthResolved) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId, isAuthResolved]);
  const { data: event, isLoading: isEventLoading } = useDoc<TeamEvent>(eventRef);

  const generateRegistrationCode = async () => {
    if (!teamId || !eventId) return;
    setIsGeneratingRegistrationCode(true);
    try {
      const token = await getAuthToken(auth);
      const response = await fetch('/api/teams/events/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          action: 'update',
          teamId,
          eventId,
          event: { registrationCode: crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase() },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to generate a tournament code.');
      toast({ title: 'Tournament Code Generated' });
    } catch (error) {
      toast({ title: 'Code Generation Failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingRegistrationCode(false);
    }
  };

  const configRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId || !isAuthResolved) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string, 'registration', configId);
  }, [db, teamId, eventId, configId, isAuthResolved]);

  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => {
    if (!db || !teamId || !eventId || !isAuthResolved) return null;
    return query(collection(db, 'teams', teamId as string, 'events', eventId as string, 'registrationEntries'), orderBy('created_at', 'desc'));
  }, [db, teamId, eventId, isAuthResolved]);

  const { data: rawEntries, isLoading: isEntriesLoading } = useCollection<RegistrationEntry>(entriesQuery);

  // Tournament membership is authoritative on the event roster. Registration
  // responses describe intake only and must never be used as the team total.
  const tournamentTeamCount = event?.tournamentTeamsData?.length || 0;

  const legacyEntriesQuery = useMemoFirebase(() => {
    if (!db || !teamId || !eventId || !isAuthResolved) return null;
    return query(collection(db, 'teams', teamId as string, 'registrationEntries'), where('event_id', '==', eventId as string));
  }, [db, teamId, eventId, isAuthResolved]);
  const { data: legacyEntries, isLoading: legacyEntriesLoading } = useCollection<RegistrationEntry>(legacyEntriesQuery);
  const legacyEntryIds = useMemo(() => new Set((legacyEntries || []).map(entry => entry.id)), [legacyEntries]);

  const filteredEntries = useMemo(() => {
    const merged = new Map((legacyEntries || []).map(entry => [entry.id, entry]));
    for (const entry of rawEntries || []) merged.set(entry.id, entry);
    return Array.from(merged.values()).filter(e => {
      const matchesStatus = filterStatus === 'all' || e.status === filterStatus;
      return matchesStatus;
    });
  }, [rawEntries, legacyEntries, filterStatus]);

  const registrationEntryRef = (entryId: string) => legacyEntryIds.has(entryId)
    ? doc(db, 'teams', teamId as string, 'registrationEntries', entryId)
    : doc(db, 'teams', teamId as string, 'events', eventId as string, 'registrationEntries', entryId);

  const getAnswerLabel = (key: string) => {
    const schemaField = (localConfig?.form_schema || config?.form_schema || []).find(field => field.id === key);
    if (schemaField?.label) return schemaField.label;
    if (BASE_REGISTRATION_ANSWER_LABELS[key]) return BASE_REGISTRATION_ANSWER_LABELS[key];
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  };

  const deleteRegistrationEntry = (entry: RegistrationEntry) => {
    const teamName = entry.answers?.teamName || entry.answers?.name || 'this team';
    if (!window.confirm(`Delete the registration for ${teamName}? This cannot be undone.`)) return;
    deleteDocumentNonBlocking(registrationEntryRef(entry.id));
  };

  const [localConfig, setLocalConfig] = useState<Partial<LeagueRegistrationConfig> | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- TEAM WAIVERS FETCHING ---
  const teamWaiversQuery = useMemo(() => {
    if (!db || !teamId) return null;
    return query(collection(db, 'teams', teamId as string, 'documents'), where('isActive', '==', true));
  }, [db, teamId]);
  const { data: teamWaiversData } = useCollection<TeamDocument>(teamWaiversQuery);
  const teamWaivers = useMemo(() => (teamWaiversData || []).filter(d => d.type === 'waiver'), [teamWaiversData]);

  useEffect(() => {
    // Don't overwrite optimistic local state while a save is in flight
    if (isSaving) return;
    if (config) {
      // Ensure Division field is always first in the schema
      const existing = config.form_schema || [];
      const hasDivision = existing.some(f => f.id === 'f_sys_division');
      if (!hasDivision) {
        setLocalConfig({ ...config, form_schema: [DIVISION_FIELD, ...existing] });
      } else {
        setLocalConfig(config);
      }
    } else if (!isConfigLoading) {
      // Init default if missing
      setLocalConfig({
        id: configId,
        type: 'team',
        title: event?.title ? `${event.title} Registration` : 'Tournament Registration',
        description: event?.description || '',
        is_active: false,
        form_schema: [DIVISION_FIELD],
        form_version: 1
      });
    }
  }, [config, isConfigLoading, event, isSaving]);

  const handleUpdateConfig = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!teamId || !eventId || !configRef) return;
    const base = localConfig || config || { id: configId, type: 'team', title: '', is_active: false, form_schema: [], form_version: 1 };
    const updated = { ...base, ...updates } as LeagueRegistrationConfig;
    setHasSaved(false);

    // If team waivers are being selected, fetch their content
    if (updates.selected_team_waivers) {
      const selectedIds = updates.selected_team_waivers;
      const contents = selectedIds.map(id => {
        const w = teamWaivers.find(tw => tw.id === id);
        return w ? { id: w.id, title: w.title, content: w.content } : null;
      }).filter(Boolean) as { id: string; title: string; content: string }[];
      updated.team_waivers_content = contents;
    }

    setLocalConfig(updated);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    
    const performSync = async () => {
      if (!configRef) {
        toast({ title: 'Auth Not Ready', description: 'Please wait and try again.', variant: 'destructive' });
        return;
      }
      setIsSaving(true);
      try {
        await setDoc(configRef, updated, { merge: true });
        if (eventRef) {
          const waiverDocuments = updated.team_waivers_content || [];
          await updateDoc(eventRef, {
            waiverIds: updated.selected_team_waivers || [],
            waiverDocuments,
            teamWaiverText: waiverDocuments.map(waiver => `${waiver.title}\n\n${waiver.content}`).join('\n\n'),
          });
        }
        // Sync cost to the event doc for top-level reads
        if (updates.registration_cost !== undefined && eventRef) {
          await updateDoc(eventRef, { registration_cost: updates.registration_cost });
        }
        // Scorekeeper credentials belong to the event itself, not the registration form.
        // Keeping this write here makes the builder and public scorekeeper portal agree.
        if ((updates as any).scoringCode !== undefined && eventRef) {
          const scoringCode = String((updates as any).scoringCode).trim();
          if (scoringCode.length > 0 && scoringCode.length < 4) {
            throw new Error('Scorekeeper code must be at least 4 characters.');
          }
          await updateDoc(eventRef, { scoringCode });
        }
        // Confirm activation/deactivation explicitly
        if (updates.is_active !== undefined) {
          toast({
            title: updates.is_active ? '✓ Form Activated' : 'Form Deactivated',
            description: updates.is_active
              ? 'The registration form is now live.'
              : 'Registration is now closed.',
          });
        }
        setHasSaved(true);
      } catch (err: any) {
        // Revert the optimistic update so UI matches actual Firestore state
        setLocalConfig(config || null);
        toast({
          title: 'Save Failed',
          description: err?.message || 'Could not sync to server. Please retry.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    };
    
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
    if (!manualForm.teamName || !manualForm.coachName || !manualForm.email || !teamId || !eventId) return;
    setIsManualProcessing(true);
    try {
      await submitRegistrationEntry(teamId as string, 'team_config', { teamName: manualForm.teamName, name: manualForm.coachName, email: manualForm.email, manual_enrollment: true }, 0, 'Manual Enrollment', 'teams', eventId as string);
      setIsManualAddOpen(false);
      setManualForm({ teamName: '', coachName: '', email: '' });
      toast({ title: "Team Added" });
    } finally { setIsManualProcessing(false); }
  };

  if (isConfigLoading || isEventLoading) return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-6 animate-pulse">
      <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground">Loading registration forms...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => formsListMode ? router.push(returnPath) : setFormsListMode(true)} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-orange-600 text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg">Tournament Registration</Badge>
            <h1 className="text-3xl font-black uppercase tracking-tight mt-1">
              {formsListMode ? (event?.title || 'Tournament') : (localConfig?.title || 'Form Builder')}
            </h1>
            {!formsListMode && <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Form Builder — {event?.title}</p>}
          </div>
        </div>
        {!formsListMode && (
          <div className="flex items-center gap-3">
            <Badge className="bg-muted border font-black uppercase text-[9px] h-8 px-4">{localConfig?.is_active ? '● Live' : '○ Draft'}</Badge>
            <Button variant="outline" className="h-10 px-5 rounded-xl font-black uppercase text-[9px]" onClick={() => {
              const url = `${window.location.origin}/register/tournament/${teamId}/${eventId}?protocol=${configId}`;
              navigator.clipboard.writeText(url);
              toast({ title: 'Registration Link Copied' });
            }}><Share2 className="h-4 w-4 mr-2" /> Copy Registration Link</Button>
          </div>
        )}
      </div>

      {/* ─── FORMS LIST MODE ───────────────────────────── */}
      {formsListMode ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Registration Forms</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Select a form to edit or create a new one</p>
            </div>
            <Button onClick={() => setIsCreatingForm(true)} className="h-11 px-6 rounded-2xl font-black uppercase text-[10px] shadow-xl flex items-center gap-2">
              <FilePlus2 className="h-4 w-4" /> New Form
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allForms.map(form => (
              <button
                key={form.id}
                onClick={() => { setConfigId(form.id); setFormsListMode(false); setActiveTab('entries'); }}
                className="text-left p-6 rounded-[2rem] border-2 bg-white shadow-sm hover:border-primary hover:shadow-lg transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Layers className="h-5 w-5" /></div>
                  <Badge className={form.is_active ? 'bg-green-100 text-green-700 border-none font-black text-[8px] uppercase' : 'bg-muted text-muted-foreground border-none font-black text-[8px] uppercase'}>
                    {form.is_active ? 'Live' : 'Draft'}
                  </Badge>
                </div>
                <h3 className="font-black text-lg uppercase tracking-tight mt-4 group-hover:text-primary transition-colors">{form.title}</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Form version {form.form_version || 1}</p>
              </button>
            ))}
            <button
              onClick={() => setIsCreatingForm(true)}
              className="text-left p-6 rounded-[2rem] border-2 border-dashed bg-muted/5 hover:bg-muted/10 transition-all flex flex-col items-center justify-center gap-3 min-h-[140px]"
            >
              <FilePlus2 className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Create New Form</span>
            </button>
          </div>

          {/* Create Form Dialog */}
          <Dialog open={isCreatingForm} onOpenChange={setIsCreatingForm}>
            <DialogContent className="rounded-[2.5rem] sm:max-w-sm p-0 overflow-hidden border-none shadow-2xl bg-white">
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase">New Registration Form</DialogTitle>
                  <DialogDescription className="sr-only">Name a new registration form for this tournament.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Form Name</Label>
                  <Input
                    placeholder="e.g. Division A Registration"
                    value={newFormName}
                    onChange={e => setNewFormName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateForm()}
                    className="h-12 rounded-xl border-2 font-bold"
                    autoFocus
                  />
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">A Division field is automatically added to every form.</p>
                </div>
                <DialogFooter><Button className="w-full h-12 rounded-2xl font-black" onClick={handleCreateForm} disabled={!newFormName.trim()}>Create Form</Button></DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
      <>

      <div className="bg-white p-1.5 rounded-2xl border-2 flex items-center shadow-sm w-fit">
        <Button variant={activeTab === 'entries' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('entries')}>Responses</Button>
        <Button variant={activeTab === 'config' ? 'secondary' : 'ghost'} className="rounded-xl h-9 px-6 font-black uppercase text-[9px]" onClick={() => setActiveTab('config')}>Form Builder</Button>
      </div>

      {activeTab === 'entries' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-2.5 rounded-xl text-orange-600"><Target className="h-5 w-5" /></div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Tournament Teams</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase">{tournamentTeamCount} enrolled teams • {filteredEntries.length} matching form responses</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
                {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                  <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
                ))}
              </div>
              <Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-xl" onClick={() => setIsManualAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Team</Button>
            </div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {isEntriesLoading || legacyEntriesLoading ? (
                  <div className="py-32 text-center flex flex-col items-center gap-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-[0.3em]">Synchronizing...</p></div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-10 py-6">Applicant</th><th className="px-4 py-6 text-center">Status</th><th className="px-10 py-6 text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-muted/50">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border-2 bg-white shadow-sm"><ShieldCheck className="h-6 w-6 text-primary" /></div>
                              <div className="min-w-0"><p className="font-black text-sm uppercase truncate">{entry.answers?.teamName || entry.answers?.name || 'Untitled Team'}</p><p className="text-[10px] font-bold text-muted-foreground truncate uppercase">{entry.answers?.email || 'No Email'}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center"><Badge className={cn("border-none font-black text-[8px] uppercase px-3 h-6", entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'assigned' ? "bg-primary text-white" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted")}>{entry.status}</Badge></td>
                          <td className="px-10 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                              <Dialog>
                                <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`View registration for ${entry.answers?.teamName || entry.answers?.name || 'team'}`} className="h-10 w-10 rounded-xl border-2 bg-white hover:bg-primary hover:text-white"><Terminal className="h-5 w-5" /></Button></DialogTrigger>
                                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden max-w-sm">
                                  <div className="h-2 bg-primary w-full" />
                                  <div className="p-8 lg:p-10 space-y-6">
                                    <DialogHeader>
                                      <DialogTitle className="text-2xl font-black uppercase tracking-tight">Response Details</DialogTitle>
                                      <DialogDescription className="sr-only">Review the submitted team registration and update its status.</DialogDescription>
                                    </DialogHeader>
                                    <ScrollArea className="h-[300px] border-2 rounded-2xl p-4 bg-muted/5">
                                      <div className="space-y-4">{Object.entries(entry.answers || {}).map(([key, val]) => (<div key={key} className="space-y-1"><p className="text-[8px] font-black uppercase opacity-40">{getAnswerLabel(key)}</p><p className="text-xs font-bold leading-relaxed">{Array.isArray(val) ? val.join(', ') : val?.toString() || '--'}</p></div>))}</div>
                                    </ScrollArea>
                                    <div className="flex flex-col gap-2">
                                       <Button className="h-12 rounded-xl font-black uppercase text-[10px]" onClick={() => updateDoc(registrationEntryRef(entry.id), { status: 'accepted' })}>Accept Registration</Button>
                                       <Button variant="outline" className="h-12 rounded-xl font-black uppercase text-[10px]" onClick={() => updateDoc(registrationEntryRef(entry.id), { status: 'pending' })}>Revert to Pending</Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="icon" aria-label={`Delete registration for ${entry.answers?.teamName || entry.answers?.name || 'team'}`} className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteRegistrationEntry(entry)}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEntries.length === 0 && !isEntriesLoading && !legacyEntriesLoading && (
                        <tr><td colSpan={3} className="py-32 text-center opacity-20"><History className="h-16 w-16 mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-[0.3em]">No responses yet</p></td></tr>
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
          <div className="lg:col-span-2 space-y-8">
            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-primary/5 border-b p-8 lg:p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-primary p-4 rounded-3xl text-white shadow-xl"><Globe className="h-8 w-8" /></div><div><CardTitle className="text-3xl font-black uppercase tracking-tight">{localConfig?.title || 'Tournament Registration'}</CardTitle><CardDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Form version {localConfig?.form_version || 1}</CardDescription></div></div>
                <div className="flex items-center gap-3">
                  {isSaving && <span className="text-[9px] font-black uppercase text-muted-foreground flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Saving</span>}
                  {!isSaving && hasSaved && <span className="text-[9px] font-black uppercase text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
                  <Switch 
                    checked={localConfig?.is_active || false} 
                    onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} 
                    disabled={isSaving}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-8 lg:p-10 space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Form Title</Label><Input value={localConfig?.title || ''} onChange={e => handleUpdateConfig({ title: e.target.value })} className="h-14 rounded-2xl border-2 font-black" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Entry Fee ($)</Label><Input type="number" value={localConfig?.registration_cost || '0'} onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} className="h-14 rounded-2xl border-2 font-black text-primary" /></div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Scorekeeper Code <span className="text-muted-foreground font-medium normal-case tracking-normal">(required for real score submissions)</span></Label>
                    <Input 
                      value={(localConfig as any)?.scoringCode || ''} 
                      onChange={e => handleUpdateConfig({ scoringCode: e.target.value } as any)} 
                      placeholder="Set a 4+ character access code..."
                      className="h-14 rounded-2xl border-2 font-black uppercase tracking-widest" 
                    />
                    <p className="text-[10px] text-muted-foreground ml-1">Share this code with scorekeepers only. Guests must enter it before accessing match entry.</p>
                  </div>
                </div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Registration Description</Label><Textarea value={localConfig?.description || ''} onChange={e => handleUpdateConfig({ description: e.target.value })} className="rounded-3xl min-h-[150px] border-2 font-medium" placeholder="Add the tournament details registrants need to know..." /></div>
                
                <div className="bg-amber-50 rounded-[2.5rem] border-2 border-amber-200 p-8 lg:p-10 space-y-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-100 p-3 rounded-2xl text-amber-700 shadow-sm"><Wallet className="h-6 w-6" /></div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tight text-amber-900 leading-none">Payment Instructions</h4>
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Shown to registrants before submission</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-amber-900">Offline Payment Instructions (e-Transfer / Cheque)</Label>
                       <Textarea 
                         value={localConfig?.offline_payment_instructions || ''} 
                         onChange={e => handleUpdateConfig({ offline_payment_instructions: e.target.value })} 
                         className="rounded-3xl min-h-[100px] border-2 font-medium border-amber-200 bg-white" 
                         placeholder="e.g., Please send e-transfer to accounting@organization.com. Include team name in notes." 
                       />
                    </div>
                  </div>
                  <div className="bg-white/60 p-6 rounded-2xl border-2 border-amber-100/50 space-y-4">
                     <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Registrant View</p><Badge variant="outline" className="text-[8px] font-black uppercase border-amber-200 text-amber-700">Preview</Badge></div>
                     <p className="text-[11px] font-medium leading-relaxed text-amber-900/80 italic">"{localConfig?.offline_payment_instructions || 'Contact the tournament organizer for payment instructions.'}"</p>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-700 tracking-[0.2em] opacity-60 px-1"><Sparkles className="h-3 w-3" /> Stripe Integration Pending</div>
                </div>

                <div className="bg-rose-50 rounded-[2.5rem] border-2 border-rose-200 p-8 lg:p-10 space-y-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-rose-100 p-3 rounded-2xl text-rose-700 shadow-sm"><FileSignature className="h-6 w-6" /></div>
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight text-rose-900 leading-none">Waivers and Agreements</h4>
                        <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-1">Choose the documents registrants must accept</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={cn(
                        "p-6 rounded-[2rem] border-2 transition-all cursor-pointer",
                        localConfig?.require_default_waiver ? "bg-white border-rose-400 ring-4 ring-rose-400/10 shadow-md" : "bg-white/40 border-rose-100 opacity-60"
                      )} onClick={() => handleUpdateConfig({ require_default_waiver: !localConfig?.require_default_waiver })}>
                        <div className="flex items-center justify-between mb-2">
                           <Badge variant="outline" className="text-[8px] font-black uppercase bg-primary/5">Standard</Badge>
                           <Switch checked={localConfig?.require_default_waiver || false} />
                        </div>
                        <h5 className="font-black uppercase text-sm mb-1 text-rose-900">Universal Waiver</h5>
                        <p className="text-[10px] font-bold text-rose-600 uppercase">General Athletic Protection</p>
                      </div>

                      <div className={cn(
                        "p-6 rounded-[2rem] border-2 transition-all",
                        (localConfig?.selected_team_waivers?.length || 0) > 0 ? "bg-white border-rose-400 ring-4 ring-rose-400/10 shadow-md" : "bg-white/40 border-rose-100 opacity-60"
                      )}>
                        <div className="flex items-center justify-between mb-2">
                           <Badge variant="outline" className="text-[8px] font-black uppercase bg-orange-50">Custom</Badge>
                           <div className={cn("h-2 w-2 rounded-full", (localConfig?.selected_team_waivers?.length || 0) > 0 ? "bg-rose-500 animate-pulse" : "bg-rose-200")} />
                        </div>
                        <h5 className="font-black uppercase text-sm mb-1 text-rose-900">Waiver Library</h5>
                        <p className="text-[10px] font-bold text-rose-600 uppercase">Documents from the organizing team</p>
                      </div>
                    </div>

                    {localConfig?.require_default_waiver && (
                      <div className="space-y-2 bg-white p-6 rounded-3xl border-2 border-rose-100 shadow-sm animate-in zoom-in-95 duration-200">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-rose-900 ml-1">Standard Waiver</Label>
                        <Textarea 
                          value={localConfig?.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this program...'} 
                          onChange={e => handleUpdateConfig({ default_waiver_text: e.target.value })} 
                          className="rounded-2xl min-h-[150px] border-none font-medium bg-rose-50/30 text-xs leading-relaxed" 
                        />
                      </div>
                    )}

                    {teamWaivers.length > 0 ? (
                      <div className="space-y-4 bg-white p-6 rounded-3xl border-2 border-rose-100 shadow-sm">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-rose-900 ml-1">Available Team Waivers</Label>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2">
                          {teamWaivers.map(waiver => (
                            <div 
                              key={waiver.id} 
                              className={cn(
                                "flex items-center space-x-3 p-4 rounded-2xl border-2 transition-all cursor-pointer",
                                localConfig?.selected_team_waivers?.includes(waiver.id) ? "bg-rose-50 border-rose-200" : "bg-muted/10 border-transparent hover:bg-muted/20"
                              )}
                              onClick={() => {
                                const current = localConfig?.selected_team_waivers || [];
                                const newSelection = current.includes(waiver.id)
                                  ? current.filter(id => id !== waiver.id)
                                  : [...current, waiver.id];
                                handleUpdateConfig({ selected_team_waivers: newSelection });
                              }}
                            >
                              <Checkbox 
                                id={`tw-${waiver.id}`} 
                                checked={localConfig?.selected_team_waivers?.includes(waiver.id) || false}
                                className="border-rose-300 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                              />
                              <Label htmlFor={`tw-${waiver.id}`} className="flex-1 text-xs font-black uppercase cursor-pointer">{waiver.title}</Label>
                              <Badge variant="outline" className="text-[7px] font-black">ID: {waiver.id.slice(0, 8)}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 bg-muted/10 rounded-3xl border-2 border-dashed text-center">
                         <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">No team waivers are available.</p>
                      </div>
                    )}

                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-rose-900">Additional Agreement Terms (Optional)</Label>
                       <Textarea 
                         value={localConfig?.custom_waiver_text || ''} 
                         onChange={e => handleUpdateConfig({ custom_waiver_text: e.target.value })} 
                         className="rounded-3xl min-h-[100px] border-2 font-medium border-rose-200 bg-white" 
                         placeholder="Add any tournament-specific terms registrants must accept..."
                       />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-8 lg:p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-primary p-3 rounded-2xl text-white"><Users className="h-6 w-6" /></div><CardTitle className="text-2xl font-black uppercase tracking-tight">Form Questions</CardTitle></div>
                <Dialog>
                  <DialogTrigger asChild><Button variant="secondary" className="rounded-full h-11 px-6 font-black uppercase text-[10px]"><Plus className="h-4 w-4 mr-2" /> Add Question</Button></DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-8 max-w-sm">
                    <DialogHeader className="mb-6">
                      <DialogTitle className="text-2xl font-black uppercase">New Question</DialogTitle>
                      <DialogDescription className="sr-only">Configure a question, answer type, form section, and whether an answer is required.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Question Label</Label>
                        <Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl border-2 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Answer Type</Label>
                        <Select value={editingField?.type || ''} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select type..." /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="short_text" className="font-bold text-[10px] uppercase">Short Text</SelectItem>
                            <SelectItem value="long_text" className="font-bold text-[10px] uppercase">Long Text</SelectItem>
                            <SelectItem value="dropdown" className="font-bold text-[10px] uppercase">Dropdown Menu</SelectItem>
                            <SelectItem value="radio" className="font-bold text-[10px] uppercase">Single Choice (Radio)</SelectItem>
                            <SelectItem value="checkbox" className="font-bold text-[10px] uppercase">Multiple Choice (Checkboxes)</SelectItem>
                            <SelectItem value="signature" className="font-bold text-[10px] uppercase">Signature</SelectItem>
                            <SelectItem value="header" className="font-bold text-[10px] uppercase">Section Header</SelectItem>
                            <SelectItem value="information_box" className="font-bold text-[10px] uppercase">Information Box</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Form Section</Label>
                        <Select value={editingField?.step || 'additional'} onValueChange={(v: any) => setEditingField({ ...editingField, step: v })}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select step..." /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="identity" className="font-bold text-[10px] uppercase">Registrant Details</SelectItem>
                            <SelectItem value="guardian" className="font-bold text-[10px] uppercase">Parent or Guardian</SelectItem>
                            <SelectItem value="team_code" className="font-bold text-[10px] uppercase">Team Assignment</SelectItem>
                            <SelectItem value="additional" className="font-bold text-[10px] uppercase">Additional Questions</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {['dropdown', 'radio', 'checkbox'].includes(editingField?.type || '') && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                          <Label className="text-[10px] uppercase font-black ml-1">Options (Comma Separated)</Label>
                          <Input 
                            placeholder="Option 1, Option 2, Option 3" 
                            value={editingField?.options?.join(', ') || ''} 
                            onChange={e => setEditingField({ ...editingField, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                            className="h-12 rounded-xl border-2 font-bold focus:border-primary/20"
                          />
                        </div>
                      )}
                      {editingField?.type && !['header', 'information_box'].includes(editingField.type) && (
                        <div className="flex items-center justify-between gap-4 rounded-2xl border-2 p-4">
                          <div>
                            <Label htmlFor="new-question-required" className="text-[10px] uppercase font-black">Required Answer</Label>
                            <p className="mt-1 text-[9px] font-medium text-muted-foreground">Registrants cannot submit without answering.</p>
                          </div>
                          <Switch
                            id="new-question-required"
                            checked={editingField.required === true}
                            onCheckedChange={required => setEditingField({ ...editingField, required })}
                          />
                        </div>
                      )}
                      {editingField?.type === 'information_box' && (
                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 bg-blue-50 p-5 rounded-2xl border-2 border-blue-100">
                          <div className="flex items-center gap-2 mb-2">
                            <Info className="h-4 w-4 text-blue-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">Information Box Settings</span>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black ml-1 text-blue-800">Box Title (displayed as heading)</Label>
                            <Input 
                              placeholder="e.g. Important Instructions" 
                              value={editingField?.label || ''}
                              onChange={e => setEditingField({ ...editingField, label: e.target.value })}
                              className="h-10 rounded-xl border-2 font-bold"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-black ml-1 text-blue-800">Box Content (body text shown to registrants)</Label>
                            <Textarea
                              placeholder="Enter the information or instructions you want to display in this section..."
                              value={editingField?.infoContent || ''}
                              onChange={e => setEditingField({ ...editingField, infoContent: e.target.value })}
                              className="rounded-xl border-2 font-medium min-h-[100px] text-sm"
                            />
                          </div>
                          <p className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">This block will be displayed as a styled info panel in your registration form — not a fillable field.</p>
                        </div>
                      )}
                    </div>
                    <DialogFooter className="pt-4">
                      <DialogClose asChild>
                        <Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleAddField} disabled={!editingField?.label || !editingField?.type}>Add Question</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {((localConfig?.form_schema || config?.form_schema) || []).map((field, i) => {
                  const isSystemField = field.id === 'f_sys_division';
                  const stepLabels: Record<string, string> = {
                    identity: 'Registrant Details',
                    guardian: 'Parent or Guardian',
                    team_code: 'Team Assignment',
                    additional: 'Additional Questions'
                  };
                  if (isSystemField) return (
                    <div key={field.id} className="p-8 flex items-center justify-between bg-primary/5 border-l-4 border-primary">
                      <div className="flex items-center gap-6">
                        <div className="text-[10px] font-black text-primary w-8 text-center opacity-60">{i + 1}</div>
                        <div className="space-y-1">
                          <p className="font-black text-base uppercase tracking-tight text-primary">{field.label}</p>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase h-5 px-2">Division</Badge>
                            <Badge variant="outline" className="text-[7px] font-black uppercase opacity-60">Always Included</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-primary/40 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Included Automatically
                      </div>
                    </div>
                  );
                  return (
                    <div key={field.id} className={cn(
                      "p-8 flex items-center justify-between group hover:bg-muted/10 transition-colors",
                      field.type === 'information_box' && "bg-blue-50/50 hover:bg-blue-50"
                    )}>
                      <div className="flex items-center gap-6">
                        <div className="text-[10px] font-black text-muted-foreground w-8 opacity-40 text-center">{i + 1}</div>
                        <div className="space-y-1">
                          {field.type === 'information_box' ? (
                            <div className="flex items-start gap-3">
                              <div className="bg-blue-100 p-2 rounded-xl text-blue-600 mt-0.5 shrink-0">
                                <Info className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-black text-base uppercase tracking-tight text-blue-900">{field.label}</p>
                                {field.infoContent && <p className="text-xs font-medium text-blue-600 mt-1 line-clamp-2 max-w-xs">{field.infoContent}</p>}
                              </div>
                            </div>
                          ) : (
                            <p className="font-black text-base uppercase tracking-tight">{field.label}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn("text-[8px] font-black uppercase", field.type === 'information_box' && "border-blue-200 text-blue-700 bg-blue-50")}>{field.type.replace(/_/g, ' ')}</Badge>
                            {field.step && <Badge variant="secondary" className="text-[8px] font-black uppercase bg-primary/10 text-primary border-none">{stepLabels[field.step] || field.step}</Badge>}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(f => f.id !== field.id && f.id !== 'f_sys_division') }, true)}><Trash2 className="h-5 w-5" /></Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
              <CardContent className="p-8 lg:p-10 space-y-8 relative z-10">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Public Registration</Badge>
                <div className="flex items-center gap-3"><Trophy className="h-8 w-8 text-primary" /><h3 className="text-3xl font-black tracking-tighter uppercase leading-[0.9]">Registration Link</h3></div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <p className="text-[10px] font-mono font-bold truncate opacity-80">/register/tournament/{teamId}/{eventId}</p>
                  <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-xs shadow-xl" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/tournament/${teamId}/${eventId}?protocol=${configId}`); toast({ title: "Registration Link Copied" }); }}>Copy Registration Link</Button>
                </div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/60">Tournament Code / ID</p>
                  <p className="text-2xl font-mono font-black tracking-widest break-all">{event?.registrationCode || `${teamId}:${eventId}`}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button variant="secondary" className="h-12 rounded-xl font-black uppercase text-[10px]" onClick={() => { navigator.clipboard.writeText(event?.registrationCode || `${teamId}:${eventId}`); toast({ title: 'Tournament Code Copied' }); }}>Copy Code</Button>
                    {!event?.registrationCode && <Button variant="outline" className="h-12 rounded-xl border-white/20 bg-transparent text-white font-black uppercase text-[10px]" onClick={generateRegistrationCode} disabled={isGeneratingRegistrationCode}>{isGeneratingRegistrationCode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Code'}</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      <Dialog open={isManualAddOpen} onOpenChange={setIsManualAddOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase">Add Team Registration</DialogTitle>
              <DialogDescription className="sr-only">Manually add a team and its primary contact to this tournament.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label><Input placeholder="e.g. Metro Tigers" value={manualForm.teamName} onChange={e => setManualForm({...manualForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Authorized Contact</Label><Input placeholder="Full Name" value={manualForm.coachName} onChange={e => setManualForm({...manualForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label><Input type="email" placeholder="coach@org.com" value={manualForm.email} onChange={e => setManualForm({...manualForm, email: e.target.value})} className="h-12 rounded-xl border-2 font-bold" /></div>
            </div>
            <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleManualAdd} disabled={isManualProcessing}>{isManualProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Add Team"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      </> /* end formsListMode else fragment */
      )} {/* end formsListMode ternary */}
    </div>
  );
}
