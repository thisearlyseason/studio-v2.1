
"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardFooter 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  File as FileIcon, 
  Download, 
  Upload,
  Calendar,
  Trash2,
  Lock,
  FolderClosed,
  Plus,
  ShieldCheck,
  Check,
  XCircle,
  FileCheck,
  ChevronRight,
  Search,
  Filter,
  CheckCircle2,
  Info,
  FileSignature,
  PenTool,
  ArrowRight,
  Clock,
  Shield,
  Loader2
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, TeamDocument, DocumentSignature, Member } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter, 
  DialogClose
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where, doc, getDocs } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function DocumentSigningDialog({ doc: d, onSign, members, onComplete }: { doc: TeamDocument, onSign: (id: string, sig: string, mid: string) => Promise<boolean>, members: Member[], onComplete: () => void }) {
  const [signature, setSignature] = useState('');
  const [targetMemberId, setTargetMemberId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSign = async () => {
    if (!signature.trim() || !agreed || !targetMemberId) return;
    setIsProcessing(true);
    const success = await onSign(d.id, signature, targetMemberId);
    if (success) {
      setIsOpen(false);
      onComplete();
    }
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all">
          Execute Document <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[2.5rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">{d.title}</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Verified Execution Protocol</DialogDescription>
          </DialogHeader>

          <div className="p-1 bg-muted rounded-2xl border-2">
            <ScrollArea className="h-64 p-6 bg-white rounded-xl">
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-foreground/80">{d.content}</p>
            </ScrollArea>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Executing Signature For</Label>
              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select roster member..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="font-bold">{m.name} ({m.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 group cursor-pointer" onClick={() => setAgreed(!agreed)}>
              <div className={cn(
                "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all",
                agreed ? "bg-primary border-primary text-white" : "border-muted-foreground/30 bg-white"
              )}>
                {agreed && <Check className="h-4 w-4 stroke-[4px]" />}
              </div>
              <Label className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                I verify that I have read and understand all terms within this {d.type}.
              </Label>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Digital Signature (Legal Name)</Label>
              <Input 
                placeholder="Type your name to sign..." 
                value={signature} 
                onChange={e => setSignature(e.target.value)} 
                className="h-14 rounded-2xl border-2 text-xl font-mono italic text-primary text-center" 
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleSign} disabled={!agreed || !signature.trim() || !targetMemberId || isProcessing}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Confirm & Verify Signatures"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FilesPage() {
  const { activeTeam, addFile, deleteFile, user, isPro, purchasePro, isSuperAdmin, isStaff, members, signTeamDocument } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('Compliance');
  const [uploadDescription, setUploadDescription] = useState('');
  const [signedDocIds, setSignedDocIds] = useState<Record<string, string[]>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter members list for parent to include themselves and their children
  const signingMembers = useMemo(() => {
    if (!user) return [];
    if (!members) return [];
    if (isStaff) return members;
    return members.filter(m => m.userId === user.id || m.parentEmail === user.email);
  }, [members, user, isStaff]);

  // Queries
  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles } = useCollection<TeamFile>(filesQuery);
  
  const teamFiles = useMemo(() => {
    const all = rawFiles || [];
    return all.filter(f => {
      const isCertificate = f.category === 'Signed Certificate';
      if (isCertificate) {
        // Show certificate only if user is staff or it belongs to them/their children
        if (isStaff || isSuperAdmin) return true;
        const myMemberIds = signingMembers.map(m => m.id);
        return f.memberId && myMemberIds.includes(f.memberId);
      }
      return !['Game Tape', 'Practice Session', 'Highlights'].includes(f.category);
    });
  }, [rawFiles, isStaff, isSuperAdmin, signingMembers]);

  const filteredFiles = useMemo(() => {
    return teamFiles.filter(file => 
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [teamFiles, searchTerm]);

  const docsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const checkSigs = useCallback(async () => {
    if (!activeTeam || signingMembers.length === 0 || !db) return;
    const results: Record<string, string[]> = {};
    
    for (const m of signingMembers) {
      const signedIds: string[] = [];
      const docsSnap = await getDocs(collection(db, 'teams', activeTeam.id, 'documents'));
      for (const d of docsSnap.docs) {
        const sigSnap = await getDocs(query(collection(db, 'teams', activeTeam.id, 'documents', d.id, 'signatures'), where('memberId', '==', m.id)));
        if (!sigSnap.empty) {
          signedIds.push(d.id);
        }
      }
      results[m.id] = signedIds;
    }
    setSignedDocIds(results);
  }, [activeTeam, signingMembers, db]);

  useEffect(() => {
    setMounted(true);
    checkSigs();
  }, [checkSigs, documents]);

  const pendingDocsForDisplay = useMemo(() => {
    if (!documents) return [];
    
    // We group by document, but only if SOME eligible member hasn't signed it
    return documents.filter(d => {
      const isParentalWaiver = d.id === 'default_parental';
      
      return signingMembers.some(m => {
        const isAdult = m.birthdate && differenceInYears(new Date(), new Date(m.birthdate)) >= 18;
        if (isParentalWaiver && isAdult) return false;
        
        const isAssigned = d.assignedTo.includes('all') || d.assignedTo.includes(m.id);
        const alreadySigned = signedDocIds[m.id]?.includes(d.id);
        return isAssigned && !alreadySigned;
      });
    });
  }, [documents, signedDocIds, signingMembers]);

  if (!mounted || !activeTeam) return null;

  const handleDownloadCertificate = (file: TeamFile) => {
    const content = `CERTIFICATE OF VERIFIED SIGNATURE\n\nDocument: ${file.name}\nTimestamp: ${file.date}\nDescription: ${file.description}\n\nThis document was digitally executed within the SquadForge platform.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file.name.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        addFile(file.name, file.name.split('.').pop()?.toLowerCase() || 'file', file.size, event.target?.result as string, uploadCategory, uploadDescription);
        toast({ title: "Document Archived" });
        setUploadDescription('');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-12 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 mb-2">Squad Repository</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Library & Docs</h1>
          <p className="text-sm font-bold text-muted-foreground">Official squad repository for waivers and administration.</p>
        </div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <Dialog>
              <DialogTrigger asChild>
                <Button className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg shadow-primary/20">
                  <Upload className="h-4 w-4 mr-2" /> Upload Resource
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Archive Resource</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px]">Enroll administrative resources</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Type</Label>
                      <Select value={uploadCategory} onValueChange={setUploadCategory}>
                        <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="Compliance">Compliance & Waivers</SelectItem><SelectItem value="Other">Other Documents</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Notes</Label><Textarea placeholder="Context for the squad..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-bold resize-none" /></div>
                    <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                      <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform"><FileText className="h-8 w-8 text-primary" /></div>
                      <p className="text-sm font-black uppercase">Select File</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {pendingDocsForDisplay.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="bg-red-100 p-2 rounded-xl text-red-600 animate-pulse">
              <FileSignature className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Action Required</h2>
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Pending Signatures</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingDocsForDisplay.map(d => (
              <Card key={d.id} className="rounded-[2.5rem] border-none shadow-xl ring-2 ring-red-100 bg-white overflow-hidden flex flex-col group">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start">
                    <Badge className="bg-red-600 text-white border-none font-black text-[8px] uppercase px-2 h-5">URGENT</Badge>
                    <span className="text-[10px] font-black text-muted-foreground uppercase">{d.type}</span>
                  </div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight pt-2">{d.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-3 leading-relaxed mb-6 italic">
                    "{d.content}"
                  </p>
                  <DocumentSigningDialog 
                    doc={d} 
                    onSign={signTeamDocument} 
                    members={signingMembers.filter(m => {
                      const isAdult = m.birthdate && differenceInYears(new Date(), new Date(m.birthdate)) >= 18;
                      if (d.id === 'default_parental' && isAdult) return false;
                      const isAssigned = d.assignedTo.includes('all') || d.assignedTo.includes(m.id);
                      const signed = signedDocIds[m.id]?.includes(d.id);
                      return isAssigned && !signed;
                    })} 
                    onComplete={checkSigs} 
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
              <FolderClosed className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight">Archive & Vault</h2>
          </div>
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search archived resources..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="pl-11 h-12 rounded-2xl bg-muted/50 border-none shadow-inner font-black" 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.map(file => {
            const isCertificate = file.category === 'Signed Certificate';
            return (
              <Card key={file.id} className={cn(
                "group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5",
                isCertificate ? "bg-primary/5 border-primary/20 ring-primary/10" : "bg-white"
              )}>
                <CardHeader className="p-6 pb-2">
                  <div className="flex justify-between items-start">
                    <div className={cn(
                      "p-3 rounded-2xl shadow-sm",
                      isCertificate ? "bg-primary text-white" : "bg-primary/5 text-primary"
                    )}>
                      {isCertificate ? <Shield className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                    </div>
                    <Badge variant={isCertificate ? "default" : "outline"} className={cn(
                      "text-[8px] font-black uppercase",
                      !isCertificate && "border-primary/20 text-primary"
                    )}>{file.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 pt-2 space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-black text-sm uppercase tracking-tight truncate">{file.name}</h3>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">{file.size || 'N/A'} • {format(new Date(file.date), 'MMM d, yyyy')}</p>
                  </div>
                  {file.description && <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed italic">"{file.description}"</p>}
                </CardContent>
                <CardFooter className="p-6 pt-0 flex gap-2">
                  {isCertificate ? (
                    <Button className="flex-1 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20" onClick={() => handleDownloadCertificate(file)}>
                      <Download className="h-3 w-3 mr-2" /> Download Cert
                    </Button>
                  ) : (
                    <Button className="flex-1 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20" onClick={() => window.open(file.url, '_blank')}>
                      View Resource
                    </Button>
                  )}
                  {isStaff && <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => setFileToDelete(file.id)}><Trash2 className="h-4 w-4" /></Button>}
                </CardFooter>
              </Card>
            );
          })}

          {filteredFiles.length === 0 && pendingDocsForDisplay.length === 0 && (
            <div className="col-span-full py-24 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed space-y-4 opacity-40">
              <FolderClosed className="h-12 w-12 mx-auto" />
              <p className="text-sm font-black uppercase tracking-widest">No Documents Found</p>
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={!!fileToDelete} onOpenChange={o => !o && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black uppercase">Purge Document?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/80">This action is permanent and will remove this resource from the squad repository for all members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(fileToDelete) { deleteFile(fileToDelete); setFileToDelete(null); } }} className="rounded-xl font-black bg-red-600">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
