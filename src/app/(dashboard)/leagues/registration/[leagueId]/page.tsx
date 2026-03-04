"use client";

import React, { useState, useMemo } from 'react';
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
  Save, 
  Share2, 
  Users, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  Download,
  Settings,
  ShieldCheck,
  Globe,
  Clock,
  LayoutGrid,
  Info,
  Loader2,
  Table as TableIcon
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { deleteDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function LeagueRegistrationAdminPage() {
  const { leagueId } = useParams();
  const router = useRouter();
  const { saveLeagueRegistrationConfig, assignEntryToTeam, activeLeague, isClubManager, hasFeature } = useTeam();
  const db = useFirestore();

  const configRef = useMemoFirebase(() => db ? doc(db, 'leagues', leagueId as string, 'registration', 'config') : null, [db, leagueId]);
  const { data: config, isLoading: isConfigLoading } = useDoc<LeagueRegistrationConfig>(configRef);

  const entriesQuery = useMemoFirebase(() => db ? query(collection(db, 'leagues', leagueId as string, 'registrationEntries'), orderBy('created_at', 'desc')) : null, [db, leagueId]);
  const { data: entries } = useCollection<RegistrationEntry>(entriesQuery);

  const [activeTab, setActiveTab] = useState<'config' | 'entries'>('config');
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Default values for config
  const formSchema = config?.form_schema || [
    { id: 'name', type: 'short_text', label: 'Full Name', required: true },
    { id: 'email', type: 'short_text', label: 'Email Address', required: true }
  ];

  const handleSaveConfig = async (updates: Partial<LeagueRegistrationConfig>) => {
    setIsProcessing(true);
    await saveLeagueRegistrationConfig(leagueId as string, updates);
    setIsProcessing(false);
  };

  const handleAddField = () => {
    if (!editingField?.label || !editingField?.type) return;
    const newField = {
      ...editingField,
      id: editingField.id || `f_${Date.now()}`
    } as RegistrationFormField;
    
    const updatedSchema = [...formSchema, newField];
    handleSaveConfig({ form_schema: updatedSchema, form_version: (config?.form_version || 0) + 1 });
    setEditingField(null);
  };

  const handleRemoveField = (fieldId: string) => {
    const updatedSchema = formSchema.filter(f => f.id !== fieldId);
    handleSaveConfig({ form_schema: updatedSchema, form_version: (config?.form_version || 0) + 1 });
  };

  const handleExportCSV = () => {
    if (!isClubManager) {
      toast({ title: "Club Feature Only", description: "CSV exports are reserved for Club organizations.", variant: "destructive" });
      return;
    }
    if (!entries || entries.length === 0) return;

    // Build headers from schema + status/date
    const headers = ['Submitted', 'Status', 'Assigned Team', ...formSchema.map(f => f.label)];
    const rows = entries.map(entry => {
      const answers = entry.answers || {};
      return [
        format(new Date(entry.created_at), 'yyyy-MM-dd'),
        entry.status,
        entry.assigned_team_id || 'Unassigned',
        ...formSchema.map(f => answers[f.id] || '')
      ].map(v => `"${v}"`).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `registration_export_${leagueId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasFeature('league_registration')) return null;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/leagues')} className="rounded-full h-10 w-10">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1">
            <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] h-6 px-3">Elite Strategy</Badge>
            <h1 className="text-3xl font-black uppercase tracking-tight">Registration Hub</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={activeTab === 'config' ? 'default' : 'outline'} 
            className="rounded-xl h-11 px-6 font-black uppercase text-[10px] tracking-widest border-2"
            onClick={() => setActiveTab('config')}
          >
            <Settings className="h-4 w-4 mr-2" /> Protocol
          </Button>
          <Button 
            variant={activeTab === 'entries' ? 'default' : 'outline'} 
            className="rounded-xl h-11 px-6 font-black uppercase text-[10px] tracking-widest border-2"
            onClick={() => setActiveTab('entries')}
          >
            <Users className="h-4 w-4 mr-2" /> Ledger
          </Button>
        </div>
      </div>

      {activeTab === 'config' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="bg-primary/5 border-b p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                      <Globe className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Public Protocol</CardTitle>
                      <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Global Signup Visibility</CardDescription>
                    </div>
                  </div>
                  <Switch 
                    checked={config?.is_active || false} 
                    onCheckedChange={(v) => handleSaveConfig({ is_active: v })} 
                  />
                </div>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Signup Title</Label>
                  <Input 
                    value={config?.title || ''} 
                    onChange={e => handleSaveConfig({ title: e.target.value })}
                    placeholder="e.g. 2024 Varsity Winter Season"
                    className="h-12 rounded-xl font-bold border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season Description</Label>
                  <Textarea 
                    value={config?.description || ''} 
                    onChange={e => handleSaveConfig({ description: e.target.value })}
                    placeholder="Briefly define the league requirements and dates..."
                    className="rounded-xl min-h-[100px] border-2 font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Payment Instructions (Offline Only)</Label>
                  <Textarea 
                    value={config?.payment_instructions || ''} 
                    onChange={e => handleSaveConfig({ payment_instructions: e.target.value })}
                    placeholder="e.g. Please e-transfer $150 to fees@league.com with your name in memo."
                    className="rounded-xl border-2 font-medium bg-muted/20"
                  />
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed italic ml-1">
                    SquadForge exclusively processes strategic data. Payments must be handled offline.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="bg-black text-white p-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                      <LayoutGrid className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Form Architect</CardTitle>
                      <CardDescription className="font-bold text-white/60 text-[10px] uppercase tracking-widest">Data Collection Schema</CardDescription>
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="secondary" className="rounded-full h-10 px-6 font-black uppercase text-[10px] tracking-widest" onClick={() => setEditingField({ type: 'short_text', label: '', required: true })}>
                        <Plus className="h-4 w-4 mr-2" /> Add Field
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-3xl border-none shadow-2xl p-8">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">New Form Field</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest">Field Label</Label>
                          <Input value={editingField?.label || ''} onChange={e => setEditingField({ ...editingField, label: e.target.value })} placeholder="e.g. Birthdate" className="h-12 rounded-xl font-bold border-2" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest">Type</Label>
                          <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({ ...editingField, type: v })}>
                            <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="short_text">Short Text</SelectItem>
                              <SelectItem value="long_text">Long Text</SelectItem>
                              <SelectItem value="dropdown">Dropdown Selection</SelectItem>
                              <SelectItem value="checkbox">Multi-Checkbox</SelectItem>
                              <SelectItem value="yes_no">Yes/No Toggle</SelectItem>
                              <SelectItem value="image">Image Upload</SelectItem>
                              <SelectItem value="header">Section Header</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {['dropdown', 'checkbox'].includes(editingField?.type || '') && (
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest">Options (Comma Separated)</Label>
                            <Input placeholder="Small, Medium, Large" onChange={e => setEditingField({ ...editingField, options: e.target.value.split(',').map(s => s.trim()) })} className="h-12 rounded-xl font-bold border-2" />
                          </div>
                        )}
                        <div className="flex items-center space-x-3 pt-2">
                          <Switch checked={editingField?.required} onCheckedChange={(v) => setEditingField({ ...editingField, required: v })} />
                          <Label className="text-[10px] font-black uppercase tracking-widest">Required Field</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddField} disabled={!editingField?.label}>Add to Schema</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {formSchema.map((field, i) => (
                    <div key={field.id} className="p-6 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="text-[10px] font-black text-muted-foreground w-6">{i + 1}</div>
                        <div>
                          <p className="font-black text-sm uppercase tracking-tight">{field.label} {field.required && <span className="text-primary">*</span>}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{field.type.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                      {i > 1 && ( // Name and Email are protected base fields for this prototype
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveField(field.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="rounded-[2rem] border-none shadow-xl bg-primary text-white overflow-hidden">
              <CardContent className="p-8 space-y-6">
                <div className="space-y-1">
                  <Share2 className="h-8 w-8 text-white/40 mb-2" />
                  <h3 className="text-xl font-black tracking-tight uppercase">Public Link</h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Secure Enrollment Portal</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 text-center space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Portal Active</p>
                  <p className="text-xs font-bold truncate">/register/league/{leagueId}</p>
                </div>
                <Button className="w-full h-12 rounded-xl bg-white text-primary font-black uppercase text-[10px] tracking-widest shadow-xl" onClick={() => {
                  const url = `${window.location.origin}/register/league/${leagueId}`;
                  navigator.clipboard.writeText(url);
                  toast({ title: "Link Synchronized", description: "Url copied to clipboard." });
                }}>Copy Portal URL</Button>
              </CardContent>
            </Card>

            <div className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Rules of Engagement</h4>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-[10px] font-medium leading-relaxed">
                  <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                  <span>Existing rosters are **never** disturbed by new signups.</span>
                </li>
                <li className="flex items-start gap-3 text-[10px] font-medium leading-relaxed">
                  <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                  <span>Assignments require coach approval to finalize enrollment.</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
                <TableIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight leading-none">Submissions Ledger</h3>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Review & Deployment Hub</p>
              </div>
            </div>
            <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] tracking-widest border-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                  <tr>
                    <th className="px-8 py-5">Applicant</th>
                    <th className="px-4 py-5">Submitted</th>
                    <th className="px-4 py-5">Status</th>
                    <th className="px-4 py-5">Assigned Squad</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries?.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-black text-sm uppercase tracking-tight">{entry.answers['name'] || entry.answers['fullName'] || 'Unknown'}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{entry.answers['email']}</p>
                      </td>
                      <td className="px-4 py-6 text-xs font-bold text-muted-foreground">
                        {format(new Date(entry.created_at), 'MMM d, p')}
                      </td>
                      <td className="px-4 py-6">
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
                      <td className="px-4 py-6 text-xs font-black uppercase truncate max-w-[120px]">
                        {entry.assigned_team_id ? (
                          <span className="text-primary">{entry.assigned_team_id.slice(-6)}</span>
                        ) : 'Pool'}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border"><Info className="h-4 w-4" /></Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
                              <div className="h-2 bg-primary w-full" />
                              <div className="p-8 space-y-6">
                                <DialogHeader>
                                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">Review Entry</DialogTitle>
                                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Complete form data</DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="h-[300px] bg-muted/30 p-6 rounded-2xl border-2">
                                  <div className="space-y-6">
                                    {formSchema.map(field => (
                                      <div key={field.id} className="space-y-1">
                                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">{field.label}</p>
                                        <p className="text-sm font-bold">{entry.answers[field.id]?.toString() || '-'}</p>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                                <div className="space-y-4 pt-2">
                                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Deploy to Squad</Label>
                                  <Select 
                                    value={entry.assigned_team_id || 'unassigned'} 
                                    onValueChange={(tid) => assignEntryToTeam(leagueId as string, entry.id, tid === 'unassigned' ? null : tid)}
                                  >
                                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent className="rounded-xl">
                                      <SelectItem value="unassigned">Unassigned Pool</SelectItem>
                                      {/* Only show squads the league owner has access to or mapped in league */}
                                      {Object.entries(activeLeague?.teams || {}).map(([id, t]) => (
                                        <SelectItem key={id} value={id}>{t.teamName}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteDocumentNonBlocking(doc(db, 'leagues', leagueId as string, 'registrationEntries', entry.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center opacity-30">
                        <Users className="h-12 w-12 mx-auto mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest">No applicants found in ledger.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
