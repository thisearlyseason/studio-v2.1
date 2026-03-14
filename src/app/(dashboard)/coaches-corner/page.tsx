"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature, RegistrationEntry, ScoutingReport } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, doc, collectionGroup, setDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
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
  ShieldCheck,
  Eye,
  Loader2,
  HardDrive,
  FileText,
  RotateCcw,
  Zap,
  Activity,
  AlertTriangle,
  Target,
  Trophy,
  Info,
  Globe,
  Settings,
  UserPlus,
  ArrowUpRight,
  DollarSign,
  XCircle,
  Edit3,
  SearchCode,
  LineChart,
  UserCog,
  Save,
  ShieldAlert,
  BrainCircuit,
  Wand2,
  Camera,
  LayoutGrid,
  HeartPulse,
  Plane,
  GraduationCap,
  Scale,
  FileBadge
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
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DEFAULT_PROTOCOLS = [
  { id: 'medical', label: 'Medical Clearance', icon: HeartPulse, type: 'waiver' },
  { id: 'travel', label: 'Travel Consent', icon: Plane, type: 'waiver' },
  { id: 'parental', label: 'Parental Waiver', icon: ShieldCheck, type: 'waiver' },
  { id: 'photography', label: 'Photography Release', icon: Camera, type: 'waiver' },
  { id: 'tournament', label: 'Tournament Master', icon: Scale, type: 'waiver' }
];

function SignatureList({ teamId, documentId }: { teamId: string, documentId: string }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => {
    if (!db || !teamId || !documentId) return null;
    return query(collection(db, 'teams', teamId, 'documents', documentId, 'signatures'), orderBy('signedAt', 'desc'));
  }, [db, teamId, documentId]);

  const { data: signatures, isLoading } = useCollection<DocumentSignature>(q);

  const handleDownloadOne = (sig: DocumentSignature) => {
    const content = `CERTIFICATE OF VERIFIED SIGNATURE\n\nDocument: ${sig.documentTitle}\nMember: ${sig.userName}\nTimestamp: ${sig.signedAt}\nLegal Signature: "${sig.signatureText}"\n\nThis document was digitally executed within the SquadForge platform and verified by team organizers.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Signature_${sig.userName.replace(/\s+/g, '_')}_${sig.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mb-1">Execution</p>
              <p className="text-[10px] font-bold font-mono italic">"{sig.signatureText}"</p>
            </div>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => handleDownloadOne(sig)}>
              <Download className="h-4 w-4" />
            </Button>
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

function DefaultProtocolCard({ protocol, activeTeam, db }: { protocol: any, activeTeam: any, db: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const docId = `default_${protocol.id}`;
  
  const { data: document } = useCollection<TeamDocument>(useMemoFirebase(() => (db && activeTeam) ? query(collection(db, 'teams', activeTeam.id, 'documents'), where('id', '==', docId)) : null, [db, activeTeam?.id, docId]));
  const docData = document?.[0];

  const [localText, setLocalText] = useState('');

  useEffect(() => {
    if (docData) setLocalText(docData.content);
  }, [docData]);

  const toggleStatus = async (active: boolean) => {
    if (!db || !activeTeam) return;
    setIsProcessing(true);
    if (active) {
      await setDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), {
        id: docId,
        teamId: activeTeam.id,
        title: protocol.label,
        content: localText || `Standard protocol for ${protocol.label}.`,
        type: protocol.type,
        assignedTo: ['all'],
        signatureCount: docData?.signatureCount || 0,
        createdAt: docData?.createdAt || new Date().toISOString()
      }, { merge: true });
    } else {
      await deleteDoc(doc(db, 'teams', activeTeam.id, 'documents', docId));
    }
    setIsProcessing(false);
    toast({ title: active ? "Protocol Activated" : "Protocol Deactivated" });
  };

  const handleSave = async () => {
    if (!db || !activeTeam) return;
    setIsProcessing(true);
    await setDoc(doc(db, 'teams', activeTeam.id, 'documents', docId), { content: localText }, { merge: true });
    setIsEditing(false);
    setIsProcessing(false);
    toast({ title: "Protocol Synchronized" });
  };

  return (
    <Card className={cn(
      "rounded-2xl border-none shadow-sm ring-1 ring-black/5 flex flex-col group transition-all",
      docData ? "bg-white" : "bg-muted/30 opacity-60"
    )}>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", docData ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <protocol.icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-xs font-black uppercase tracking-tight truncate max-w-[100px]">{protocol.label}</CardTitle>
        </div>
        <Switch 
          checked={!!docData} 
          onCheckedChange={toggleStatus} 
          disabled={isProcessing}
        />
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-1">
        <p className="text-[9px] font-medium text-muted-foreground line-clamp-2 italic">
          {docData ? `"${docData.content}"` : 'Institutional protocol inactive.'}
        </p>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        {docData && (
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full h-8 rounded-lg font-black text-[8px] uppercase tracking-widest hover:bg-primary/5 hover:text-primary border border-transparent hover:border-primary/20 transition-all">
                Edit Protocol
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-xl">
              <DialogTitle className="sr-only">Edit Mandatory Protocol</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 space-y-6 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">Edit: {protocol.label}</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px]">Define squad liability & terms</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase ml-1">Official Protocol Text</Label>
                  <Textarea 
                    value={localText} 
                    onChange={e => setLocalText(e.target.value)} 
                    className="min-h-[250px] rounded-2xl border-2 p-4 font-medium" 
                  />
                </div>
                <DialogFooter>
                  <Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={handleSave} disabled={isProcessing}>
                    Commit Protocol
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, members, createTeamDocument, updateTeamDocument, deleteTeamDocument, respondToAssignment, exportSignaturesCSV } = useTeam();
  const db = useFirestore();
  const [activeTab, setActiveTab] = useState('compliance');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });

  const docsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc')) : null, [activeTeam?.id, db]);
  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  const documents = useMemo(() => allDocuments?.filter(d => !d.id.startsWith('default_')) || [], [allDocuments]);

  const teamEntriesQuery = useMemoFirebase(() => (db && activeTeam) ? collectionGroup(db, 'registrationEntries') : null, [db, activeTeam?.id]);
  const { data: allEntries } = useCollection<RegistrationEntry>(teamEntriesQuery);
  const teamEntries = useMemo(() => (allEntries || []).filter(e => e.assigned_team_id === activeTeam?.id), [allEntries, activeTeam?.id]);

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase">Staff Access Restricted</h1></div>;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1></div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-auto p-1 border-2 w-full md:w-auto flex-wrap gap-1 shadow-sm">
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Waivers</TabsTrigger>
            <TabsTrigger value="recruitment" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Recruitment</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} className="mt-0">
        <TabsContent value="compliance" className="space-y-10 mt-0">
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Institutional Protocols</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {DEFAULT_PROTOCOLS.map(p => (
                <DefaultProtocolCard key={p.id} protocol={p} activeTeam={activeTeam} db={db} />
              ))}
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-primary" />
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Custom Documents</h2>
              </div>
              <Button onClick={() => { setEditingDocId(null); setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'] }); setIsCreateOpen(true); }} className="h-11 px-6 rounded-xl font-black shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" /> New Document
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {documents.map(doc => (
                <Card key={doc.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group transition-all hover:shadow-xl">
                  <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="bg-primary/5 p-4 rounded-2xl text-primary"><PenTool className="h-6 w-6" /></div>
                      <div>
                        <h3 className="font-black text-xl uppercase tracking-tight leading-none">{doc.title}</h3>
                        <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">
                          <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount} Signed</span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] border-2 bg-white text-black hover:bg-black hover:text-white transition-all" onClick={() => setSelectedDoc(doc)}>Audit</Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-primary/5 rounded-xl transition-all" onClick={() => { setEditingDocId(doc.id); setNewDoc({ title: doc.title, content: doc.content, type: doc.type, assignedTo: doc.assignedTo }); setIsCreateOpen(true); }}><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-10 w-10 hover:bg-destructive/5 rounded-xl transition-all" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recruitment" className="space-y-8 mt-0 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 px-2">
            <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
            <div><h3 className="text-xl font-black uppercase tracking-tight">Recruit Pool</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{teamEntries.length} Applicants</p></div>
          </div>

          <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                  <tr>
                    <th className="px-8 py-5">Applicant</th>
                    <th className="px-4 py-5 text-center">Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/50">
                  {teamEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 rounded-xl border shadow-sm">
                            <AvatarImage src={entry.answers['photo']} className="object-cover" />
                            <AvatarFallback className="font-black text-xs">{entry.answers['name']?.[0] || '?'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-black text-sm uppercase tracking-tight">{entry.answers['name'] || entry.answers['fullName'] || 'New Recruit'}</p>
                            <p className="text-[10px] font-bold text-muted-foreground">{entry.answers['email']}</p>
                          </div>
                        </div>
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
                              <Button size="sm" variant="ghost" className="rounded-xl h-9 w-9 text-destructive hover:bg-destructive/5" onClick={() => respondToAssignment(activeTeam!.id, entry.id, 'declined')}><XCircle className="h-4 w-4" /></Button>
                              <Button size="sm" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] shadow-md shadow-primary/20" onClick={() => respondToAssignment(activeTeam!.id, entry.id, 'accepted')}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Enroll</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedDoc} onOpenChange={o => !o && setSelectedDoc(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-xl p-0 overflow-hidden bg-white shadow-2xl border-none max-h-[90vh] flex flex-col">
          <DialogTitle className="sr-only">Document Audit Ledger</DialogTitle>
          <div className="h-2 bg-black w-full shrink-0" />
          <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div><DialogTitle className="text-2xl font-black uppercase">{selectedDoc?.title}</DialogTitle><DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Compliance Audit</DialogDescription></div>
                <Button variant="outline" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] border-2 transition-all active:scale-95 bg-white text-black hover:bg-black hover:text-white" onClick={() => selectedDoc && exportSignaturesCSV(selectedDoc.id)}><Download className="h-3 w-3 mr-2" /> CSV</Button>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              {selectedDoc && <SignatureList teamId={activeTeam!.id} documentId={selectedDoc.id} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}