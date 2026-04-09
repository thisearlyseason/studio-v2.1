
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
  Loader2,
  ChevronDown,
  FolderOpen,
  Users,
  Signature
} from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, TeamDocument, Member, Team } from '@/components/providers/team-provider';
import { usePendingWaivers } from '@/hooks/use-pending-waivers';
import { generateBrandedPDF } from '@/lib/pdf-utils';
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
import { collection, query, orderBy, where, doc, getDocs, collectionGroup } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function DocumentSigningDialog({ doc: d, onSign, members, onComplete }: { doc: any, onSign: (id: string, sig: string, mid: string) => Promise<boolean>, members: Member[], onComplete: () => void }) {
  const [signature, setSignature] = useState('');
  const [targetMemberId, setTargetMemberId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Auto-select if only one member is available
  useEffect(() => {
    if (members.length === 1 && !targetMemberId) {
      setTargetMemberId(members[0].id);
    }
  }, [members, targetMemberId]);

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
        <DialogTitle className="sr-only">Execute Verified Signature</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">{d.title}</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Verified Execution Protocol</DialogDescription>
          </DialogHeader>

          <div className="p-1 bg-muted rounded-2xl border-2">
            <ScrollArea className="h-64 p-6 bg-white rounded-xl shadow-inner">
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-foreground/80">{d.content}</p>
            </ScrollArea>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Executing Signature For</Label>
              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary/20 transition-all"><SelectValue placeholder="Select who is signing..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="font-bold">{m.name} ({m.position})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 group cursor-pointer transition-all hover:bg-primary/10" onClick={() => setAgreed(!agreed)}>
              <div className={cn(
                "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all",
                agreed ? "bg-primary border-primary text-white" : "border-muted-foreground/30 bg-white"
              )}>
                {agreed && <Check className="h-4 w-4 stroke-[4px]" />}
              </div>
              <Label className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">
                I verify that I have read and understand all terms within this {d.type?.replace('_', ' ')}.
              </Label>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Digital Signature (Legal Name)</Label>
              <Input 
                placeholder="Type your name to sign..." 
                value={signature} 
                onChange={e => setSignature(e.target.value)} 
                className="h-14 rounded-2xl border-2 text-xl font-mono italic text-primary text-center focus:border-primary/40 transition-all" 
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleSign} disabled={!agreed || !signature.trim() || !targetMemberId || isProcessing}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Confirm & Verify Signatures"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function FilesPage() {
  const { activeTeam, addFile, deleteFile, user, isPro, purchasePro, isSuperAdmin, isStaff, isPrimaryClubAuthority, members, teams, signTeamDocument } = useTeam();
  
  // Players and Parents need to access this page to SIGN documents.
  // Starter users now have access, but with a 500mb limit.
  
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('Compliance');
  const [uploadDescription, setUploadDescription] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { pendingDocs: pendingDocsForDisplay, signingMembers, visibleSignedFiles, realTimeSignedDocIds, documents } = usePendingWaivers();

  // Group ALL visible signed files by Team > Type
  const waiverFolders = useMemo(() => {
    const map: Record<string, Record<string, TeamFile[]>> = {};
    visibleSignedFiles.forEach(f => {
      const teamName = f.teamName || 'Unknown Squad';
      const docType = f.waiverType || f.name.split(':')[0].replace('Signed', '').trim() || 'General Waiver';
      
      if (!map[teamName]) map[teamName] = {};
      if (!map[teamName][docType]) map[teamName][docType] = [];
      map[teamName][docType].push(f);
    });
    return map;
  }, [visibleSignedFiles]);

  // Local team non-certificate files
  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles } = useCollection<TeamFile>(filesQuery);
  const resourceFiles = useMemo(() => {
    const all = rawFiles || [];
    return all.filter(f => f.category !== 'Signed Certificate' && !['Game Tape', 'Practice Session', 'Highlights'].includes(f.category));
  }, [rawFiles]);

  const filteredResources = useMemo(() => {
    return resourceFiles.filter(file => 
      file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [resourceFiles, searchTerm]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) return null;

  const handleDownloadCertificate = (file: TeamFile & { resolvedMemberName?: string; resolvedDocTitle?: string; }) => {
    generateBrandedPDF({
      title: "Verified Signature Receipt",
      subtitle: "STUDIO SECURE HUB INSTITUTIONAL ARCHIVE",
      filename: `VERIFIED_CERT_${file.name.replace(/\s+/g, '_')}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // --- Certificate Body ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text("CERTIFICATE OF DIGITAL EXECUTION", 20, startY);
      
      doc.setDrawColor(220, 220, 220);
      doc.line(20, startY + 5, pageWidth - 20, startY + 5);

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("DOCUMENT ATTRIBUTES", 20, startY + 15);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Title: ${file.resolvedDocTitle || file.name}`, 20, startY + 22);
      doc.text(`Category: Compliance & Waivers`, 20, startY + 29);
      doc.text(`Execution Token: ${file.id}`, 20, startY + 36);
      
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text("SIGNATORY & TIMESTAMP", 20, startY + 50);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Member: ${file.resolvedMemberName || 'Authorized Signatory'}`, 20, startY + 57);
      doc.text(`Timestamp: ${file.date ? format(new Date(file.date), 'PPPP p') : 'TBD'}`, 20, startY + 64);

      // --- Verification Shield ---
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(20, startY + 75, pageWidth - 40, 40, 2, 2, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.text("AUTHENTICITY STATEMENT", 30, startY + 87);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      const statement = "This institutional document confirms that the above signatory has reviewed and digitally accepted the terms through the secure verification protocol. This record is held in the Studio cryptographically signed vault.";
      const lines = doc.splitTextToSize(statement, pageWidth - 60);
      doc.text(lines, 30, startY + 95);

      return startY + 130;
    });
    
    toast({ title: "Certificate Exported", description: "Institutional PDF generated." });
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
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Squad Repository</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Library & Docs</h1>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Official administrative repository & verified vault</p>
        </div>
        {isStaff && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-xl shadow-primary/20 active:scale-95 transition-all">
                    <Upload className="h-4 w-4 mr-2" /> Archive Resource
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0 sm:max-w-xl">
                  <div className="h-2 bg-primary w-full" />
                  <div className="p-8 lg:p-10 space-y-8">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black uppercase tracking-tight">Archive Resource</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Enroll administrative resources</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Resource Category</Label>
                        <Select value={uploadCategory} onValueChange={setUploadCategory}>
                          <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary/20"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl"><SelectItem value="Compliance" className="font-bold">Compliance & Waivers</SelectItem><SelectItem value="Other" className="font-bold">Other Documents</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Tactical Context</Label><Textarea placeholder="Define the purpose of this resource for the squad..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="rounded-xl min-h-[120px] border-2 font-bold resize-none shadow-inner p-4 focus:bg-white transition-all" /></div>
                      <div className="p-12 border-2 border-dashed rounded-[2.5rem] bg-muted/20 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                        <div className="bg-white w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform"><FileText className="h-8 w-8 text-primary" /></div>
                        <p className="text-sm font-black uppercase tracking-widest">Select Tactical File</p>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {!isPro && <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Storage Limit: 500MB (Grassroots) <span className="text-primary hover:underline cursor-pointer" onClick={purchasePro}>Upgrade</span></div>}
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
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Pending Institutional Signatures</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pendingDocsForDisplay.map(d => (
              <Card key={d.id} className="rounded-[2.5rem] border-none shadow-xl ring-2 ring-red-100 bg-white overflow-hidden flex flex-col group hover:shadow-2xl transition-all">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start">
                    <Badge className="bg-red-600 text-white border-none font-black text-[8px] uppercase px-2 h-5 shadow-lg shadow-red-600/20">URGENT</Badge>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-40">{d.type?.replace('_', ' ')}</span>
                  </div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tight pt-2">{d.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-3 leading-relaxed mb-8 italic opacity-80">
                    "{d.content}"
                  </p>
                  <DocumentSigningDialog 
                    doc={d} 
                    onSign={signTeamDocument} 
                    members={signingMembers.filter(m => {
                      const isAdult = m.birthdate && differenceInYears(new Date(), new Date(m.birthdate)) >= 18;
                      if (d.id === 'default_parental' && isAdult) return false;
                      const isAssigned = d.assignedTo?.includes('all') || d.assignedTo?.includes(m.id);
                      const signed = realTimeSignedDocIds[m.id]?.includes(d.id);
                      return isAssigned && !signed;
                    })} 
                    onComplete={() => {}} 
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {Object.keys(waiverFolders).length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="bg-black p-2 rounded-xl text-white shadow-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Archived & Verified Signatures</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Permanent institutional records vault</p>
            </div>
          </div>
          
          <div className="bg-muted/30 p-6 rounded-[3rem] border-2 border-dashed space-y-6">
            <div className="flex items-center gap-2 px-4">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest">Strategic Records</span>
            </div>
            
            <Accordion type="multiple" defaultValue={[Object.keys(waiverFolders)[0]]} className="space-y-4">
              {Object.entries(waiverFolders).map(([teamName, types]) => (
                <AccordionItem key={teamName} value={teamName} className="border-none">
                  <AccordionTrigger className="bg-white p-6 rounded-[2rem] shadow-sm hover:no-underline ring-1 ring-black/5 [&[data-state=open]]:rounded-b-none transition-all">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/5 p-3 rounded-2xl text-primary">
                        <Users className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-black uppercase tracking-tight leading-none">{teamName}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1.5">
                          {Object.values(types).flat().length} Executed Artifacts
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="bg-white p-6 pt-4 rounded-b-[2rem] shadow-md ring-1 ring-black/5 border-t">
                    <Accordion type="single" collapsible className="space-y-3">
                      {Object.entries(types).map(([docType, files]) => (
                        <AccordionItem key={docType} value={docType} className="border-none">
                          <AccordionTrigger className="py-3 px-4 rounded-xl hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <FolderClosed className="h-4 w-4 text-primary opacity-40" />
                              <span className="text-xs font-black uppercase tracking-widest">{docType}</span>
                              <Badge className="h-4 px-1.5 text-[7px] bg-primary/10 text-primary border-none">{files.length}</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pl-8 pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {files.map((file: any) => (
                                <Card key={file.id} className="rounded-2xl border bg-muted/20 p-4 space-y-3 group hover:ring-1 hover:ring-primary transition-all">
                                  <div className="flex justify-between items-start">
                                    <div className="bg-white p-2 rounded-lg text-primary shadow-sm"><FileSignature className="h-4 w-4" /></div>
                                    <Badge className="bg-green-100 text-green-700 border-none font-black text-[7px] uppercase h-4">VERIFIED</Badge>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase text-primary tracking-tight truncate">{file.resolvedDocTitle || docType}</p>
                                    <p className="text-xs font-black uppercase truncate mt-0.5">{file.resolvedMemberName}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-80 mt-1 flex items-center gap-1">
                                      <Clock className="h-2 w-2" /> {format(new Date(file.date), 'MMM d, yyyy h:mm a')}
                                    </p>
                                  </div>
                                  <Button className="w-full h-9 rounded-xl font-black text-[9px] uppercase bg-black text-white hover:bg-primary transition-all" onClick={() => handleDownloadCertificate(file)}>
                                    <Download className="h-3 w-3 mr-2" /> Download Cert
                                  </Button>
                                </Card>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      <section className="space-y-8 pt-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
              <FolderClosed className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight">Archive & Resources</h2>
          </div>
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search archived resources..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="pl-11 h-12 rounded-2xl bg-muted/50 border-none shadow-inner font-black text-sm transition-all focus:bg-white" 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredResources.map(file => (
            <Card key={file.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5 flex flex-col bg-white">
              <CardHeader className="p-6 pb-2">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-primary/5 text-primary shadow-sm transition-transform group-hover:scale-110">
                    <FileText className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase tracking-tighter px-2 h-5 border-primary/20 text-primary">{file.category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-2 flex-1 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-black text-sm uppercase tracking-tight truncate group-hover:text-primary transition-colors">{file.name}</h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{file.size || 'N/A'} • {format(new Date(file.date), 'MMM d, yyyy')}</p>
                </div>
                {file.description && <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed italic">"{file.description}"</p>}
              </CardContent>
              <CardFooter className="p-6 pt-0 flex gap-2">
                <Button className="flex-1 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95" onClick={() => window.open(file.url, '_blank')}>
                  View Resource
                </Button>
                {isStaff && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5 transition-colors" onClick={() => setFileToDelete(file.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Purge from Repository</TooltipContent>
                  </Tooltip>
                )}
              </CardFooter>
            </Card>
          ))}

          {filteredResources.length === 0 && pendingDocsForDisplay.length === 0 && Object.keys(waiverFolders).length === 0 && (
            <div className="col-span-full py-32 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed space-y-4 opacity-40">
              <FolderClosed className="h-16 w-16 mx-auto mb-2" />
              <p className="text-sm font-black uppercase tracking-[0.2em]">Repository Clear</p>
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={!!fileToDelete} onOpenChange={o => !o && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <AlertDialogHeader className="p-8 lg:p-10 pb-4">
            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Purge Document?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/80 leading-relaxed">This action is irreversible and will remove this resource from the squad repository for all members permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-8 bg-muted/10 border-t flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="rounded-xl font-bold border-2 h-12">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(fileToDelete) { deleteFile(fileToDelete); setFileToDelete(null); } }} className="rounded-xl font-black bg-red-600 hover:bg-red-700 h-12 shadow-xl shadow-red-600/20">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
