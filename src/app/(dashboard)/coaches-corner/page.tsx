
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature, TeamEvent, RegistrationFormField, LeagueRegistrationConfig } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, where, doc, getDocs, setDoc } from 'firebase/firestore';
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
  UserPlus
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
  const { activeTeam, isStaff, members, createTeamDocument, deleteTeamDocument, resetSquadData, saveLeagueRegistrationConfig } = useTeam();
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
  const configRef = useMemoFirebase(() => (db && activeTeam) ? doc(db, 'teams', activeTeam.id, 'registration', 'config') : null, [db, activeTeam?.id]);
  const { data: regConfig } = useDoc<LeagueRegistrationConfig>(configRef);

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase">Staff Access Restricted</h1></div>;

  const handleCreate = async () => {
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

  const handleSaveRegConfig = async (updates: Partial<LeagueRegistrationConfig>) => {
    if (!activeTeam) return;
    await setDoc(doc(db, 'teams', activeTeam.id, 'registration', 'config'), updates, { merge: true });
    toast({ title: "Recruitment Protocol Synchronized" });
  };

  const handleAddField = () => {
    if (!editingField?.label || !editingField?.type || !activeTeam) return;
    const currentSchema = regConfig?.form_schema || [];
    const newField = { ...editingField, id: `f_${Date.now()}` } as RegistrationFormField;
    handleSaveRegConfig({ form_schema: [...currentSchema, newField], form_version: (regConfig?.form_version || 0) + 1 });
    setEditingField(null);
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
                  <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleCreate} disabled={isProcessing}>Deploy to Roster</Button></DialogFooter>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
                <CardHeader className="bg-primary/5 border-b p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tight">Roster Portal Protocol</CardTitle>
                        <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Public Squad Recruitment</CardDescription>
                      </div>
                    </div>
                    <Switch 
                      checked={regConfig?.is_active || false} 
                      onCheckedChange={(v) => handleSaveRegConfig({ is_active: v })} 
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Portal Heading</Label>
                      <Input 
                        value={regConfig?.title || ''} 
                        onChange={e => handleSaveRegConfig({ title: e.target.value })}
                        placeholder="e.g. Join the Elite Summer Program"
                        className="h-12 rounded-xl font-bold border-2"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Portal Description</Label>
                      <Input 
                        value={regConfig?.description || ''} 
                        onChange={e => handleSaveRegConfig({ description: e.target.value })}
                        placeholder="Define your recruitment criteria..."
                        className="h-12 rounded-xl font-bold border-2"
                      />
                    </div>
                  </div>
                  <div className="p-6 bg-primary/5 rounded-[2rem] border-2 border-dashed border-primary/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Share2 className="h-6 w-6 text-primary" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Recruitment URL</p>
                        <p className="text-xs font-mono font-bold text-primary truncate max-w-[250px]">/register/squad/{activeTeam.id}</p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" className="rounded-xl h-9 px-4 font-black uppercase text-[10px]" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/squad/${activeTeam.id}`); toast({ title: "Link Copied" }); }}>Copy Link</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
                <CardHeader className="bg-black text-white p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary p-3 rounded-2xl text-white">
                        <Settings className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tight">Form Architect</CardTitle>
                        <CardDescription className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Recruit Data Payload</CardDescription>
                      </div>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="secondary" className="rounded-full h-10 px-6 font-black uppercase text-[10px]" onClick={() => setEditingField({ type: 'short_text', label: '', required: true })}>
                          <Plus className="h-4 w-4 mr-2" /> Add Field
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-[2.5rem] shadow-2xl p-8">
                        <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Add Form Field</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2"><Label className="text-[10px] uppercase font-black">Field Label</Label><Input value={editingField?.label || ''} onChange={e => setEditingField({...editingField, label: e.target.value})} className="h-12 rounded-xl" /></div>
                          <div className="space-y-2"><Label className="text-[10px] uppercase font-black">Type</Label>
                            <Select value={editingField?.type} onValueChange={(v: any) => setEditingField({...editingField, type: v})}>
                              <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="short_text">Short Text</SelectItem>
                                <SelectItem value="long_text">Long Text</SelectItem>
                                <SelectItem value="dropdown">Selection</SelectItem>
                                <SelectItem value="header">Section Header</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleAddField}>Add to Protocol</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {(regConfig?.form_schema || []).map((field, i) => (
                      <div key={field.id} className="p-6 flex items-center justify-between group hover:bg-muted/10 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="text-[10px] font-black text-muted-foreground w-6">{i + 1}</div>
                          <div>
                            <p className="font-black text-sm uppercase tracking-tight">{field.label}</p>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{field.type.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleSaveRegConfig({ form_schema: regConfig?.form_schema?.filter(f => f.id !== field.id) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(!regConfig?.form_schema || regConfig.form_schema.length === 0) && (
                      <div className="p-12 text-center opacity-30 italic font-bold text-sm">No custom fields established. Standard ID required.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-black text-white p-8 rounded-[2.5rem] shadow-xl space-y-6">
                <div className="flex items-center gap-3">
                  <UserPlus className="h-6 w-6 text-primary" />
                  <h4 className="text-lg font-black uppercase tracking-tight">Active Recruitment</h4>
                </div>
                <p className="text-xs font-medium text-white/60 leading-relaxed italic">
                  Public portals allow you to scale your roster without manual data entry. Use the "Choose from Pool" workflow in League Ledger to deploy recruits to your active squad.
                </p>
                <Button asChild className="w-full h-12 rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                  <Link href="/leagues">Enter Recruit Pool</Link>
                </Button>
              </div>
            </aside>
          </div>
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
