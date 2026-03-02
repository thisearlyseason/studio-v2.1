
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Image as ImageIcon, 
  File as FileIcon, 
  Download, 
  MoreVertical, 
  Upload,
  Calendar,
  Eye,
  Trash2,
  Lock,
  Sparkles,
  FolderClosed,
  Loader2,
  Link as LinkIcon,
  Globe,
  Plus,
  ShieldCheck,
  Check,
  XCircle,
  AlertTriangle,
  FileCheck,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, Member, TeamEvent } from '@/components/providers/team-provider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function FilesPage() {
  const { activeTeam, addFile, addExternalLink, deleteFile, user, isPro, hasFeature, purchasePro, isSuperAdmin, members, updateMember, createAlert } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkCompliance, setLinkCompliance] = useState<string>('none');
  const [uploadCompliance, setUploadCompliance] = useState<string>('none');
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditEvent, setAuditEvent] = useState<TeamEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Localized data fetching for performance
  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles, isLoading } = useCollection<TeamFile>(filesQuery);
  const teamFiles = useMemo(() => rawFiles || [], [rawFiles]);

  // Special: Fetch events with waivers to display in library
  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  
  const eventWaivers = useMemo(() => {
    return (rawEvents || [])
      .filter(e => e.requiresSpecialWaiver)
      .map(e => ({
        id: `waiver_${e.id}`,
        name: `Waiver: ${e.title}`,
        type: 'waiver',
        size: 'N/A',
        url: '',
        teamId: e.teamId,
        uploadedBy: 'System',
        uploaderId: 'system',
        date: e.createdAt || new Date().toISOString(),
        category: 'compliance',
        eventId: e.id,
        isEventWaiver: true,
        eventData: e
      } as any));
  }, [rawEvents]);

  const allLibraryItems = useMemo(() => {
    return [...teamFiles, ...eventWaivers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [teamFiles, eventWaivers]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Accessing library...</p>
      </div>
    );
  }

  const canAccess = hasFeature('media_uploads');
  const isAdmin = activeTeam.role === 'Admin' || isSuperAdmin;

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl">
            <FolderClosed className="h-16 w-16 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 bg-black text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Team Library</h1>
          <p className="text-muted-foreground font-bold leading-relaxed">
            Store playbooks, waivers, tournament documents, and shared assets securely in your squad's private repository.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-black/5">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Plan Features</span>
              <Badge className="bg-primary text-white border-none font-bold">Premium Storage</Badge>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Shared Repository</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> PDF & Image Previews</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Tactical Link Hub</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 hover:bg-primary/90" onClick={purchasePro}>
              Unlock Team Library
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = file.name.split('.').pop()?.toLowerCase() || 'file';
      const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        addFile(file.name, type, size, url, uploadCompliance !== 'none' ? uploadCompliance : undefined);
        setUploadCompliance('none');
        toast({ title: "Resource Added", description: `${file.name} is now available to the squad.` });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddLink = () => {
    if (!linkTitle || !linkUrl) return;
    addExternalLink(linkTitle, linkUrl, linkCompliance !== 'none' ? linkCompliance : undefined);
    setIsLinkOpen(false);
    setLinkTitle('');
    setLinkUrl('');
    setLinkCompliance('none');
    toast({ title: "Link Synchronized", description: `${linkTitle} added to library.` });
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'waiver') return <ShieldCheck className="h-6 w-6 text-amber-600" />;
    if (t === 'link') return <LinkIcon className="h-6 w-6 text-primary" />;
    if (t === 'pdf') return <FileText className="h-6 w-6 text-primary" />;
    if (['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(t)) return <ImageIcon className="h-6 w-6 text-primary" />;
    return <FileIcon className="h-6 w-6 text-muted-foreground" />;
  };

  const handleDownload = (file: TeamFile) => {
    if (file.type === 'link') {
      window.open(file.url, '_blank');
      return;
    }
    if (file.type === 'waiver') return;
    if (!file.url) return;
    const link = document.body.appendChild(document.createElement('a'));
    link.href = file.url;
    link.download = file.name;
    link.click();
    document.body.removeChild(link);
  };

  const confirmDelete = () => {
    if (fileToDelete) {
      deleteFile(fileToDelete);
      setFileToDelete(null);
    }
  };

  const handleAgree = async (file: TeamFile) => {
    if (!user || !file.complianceType) return;
    const member = members.find(m => m.userId === user.id);
    if (!member) return;

    updateMember(member.id, {
      [file.complianceType]: true
    });

    setSelectedFile(null);
    toast({ title: "Acknowledgment Received", description: "Your status has been updated on the team roster." });
  };

  const handleDisagree = async (file: TeamFile) => {
    if (!user || !file.complianceType) return;
    
    await createAlert(
      "Compliance Attention Required",
      `Member ${user.name} has declined to agree to the document: "${file.name}". Please coordinate follow-up.`
    );

    setSelectedFile(null);
    toast({ title: "Status Recorded", description: "The coaching staff has been notified of your decline.", variant: "destructive" });
  };

  const openAudit = (e: any) => {
    setAuditEvent(e);
    setIsAuditOpen(true);
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Team Library</h1>
          <p className="text-sm font-bold text-muted-foreground">Official squad repository and playbooks.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <div className="flex flex-col gap-2">
              <Select value={uploadCompliance} onValueChange={setUploadCompliance}>
                <SelectTrigger className="h-8 text-[8px] font-black uppercase border-dashed">
                  <SelectValue placeholder="ACK TYPE (OPT)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Standard)</SelectItem>
                  <SelectItem value="waiverSigned">General Waiver</SelectItem>
                  <SelectItem value="transportationWaiverSigned">Transport Waiver</SelectItem>
                  <SelectItem value="medicalClearance">Medical Clearance</SelectItem>
                  <SelectItem value="mediaRelease">Media Release</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="rounded-full px-6 font-black uppercase text-[10px] h-11 tracking-widest shadow-lg shadow-primary/20" onClick={handleUploadClick}>
                <Upload className="h-3.5 w-3.5 mr-2" />
                Upload File
              </Button>
            </div>
            <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full px-6 font-black uppercase text-[10px] h-11 tracking-widest border-2 mt-auto">
                  <LinkIcon className="h-3.5 w-3.5 mr-2" />
                  Add Link
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Add Tactical Link</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Reference external strategy or media</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Link Title</Label>
                      <Input placeholder="e.g. Hudl Game Tape" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Destination URL</Label>
                      <Input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Acknowledgment Category</Label>
                      <Select value={linkCompliance} onValueChange={setLinkCompliance}>
                        <SelectTrigger className="h-12 rounded-xl font-bold border-2">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Standard Reference</SelectItem>
                          <SelectItem value="waiverSigned">General Waiver</SelectItem>
                          <SelectItem value="transportationWaiverSigned">Transport Waiver</SelectItem>
                          <SelectItem value="medicalClearance">Medical Clearance</SelectItem>
                          <SelectItem value="mediaRelease">Media Release</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleAddLink} disabled={!linkTitle || !linkUrl}>
                      Save Link to Library
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Repository...</p>
        </div>
      ) : (
        <div className="grid gap-3 w-full">
          {allLibraryItems.length > 0 ? allLibraryItems.map((file: any) => {
            const isEventWaiver = !!file.isEventWaiver;
            const canDelete = isAdmin || (file.uploaderId === user?.id);
            const isCompliance = (file.complianceType && file.complianceType !== 'none') || isEventWaiver;
            const userResponse = isEventWaiver ? file.eventData.specialWaiverResponses?.[user?.id || ''] : null;
            
            return (
              <Card key={file.id} className="hover:bg-muted/30 transition-all border-none shadow-sm overflow-hidden w-full ring-1 ring-black/5 rounded-2xl group">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                  <div className="h-14 w-14 rounded-xl bg-primary/5 flex items-center justify-center border shadow-inner shrink-0 transition-colors group-hover:bg-primary/10">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-base truncate pr-2" title={file.name}>{file.name}</h3>
                      {isCompliance && <Badge className="bg-amber-100 text-amber-700 border-none h-4 text-[7px] font-black uppercase tracking-widest px-1.5"><ShieldCheck className="h-2 w-2 mr-1" /> Ack Required</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground uppercase mt-1 flex-wrap tracking-widest">
                      <span className={cn(file.type === 'link' ? "text-blue-600" : file.type === 'waiver' ? "text-amber-600" : "text-primary")}>{file.size}</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {mounted ? format(new Date(file.date), 'MMM d, yyyy') : '...'}
                      </span>
                      {isEventWaiver && userResponse && (
                        <Badge variant="outline" className={cn("text-[8px] h-4 font-black uppercase border-none", userResponse.agreed ? "text-green-600" : "text-red-600")}>
                          My Status: {userResponse.agreed ? 'Agreed' : 'Declined'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-auto sm:ml-0">
                    {!isEventWaiver && (
                      <>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={cn("h-10 w-10 rounded-full text-muted-foreground hover:bg-primary/5", isCompliance ? "text-amber-600 hover:text-amber-700" : "hover:text-primary")}
                          onClick={() => setSelectedFile(file)}
                        >
                          {isCompliance ? <FileCheck className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-10 w-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
                          onClick={() => handleDownload(file)}
                        >
                          {file.type === 'link' ? <Globe className="h-5 w-5" /> : <Download className="h-5 w-5" />}
                        </Button>
                      </>
                    )}
                    
                    {isEventWaiver && isAdmin && (
                      <Button variant="ghost" className="h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-primary hover:bg-primary/5" onClick={() => openAudit(file.eventData)}>
                        View Audit <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}

                    {isAdmin && !isEventWaiver && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground">
                            <MoreVertical className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-none p-2 min-w-[160px]">
                          <DropdownMenuItem onSelect={() => handleDownload(file)} className="font-black text-xs uppercase tracking-widest p-3 cursor-pointer">
                            {file.type === 'link' ? <Globe className="h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                            {file.type === 'link' ? 'Open URL' : 'Download'}
                          </DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem 
                              onSelect={() => setFileToDelete(file.id)}
                              className="text-destructive focus:text-destructive font-black text-xs uppercase tracking-widest p-3 cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Purge Resource
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          }) : (
            <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[2.5rem] w-full space-y-4">
              <FolderClosed className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
              <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Repository is currently empty.</p>
              {isAdmin && <Button variant="outline" className="rounded-full font-black text-[10px] uppercase tracking-widest border-2" onClick={handleUploadClick}>Browse Local Files</Button>}
            </div>
          )}
        </div>
      )}

      {/* Audit Dialog */}
      <Dialog open={isAuditOpen} onOpenChange={setIsAuditOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="h-2 bg-amber-500 w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight uppercase">Waiver Compliance Audit</DialogTitle>
              <DialogDescription className="font-bold text-amber-600 uppercase tracking-widest text-[10px]">
                {auditEvent?.title}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3 pr-4">
                {members.map(member => {
                  const resp = auditEvent?.specialWaiverResponses?.[member.userId];
                  const status = resp ? (resp.agreed ? 'Agreed' : 'Declined') : 'Pending';
                  return (
                    <div key={member.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8"><AvatarImage src={member.avatar} /><AvatarFallback className="font-black text-[10px]">{member.name[0]}</AvatarFallback></Avatar>
                        <div>
                          <p className="text-xs font-black">{member.name}</p>
                          <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-[8px] font-black uppercase tracking-widest h-5 px-3 border-none shadow-sm",
                        status === 'Agreed' ? "bg-green-600 text-white" : status === 'Declined' ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
                      )}>{status}</Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest" onClick={() => setIsAuditOpen(false)}>Close Audit</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewer Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-black/95 border-none text-white rounded-[2.5rem] shadow-2xl">
          <DialogTitle className="sr-only">File Preview: {selectedFile?.name}</DialogTitle>
          <DialogDescription className="sr-only">Visual preview of the shared squad resource.</DialogDescription>
          <DialogHeader className="p-6 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-8">
                <div className="flex items-center gap-3">
                  <DialogTitle className="text-xl font-black truncate tracking-tight">{selectedFile?.name}</DialogTitle>
                  {selectedFile?.complianceType && selectedFile.complianceType !== 'none' && (
                    <Badge className="bg-amber-500 text-black font-black uppercase text-[8px] px-2 h-5">Action Required</Badge>
                  )}
                </div>
                <DialogDescription className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
                  SECURE RESOURCE • UPLOADED BY {selectedFile?.uploadedBy} • {selectedFile?.date && format(new Date(selectedFile.date), 'MMM d, yyyy')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-black/40">
            {selectedFile && (
              <>
                {['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(selectedFile.type?.toLowerCase()) ? (
                  <img 
                    src={selectedFile.url} 
                    alt={selectedFile.name} 
                    className="max-w-full max-h-full object-contain animate-in zoom-in-95 duration-500 shadow-2xl rounded-xl" 
                  />
                ) : selectedFile.type?.toLowerCase() === 'pdf' ? (
                  <iframe 
                    src={selectedFile.url} 
                    className="w-full h-full min-h-[70vh] rounded-2xl bg-white shadow-2xl" 
                    title={selectedFile.name}
                  />
                ) : selectedFile.type?.toLowerCase() === 'link' ? (
                  <div className="text-center space-y-8 bg-white/5 p-12 rounded-[3rem] border-2 border-dashed border-white/10 max-w-lg">
                    <div className="bg-primary/20 h-24 w-24 rounded-[2rem] flex items-center justify-center mx-auto">
                      <Globe className="h-12 w-12 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-2xl font-black uppercase tracking-tight">Tactical Destination</h4>
                      <p className="text-white/60 text-xs font-bold uppercase tracking-widest">{selectedFile.url}</p>
                    </div>
                    <Button onClick={() => window.open(selectedFile.url, '_blank')} className="rounded-full h-14 px-10 font-black uppercase text-xs tracking-widest">
                      Launch External Site <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-center space-y-6">
                    <div className="bg-white/5 h-32 w-32 rounded-[2.5rem] flex items-center justify-center mx-auto">
                      <FileIcon className="h-16 w-16 text-white/20" />
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-white/40">Preview not supported</p>
                    <Button variant="secondary" onClick={() => handleDownload(selectedFile)} className="font-black uppercase tracking-widest text-xs h-12 rounded-xl px-8">
                      <Download className="h-4 w-4 mr-2" />
                      Download to View
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          
          <DialogFooter className="p-6 border-t border-white/10 flex flex-col sm:flex-row gap-4 justify-between items-center shrink-0">
            {selectedFile?.complianceType && selectedFile.complianceType !== 'none' ? (
              <div className="w-full flex flex-col sm:flex-row items-center gap-4 bg-white/5 p-4 rounded-3xl border border-white/10">
                <div className="flex items-center gap-3 px-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Agreement Required</p>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-tighter">Your decision will be synced to the roster</p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto ml-auto">
                  <Button variant="ghost" onClick={() => handleDisagree(selectedFile)} className="flex-1 sm:flex-none text-red-400 hover:text-red-500 font-black uppercase text-[10px] h-12 px-6">I Do Not Agree</Button>
                  <Button onClick={() => handleAgree(selectedFile)} className="flex-1 sm:flex-none bg-primary text-white font-black uppercase text-[10px] h-12 px-10 rounded-2xl shadow-xl shadow-primary/20">I Agree & Acknowledge</Button>
                </div>
              </div>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setSelectedFile(null)} className="text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 px-8">Dismiss</Button>
                {selectedFile && selectedFile.type !== 'waiver' && (
                  <Button onClick={() => handleDownload(selectedFile)} className="bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-widest text-[10px] h-12 px-10 rounded-2xl shadow-xl shadow-primary/20">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
          <div className="h-2 bg-destructive w-full" />
          <div className="p-8">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-black text-2xl tracking-tight">Purge Resource?</AlertDialogTitle>
              <AlertDialogDescription className="font-bold text-base pt-2 text-foreground/70">
                This action is permanent and will remove the item from the shared squad repository for all members.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-8 gap-3">
              <AlertDialogCancel className="rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] border-2">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-white hover:bg-destructive/90 rounded-2xl h-14 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-destructive/20"
              >
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
