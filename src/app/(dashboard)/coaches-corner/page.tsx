
"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature, RegistrationEntry } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, doc, collectionGroup } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Circle,
  Edit3,
  SearchCode,
  LineChart,
  UserCog,
  Save
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
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function PersonnelAuditDialog({ member, isOpen, onOpenChange }: { member: Member, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { updateStaffEvaluation, getStaffEvaluation } = useTeam();
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getStaffEvaluation(member.id).then(setNote);
    }
  }, [isOpen, member.id, getStaffEvaluation]);

  const handleSave = async () => {
    setIsSaving(true);
    await updateStaffEvaluation(member.id, note);
    setIsSaving(false);
    toast({ title: "Evaluation Saved" });
  };

  const handleExportPortfolio = useCallback(() => {
    const headers = ["Player", "Position", "Jersey", "Medical", "Fees Owed", "Staff Evaluations"];
    const row = [
      member.name, member.position, member.jersey,
      member.medicalClearance ? 'Cleared' : 'Pending',
      `$${member.amountOwed || 0}`,
      note.replace(/,/g, ';').replace(/\n/g, ' ')
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, row].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${member.name.replace(/\s+/g, '_')}_Portfolio.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [member, note]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white">
        <div className="h-2 bg-black w-full" />
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-5/12 bg-muted/20 p-8 lg:p-10 space-y-8 border-r">
            <div className="flex flex-col items-center text-center space-y-6">
              <Avatar className="h-32 w-32 rounded-[2.5rem] border-4 border-background shadow-2xl">
                <AvatarImage src={member.avatar} />
                <AvatarFallback className="font-black text-2xl">{member.name[0]}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6">Verified Personnel</Badge>
                <h3 className="text-3xl font-black uppercase tracking-tight">{member.name}</h3>
                <p className="text-primary font-black uppercase tracking-widest text-[10px]">{member.position} • #{member.jersey}</p>
              </div>
              <div className="w-full pt-6 border-t border-muted space-y-4">
                <div className="bg-white p-4 rounded-2xl border flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase opacity-40">Identity Proof</span>
                  <Badge variant="outline" className="text-[8px] border-green-200 text-green-600 bg-green-50 font-black">ACTIVE</Badge>
                </div>
                <Button className="w-full h-12 rounded-xl bg-black text-white font-black uppercase text-[10px] tracking-widest" onClick={handleExportPortfolio}>
                  <Download className="h-4 w-4 mr-2" /> Export Recruiting Pack
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 p-8 lg:p-10 space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Staff Evaluation Ledger</h4>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-4">
                Notes entered here are private to the coaching staff and are used for tactical deployment and player development tracking.
              </p>
              <Textarea 
                placeholder="Log performance benchmarks, tactical aptitude, or recruitment observations..." 
                value={note}
                onChange={e => setNote(e.target.value)}
                className="min-h-[300px] rounded-3xl bg-muted/10 border-none font-bold p-6 text-base shadow-inner resize-none focus:bg-white transition-all"
              />
            </div>
            <div className="pt-4 border-t flex justify-end gap-3">
              <Button variant="outline" className="h-12 rounded-xl font-black uppercase text-[10px] px-8 border-2" onClick={() => onOpenChange(false)}>Close Audit</Button>
              <Button className="h-12 rounded-xl font-black uppercase text-[10px] px-8 shadow-lg shadow-primary/20" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Commit Evaluation
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, members, createTeamDocument, updateTeamDocument, deleteTeamDocument, resetSquadData, respondToAssignment, exportSignaturesCSV } = useTeam();
  const db = useFirestore();
  
  const [activeTab, setActiveTab] = useState('compliance');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });
  
  const [selectedPersonnel, setSelectedPersonnel] = useState<Member | null>(null);
  const [personnelSearch, setPersonnelPersonnelSearch] = useState('');

  const [resetOptions, setResetOptions] = useState<string[]>(['games', 'events']);

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const teamEntriesQuery = useMemoFirebase(() => (db && activeTeam) ? collectionGroup(db, 'registrationEntries') : null, [db, activeTeam?.id]);
  const { data: allEntries } = useCollection<RegistrationEntry>(teamEntriesQuery);

  const teamEntries = useMemo(() => {
    if (!allEntries || !activeTeam) return [];
    return allEntries.filter(e => e.assigned_team_id === activeTeam.id || e.league_id === activeTeam.id);
  }, [allEntries, activeTeam]);

  const filteredPersonnel = useMemo(() => {
    return members.filter(m => m.name.toLowerCase().includes(personnelSearch.toLowerCase()));
  }, [members, personnelSearch]);

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase">Staff Access Restricted</h1></div>;

  const handleCreateDocument = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setIsProcessing(true);
    if (editingDocId) {
      await updateTeamDocument(editingDocId, newDoc);
      toast({ title: "Document Protocol Synchronized" });
    } else {
      await createTeamDocument(newDoc);
      toast({ title: "New Document Deployed" });
    }
    setIsCreateOpen(false);
    setIsProcessing(false);
    setEditingDocId(null);
    setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'] });
  };

  const handleEditDocument = (doc: TeamDocument) => {
    setEditingDocId(doc.id);
    setNewDoc({
      title: doc.title,
      content: doc.content,
      type: doc.type,
      assignedTo: doc.assignedTo
    });
    setIsCreateOpen(true);
  };

  const handleFinalReset = async () => {
    setIsProcessing(true);
    await resetSquadData(resetOptions);
    setIsResetOpen(false);
    setIsDoubleConfirmOpen(false);
    setIsProcessing(false);
  };

  const toggleAssignment = (memberId: string) => {
    setNewDoc(prev => {
      const current = prev.assignedTo;
      if (memberId === 'all') return { ...prev, assignedTo: ['all'] };
      
      let next = current.filter(id => id !== 'all');
      if (next.includes(memberId)) {
        next = next.filter(id => id !== memberId);
        if (next.length === 0) next = ['all'];
      } else {
        next.push(memberId);
      }
      return { ...prev, assignedTo: next };
    });
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-auto p-1 border-2 w-full md:w-auto flex-wrap gap-1">
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Waivers</TabsTrigger>
            <TabsTrigger value="recruitment" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Recruitment</TabsTrigger>
            <TabsTrigger value="personnel" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Personnel</TabsTrigger>
            <TabsTrigger value="governance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Logistics</TabsTrigger>
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
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              if (!open) { setEditingDocId(null); setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'] }); }
              setIsCreateOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button className="h-11 px-6 rounded-xl font-black shadow-lg shadow-primary/20">
                  <Plus className="h-4 w-4 mr-2" /> New Waiver
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] sm:max-w-4xl p-0 border-none shadow-2xl overflow-y-auto">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 lg:p-12 space-y-10">
                  <DialogHeader><DialogTitle className="text-3xl lg:text-4xl font-black uppercase tracking-tight">{editingDocId ? 'Update Waiver' : 'Document Architect'}</DialogTitle></DialogHeader>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="space-y-6">
                        <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest ml-1">Headline</Label><Input value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold text-lg" placeholder="e.g. 2024 Medical Release" /></div>
                        <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest ml-1">Document Type</Label>
                          <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v})}>
                            <SelectTrigger className="h-14 rounded-2xl border-2 font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl"><SelectItem value="waiver" className="font-bold">Legal Waiver</SelectItem><SelectItem value="policy" className="font-bold">Conduct Policy</SelectItem><SelectItem value="info" className="font-bold">Informational</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2"><Label className="text-[10px] uppercase font-black tracking-widest ml-1">Legal Content</Label><Textarea value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} className="min-h-[300px] rounded-3xl border-2 font-medium bg-muted/5 p-6 resize-none" placeholder="Paste full legal text here..." /></div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[10px] uppercase font-black tracking-widest">Assignment Logic</Label>
                          <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{newDoc.assignedTo.includes('all') ? 'Global' : `${newDoc.assignedTo.length} Targeted`}</Badge>
                        </div>
                        <div className="bg-muted/10 rounded-[2.5rem] border-2 p-3 space-y-2">
                          <div className={cn("p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all", newDoc.assignedTo.includes('all') ? "bg-primary text-white shadow-lg" : "hover:bg-white")} onClick={() => toggleAssignment('all')}>
                            <span className="text-sm font-black uppercase tracking-tight">Assign to Entire Roster</span>
                            {newDoc.assignedTo.includes('all') && <CheckCircle2 className="h-5 w-5" />}
                          </div>
                          <div className="h-px bg-muted mx-4" />
                          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            {members.map(member => (
                              <div key={member.id} className={cn("p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all", newDoc.assignedTo.includes(member.id) ? "bg-black text-white shadow-lg" : "hover:bg-white")} onClick={() => toggleAssignment(member.id)}>
                                <div className="flex items-center gap-4">
                                  <Avatar className="h-10 w-10 rounded-xl border-2 border-background shadow-sm">
                                    <AvatarImage src={member.avatar} />
                                    <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0"><p className="text-sm font-black uppercase truncate">{member.name}</p><p className="text-[9px] font-bold opacity-60 uppercase tracking-widest">{member.position}</p></div>
                                </div>
                                {newDoc.assignedTo.includes(member.id) && <CheckCircle2 className="h-5 w-5 text-primary" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t">
                    <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleCreateDocument} disabled={isProcessing || !newDoc.title || !newDoc.content}>
                      {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <ShieldCheck className="h-6 w-6 mr-3" />}
                      {editingDocId ? 'Update & Synchronize Protocol' : 'Deploy Verified Protocol'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {documents?.map(doc => (
              <Card key={doc.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group transition-all hover:shadow-xl">
                <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="bg-primary/5 p-4 rounded-2xl text-primary"><PenTool className="h-6 w-6" /></div>
                    <div>
                      <h3 className="font-black text-xl uppercase tracking-tight leading-none">{doc.title}</h3>
                      <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">
                        <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount} Signed</span>
                        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                        <Badge variant="outline" className="h-4 px-1.5 text-[7px] border-primary/20 text-primary">{doc.type}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px] border-2" onClick={() => setSelectedDoc(doc)}>Audit</Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-primary/5 rounded-xl" onClick={() => handleEditDocument(doc)}><Edit3 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive h-10 w-10 hover:bg-destructive/5 rounded-xl" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {documents?.length === 0 && (
              <div className="py-24 text-center border-2 border-dashed rounded-[3rem] opacity-30 italic font-bold uppercase text-xs tracking-widest">
                No compliance protocols established.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="recruitment" className="space-y-8 mt-0">
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
                            <DialogContent className="rounded-3xl border-none shadow-2xl p-0 sm:max-w-lg overflow-y-auto">
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
                    <tr><td colSpan={3} className="py-20 text-center opacity-30 italic font-bold">No applicants in pool. Share a pipeline link to recruit.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="personnel" className="space-y-8 mt-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-black p-2.5 rounded-xl text-white shadow-lg"><UserCog className="h-5 w-5" /></div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">Personnel Intelligence</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{members.length} Enrolled Members</p></div>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Tactical search..." 
                className="pl-9 h-11 rounded-xl bg-muted/30 border-none font-bold shadow-inner" 
                value={personnelSearch}
                onChange={e => setPersonnelPersonnelSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPersonnel.map(member => (
              <Card key={member.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group hover:ring-primary/20 transition-all cursor-pointer" onClick={() => setSelectedPersonnel(member)}>
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <Avatar className="h-14 w-14 rounded-2xl border-2 border-background shadow-md">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="font-black text-lg uppercase tracking-tight group-hover:text-primary transition-colors truncate">{member.name}</h4>
                        <Badge variant="outline" className="text-[8px] h-4 font-black border-primary/20 text-primary px-1.5 uppercase">#{member.jersey}</Badge>
                      </div>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{member.position}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-primary opacity-20 group-hover:opacity-100 transition-all" />
                </CardContent>
              </Card>
            ))}
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
        <DialogContent className="rounded-[2.5rem] sm:max-w-xl border-none shadow-2xl p-0 overflow-y-auto">
          <div className="h-2 bg-black w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div><DialogTitle className="text-2xl font-black uppercase">{selectedDoc?.title}</DialogTitle><DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Compliance Audit</DialogDescription></div>
                <Button variant="outline" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] border-2" onClick={() => selectedDoc && exportSignaturesCSV(selectedDoc.id)}><Download className="h-3 w-3 mr-2" /> Export CSV</Button>
              </div>
            </DialogHeader>
            <div className="space-y-4">
              {selectedDoc && <SignatureList teamId={activeTeam!.id} documentId={selectedDoc.id} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedPersonnel && (
        <PersonnelAuditDialog 
          member={selectedPersonnel} 
          isOpen={!!selectedPersonnel} 
          onOpenChange={(o) => !o && setSelectedPersonnel(null)} 
        />
      )}

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
