"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField, LeagueArchiveWaiver } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, query, orderBy, where, deleteDoc } from 'firebase/firestore';
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
  Download
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
import { jsPDF } from 'jspdf';
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

  // --- WAIVER EXPORT ---
  const activeLeagueDocRef = useMemo(() => leagueId ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: leagueData } = useDoc(activeLeagueDocRef);
  const activeLeague = useMemo(() => leagueData || null, [leagueData]);

  const waiversQuery = useMemoFirebase(() => {
    if (!db || !leagueId) return null;
    return collection(db, 'leagues', leagueId as string, 'archived_waivers');
  }, [db, leagueId]);
  const { data: waiversData } = useCollection<LeagueArchiveWaiver>(waiversQuery);
  const archivedWaivers = useMemo(() => waiversData || [], [waiversData]);

  const exportAllWaivers = () => {
    if (archivedWaivers.length === 0) {
      toast({ title: "No waivers found", description: "This league has no signed waivers yet." });
      return;
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text(`Official Waiver Archive: ${activeLeague?.name || 'League'}`, 20, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
    doc.setFontSize(12);
    doc.text(`Total Records: ${archivedWaivers.length}`, 20, 38);
    doc.setDrawColor(200);
    doc.line(20, 45, 190, 45);

    archivedWaivers.forEach((waiver, index) => {
      doc.addPage();
      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0);
      doc.text("WAIVER RECORD", 20, 30);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`UID: ${waiver.id}`, 20, 38);
      
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(20, 45, 190, 45);

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("PARTICIPANT INFO", 20, 60);
      doc.setFontSize(11);
      doc.text(`Name: ${waiver.signer}`, 20, 70);
      doc.text(`Affiliation: ${waiver.teamName || 'Independent'}`, 20, 78);
      doc.text(`Signed At: ${format(new Date(waiver.signedAt), 'PPP p')}`, 20, 86);
      doc.text(`Type: ${waiver.type.toUpperCase()}`, 20, 94);

      doc.setFontSize(14);
      doc.text("WAIVER TEXT", 20, 115);
      doc.setFontSize(8);
      doc.setTextColor(50);
      const splitWaiver = doc.splitTextToSize(waiver.waiverText, 170);
      doc.text(splitWaiver, 20, 125);

      doc.setFontSize(14);
      doc.setTextColor(0);
      const lastLine = 125 + (splitWaiver.length * 3.5);
      doc.text("EXECUTION LOG", 20, lastLine + 15);
      doc.setFontSize(9);
      doc.text(`The user ${waiver.signer} confirmed their identity and agreed to the above terms via electronic signature on ${format(new Date(waiver.signedAt), 'PPP p')}.`, 20, lastLine + 25, { maxWidth: 170 });
    });

    doc.save(`${activeLeague?.name || 'League'}_Waiver_Archive.pdf`);
    toast({ title: "Archive Generated" });
  };

  useEffect(() => {
    if (config) setLocalConfig(config);
    else setLocalConfig(null);
  }, [config]);

  const handleUpdateConfig = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!leagueId) return;
    const base = localConfig || config || { id: configId, type: pipelineType, title: '', is_active: false, form_schema: [], form_version: 1 };
    const updated = { ...base, ...updates } as LeagueRegistrationConfig;
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary">{pipelineType === 'player' ? <Users className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">{pipelineType === 'player' ? 'Athlete Pool' : 'Squad Pool'}</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{filteredEntries.length} Active Applicants</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
                {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                  <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
                ))}
              </div>
              {pipelineType === 'team' && <Button className="rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-xl" onClick={() => setIsManualAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Enroll Squad</Button>}
            </div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {isEntriesLoading ? (
                  <div className="py-32 text-center flex flex-col items-center gap-6"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-[0.3em]">Synchronizing...</p></div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-10 py-6">Applicant</th><th className="px-4 py-6 text-center">Status</th><th className="px-10 py-6 text-right">Actions</th></tr></thead>
                    <tbody className="divide-y divide-muted/50">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border-2 bg-white shadow-sm">{pipelineType === 'player' ? <UserCheck className="h-6 w-6 text-primary" /> : <ShieldCheck className="h-6 w-6 text-primary" />}</div>
                              <div className="min-w-0"><p className="font-black text-sm uppercase truncate">{entry.answers?.teamName || entry.answers?.name || entry.answers?.fullName || 'Untitled'}</p><p className="text-[10px] font-bold text-muted-foreground truncate uppercase">{entry.answers?.email || 'No Email'}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center"><Badge className={cn("border-none font-black text-[8px] uppercase px-3 h-6", entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'assigned' ? "bg-primary text-white" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted")}>{entry.status}</Badge></td>
                          <td className="px-10 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Dialog>
                                <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border-2 bg-white hover:bg-primary hover:text-white"><Terminal className="h-5 w-5" /></Button></DialogTrigger>
                                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden max-w-2xl">
                                  <div className="h-2 bg-primary w-full" /><div className="p-8 lg:p-10 space-y-8">
                                    <DialogHeader><DialogTitle className="text-3xl font-black uppercase">Institutional Audit</DialogTitle></DialogHeader>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                      <div className="space-y-6">
                                        <p className="text-[10px] font-black uppercase text-primary tracking-[0.2em] px-1">Form Data</p>
                                        <ScrollArea className="h-[300px] border-2 rounded-[2rem] p-6 bg-muted/10 shadow-inner">
                                          <div className="space-y-6">{Object.entries(entry.answers || {}).map(([key, val]) => (<div key={key} className="space-y-1.5"><p className="text-[8px] font-black uppercase opacity-40">{key.replace(/_/g, ' ')}</p><p className="text-sm font-bold leading-relaxed">{val?.toString() || '--'}</p></div>))}</div>
                                        </ScrollArea>
                                      </div>
                                      <div className="space-y-8">
                                        <div className="space-y-3">
                                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Dispatch Squad</Label>
                                          <Select value={entry.assigned_team_id || 'unassigned'} onValueChange={(tid) => assignEntryToTeam(leagueId as string, entry.id, tid === 'unassigned' ? null : tid)}>
                                            <SelectTrigger className="h-14 rounded-2xl border-2 font-black shadow-inner"><SelectValue placeholder="Select..." /></SelectTrigger>
                                            <SelectContent className="rounded-2xl border-2"><SelectItem value="unassigned" className="font-bold uppercase text-[10px]">Unassigned Pool</SelectItem>{activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).map(id => (<SelectItem key={id} value={id} className="font-bold uppercase text-[10px]">Squad {id.slice(-6)}</SelectItem>))}</SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    </div>
                                    <DialogFooter className="pt-4"><DialogClose asChild><Button variant="outline" className="w-full h-14 rounded-xl border-2 font-black uppercase text-xs">Close Audit</Button></DialogClose></DialogFooter>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}><Trash2 className="h-5 w-5" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEntries.length === 0 && !isEntriesLoading && (
                        <tr><td colSpan={3} className="py-32 text-center opacity-20"><History className="h-16 w-16 mx-auto mb-4" /><p className="text-sm font-black uppercase tracking-[0.3em]">Ledger Empty</p></td></tr>
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
                <div className="flex items-center gap-4"><div className="bg-primary p-4 rounded-3xl text-white shadow-xl"><Globe className="h-8 w-8" /></div><div><CardTitle className="text-3xl font-black uppercase tracking-tight">{localConfig?.title || 'Pipeline Protocol'}</CardTitle><CardDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Institutional Blueprint v{localConfig?.form_version || 1}</CardDescription></div></div>
                <Switch checked={localConfig?.is_active || false} onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} />
              </CardHeader>
              <CardContent className="p-8 lg:p-10 space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Headline</Label><Input value={localConfig?.title || ''} onChange={e => handleUpdateConfig({ title: e.target.value })} className="h-14 rounded-2xl border-2 font-black" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Enrollment Fee ($)</Label><Input type="number" value={localConfig?.registration_cost || '0'} onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} className="h-14 rounded-2xl border-2 font-black text-primary" /></div>
                </div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Brief</Label><Textarea value={localConfig?.description || ''} onChange={e => handleUpdateConfig({ description: e.target.value })} className="rounded-3xl min-h-[150px] border-2 font-medium" placeholder="Define the recruitment scope..." /></div>
                
                <div className="bg-amber-50 rounded-[2.5rem] border-2 border-amber-200 p-8 lg:p-10 space-y-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-100 p-3 rounded-2xl text-amber-700 shadow-sm"><Wallet className="h-6 w-6" /></div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tight text-amber-900 leading-none">Payment Protocol</h4>
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-1">Disbursement Guidance v1.0</p>
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
                     <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Institutional Interface</p><Badge variant="outline" className="text-[8px] font-black uppercase border-amber-200 text-amber-700">Live Preview</Badge></div>
                     <p className="text-[11px] font-medium leading-relaxed text-amber-900/80 italic">"{localConfig?.offline_payment_instructions || 'Enrollment fees are currently processed via bank transfer or institutional check. Online Checkout Pipeline: In Active Development.'}"</p>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-700 tracking-[0.2em] opacity-60 px-1"><Sparkles className="h-3 w-3" /> Stripe Integration Pending</div>
                </div>

                <div className="bg-rose-50 rounded-[2.5rem] border-2 border-rose-200 p-8 lg:p-10 space-y-6 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="bg-rose-100 p-3 rounded-2xl text-rose-700 shadow-sm"><FileSignature className="h-6 w-6" /></div>
                    <div>
                      <h4 className="text-xl font-black uppercase tracking-tight text-rose-900 leading-none">Compliance & Waivers</h4>
                      <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-1">Institutional Liability & Agreements</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="space-y-4 bg-white p-6 rounded-3xl border-2 border-rose-100 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <Label className="text-sm font-black uppercase tracking-widest text-rose-900">Universal Athletics Waiver</Label>
                          <p className="text-[10px] uppercase font-bold text-rose-600/70">Enforce standard injury & liability protections</p>
                        </div>
                        <Switch checked={localConfig?.require_default_waiver || false} onCheckedChange={(v) => handleUpdateConfig({ require_default_waiver: v })} />
                      </div>
                      {localConfig?.require_default_waiver && (
                        <div className="space-y-2 pt-4 border-t border-rose-50 animate-in slide-in-from-top-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-rose-900">Edit Default Waiver Text</Label>
                          <Textarea 
                            value={localConfig?.default_waiver_text || 'I hereby assume all risks, hazards, and liabilities associated with participation in this program. I waive, release, and discharge the organization, its directors, coaches, and facility providers from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.'} 
                            onChange={e => handleUpdateConfig({ default_waiver_text: e.target.value })} 
                            className="rounded-2xl min-h-[120px] border-2 font-medium border-rose-100 bg-rose-50/50 text-xs leading-relaxed" 
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-rose-900">Custom Organization Agreement (Optional)</Label>
                       <Textarea 
                         value={localConfig?.custom_waiver_text || ''} 
                         onChange={e => handleUpdateConfig({ custom_waiver_text: e.target.value })} 
                         className="rounded-3xl min-h-[120px] border-2 font-medium border-rose-200 bg-white" 
                         placeholder="Define custom terms, facility rules, or specific compliance clauses that require applicant signature..." 
                       />
                       <p className="text-[10px] uppercase font-bold text-rose-600/60 ml-1">This agreement will be appended to the recruitment portal and require digital authorization.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
              <CardHeader className="bg-black text-white p-8 lg:p-10 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4"><div className="bg-primary p-3 rounded-2xl text-white"><Users className="h-6 w-6" /></div><CardTitle className="text-2xl font-black uppercase tracking-tight">Form Architect</CardTitle></div>
                <Dialog>
                  <DialogTrigger asChild><Button variant="secondary" className="rounded-full h-11 px-6 font-black uppercase text-[10px]"><Plus className="h-4 w-4 mr-2" /> Add Data Point</Button></DialogTrigger>
                  <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-8 max-w-sm">
                    <DialogHeader className="mb-6"><DialogTitle className="text-2xl font-black uppercase">New Data Point</DialogTitle></DialogHeader>
                    <div className="space-y-6 py-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Field Headline</Label>
                        <Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl border-2 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-black ml-1">Input Mechanism</Label>
                        <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select type..." /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="short_text" className="font-bold text-[10px] uppercase">Short Text</SelectItem>
                            <SelectItem value="long_text" className="font-bold text-[10px] uppercase">Long Narrative</SelectItem>
                            <SelectItem value="dropdown" className="font-bold text-[10px] uppercase">Dropdown Menu</SelectItem>
                            <SelectItem value="radio" className="font-bold text-[10px] uppercase">Single Choice (Radio)</SelectItem>
                            <SelectItem value="checkbox" className="font-bold text-[10px] uppercase">Multi Choice (Check)</SelectItem>
                            <SelectItem value="signature" className="font-bold text-[10px] uppercase">Digital Signature</SelectItem>
                            <SelectItem value="header" className="font-bold text-[10px] uppercase">Section Header</SelectItem>
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
                    </div>
                    <DialogFooter className="pt-4">
                      <Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleAddField} disabled={!editingField?.label}>Inject Spec</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {((localConfig?.form_schema || config?.form_schema) || []).map((field, i) => (
                  <div key={field.id} className="p-8 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-6"><div className="text-[10px] font-black text-muted-foreground w-8 opacity-40 text-center">{i + 1}</div><div className="space-y-1"><p className="font-black text-base uppercase tracking-tight">{field.label}</p><Badge variant="outline" className="text-[8px] font-black uppercase">{field.type.replace('_', ' ')}</Badge></div></div>
                    {i > 1 && (<Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleUpdateConfig({ form_schema: (localConfig?.form_schema || []).filter(f => f.id !== field.id) }, true)}><Trash2 className="h-5 w-5" /></Button>)}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
              <CardContent className="p-8 lg:p-10 space-y-8 relative z-10">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Public Portal</Badge>
                <h3 className="text-3xl font-black tracking-tighter uppercase leading-[0.9]">Recruitment Portal</h3>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5 space-y-4">
                  <p className="text-xs font-mono font-bold truncate opacity-80">/register/league/{leagueId}</p>
                  <Button className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase text-xs shadow-xl" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${leagueId}?protocol=${configId}`); toast({ title: "Portal Link Copied" }); }}>Copy Deployment Link</Button>
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