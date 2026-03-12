
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

  return (
    <div className="space-y-10 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Coaches Corner</h1>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button className="h-12 px-8 rounded-xl font-black shadow-xl shadow-primary/20"><Plus className="h-4 w-4 mr-2" /> Create Protocol</Button></DialogTrigger>
          <DialogContent className="rounded-[2.5rem] sm:max-w-2xl border-none shadow-2xl p-0 overflow-hidden">
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
              <DialogFooter><Button className="w-full h-14 rounded-2xl font-black" onClick={handleCreate} disabled={isProcessing}>Deploy to Roster</Button></DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {documents?.map(doc => (
          <Card key={doc.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 group">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="bg-primary/5 p-4 rounded-2xl text-primary"><FileSignature className="h-6 w-6" /></div>
                <div>
                  <h3 className="font-black text-xl uppercase tracking-tight">{doc.title}</h3>
                  <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                    <span className="flex items-center gap-1.5"><Users className="h-3 w-3" /> {doc.signatureCount} Signed</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => setSelectedDoc(doc)}>Audit Signatures</Button>
                <Button variant="ghost" size="icon" className="text-destructive h-10 w-10" onClick={() => deleteTeamDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
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
    </div>
  );
}
