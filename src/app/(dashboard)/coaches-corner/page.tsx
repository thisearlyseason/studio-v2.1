
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature, RegistrationFormField, LeagueRegistrationConfig, RegistrationEntry } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, where, doc, getDocs, setDoc, deleteDoc, collectionGroup } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  PenTool, 
  FileSignature, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Download,
  Search,
  Filter,
  ShieldCheck,
  ClipboardList,
  Eye,
  Loader2,
  HardDrive,
  FileText,
  RotateCcw,
  Zap,
  Table as TableIcon,
  Activity,
  AlertTriangle,
  Target,
  Trophy,
  Building,
  Info,
  Globe,
  Settings,
  Copy,
  Share2,
  UserPlus,
  ArrowUpRight,
  DollarSign,
  CreditCard,
  XCircle,
  Circle
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

function SignatureList({ teamId, documentId }: { teamId: string, documentId: string }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => {
    if (!db || !teamId || !documentId) return null;
    return query(collection(db, 'teams', teamId, 'documents', documentId, 'signatures'), orderBy('signedAt', 'desc'));
  }, [db, teamId, documentId]);

  const { data: signatures, isLoading } = useCollection<DocumentSignature>(q);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto my-10 text-primary" />;

  return (
    <div className="space-y-3">
      {signatures?.map(sig => (
        <div key={sig.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg border shadow-sm"><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
            <div>
              <p className="font-black text-sm uppercase">{sig.userName}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">{format(new Date(sig.signedAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">Execution</p>
            <p className="text-[10px] font-bold font-mono italic">"{sig.signatureText}"</p>
          </div>
        </div>
      ))}
      {(!signatures || signatures.length === 0) && (
        <div className="text-center py-10 opacity-30">
          <FileSignature className="h-10 w-10 mx-auto mb-2" />
          <p className="text-xs font-black uppercase">No signatures collected yet.</p>
        </div>
      )}
    </div>
  );
}

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, members, createTeamDocument, deleteTeamDocument, resetSquadData, saveLeagueRegistrationConfig, respondToAssignment } = useTeam();
  const db = useFirestore();
  
  const [activeTab, setActiveTab] = useState('compliance');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });
  
  const [resetOptions, setResetOptions] = useState<string[]>(['games', 'events']);

  // Registration Builder State
  const [editingField, setEditingField] = useState<Partial<RegistrationFormField> | null>(null);
  const [activeProtocol, setActiveProtocol] = useState<LeagueRegistrationConfig | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const protocolsQuery = useMemoFirebase(() => (db && activeTeam) ? collection(db, 'teams', activeTeam.id, 'registration') : null, [db, activeTeam?.id]);
  const { data: protocols } = useCollection<LeagueRegistrationConfig>(protocolsQuery);

  const entriesQuery = useMemoFirebase(() => (db && activeTeam) ? collectionGroup(db, 'registrationEntries') : null, [db]);
  const { data: allEntries } = useCollection<RegistrationEntry>(entriesQuery);

  const teamEntries = useMemo(() => {
    if (!allEntries || !activeTeam) return [];
    return allEntries.filter(e => e.assigned_team_id === activeTeam.id || (e.protocol_id && protocols?.find(p => p.id === e.protocol_id)));
  }, [allEntries, activeTeam, protocols]);

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase">Staff Access Restricted</h1></div>;

  const handleCreateProtocol = async () => {
    if (!activeTeam) return;
    const newId = `proto_${Date.now()}`;
    const newProto: LeagueRegistrationConfig = {
      id: newId,
      title: 'New Recruitment Pipeline',
      description: 'Define your recruitment criteria...',
      registration_cost: '0',
      payment_instructions: 'Pay via squad hub.',
      is_active: false,
      form_schema: [
        { id: 'name', type: 'short_text', label: 'Full Name', required: true },
        { id: 'email', type: 'short_text', label: 'Email Address', required: true }
      ],
      form_version: 1
    };
    await setDoc(doc(db, 'teams', activeTeam.id, 'registration', newId), newProto);
    setActiveProtocol(newProto);
    toast({ title: "Protocol Established" });
  };

  const handleSaveActiveProtocol = (updates: Partial<LeagueRegistrationConfig>, immediate = false) => {
    if (!activeTeam || !activeProtocol) return;
    
    // Update local UI state immediately for smooth response
    const updated = { ...activeProtocol, ...updates } as LeagueRegistrationConfig;
    setActiveProtocol(updated);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    const performSync = async () => {
      try {
        await setDoc(doc(db, 'teams', activeTeam.id, 'registration', updated.id), updated, { merge: true });
        toast({ title: "Pipeline Synchronized" });
      } catch (e) {
        console.error("Pipeline sync failure", e);
      }
    };

    if (immediate) {
      performSync();
    } else {
      syncTimeoutRef.current = setTimeout(performSync, 1500);
    }
  };

  const handleAddField = () => {
    if (!editingField?.label || !editingField?.type || !activeProtocol) return;
    const currentSchema = activeProtocol.form_schema || [];
    const newField = { ...editingField, id: `f_${Date.now()}` } as RegistrationFormField;
    handleSaveActiveProtocol({ 
      form_schema: [...currentSchema, newField], 
      form_version: (activeProtocol.form_version || 0) + 1 
    }, true); 
    setEditingField(null);
  };

  const handleCreateDocument = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setIsProcessing(true);
    await createTeamDocument(newDoc);
    setIsCreateOpen(false);
    setIsProcessing(false);
    setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'] });
    toast({ title: "Document Deployed" });
  };

  const handleResetClick = () => {
    const highImpact = resetOptions.includes('members') || resetOptions.includes('facilities');
    if (highImpact) {
      setIsDoubleConfirmOpen(true);
    } else {
      handleFinalReset();
    }
  };

  const handleFinalReset = async () => {
    setIsProcessing(true);
    await resetSquadData(resetOptions);
    setIsResetOpen(false);
    setIsDoubleConfirmOpen(false);
    setIsProcessing(false);
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-12 p-1 border-2 w-full md:w-auto">
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 data-[state=active]:bg-black data-[state=active]:text-white">Documents</TabsTrigger>
            <TabsTrigger value="recruitment" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Recruitment</TabsTrigger>
            <TabsTrigger value="governance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 data-[state=active]:bg-black data-[state=active]:text-white">Governance</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} className="mt-0">
        <TabsContent value="compliance" className="space-y-8 mt-0">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Compliance Ledger</h2>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 px-6 rounded-xl font-black shadow-lg shadow-primary/20">
                  <Plus className="h-4 w-4 mr-2" /> Create Protocol
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Document Architect</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-black">Title</Label><Input value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="h-11 rounded-xl" /></div>
                      <div className="space-y-1"><Label className="text-[10px] uppercase font-black">Type</Label>
                        <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v})}>
                          <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl"><SelectItem value="waiver">Waiver</SelectItem><SelectItem value="policy">Policy</SelectItem><SelectItem value="info">Info</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1"><Label className="text-[10px] uppercase font-black">Content</Label><Textarea value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} className="min-h-[200px] rounded-xl" /></div>
                  </div>
                  <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleCreateDocument} disabled={isProcessing}>Deploy to Roster</Button></DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {documents?.map(doc => (
              <Card key={doc.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group">
                <CardContent className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="bg-primary/5 p-4 rounded-2xl text-primary"><PenTool className="h-6 w-6" /></div>
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tight">{doc.title}</h3>
                      <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                        <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount} Signed</span>
                        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] border-2" onClick={() => setSelectedDoc(doc)}>Audit Signatures</Button>
                    <Button variant="ghost" size="icon" className="text-destructive h-10 w-10" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recruitment" className="space-y-8 mt-0">
          <Tabs defaultValue="pool" className="w-full">
            <div className="flex items-center justify-between mb-6 bg-muted/20 p-2 rounded-2xl border-2">
              <TabsList className="bg-transparent h-10 p-0 border-none">
                <TabsTrigger value="pool" className="rounded-xl font-black text-[10px] uppercase px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Recruit Pool</TabsTrigger>
                <TabsTrigger value="protocols" className="rounded-xl font-black text-[10px] uppercase px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Pipelines & Forms</TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="sm" className="font-black uppercase text-[10px] text-primary" onClick={handleCreateProtocol}>+ New Pipeline</Button>
            </div>

            <TabsContent value="pool" className="mt-0 space-y-6">
              <div className="flex items-center gap-3 px-2">
                <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
                <div><h3 className="text-xl font-black uppercase tracking-tight">Recruit Ledger</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{teamEntries.length} Applicants in Pool</p></div>
              </div>

              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr>
                        <th className="px-8 py-5">Applicant</th>
                        <th className="px-4 py-5">Pipeline</th>
                        <th className="px-4 py-5 text-center">Status</th>
                        <th className="px-8 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted/50">
                      {teamEntries.map(entry => (
                        <tr key={entry.id} className="hover:bg-muted/5 transition-colors">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                              <Avatar className="h-10 w-10 rounded-xl border">
                                <AvatarImage src={entry.answers['photo']} />
                                <AvatarFallback className="font-black text-xs">{entry.answers['name']?.[0] || '?'}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-black text-sm uppercase tracking-tight">{entry.answers['name'] || entry.answers['fullName'] || 'New Recruit'}</p>
                                <p className="text-[10px] font-bold text-muted-foreground">{entry.answers['email']}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-xs font-bold text-primary uppercase">
                            {protocols?.find(p => p.id === entry.protocol_id)?.title || 'Standard'}
                          </td>
                          <td className="px-4 py-6 text-center">
                            <Badge className={cn(
                              "font-black text-[8px] uppercase px-2 h-5 border-none",
                              entry.status === 'pending' ? "bg-amber-100 text-amber-700" : entry.status === 'accepted' ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                            )}>{entry.status}</Badge>
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex justify-end gap-2">
                              {entry.status === 'pending' && (
                                <>
                                  <Button size="sm" variant="ghost" className="rounded-xl h-9 w-9 text-destructive" onClick={() => respondToAssignment(entry.league_id, entry.id, 'declined')}><XCircle className="h-4 w-4" /></Button>
                                  <Button size="sm" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] shadow-md" onClick={() => respondToAssignment(entry.league_id, entry.id, 'accepted')}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Deploy</Button>
                                </>
                              )}
                              <Dialog>
                                <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border"><Eye className="h-4 w-4" /></Button></DialogTrigger>
                                <DialogContent className="rounded-3xl border-none shadow-2xl p-0 overflow-hidden sm:max-w-lg">
                                  <div className="h-2 bg-primary w-full" />
                                  <div className="p-8 space-y-6">
                                    <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Recruit File</DialogTitle></DialogHeader>
                                    <div className="space-y-4">
                                      <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed space-y-4">
                                        {Object.entries(entry.answers).map(([key, val]) => (
                                          <div key={key} className="space-y-1">
                                            <p className="text-[8px] font-black uppercase opacity-40">{key.replace(/_/g, ' ')}</p>
                                            <p className="text-sm font-bold">{val.toString()}</p>
                                          </div>
                                        ))}
                                        {entry.waiver_signed_text && (
                                          <div className="pt-4 border-t border-muted-foreground/10 space-y-1">
                                            <p className="text-[8px] font-black uppercase text-green-600">Digital Signature Verified</p>
                                            <p className="text-xs font-mono italic">"{entry.waiver_signed_text}"</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {teamEntries.length === 0 && (
                        <tr><td colSpan={4} className="py-20 text-center opacity-30 italic font-bold">No applicants in pool. Share a pipeline link to recruit.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="protocols" className="mt-0 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-4">
                  <div className="flex items-center gap-2 px-2 text-primary"><Target className="h-4 w-4" /><h3 className="text-xs font-black uppercase tracking-widest">Active Pipelines</h3></div>
                  <div className="space-y-2">
                    {protocols?.map(p => (
                      <Card key={p.id} className={cn("rounded-2xl border-none shadow-sm transition-all cursor-pointer ring-1 ring-black/5", activeProtocol?.id === p.id ? "bg-primary text-white" : "bg-white hover:ring-primary/20")} onClick={() => { 
                        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
                        setActiveProtocol(p); 
                      }}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="font-black text-sm uppercase truncate">{p.title}</p>
                            <p className={cn("text-[8px] font-bold uppercase", activeProtocol?.id === p.id ? "text-white/60" : "text-muted-foreground")}>V{p.form_version}.0 • {p.is_active ? 'LIVE' : 'IDLE'}</p>
                          </div>
                          <ChevronRight className={cn("h-4 w-4", activeProtocol?.id === p.id ? "text-white" : "text-primary opacity-20")} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-8">
                  {activeProtocol ? (
                    <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
                      <div className="h-2 bg-primary w-full" />
                      <div className="p-8 space-y-10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                          <div className="space-y-1">
                            <Badge className="bg-primary/5 text-primary border-none font-black text-[8px] uppercase tracking-widest px-3 h-5">Pipeline Config</Badge>
                            <h3 className="text-3xl font-black uppercase tracking-tight">{activeProtocol.title}</h3>
                          </div>
                          <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-xl border">
                            <Label className="text-[10px] font-black uppercase tracking-widest">Live</Label>
                            <Switch checked={activeProtocol.is_active} onCheckedChange={v => handleSaveActiveProtocol({ is_active: v }, true)} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t">
                          <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Title</Label><Input value={activeProtocol.title} onChange={e => handleSaveActiveProtocol({ title: e.target.value })} className="h-12 rounded-xl font-bold border-2" /></div>
                          <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Registration Fee ($)</Label><Input type="number" value={activeProtocol.registration_cost} onChange={e => handleSaveActiveProtocol({ registration_cost: e.target.value })} className="h-12 rounded-xl font-black border-2 text-primary" /></div>
                          <div className="space-y-2 col-span-full"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Pipeline Link (Share with recruits)</Label>
                            <div className="flex gap-2">
                              <Input readOnly value={`${window.location.origin}/register/league/${activeTeam.id}?protocol=${activeProtocol.id}`} className="h-12 rounded-xl bg-muted/10 border-none font-mono text-[10px]" />
                              <Button size="icon" variant="outline" className="h-12 w-12 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeTeam.id}?protocol=${activeProtocol.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-4 w-4" /></Button>
                            </div>
                            <div className="flex items-center gap-2 mt-2 bg-amber-50 p-3 rounded-xl border border-amber-100">
                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                              <p className="text-[8px] font-bold text-amber-800 uppercase leading-relaxed">Preview Environment Warning: These development links require active workstation permission (401 error otherwise). They will be public after deployment.</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3"><Settings className="h-5 w-5 text-primary" /><h4 className="text-xs font-black uppercase tracking-[0.2em]">Form Architect</h4></div>
                            <Dialog>
                              <DialogTrigger asChild><Button variant="secondary" className="rounded-full h-9 px-6 font-black uppercase text-[10px]" onClick={() => setEditingField({ type: 'short_text', label: '', required: true })}><Plus className="h-4 w-4 mr-2" /> Add Field</Button></DialogTrigger>
                              <DialogContent className="rounded-3xl border-none shadow-2xl p-8">
                                <DialogHeader><DialogTitle className="text-2xl font-black uppercase">New Data Payload</DialogTitle></DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Label</Label><Input value={editingField?.label || ''} onChange={e => setEditingField({...editingField, label: e.target.value})} className="h-12 rounded-xl border-2" /></div>
                                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Input Type</Label>
                                    <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({...editingField, type: v})}>
                                      <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                                      <SelectContent className="rounded-xl">
                                        <SelectItem value="short_text">Short Text</SelectItem>
                                        <SelectItem value="long_text">Long Text Block</SelectItem>
                                        <SelectItem value="dropdown">Dropdown Selection</SelectItem>
                                        <SelectItem value="checkbox">Checkbox Group</SelectItem>
                                        <SelectItem value="yes_no">Affirmative/Negative</SelectItem>
                                        <SelectItem value="header">Section Header</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {['dropdown', 'checkbox'].includes(editingField?.type || '') && (
                                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Options (Comma separated)</Label><Input placeholder="Option 1, Option 2..." value={editingField?.options?.join(', ') || ''} onChange={e => setEditingField({...editingField, options: e.target.value.split(',').map(o => o.trim())})} className="h-12 rounded-xl border-2" /></div>
                                  )}
                                </div>
                                <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddField}>Add to Protocol</Button></DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                          
                          <div className="space-y-2">
                            {activeProtocol.form_schema.map((field, i) => (
                              <div key={field.id} className="p-4 bg-muted/20 rounded-2xl border flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                  <div className="text-[10px] font-black text-muted-foreground w-6">{i + 1}</div>
                                  <div><p className="font-black text-sm uppercase tracking-tight">{field.label}</p><p className="text-[8px] font-bold text-muted-foreground uppercase">{field.type.replace(/_/g, ' ')}</p></div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => handleSaveActiveProtocol({ form_schema: activeProtocol.form_schema.filter(f => f.id !== field.id) }, true)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-6 pt-6 border-t">
                          <div className="flex items-center gap-3"><FileSignature className="h-5 w-5 text-primary" /><h4 className="text-xs font-black uppercase tracking-[0.2em]">Legal & Liability</h4></div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Institutional Waiver Text</Label>
                            <Textarea value={activeProtocol.waiver_text || ''} onChange={e => handleSaveActiveProtocol({ waiver_text: e.target.value })} className="min-h-[150px] rounded-2xl border-2 font-medium bg-muted/10" placeholder="Define liability terms, medical releases, and conduct codes..." />
                          </div>
                        </div>

                        <div className="pt-8 flex justify-end">
                          <Button variant="ghost" className="text-destructive font-black uppercase text-[10px]" onClick={async () => { await deleteDoc(doc(db, 'teams', activeTeam.id, 'registration', activeProtocol.id)); setActiveProtocol(null); }}>Delete Pipeline</Button>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed opacity-40">
                      <Target className="h-12 w-12 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">Select a pipeline to configure</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="governance" className="space-y-8 mt-0">
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Seasonal Protocols</h2>
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden">
              <CardHeader className="bg-primary/5 border-b p-8">
                <CardTitle className="text-xl font-black uppercase">Squad Pulse Reset</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Operational Data Purge</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <p className="text-sm font-medium text-muted-foreground leading-relaxed italic">Wipe tactical records to begin a new competitive season. This action is audited and irreversible.</p>
                <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2 border-red-100 text-red-600 hover:bg-red-50" onClick={() => setIsResetOpen(true)}>
                  Initialize Season Reset
                </Button>
              </CardContent>
            </Card>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedDoc} onOpenChange={o => !o && setSelectedDoc(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="h-2 bg-black w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div><DialogTitle className="text-2xl font-black uppercase">{selectedDoc?.title}</DialogTitle><DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Compliance Audit</DialogDescription></div>
                <Button variant="outline" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] border-2"><Download className="h-3 w-3 mr-2" /> Export CSV</Button>
              </div>
            </DialogHeader>
            <ScrollArea className="h-[400px] pr-4">
              {selectedDoc && <SignatureList teamId={activeTeam!.id} documentId={selectedDoc.id} />}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDoubleConfirmOpen} onOpenChange={setIsDoubleConfirmOpen}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogTitle className="text-center text-2xl font-black uppercase">Irreversible Purge</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base font-medium pt-2 text-foreground/80">
              You have selected high-impact data categories (Roster or Facilities). This will permanently delete squad members or organization venue records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel Operation</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalReset} className="rounded-xl font-black bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/20">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
