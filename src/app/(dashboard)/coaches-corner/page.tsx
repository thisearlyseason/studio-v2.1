
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, doc, getDocs } from 'firebase/firestore';
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
  ClipboardCheck,
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
  Building
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
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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
  const { activeTeam, isStaff, members, createTeamDocument, deleteTeamDocument, resetSquadData } = useTeam();
  const db = useFirestore();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isDoubleConfirmOpen, setIsDoubleConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });
  
  const [resetOptions, setResetOptions] = useState<string[]>(['games', 'events']);

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

  const handleExport = async (type: 'games' | 'tournaments' | 'scouting') => {
    if (!activeTeam || !db) return;
    let coll = '';
    let fileName = '';
    let headers: string[] = [];
    
    if (type === 'games') {
      coll = 'games'; fileName = 'match_ledger'; headers = ['Date', 'Opponent', 'Us', 'Them', 'Result', 'Notes'];
    } else if (type === 'tournaments') {
      coll = 'events'; fileName = 'tournament_records'; headers = ['Title', 'Date', 'Location', 'Teams'];
    } else if (type === 'scouting') {
      coll = 'scouting'; fileName = 'intel_scouting'; headers = ['Opponent', 'Date', 'Strengths', 'Weaknesses', 'Keys'];
    }

    const snap = await getDocs(collection(db, 'teams', activeTeam.id, coll));
    const rows = snap.docs.map(d => {
      const data = d.data();
      if (type === 'games') return [data.date, data.opponent, data.myScore, data.opponentScore, data.result, `"${data.notes || ''}"`];
      if (type === 'tournaments' && data.isTournament) return [data.title, data.date, data.location, `"${data.tournamentTeams?.join(', ') || ''}"`];
      if (type === 'scouting') return [data.opponentName, data.date, `"${data.strengths}"`, `"${data.weaknesses}"`, `"${data.keysToVictory}"`];
      return null;
    }).filter(r => r !== null);

    if (rows.length === 0) { toast({ title: "Empty Ledger", description: "No data found for this category." }); return; }

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e?.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeTeam.name}_${fileName}_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-12 px-6 rounded-xl font-black uppercase text-[10px] border-2 border-primary/20 text-primary hover:bg-primary/5 hover:text-black transition-colors">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset Season
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden">
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 space-y-6">
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="h-6 w-6 text-primary" />
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Season Purge</DialogTitle>
                  </div>
                  <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Select data categories to wipe for the new season.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {[
                    { id: 'games', label: 'Match Ledger (Win/Loss Records)', icon: Trophy },
                    { id: 'events', label: 'Itinerary (Matches & Practices)', icon: Clock },
                    { id: 'scouting', label: 'Scouting Intel (Opponent Reports)', icon: Target },
                    { id: 'feed', label: 'Squad Feed (Historical Broadcasts)', icon: Activity },
                    { id: 'members', label: 'Squad Roster (Players & Members)', icon: Users },
                    { id: 'facilities', label: 'Facility Data (Venues & Fields)', icon: Building }
                  ].map(opt => (
                    <div key={opt.id} className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer",
                      resetOptions.includes(opt.id) ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/30 border-transparent hover:border-muted"
                    )} onClick={() => setResetOptions(prev => prev.includes(opt.id) ? prev.filter(i => i !== opt.id) : [...prev, opt.id])}>
                      <div className="flex items-center gap-3">
                        <opt.icon className={cn("h-4 w-4", resetOptions.includes(opt.id) ? "text-primary" : "text-muted-foreground opacity-60")} />
                        <span className="text-xs font-black uppercase">{opt.label}</span>
                      </div>
                      <Checkbox checked={resetOptions.includes(opt.id)} onCheckedChange={() => {}} className="rounded-lg h-5 w-5" />
                    </div>
                  ))}
                </div>
                <div className="bg-amber-50 p-4 rounded-2xl border-2 border-dashed border-amber-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Info className="h-3 w-3 text-amber-600" />
                    <p className="text-[9px] font-black uppercase text-amber-700 tracking-widest">Strategic Reminder</p>
                  </div>
                  <p className="text-[10px] font-bold text-amber-800 leading-relaxed italic">
                    Ensure you have exported all Match Ledgers and Scouting Intel as CSV files before proceeding.
                  </p>
                </div>
                <DialogFooter>
                  <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleResetClick} disabled={isProcessing || resetOptions.length === 0}>
                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Commit Tactical Reset"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-12 px-8 rounded-xl font-black shadow-xl shadow-primary/20">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center gap-2 px-2">
            <FileSignature className="h-5 w-5 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Compliance Ledger</h2>
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
            {(!documents || documents.length === 0) && (
              <div className="text-center py-20 bg-muted/10 rounded-[2.5rem] border-2 border-dashed opacity-40">
                <PenTool className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No protocols established.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Intelligence Export</h3>
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden group relative">
              <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                <Zap className="h-32 w-32" />
              </div>
              <CardContent className="p-8 relative z-10 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Seasonal Archives</p>
                <div className="grid grid-cols-1 gap-3">
                  <Button variant="ghost" className="w-full justify-between h-12 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 px-4 font-bold uppercase text-[10px] tracking-widest" onClick={() => handleExport('games')}>
                    <div className="flex items-center gap-3"><Trophy className="h-4 w-4 text-primary" /> League Ledger</div>
                    <Download className="h-3.5 w-3.5 opacity-40" />
                  </Button>
                  <Button variant="ghost" className="w-full justify-between h-12 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 px-4 font-bold uppercase text-[10px] tracking-widest" onClick={() => handleExport('tournaments')}>
                    <div className="flex items-center gap-3"><TableIcon className="h-4 w-4 text-primary" /> Tournament Brackets</div>
                    <Download className="h-3.5 w-3.5 opacity-40" />
                  </Button>
                  <Button variant="ghost" className="w-full justify-between h-12 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 px-4 font-bold uppercase text-[10px] tracking-widest" onClick={() => handleExport('scouting')}>
                    <div className="flex items-center gap-3"><Target className="h-4 w-4 text-primary" /> Scouting Reports</div>
                    <Download className="h-3.5 w-3.5 opacity-40" />
                  </Button>
                </div>
                <p className="text-[8px] font-medium text-white/40 italic text-center pt-2">All files generated in CSV format.</p>
              </CardContent>
            </Card>
          </section>

          <Card className="rounded-[2rem] border-none shadow-md bg-white ring-1 ring-black/5 p-8 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Compliance Protocol</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Official squad agreements are legally binding digital signatures. Export certificates from the audit view for insurance verification.
            </p>
          </Card>
        </aside>
      </div>

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
