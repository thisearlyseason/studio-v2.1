"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, LeagueRegistrationConfig, RegistrationEntry, RegistrationFormField } from '@/components/providers/team-provider';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
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
  Loader2
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function LeagueRegistrationAdminPage() {
  const { leagueId } = useParams();
  const router = useRouter();
  const { saveLeagueRegistrationConfig, assignEntryToTeam, activeTeam, hasFeature, toggleRegistrationPaymentStatus, purchasePro, isStaff, respondToAssignment } = useTeam();
  const db = useFirestore();

  const canRegister = hasFeature('league_registration') || (activeTeam?.isPro && isStaff);

  const configRef = useMemoFirebase(() => (db && leagueId) ? doc(db, 'leagues', leagueId as string, 'registration', 'config') : null, [db, leagueId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => (db && leagueId) ? query(collection(db, 'leagues', leagueId as string, 'registrationEntries'), orderBy('created_at', 'desc')) : null, [db, leagueId]);
  const { data: entries } = useCollection<RegistrationEntry>(entriesQuery);

  const [activeTab, setActiveTab] = useState<'entries' | 'config'>('entries');
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'assigned' | 'accepted'>('all');

  const [localConfig, setLocalConfig] = useState<Partial<LeagueRegistrationConfig> | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (config && !localConfig) {
      setLocalConfig(config);
    }
  }, [config, localConfig]);

  const handleUpdateConfig = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!leagueId) return;
    
    const base = localConfig || config || {
      id: 'config',
      title: 'New League Pipeline',
      description: 'Registration for our upcoming season.',
      registration_cost: '0',
      payment_instructions: 'Pay via the squad hub.',
      is_active: false,
      form_schema: [
        { id: 'name', type: 'short_text', label: 'Full Name', required: true },
        { id: 'email', type: 'short_text', label: 'Email Address', required: true }
      ],
      form_version: 1,
      waiver_text: '',
      confirmation_message: ''
    };

    const updated = { ...base, ...updates } as LeagueRegistrationConfig;
    setLocalConfig(updated);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    const performSync = async () => {
      try {
        await saveLeagueRegistrationConfig(leagueId as string, updated);
      } catch (e) {
        console.error("Config sync failure", e);
      }
    };

    if (immediate) {
      performSync();
    } else {
      syncTimeoutRef.current = setTimeout(performSync, 1500);
    }
  };

  const formSchema = localConfig?.form_schema || config?.form_schema || [];

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    if (filterStatus === 'all') return entries;
    return entries.filter(e => e.status === filterStatus);
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

  const handleCopyPortalUrl = async () => {
    try {
      const url = `${window.location.origin}/register/league/${leagueId}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link Synchronized", description: "Portal URL copied to clipboard." });
    } catch (err) {
      toast({ title: "Copy Failed", variant: "destructive" });
    }
  };

  if (!canRegister) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative"><div className="bg-primary/10 p-8 rounded-[3rem] shadow-2xl"><ClipboardList className="h-20 w-20 text-primary" /></div><div className="absolute -top-3 -right-3 bg-black text-white p-2.5 rounded-full shadow-lg border-4 border-background"><Lock className="h-5 w-5" /></div></div>
        <div className="text-center max-w-md space-y-4">
          <h1 className="text-4xl font-black tracking-tight uppercase">Registration Hub Locked</h1>
          <p className="text-muted-foreground font-bold leading-relaxed text-lg uppercase tracking-wide">Automated player enrollment and assignment logic is reserved for Elite Pro and Club squads.</p>
        </div>
        <Button className="h-14 px-10 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={purchasePro}>Unlock Recruitment Hub</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leagues')} className="rounded-full h-10 w-10"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="space-y-1">
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3">Recruit Pool</Badge>
            <h1 className="text-3xl font-black uppercase tracking-tight">League Pipeline</h1>
          </div>
        </div>
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2">
          <Button variant={activeTab === 'entries' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => setActiveTab('entries')}><Target className="h-4 w-4 mr-2" /> Recruit Pool</Button>
          <Button variant={activeTab === 'config' ? 'default' : 'ghost'} className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => setActiveTab('config')}><Settings className="h-4 w-4 mr-2" /> Protocol Architect</Button>
        </div>
      </div>

      {activeTab === 'entries' ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">Applicant Pool</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{filteredEntries.length} Records Found</p></div>
            </div>
            <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl border-2 shadow-sm">
              {(['all', 'pending', 'assigned', 'accepted'] as const).map(s => (
                <Button key={s} variant={filterStatus === s ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-xl font-black text-[9px] uppercase px-4" onClick={() => setFilterStatus(s)}>{s}</Button>
              ))}
            </div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                  <tr>
                    <th className="px-8 py-5">Applicant</th>
                    <th className="px-4 py-5">Submitted</th>
                    <th className="px-4 py-5 text-center">Payment</th>
                    <th className="px-4 py-5">Status</th>
                    <th className="px-4 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-black text-sm uppercase tracking-tight">{entry.answers['name'] || entry.answers['fullName'] || 'New Recruit'}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{entry.answers['email']}</p>
                      </td>
                      <td className="px-4 py-6 text-xs font-bold text-muted-foreground">{format(new Date(entry.created_at), 'MMM d, p')}</td>
                      <td className="px-4 py-6 text-center">
                        <button onClick={() => toggleRegistrationPaymentStatus(leagueId as string, entry.id, !entry.payment_received)} className={cn("inline-flex items-center justify-center h-8 w-8 rounded-lg transition-all", entry.payment_received ? "bg-green-500 text-white shadow-lg" : "bg-muted text-muted-foreground/30")}><DollarSign className="h-4 w-4" /></button>
                      </td>
                      <td className="px-4 py-6"><Badge className={cn("border-none font-black text-[8px] uppercase px-2 h-5", entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'assigned' ? "bg-primary text-white" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>{entry.status}</Badge></td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border hover:bg-primary hover:text-white transition-all"><UserPlus className="h-4 w-4" /></Button></DialogTrigger>
                            <DialogContent className="rounded-3xl border-none shadow-2xl p-8 max-w-2xl">
                              <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Review & Dispatch</DialogTitle></DialogHeader>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                                <div className="space-y-4">
                                  <p className="text-[10px] font-black uppercase text-muted-foreground">Form Responses</p>
                                  <ScrollArea className="h-[250px] pr-4">
                                    <div className="space-y-4">
                                      {Object.entries(entry.answers).map(([key, val]) => (
                                        <div key={key} className="space-y-1">
                                          <p className="text-[8px] font-black uppercase opacity-40">{key.replace(/_/g, ' ')}</p>
                                          <p className="text-sm font-bold">{val.toString()}</p>
                                        </div>
                                      ))}
                                      {entry.waiver_signed_text && (
                                        <div className="pt-4 border-t border-muted-foreground/10 space-y-1">
                                          <p className="text-[8px] font-black uppercase text-green-600">Signed Digitally</p>
                                          <p className="text-xs font-mono italic">"{entry.waiver_signed_text}"</p>
                                        </div>
                                      )}
                                    </div>
                                  </ScrollArea>
                                </div>
                                <div className="space-y-6">
                                  <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase ml-1">Dispatch to Squad</Label>
                                    <Select value={entry.assigned_team_id || 'unassigned'} onValueChange={(tid) => assignEntryToTeam(leagueId as string, entry.id, tid === 'unassigned' ? null : tid)}>
                                      <SelectTrigger className="h-14 rounded-xl border-2 font-black"><SelectValue placeholder="Move to squad..." /></SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        <SelectItem value="unassigned">Unassigned Pool</SelectItem>
                                        {Object.entries(activeTeam?.leagueIds || {}).map(([id, t]) => <SelectItem key={id} value={id}>Squad {id.slice(-6)}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed space-y-4">
                                    <div className="flex items-center gap-2">
                                      <Info className="h-4 w-4 text-primary" />
                                      <p className="text-[10px] font-black uppercase text-primary">Deployment Note</p>
                                    </div>
                                    <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                                      Assigning a recruit to a squad allows that squad's coach to review and officially enroll them into their active roster.
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={() => toast({ title: "Recruit Dispatched" })}>Commit Deployment</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="bg-primary/5 border-b p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20"><Globe className="h-6 w-6" /></div>
                    <div><CardTitle className="text-2xl font-black uppercase tracking-tight">Pipeline Logistics</CardTitle><CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Global Signup Visibility</CardDescription></div>
                  </div>
                  <Switch checked={localConfig?.is_active || config?.is_active || false} onCheckedChange={(v) => handleUpdateConfig({ is_active: v }, true)} />
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Signup Headline</Label>
                    <Input 
                      value={localConfig?.title ?? config?.title ?? ''} 
                      onChange={e => handleUpdateConfig({ title: e.target.value })} 
                      className="h-12 rounded-xl font-bold border-2" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Registration Fee ($)</Label>
                    <Input 
                      type="number"
                      value={localConfig?.registration_cost ?? config?.registration_cost ?? ''} 
                      onChange={e => handleUpdateConfig({ registration_cost: e.target.value })} 
                      className="h-12 rounded-xl font-black border-2 text-primary" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Brief</Label>
                  <Textarea 
                    value={localConfig?.description ?? config?.description ?? ''} 
                    onChange={e => handleUpdateConfig({ description: e.target.value })} 
                    className="rounded-xl min-h-[100px] border-2 font-medium" 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <MessageSquare className="h-3 w-3 text-primary" />
                    <Label className="text-[10px] font-black uppercase tracking-widest">Custom Confirmation Message</Label>
                  </div>
                  <Textarea 
                    placeholder="Show this message after submission (e.g. 'Welcome to the league! Check your email.')"
                    value={localConfig?.confirmation_message ?? config?.confirmation_message ?? ''} 
                    onChange={e => handleUpdateConfig({ confirmation_message: e.target.value })} 
                    className="rounded-xl min-h-[80px] border-2 font-medium bg-muted/5" 
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="bg-black text-white p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20"><LayoutGrid className="h-6 w-6" /></div>
                    <div><CardTitle className="text-2xl font-black uppercase tracking-tight">Field Architect</CardTitle><CardDescription className="font-bold text-white/60 text-[10px] uppercase tracking-widest">Applicant Data Payload</CardDescription></div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild><Button variant="secondary" className="rounded-full h-10 px-6 font-black uppercase text-[10px]" onClick={() => setEditingField({ type: 'short_text', label: '', required: true })}><Plus className="h-4 w-4 mr-2" /> Add Field</Button></DialogTrigger>
                    <DialogContent className="rounded-3xl border-none shadow-2xl p-8"><DialogHeader><DialogTitle className="text-2xl font-black uppercase">New Data Segment</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2"><Label className="text-[10px] uppercase font-black">Segment Label</Label><Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} className="h-12 rounded-xl" /></div>
                        <div className="space-y-2"><Label className="text-[10px] uppercase font-black">Input Type</Label>
                          <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="short_text">Short Text</SelectItem>
                              <SelectItem value="long_text">Long Text Block</SelectItem>
                              <SelectItem value="dropdown">Dropdown Selection</SelectItem>
                              <SelectItem value="checkbox">Checkbox Group</SelectItem>
                              <SelectItem value="yes_no">Yes / No Toggle</SelectItem>
                              <SelectItem value="image">Image Attachment</SelectItem>
                              <SelectItem value="header">Section Header</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {['dropdown', 'checkbox'].includes(editingField?.type || '') && (
                          <div className="space-y-2 animate-in slide-in-from-top-2">
                            <Label className="text-[10px] uppercase font-black">Selection Options (Comma Separated)</Label>
                            <Input 
                              placeholder="e.g. Small, Medium, Large" 
                              value={editingField?.options?.join(', ') || ''} 
                              onChange={e => setEditingField({...editingField, options: e.target.value.split(',').map(o => o.trim())})} 
                              className="h-12 rounded-xl border-primary/20"
                            />
                          </div>
                        )}
                      </div>
                      <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleAddField}>Add to Protocol</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">{formSchema.map((field, i) => (
                  <div key={field.id} className="p-6 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="text-[10px] font-black text-muted-foreground w-6">{i + 1}</div>
                      <div>
                        <p className="font-black text-sm uppercase">{field.label}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">{field.type.replace(/_/g, ' ')} {field.options && `(${field.options.length} options)`}</p>
                      </div>
                    </div>
                    {i > 1 && <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleUpdateConfig({ form_schema: formSchema.filter(f => f.id !== field.id) }, true)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}</div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="bg-muted/30 border-b p-8">
                <div className="flex items-center gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary"><FileSignature className="h-6 w-6" /></div>
                  <div><CardTitle className="text-2xl font-black uppercase tracking-tight">Institutional Waiver</CardTitle><CardDescription className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">Digital Signature Mandate</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-4">
                <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">Applicants must digitally sign this text before submitting their enrollment.</p>
                <Textarea 
                  placeholder="Define liability terms, medical releases, and conduct codes..." 
                  value={localConfig?.waiver_text ?? config?.waiver_text ?? ''} 
                  onChange={e => handleUpdateConfig({ waiver_text: e.target.value })} 
                  className="min-h-[200px] rounded-2xl border-2 font-medium bg-muted/10" 
                />
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-white overflow-hidden group">
              <CardContent className="p-8 space-y-6">
                <div className="bg-white/20 p-4 rounded-2xl w-fit group-hover:scale-110 transition-transform"><Share2 className="h-8 w-8 text-white" /></div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black tracking-tight uppercase leading-none">Portal Access</h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Recruitment Link</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 text-center"><p className="text-[8px] font-black uppercase opacity-60 mb-1">Public Link</p><p className="text-[10px] font-bold truncate">/register/league/{leagueId}</p></div>
                <Button className="w-full h-14 rounded-2xl bg-white text-primary font-black uppercase text-xs shadow-xl active:scale-95 transition-all" onClick={handleCopyPortalUrl}>
                  <Copy className="h-4 w-4 mr-2" /> Copy Portal Link
                </Button>
              </CardContent>
            </Card>

            <div className="bg-amber-50 p-8 rounded-[2.5rem] border-2 border-dashed border-amber-200 space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Preview Mode Info</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed italic text-amber-800">
                In this development preview, recruitment links require active workstation permissions (401 error otherwise). <strong>Deploy your app</strong> to make these links fully public.
              </p>
            </div>

            <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Strategic Enrollment</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                All data collected via this protocol is funneled into your master Recruit Pool for tactical review and squad deployment.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}