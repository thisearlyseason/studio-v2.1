"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Upload, Trash2, Plus, ShieldCheck, Search, FileSignature, Clock, Users, FolderClosed, FolderOpen, Image as ImageIcon, Video, Link as LinkIcon, File as FileIcon, ExternalLink, Play, Eye, ChevronRight, Check, Loader2, X } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, Member } from '@/components/providers/team-provider';
import { usePendingWaivers } from '@/hooks/use-pending-waivers';
import { generateBrandedPDF } from '@/lib/pdf-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AccessRestricted } from '@/components/layout/AccessRestricted';


function DocumentSigningDialog({ doc: d, onSign, members, onComplete }: { doc: any, onSign: (id: string, sig: string, mid: string) => Promise<boolean>, members: Member[], onComplete: () => void }) {
  const [signature, setSignature] = useState('');
  const [targetMemberId, setTargetMemberId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => { if (members.length === 1 && !targetMemberId) setTargetMemberId(members[0].id); }, [members, targetMemberId]);
  const handleSign = async () => {
    if (!signature.trim() || !agreed || !targetMemberId) return;
    setIsProcessing(true);
    const success = await onSign(d.id, signature, targetMemberId);
    if (success) { setIsOpen(false); onComplete(); }
    setIsProcessing(false);
  };
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full h-12 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all">Execute Document <ChevronRight className="ml-2 h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="rounded-[2.5rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogTitle className="sr-only">Execute Verified Signature</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-6 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">{d.title}</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Verified Execution Protocol</DialogDescription>
          </DialogHeader>
          <div className="p-1 bg-muted rounded-2xl border-2">
            <ScrollArea className="h-48 p-4 bg-white rounded-xl shadow-inner">
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-foreground/80">{d.content}</p>
            </ScrollArea>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Signing For</Label>
              <Select value={targetMemberId} onValueChange={setTargetMemberId}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue placeholder="Select member..." /></SelectTrigger>
                <SelectContent className="rounded-xl">{members.map(m => <SelectItem key={m.id} value={m.id} className="font-bold">{m.name} ({m.position})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-2xl border border-primary/10 cursor-pointer" onClick={() => setAgreed(!agreed)}>
              <div className={cn("h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all", agreed ? "bg-primary border-primary text-white" : "border-muted-foreground/30 bg-white")}>{agreed && <Check className="h-4 w-4 stroke-[4px]" />}</div>
              <Label className="text-[10px] font-black uppercase tracking-tight cursor-pointer leading-tight">I verify that I have read and understand all terms.</Label>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Digital Signature (Legal Name)</Label>
              <Input placeholder="Type your name to sign..." value={signature} onChange={e => setSignature(e.target.value)} className="h-12 rounded-2xl border-2 text-lg font-mono italic text-primary text-center" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-base font-black" onClick={handleSign} disabled={!agreed || !signature.trim() || !targetMemberId || isProcessing}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm & Verify Signature"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function FileTypeBadge({ category }: { category: string }) {
  const lower = category?.toLowerCase() || '';
  if (lower.includes('photo') || lower.includes('image')) return <Badge className="bg-blue-100 text-blue-700 border-none text-[8px] font-black uppercase h-5 px-2"><ImageIcon className="h-2.5 w-2.5 mr-1" />Photo</Badge>;
  if (lower.includes('video')) return <Badge className="bg-purple-100 text-purple-700 border-none text-[8px] font-black uppercase h-5 px-2"><Video className="h-2.5 w-2.5 mr-1" />Video</Badge>;
  if (lower.includes('link') || lower.includes('url')) return <Badge className="bg-green-100 text-green-700 border-none text-[8px] font-black uppercase h-5 px-2"><LinkIcon className="h-2.5 w-2.5 mr-1" />Link</Badge>;
  if (lower.includes('waiver') || lower.includes('compliance') || lower.includes('cert')) return <Badge className="bg-red-100 text-red-700 border-none text-[8px] font-black uppercase h-5 px-2"><ShieldCheck className="h-2.5 w-2.5 mr-1" />Waiver</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 border-none text-[8px] font-black uppercase h-5 px-2"><FileText className="h-2.5 w-2.5 mr-1" />Doc</Badge>;
}

function FileThumbnail({ file }: { file: any }) {
  const cat = file.category?.toLowerCase() || '';
  const isImage = cat.includes('photo') || cat.includes('image') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.url || '');
  const isVideo = cat.includes('video') || /\.(mp4|mov|webm|avi)$/i.test(file.url || '');
  const isLink = cat.includes('link') || cat.includes('url');
  if (isImage && file.url && file.url !== '#') {
    return <div className="w-full h-36 rounded-2xl overflow-hidden bg-muted"><img src={file.url} alt={file.name} className="w-full h-full object-cover" /></div>;
  }
  if (isVideo && file.url && file.url !== '#') {
    return (
      <div className="w-full h-36 rounded-2xl overflow-hidden bg-black relative">
        <video src={file.url} className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 flex items-center justify-center"><div className="bg-white/20 backdrop-blur-sm rounded-full p-3"><Play className="h-6 w-6 text-white fill-white" /></div></div>
      </div>
    );
  }
  if (isLink) {
    return <div className="w-full h-36 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 flex flex-col items-center justify-center gap-2"><LinkIcon className="h-10 w-10 text-emerald-500" /><p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">External Link</p></div>;
  }
  return <div className="w-full h-36 rounded-2xl bg-gradient-to-br from-muted/30 to-muted/60 flex flex-col items-center justify-center gap-2"><FileText className="h-10 w-10 text-muted-foreground/50" /><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{file.category || 'Document'}</p></div>;
}


export default function FilesPage() {
  const { activeTeam, addFile, deleteFile, user, isPro, purchasePro, isStaff, members, signTeamDocument } = useTeam();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [uploadCategory, setUploadCategory] = useState<string>('Documents');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDesc, setLinkDesc] = useState('');
  const [isSavingLink, setIsSavingLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pendingDocs, signingMembers, visibleSignedFiles, realTimeSignedDocIds } = usePendingWaivers();

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: rawFiles } = useCollection<TeamFile>(filesQuery);

  const resourceFiles = useMemo(() => {
    const all = rawFiles || [];
    return all.filter(f => !['Game Tape', 'Practice Session', 'Highlights'].includes(f.category));
  }, [rawFiles]);

  const tabFiles = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return resourceFiles.filter(f => {
      const cat = (f.category || '').toLowerCase();
      const matchesSearch = f.name.toLowerCase().includes(search) || cat.includes(search);
      if (!matchesSearch) return false;
      if (activeTab === 'waivers') return cat.includes('waiver') || cat.includes('cert') || cat.includes('compliance');
      if (activeTab === 'photos') return cat.includes('photo') || cat.includes('image');
      if (activeTab === 'videos') return cat.includes('video');
      if (activeTab === 'links') return cat.includes('link') || cat.includes('url');
      if (activeTab === 'docs') return !cat.includes('waiver') && !cat.includes('cert') && !cat.includes('photo') && !cat.includes('image') && !cat.includes('video') && !cat.includes('link') && !cat.includes('url') && cat !== 'signed certificate';
      return cat !== 'signed certificate';
    });
  }, [resourceFiles, searchTerm, activeTab]);

  const waiverFolders = useMemo(() => {
    const map: Record<string, Record<string, TeamFile[]>> = {};
    visibleSignedFiles.forEach(f => {
      const teamName = f.teamName || 'Unknown Squad';
      const docType = (f as any).waiverType || f.name.split(':')[0].replace('Signed','').trim() || 'General';
      if (!map[teamName]) map[teamName] = {};
      if (!map[teamName][docType]) map[teamName][docType] = [];
      map[teamName][docType].push(f);
    });
    return map;
  }, [visibleSignedFiles]);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !activeTeam) return null;

  const handleAddLink = async () => {
    if (!linkUrl.trim() || !linkTitle.trim()) return;
    setIsSavingLink(true);
    try {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      await addFile(linkTitle, 'link', 0, url, 'Link / URL', linkDesc);
      setIsAddLinkOpen(false); setLinkUrl(''); setLinkTitle(''); setLinkDesc('');
      toast({ title: 'Link Added', description: 'Resource link archived.' });
    } catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
    setIsSavingLink(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        addFile(file.name, file.name.split('.').pop()?.toLowerCase() || 'file', file.size, ev.target?.result as string, uploadCategory, uploadDescription);
        toast({ title: 'File Archived' });
        setUploadDescription('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadCertificate = (file: any) => {
    generateBrandedPDF({ title: 'Verified Signature Receipt', subtitle: 'STUDIO SECURE HUB', filename: `CERT_${file.name.replace(/\s+/g,'_')}` }, (doc, startY) => {
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.text('CERTIFICATE OF DIGITAL EXECUTION', 20, startY);
      doc.setFontSize(9); doc.setFont('helvetica','normal');
      doc.text(`Document: ${file.resolvedDocTitle || file.name}`, 20, startY+15);
      doc.text(`Member: ${file.resolvedMemberName || 'Authorized Signatory'}`, 20, startY+22);
      doc.text(`Timestamp: ${file.date ? format(new Date(file.date),'PPPp') : 'TBD'}`, 20, startY+29);
      return startY + 60;
    });
    toast({ title: 'Certificate Exported' });
  };


  return (
    <div className="space-y-8 pb-32 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Squad Repository</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Library & Docs</h1>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Official administrative repository & verified vault</p>
        </div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-full h-10 px-6 font-black uppercase text-xs border-2">
                  <Upload className="h-4 w-4 mr-2" />Upload File
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 sm:max-w-md overflow-hidden">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase">Archive Resource</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Upload to squad repository</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Category</Label>
                    <Select value={uploadCategory} onValueChange={setUploadCategory}>
                      <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="Documents" className="font-bold">Documents</SelectItem>
                        <SelectItem value="Photos" className="font-bold">Photos</SelectItem>
                        <SelectItem value="Videos" className="font-bold">Videos</SelectItem>
                        <SelectItem value="Compliance" className="font-bold">Compliance & Waivers</SelectItem>
                        <SelectItem value="Other" className="font-bold">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Description (Optional)</Label>
                    <Textarea placeholder="Purpose of this file..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="rounded-xl min-h-[80px] border-2 font-medium resize-none" />
                  </div>
                  <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-3 cursor-pointer hover:border-primary/40 transition-all" onClick={() => fileInputRef.current?.click()}>
                    <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center mx-auto shadow-sm"><FileText className="h-7 w-7 text-primary" /></div>
                    <p className="text-sm font-black uppercase tracking-widest">Select File</p>
                    <p className="text-[10px] text-muted-foreground font-bold">Click to browse</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddLinkOpen} onOpenChange={setIsAddLinkOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full h-10 px-6 font-black uppercase text-xs shadow-lg shadow-primary/20">
                  <LinkIcon className="h-4 w-4 mr-2" />Add Link
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-0 sm:max-w-md overflow-hidden">
                <div className="h-2 bg-emerald-500 w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase">Add URL Link</DialogTitle>
                    <DialogDescription className="font-bold text-emerald-600 uppercase text-[10px] tracking-widest">Archive an external resource link</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Title</Label>
                    <Input placeholder="e.g. Team Training Video" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">URL</Label>
                    <Input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Description (Optional)</Label>
                    <Input placeholder="Brief note about this link..." value={linkDesc} onChange={e => setLinkDesc(e.target.value)} className="h-12 rounded-xl border-2 font-bold" />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsAddLinkOpen(false)} className="font-black uppercase text-xs">Cancel</Button>
                    <Button onClick={handleAddLink} disabled={!linkUrl.trim() || !linkTitle.trim() || isSavingLink} className="font-black uppercase text-xs rounded-xl h-12 bg-emerald-600 hover:bg-emerald-700">
                      {isSavingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Link'}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>


      {/* Pending Signatures */}
      {pendingDocs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="bg-red-100 p-2 rounded-xl text-red-600 animate-pulse"><FileSignature className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Action Required</h2>
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Pending Institutional Signatures</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingDocs.map(d => (
              <Card key={d.id} className="rounded-[2rem] border-none shadow-lg ring-2 ring-red-100 bg-white overflow-hidden flex flex-col">
                <CardHeader className="p-6 pb-3">
                  <div className="flex justify-between items-start">
                    <Badge className="bg-red-600 text-white border-none font-black text-[8px] uppercase px-2 h-5">URGENT</Badge>
                    <span className="text-[9px] font-black text-muted-foreground uppercase opacity-40">{d.type?.replace('_',' ')}</span>
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight pt-1">{d.title}</h3>
                </CardHeader>
                <CardContent className="p-6 pt-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground line-clamp-2 leading-relaxed mb-4 italic opacity-80">"{d.content}"</p>
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

      {/* Signed Waivers Vault */}
      {Object.keys(waiverFolders).length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="bg-black p-2 rounded-xl text-white shadow-lg"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Archived Signatures</h2>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Permanent institutional records vault</p>
            </div>
          </div>
          <div className="bg-muted/20 p-5 rounded-[2.5rem] border-2 border-dashed space-y-4">
            <Accordion type="multiple" defaultValue={[Object.keys(waiverFolders)[0]]} className="space-y-3">
              {Object.entries(waiverFolders).map(([teamName, types]) => (
                <AccordionItem key={teamName} value={teamName} className="border-none">
                  <AccordionTrigger className="bg-white p-5 rounded-[1.5rem] shadow-sm hover:no-underline ring-1 ring-black/5 [&[data-state=open]]:rounded-b-none transition-all">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/5 p-2.5 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
                      <div className="text-left">
                        <p className="text-base font-black uppercase tracking-tight leading-none">{teamName}</p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{Object.values(types).flat().length} Executed</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="bg-white p-5 pt-3 rounded-b-[1.5rem] shadow-md ring-1 ring-black/5 border-t">
                    <Accordion type="single" collapsible className="space-y-2">
                      {Object.entries(types).map(([docType, files]) => (
                        <AccordionItem key={docType} value={docType} className="border-none">
                          <AccordionTrigger className="py-2.5 px-3 rounded-xl hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2">
                              <FolderClosed className="h-4 w-4 text-primary opacity-40" />
                              <span className="text-xs font-black uppercase tracking-widest">{docType}</span>
                              <Badge className="h-4 px-1.5 text-[7px] bg-primary/10 text-primary border-none">{files.length}</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 pl-6 pr-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {files.map((file: any) => (
                                <Card key={file.id} className="rounded-2xl border bg-muted/10 p-4 space-y-3 hover:ring-1 hover:ring-primary transition-all">
                                  <div className="flex justify-between items-start">
                                    <div className="bg-white p-2 rounded-lg text-primary shadow-sm"><FileSignature className="h-4 w-4" /></div>
                                    <Badge className="bg-green-100 text-green-700 border-none font-black text-[7px] uppercase h-4">VERIFIED</Badge>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase text-primary tracking-tight truncate">{file.resolvedDocTitle || docType}</p>
                                    <p className="text-xs font-black uppercase truncate mt-0.5">{file.resolvedMemberName}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase mt-1 flex items-center gap-1"><Clock className="h-2 w-2" />{format(new Date(file.date), 'MMM d, yyyy h:mm a')}</p>
                                  </div>
                                  <Button className="w-full h-8 rounded-xl font-black text-[9px] uppercase bg-black text-white hover:bg-primary" onClick={() => handleDownloadCertificate(file)}>
                                    <Download className="h-3 w-3 mr-1" />Download Cert
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


      {/* Main Tabbed Resource Library */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl text-primary"><FolderClosed className="h-5 w-5" /></div>
            <h2 className="text-xl font-black uppercase tracking-tight">Resource Archive</h2>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search resources..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-11 rounded-2xl bg-muted/40 border-none shadow-inner font-bold text-sm" />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/40 rounded-2xl p-1 h-11 border flex-wrap gap-1 w-full sm:w-auto">
            <TabsTrigger value="all" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-black data-[state=active]:text-white h-8">All</TabsTrigger>
            <TabsTrigger value="docs" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-primary data-[state=active]:text-white h-8">Docs</TabsTrigger>
            <TabsTrigger value="waivers" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-primary data-[state=active]:text-white h-8">Waivers</TabsTrigger>
            <TabsTrigger value="photos" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white h-8">Photos</TabsTrigger>
            <TabsTrigger value="videos" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-purple-600 data-[state=active]:text-white h-8">Videos</TabsTrigger>
            <TabsTrigger value="links" className="rounded-xl font-black text-[10px] uppercase px-4 data-[state=active]:bg-emerald-600 data-[state=active]:text-white h-8">Links</TabsTrigger>
          </TabsList>

          {['all','docs','waivers','photos','videos','links'].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {tabFiles.map(file => {
                  const isLink = (file.category || '').toLowerCase().includes('link') || (file.category || '').toLowerCase().includes('url');
                  return (
                    <Card key={file.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[1.75rem] overflow-hidden ring-1 ring-black/5 flex flex-col bg-white">
                      <div className="p-3 pb-0">
                        <FileThumbnail file={file} />
                      </div>
                      <CardHeader className="p-4 pb-1 pt-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-black text-sm uppercase tracking-tight truncate group-hover:text-primary transition-colors flex-1 min-w-0">{file.name}</h3>
                          <FileTypeBadge category={file.category} />
                        </div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60 mt-0.5">{file.size ? `${Math.round(Number(file.size)/1024)}KB · ` : ''}{format(new Date(file.date), 'MMM d, yyyy')}</p>
                      </CardHeader>
                      {file.description && (
                        <CardContent className="px-4 py-0">
                          <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed italic">"{file.description}"</p>
                        </CardContent>
                      )}
                      <CardFooter className="p-4 pt-3 mt-auto flex gap-2">
                        <Button
                          className="flex-1 h-9 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm transition-all active:scale-95"
                          onClick={() => isLink ? window.open(file.url, '_blank') : window.open(file.url, '_blank')}
                        >
                          {isLink ? <><ExternalLink className="h-3 w-3 mr-1" />Open Link</> : <><Eye className="h-3 w-3 mr-1" />View</>}
                        </Button>
                        {isStaff && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/5 transition-colors shrink-0" onClick={() => setFileToDelete(file.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove from Repository</TooltipContent>
                          </Tooltip>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
                {tabFiles.length === 0 && (
                  <div className="col-span-full py-24 text-center bg-muted/10 rounded-[2.5rem] border-2 border-dashed space-y-3 opacity-40">
                    <FolderClosed className="h-12 w-12 mx-auto mb-2" />
                    <p className="text-sm font-black uppercase tracking-[0.2em]">No {tab === 'all' ? 'resources' : tab} found</p>
                    {isStaff && <p className="text-xs font-bold text-muted-foreground">Upload a file or add a link above</p>}
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <AlertDialog open={!!fileToDelete} onOpenChange={o => !o && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <AlertDialogHeader className="p-8 pb-4">
            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Remove Resource?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/80">This will permanently remove this resource from the repository for all members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-8 bg-muted/10 border-t flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="rounded-xl font-bold border-2 h-12">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(fileToDelete) { deleteFile(fileToDelete); setFileToDelete(null); } }} className="rounded-xl font-black bg-red-600 hover:bg-red-700 h-12">Remove Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
