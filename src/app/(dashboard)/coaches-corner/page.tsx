
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, TeamDocument, Member, DocumentSignature } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, doc } from 'firebase/firestore';
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
  FileText
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
  const { activeTeam, isStaff, members, createTeamDocument, deleteTeamDocument } = useTeam();
  const db = useFirestore();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TeamDocument | null>(null);
  
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'waiver' as any, assignedTo: ['all'] });

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents, isLoading } = useCollection<TeamDocument>(docsQuery);

  if (!isStaff) {
    return (
      <div className="py-24 text-center space-y-6">
        <div className="bg-muted p-6 rounded-[3rem] opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /></div>
        <h1 className="text-3xl font-black uppercase">Staff Access Only</h1>
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">This coordination hub is reserved for coaching staff.</p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newDoc.title || !newDoc.content) return;
    setIsProcessing(true);
    await createTeamDocument(newDoc);
    setIsCreateOpen(false);
    setIsProcessing(false);
    setNewDoc({ title: '', content: '', type: 'waiver', assignedTo: ['all'] });
    toast({ title: "Document Deployed", description: "Available for signatures in player hubs." });
  };

  const handleDownloadReport = (doc: TeamDocument) => {
    toast({ title: "Report Generating", description: "Preparing seasonal compliance CSV..." });
    // In a real app, we'd fetch all signatures and format as CSV
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Administrative Engine</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Coaches Corner</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Waivers, Compliance & Official Record</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
              <Plus className="h-5 w-5 mr-2" /> Create Protocol
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 space-y-8">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Document Architect</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Formalize squad protocols and liability terms</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label>
                    <Input placeholder="e.g. 2024 Travel Liability" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Protocol Type</Label>
                    <Select value={newDoc.type} onValueChange={v => setNewDoc({...newDoc, type: v})}>
                      <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="waiver">Legal Waiver</SelectItem>
                        <SelectItem value="policy">Conduct Policy</SelectItem>
                        <SelectItem value="info">Informational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Document Content</Label>
                  <Textarea 
                    placeholder="Enter the full legal or informational text..." 
                    value={newDoc.content} 
                    onChange={e => setNewDoc({...newDoc, content: e.target.value})} 
                    className="min-h-[250px] rounded-2xl border-2 font-medium leading-relaxed p-6 bg-muted/10 resize-none" 
                  />
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Assignment Scope</p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setNewDoc({...newDoc, assignedTo: ['all']})}
                      className={cn(
                        "flex-1 p-4 rounded-xl border-2 font-black text-[10px] uppercase transition-all",
                        newDoc.assignedTo[0] === 'all' ? "bg-primary text-white border-primary shadow-lg" : "bg-muted/30 border-transparent hover:border-muted"
                      )}
                    >
                      Entire Roster
                    </button>
                    <button 
                      onClick={() => setNewDoc({...newDoc, assignedTo: []})}
                      className={cn(
                        "flex-1 p-4 rounded-xl border-2 font-black text-[10px] uppercase transition-all",
                        newDoc.assignedTo[0] !== 'all' ? "bg-black text-white border-black shadow-lg" : "bg-muted/30 border-transparent hover:border-muted"
                      )}
                    >
                      Targeted Members
                    </button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleCreate} disabled={isProcessing || !newDoc.title || !newDoc.content}>
                  Dispatch to Squad Hub
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Compliance Ledger</h3>
            </div>
            <Badge variant="outline" className="text-[8px] font-black border-primary/20 text-primary">{documents?.length || 0} ACTIVE DOCS</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {documents?.map((doc) => (
              <Card key={doc.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:shadow-xl transition-all group overflow-hidden bg-white">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-stretch">
                    <div className="w-full md:w-20 bg-muted/30 flex items-center justify-center p-6 border-r group-hover:bg-primary/5 transition-colors">
                      <FileText className="h-8 w-8 text-primary/40 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black uppercase tracking-tight group-hover:text-primary transition-colors">{doc.title}</h3>
                          <Badge variant="outline" className="text-[7px] font-black uppercase h-4 px-1.5 border-primary/20 text-primary">{doc.type}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                          <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount || 0} / {members.length} Signed</span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="rounded-xl h-10 w-10 border hover:bg-muted"
                          onClick={() => setSelectedDoc(doc)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="rounded-xl h-10 w-10 border text-destructive hover:bg-destructive/5"
                          onClick={() => deleteTeamDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          className="rounded-xl h-10 px-4 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                          onClick={() => setSelectedDoc(doc)}
                        >
                          Audit Signatures <ChevronRight className="ml-1 h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {(!documents || documents.length === 0) && (
              <div className="text-center py-20 bg-muted/10 rounded-[3rem] border-2 border-dashed opacity-40">
                <PenTool className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No squad protocols established.</p>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-8">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <ShieldCheck className="h-48 w-48" />
            </div>
            <CardContent className="p-10 relative z-10 space-y-6">
              <div className="space-y-2">
                <Badge className="bg-primary text-white border-none font-black text-[8px] uppercase px-2 h-5">Legal Infrastructure</Badge>
                <h3 className="text-3xl font-black tracking-tight leading-none">Compliance Hub</h3>
              </div>
              <p className="text-white/60 text-sm font-medium leading-relaxed italic">
                Professional coordination requires professional verification. Create waivers for tournaments, travel, and seasonal registrations to maintain a master audit trail.
              </p>
              <div className="pt-4 border-t border-white/10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-lg"><ClipboardCheck className="h-4 w-4 text-primary" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Real-time Verification</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-lg"><Download className="h-4 w-4 text-primary" /></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Export Seasonal Records</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-lg bg-white ring-1 ring-black/5">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-[0.2em]">Operational Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-end mb-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Compliance Rate</p>
                  <p className="text-xs font-black text-primary">0%</p>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-0" />
                </div>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed italic">
                Encourage all squad members to complete pending signatures in their Library.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={!!selectedDoc} onOpenChange={o => !o && setSelectedDoc(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="h-2 bg-black w-full" />
          <div className="p-8 space-y-8">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">{selectedDoc?.title}</DialogTitle>
                  <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Official Signature Audit</DialogDescription>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl font-black text-[10px] uppercase border-2 h-9" onClick={() => selectedDoc && handleDownloadReport(selectedDoc)}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Export
                </Button>
              </div>
            </DialogHeader>

            <ScrollArea className="h-[400px] pr-4">
              {selectedDoc && <SignatureList teamId={activeTeam.id} documentId={selectedDoc.id} />}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest border-2" onClick={() => setSelectedDoc(null)}>
                Close Audit
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
