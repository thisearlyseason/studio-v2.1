
"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  GraduationCap
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
import { generateScoutingBrief } from '@/ai/flows/scouting-report-agent';

const DEFAULT_PROTOCOLS = [
  { id: 'medical', label: 'Medical Clearance', icon: HeartPulse, type: 'waiver' },
  { id: 'travel', label: 'Travel Consent', icon: Plane, type: 'waiver' },
  { id: 'parental', label: 'Parental Waiver', icon: ShieldCheck, type: 'waiver' },
  { id: 'photography', label: 'Photography Release', icon: Camera, type: 'waiver' }
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

function PersonnelAuditDialog({ member, isOpen, onOpenChange }: { member: Member, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { updateStaffEvaluation, getStaffEvaluation, updateMember } = useTeam();
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [editForm, setEditForm] = useState({
    name: member.name || '',
    position: member.position || '',
    jersey: member.jersey || '',
    notes: member.notes || '',
    gradYear: member.gradYear || '',
    gpa: member.gpa || '',
    school: member.school || '',
    highlightUrl: member.highlightUrl || ''
  });

  useEffect(() => {
    if (isOpen) {
      getStaffEvaluation(member.id).then(setNote);
      setEditForm({
        name: member.name || '',
        position: member.position || '',
        jersey: member.jersey || '',
        notes: member.notes || '',
        gradYear: member.gradYear || '',
        gpa: member.gpa || '',
        school: member.school || '',
        highlightUrl: member.highlightUrl || ''
      });
    }
  }, [isOpen, member, getStaffEvaluation]);

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await updateStaffEvaluation(member.id, note);
      await updateMember(member.id, editForm);
      toast({ title: "Personnel Record Synchronized" });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUpdatingAvatar(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await updateMember(member.id, { avatar: ev.target?.result as string });
        toast({ title: "Photo Updated" });
        setIsUpdatingAvatar(false);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleExportPortfolio = useCallback(() => {
    const headers = ["PLAYER PROFILE - THE SQUAD CERTIFIED", "", "Name", "Position", "Jersey", "Grad Year", "GPA", "School", "Highlights", "Clearance", "Evaluations", "Bio"];
    const row = [
      "", "",
      member.name, member.position, member.jersey, member.gradYear, member.gpa, member.school, member.highlightUrl,
      member.medicalClearance ? 'Cleared' : 'Pending',
      note.replace(/,/g, ';').replace(/\n/g, ' '),
      (member.notes || '').replace(/,/g, ';').replace(/\n/g, ' ')
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, row].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `RECRUITING_PACK_${member.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [member, note]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl bg-white overflow-y-auto max-h-[90vh] custom-scrollbar">
        <DialogTitle className="sr-only">Recruiting Intelligence Hub: {member.name}</DialogTitle>
        <div className="h-2 bg-black w-full" />
        <div className="flex flex-col lg:flex-row h-full">
          <div className="w-full lg:w-5/12 bg-muted/20 p-8 lg:p-10 space-y-8 border-r overflow-y-auto custom-scrollbar">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative group">
                <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                <Avatar className="h-32 w-32 rounded-[2.5rem] border-4 border-background shadow-2xl transition-transform group-hover:scale-105">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="font-black text-2xl">{member.name[0]}</AvatarFallback>
                </Avatar>
                <Button size="icon" variant="secondary" className="absolute bottom-1 right-1 h-9 w-9 rounded-xl shadow-xl bg-white text-primary opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => avatarInputRef.current?.click()} disabled={isUpdatingAvatar}>
                  {isUpdatingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </Button>
              </div>
              
              <div className="space-y-4 w-full">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Identity & Roster</Label>
                  <Input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="h-12 rounded-xl font-black text-lg border-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Position</Label>
                    <Input value={editForm.position} onChange={e => setEditForm({...editForm, position: e.target.value})} className="h-11 rounded-xl font-bold border-2" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Jersey #</Label>
                    <Input value={editForm.jersey} onChange={e => setEditForm({...editForm, jersey: e.target.value})} className="h-11 rounded-xl font-black border-2" />
                  </div>
                </div>

                <div className="pt-4 border-t border-muted-foreground/10 space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-primary text-left block ml-1">Recruiting Data</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 text-left">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Class Year</Label>
                      <Input value={editForm.gradYear} onChange={e => setEditForm({...editForm, gradYear: e.target.value})} className="h-11 rounded-xl font-bold border-2" placeholder="2028" />
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">GPA</Label>
                      <Input value={editForm.gpa} onChange={e => setEditForm({...editForm, gpa: e.target.value})} className="h-11 rounded-xl font-bold border-2" placeholder="3.8" />
                    </div>
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Current School</Label>
                    <Input value={editForm.school} onChange={e => setEditForm({...editForm, school: e.target.value})} className="h-11 rounded-xl font-bold border-2" placeholder="Central High" />
                  </div>
                  <div className="space-y-2 text-left">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Highlight URL</Label>
                    <Input value={editForm.highlightUrl} onChange={e => setEditForm({...editForm, highlightUrl: e.target.value})} className="h-11 rounded-xl font-bold border-2" placeholder="Hudl / YouTube link..." />
                  </div>
                </div>

                <div className="space-y-2 text-left pt-4 border-t border-muted-foreground/10">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Public Bio</Label>
                  <Textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="min-h-[100px] rounded-2xl font-medium text-sm p-4 border-2 resize-none" placeholder="Athlete narrative..." />
                </div>
              </div>
              <div className="w-full pt-6 border-t border-muted space-y-4">
                <Button variant="outline" className="w-full h-12 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest" onClick={handleExportPortfolio}>
                  <Download className="h-4 w-4 mr-2" /> Export Recruiting Pack
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 p-8 lg:p-10 space-y-8 overflow-y-auto bg-white">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Private Staff Evaluation</h4>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-4">
                This evaluation ledger is strictly restricted to coaching staff. Log tactical aptitude, leadership metrics, and developmental milestones.
              </p>
              <Textarea 
                placeholder="Log performance benchmarks, tactical aptitude, or recruitment observations..." 
                value={note}
                onChange={e => setNote(e.target.value)}
                className="min-h-[400px] rounded-3xl bg-muted/10 border-none font-bold p-6 text-base shadow-inner resize-none focus:bg-white transition-all"
              />
            </div>
            <div className="pt-4 border-t flex justify-end gap-3">
              <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-primary/20" onClick={handleSaveAll} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Save className="h-6 w-6 mr-2" />}
                Synchronize Recruiting Intelligence
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefaultProtocolCard({ protocol, activeTeam, db }: { protocol: any, activeTeam: any, db: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const docId = `default_${protocol.id}`;
  
  const docRef = useMemoFirebase(() => (db && activeTeam) ? doc(db, 'teams', activeTeam.id, 'documents', docId) : null, [db, activeTeam?.id, docId]);
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
              <Button variant="ghost" size="sm" className="w-full h-8 rounded-lg font-black text-[8px] uppercase tracking-widest hover:bg-primary/5 hover:text-primary border border-transparent hover:border-primary/20">
                Edit Legal Text
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden sm:max-w-xl">
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">Edit Protocol: {protocol.label}</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px]">Define squad liability & terms</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase ml-1">Official Waiver Verbiage</Label>
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
  const { activeTeam, isStaff, members, createTeamDocument, updateTeamDocument, deleteTeamDocument, respondToAssignment, exportSignaturesCSV, addScoutingReport, deleteScoutingReport } = useTeam();
  const db = useFirestore();
  
  const [activeTab, setActiveTab] = useState('compliance');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });
  
  const [selectedPersonnel, setSelectedPersonnel] = useState<Member | null>(null);
  const [personnelSearch, setPersonnelPersonnelSearch] = useState('');

  const [isAddScoutingOpen, setIsAddScoutingOpen] = useState(false);
  const [newScouting, setNewScouting] = useState({ opponentName: '', date: '', strengths: '', weaknesses: '', keysToVictory: '', videoUrl: '' });
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiObservations, setAiObservations] = useState('');
  const [scoutingSearch, setScoutingSearch] = useState('');

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const scoutingQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'scouting'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  const documents = useMemo(() => allDocuments?.filter(d => !d.id.startsWith('default_')) || [], [allDocuments]);

  const { data: rawScouting } = useCollection<ScoutingReport>(scoutingQuery);
  const scoutingReports = useMemo(() => rawScouting || [], [rawScouting]);

  const teamEntriesQuery = useMemoFirebase(() => (db && activeTeam) ? collectionGroup(db, 'registrationEntries') : null, [db, activeTeam?.id]);
  const { data: allEntries } = useCollection<RegistrationEntry>(teamEntriesQuery);

  const teamEntries = useMemo(() => {
    if (!allEntries || !activeTeam) return [];
    return allEntries.filter(e => e.assigned_team_id === activeTeam.id || e.league_id === activeTeam.id);
  }, [allEntries, activeTeam]);

  const filteredPersonnel = useMemo(() => {
    return members.filter(m => m.name.toLowerCase().includes(personnelSearch.toLowerCase()));
  }, [members, personnelSearch]);

  const filteredScouting = useMemo(() => scoutingReports.filter(r => r.opponentName.toLowerCase().includes(scoutingSearch.toLowerCase())), [scoutingReports, scoutingSearch]);

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

  const handleAddScouting = async () => {
    if (!newScouting.opponentName || !newScouting.date) return;
    await addScoutingReport(newScouting);
    setIsAddScoutingOpen(false);
    setNewScouting({ opponentName: '', date: '', strengths: '', weaknesses: '', keysToVictory: '', videoUrl: '' });
    setAiObservations('');
    toast({ title: "Scouting Brief Finalized" });
  };

  const handleAiAnalyze = async () => {
    if (!aiObservations.trim() || !newScouting.opponentName) {
      toast({ title: "Identification Required", description: "Enter opponent name and observations.", variant: "destructive" });
      return;
    }
    setIsAiGenerating(true);
    try {
      const result = await generateScoutingBrief({
        opponentName: newScouting.opponentName,
        sport: activeTeam?.sport || 'General',
        rawObservations: aiObservations
      });
      setNewScouting(prev => ({
        ...prev,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        keysToVictory: result.keysToVictory
      }));
      toast({ title: "Intelligence Generated" });
    } catch (e) {
      toast({ title: "Analysis Failed", variant: "destructive" });
    } finally {
      setIsAiGenerating(false);
    }
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
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-auto p-1 border-2 w-full md:w-auto flex-wrap gap-1 shadow-sm">
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Waivers</TabsTrigger>
            <TabsTrigger value="recruitment" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Recruitment</TabsTrigger>
            <TabsTrigger value="personnel" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Personnel</TabsTrigger>
            <TabsTrigger value="scouting" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Scouting</TabsTrigger>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-primary/5 rounded-xl" onClick={() => { setEditingDocId(doc.id); setNewDoc({ title: doc.title, content: doc.content, type: doc.type, assignedTo: doc.assignedTo }); setIsCreateOpen(true); }}><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-10 w-10 hover:bg-destructive/5 rounded-xl" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!documents || documents.length === 0) && (
                <div className="text-center py-16 opacity-30 border-2 border-dashed rounded-[3rem]">
                  <FileText className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-sm font-black uppercase tracking-widest">No custom documents deployed.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recruitment" className="space-y-8 mt-0">
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
                              <Button size="sm" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] shadow-md shadow-primary/20" onClick={() => respondToAssignment(entry.league_id, entry.id, 'accepted')}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Enroll</Button>
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

        <TabsContent value="personnel" className="space-y-8 mt-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-black p-2.5 rounded-xl text-white shadow-lg"><UserCog className="h-5 w-5" /></div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">Personnel Intelligence</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{members.length} Enrolled Members</p></div>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search roster..." className="pl-9 h-11 rounded-xl bg-muted/30 border-none font-bold" value={personnelSearch} onChange={e => setPersonnelPersonnelSearch(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPersonnel.map(member => (
              <Card key={member.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 group hover:ring-primary/20 transition-all cursor-pointer bg-white" onClick={() => setSelectedPersonnel(member)}>
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
                  <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scouting" className="space-y-8 mt-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><BrainCircuit className="h-5 w-5" /></div>
              <div><h3 className="text-xl font-black uppercase tracking-tight">Opponent Intelligence</h3><p className="text-[9px] font-bold text-muted-foreground uppercase">{scoutingReports.length} Active Briefs</p></div>
            </div>
            <div className="flex gap-2">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search intel..." className="pl-9 h-11 rounded-xl bg-muted/30 border-none font-bold" value={scoutingSearch} onChange={e => setScoutingSearch(e.target.value)} />
              </div>
              <Button onClick={() => setIsAddScoutingOpen(true)} className="h-11 rounded-xl font-black shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" /> New Brief
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredScouting.map(report => (
              <Card key={report.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group hover:shadow-xl transition-all">
                <div className="h-1.5 w-full bg-black" />
                <CardHeader className="p-6 pb-2">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="font-black uppercase text-[8px] border-black/20 text-black">Scouting</Badge>
                    <span className="text-[10px] font-bold text-muted-foreground">{report.date}</span>
                  </div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight pt-2 truncate group-hover:text-primary transition-colors">Vs {report.opponentName}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                  <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 italic">"{report.keysToVictory}"</p>
                </CardContent>
                <CardFooter className="p-6 pt-0 border-t flex items-center justify-between bg-muted/10">
                  <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0 hover:bg-destructive/10" onClick={() => deleteScoutingReport(report.id)}><Trash2 className="h-4 w-4" /></Button>
                  <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all" />
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* --- DIALOGS --- */}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-4xl p-0 border-none shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar bg-white">
          <DialogTitle className="sr-only">Document Architect</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingDocId ? 'Update Waiver' : 'Document Architect'}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Headline</Label><Input value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Type</Label>
                  <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v})}>
                    <SelectTrigger className="h-14 rounded-2xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl"><SelectItem value="waiver" className="font-bold">Legal Waiver</SelectItem><SelectItem value="policy" className="font-bold">Conduct Policy</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Content</Label><Textarea value={newDoc.content} onChange={e => setNewDoc({...newDoc, content: e.target.value})} className="min-h-[250px] rounded-2xl border-2 p-4 font-medium" /></div>
              </div>
              <div className="space-y-6">
                <Label className="text-[10px] font-black uppercase ml-1">Assignment Logic</Label>
                <div className="bg-muted/10 rounded-3xl border-2 p-2 space-y-2">
                  <div className={cn("p-4 rounded-xl flex items-center justify-between cursor-pointer", newDoc.assignedTo.includes('all') ? "bg-primary text-white" : "hover:bg-white")} onClick={() => toggleAssignment('all')}>
                    <span className="text-xs font-black uppercase">Entire Roster</span>
                    {newDoc.assignedTo.includes('all') && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  {members.map(m => (
                    <div key={m.id} className={cn("p-3 rounded-xl flex items-center justify-between cursor-pointer", newDoc.assignedTo.includes(m.id) ? "bg-black text-white" : "hover:bg-white")} onClick={() => toggleAssignment(m.id)}>
                      <span className="text-xs font-bold uppercase truncate">{m.name}</span>
                      {newDoc.assignedTo.includes(m.id) && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl" onClick={handleCreateDocument} disabled={isProcessing}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Protocol"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddScoutingOpen} onOpenChange={setIsAddScoutingOpen}>
        <DialogContent className="sm:max-w-4xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">New Scouting Brief Initialization</DialogTitle>
          <div className="h-2 bg-black w-full" />
          <div className="flex flex-col lg:flex-row h-full">
            <div className="w-full lg:w-5/12 bg-primary/5 p-8 lg:p-10 space-y-8 border-r overflow-y-auto custom-scrollbar max-h-[85vh]">
              <DialogHeader>
                <div className="flex items-center gap-4 mb-2">
                  <div className="bg-primary/10 p-3 rounded-2xl text-primary"><BrainCircuit className="h-6 w-6" /></div>
                  <div>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">AI Tactical Assist</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Generate brief from observations</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-primary/20 space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Raw Match Observations</Label>
                  <Textarea placeholder="Paste raw notes or tendencies here..." value={aiObservations} onChange={e => setAiObservations(e.target.value)} className="min-h-[200px] rounded-2xl bg-muted/10 border-none font-medium text-sm" />
                  <Button className="w-full h-12 rounded-xl font-black uppercase text-xs shadow-lg" onClick={handleAiAnalyze} disabled={isAiGenerating || !aiObservations.trim() || !newScouting.opponentName}>
                    {isAiGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Generate AI Brief
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 p-8 lg:p-10 space-y-6 bg-white overflow-y-auto custom-scrollbar max-h-[85vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase">Opponent Name</Label><Input value={newScouting.opponentName} onChange={e => setNewScouting({...newScouting, opponentName: e.target.value})} className="h-12 rounded-xl border-2" /></div>
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase">Match Date</Label><Input type="date" value={newScouting.date} onChange={e => setNewScouting({...newScouting, date: e.target.value})} className="h-12 rounded-xl border-2" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase">Study Link</Label><Input placeholder="Video or playbook URL..." value={newScouting.videoUrl} onChange={e => setNewScouting({...newScouting, videoUrl: e.target.value})} className="h-12 rounded-xl border-2" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase">Strengths</Label><Textarea value={newScouting.strengths} onChange={e => setNewScouting({...newScouting, strengths: e.target.value})} className="h-24 rounded-xl border-2 p-4 font-bold text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase">Weaknesses</Label><Textarea value={newScouting.weaknesses} onChange={e => setNewScouting({...newScouting, weaknesses: e.target.value})} className="h-24 rounded-xl border-2 p-4 font-bold text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-primary">Primary Keys to Victory</Label><Textarea value={newScouting.keysToVictory} onChange={e => setNewScouting({...newScouting, keysToVictory: e.target.value})} className="h-24 rounded-xl border-primary border-2 p-4 font-black text-sm" /></div>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl" onClick={handleAddScouting} disabled={!newScouting.opponentName || !newScouting.date}>Commit Scouting Brief</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDoc} onOpenChange={o => !o && setSelectedDoc(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-xl p-0 overflow-hidden bg-white shadow-2xl border-none">
          <DialogTitle className="sr-only">Document Audit Ledger</DialogTitle>
          <div className="h-2 bg-black w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div><DialogTitle className="text-2xl font-black uppercase">{selectedDoc?.title}</DialogTitle><DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Compliance Audit</DialogDescription></div>
                <Button variant="outline" className="rounded-xl h-9 px-4 font-black uppercase text-[10px]" onClick={() => selectedDoc && exportSignaturesCSV(selectedDoc.id)}><Download className="h-3 w-3 mr-2" /> CSV</Button>
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
    </div>
  );
}
