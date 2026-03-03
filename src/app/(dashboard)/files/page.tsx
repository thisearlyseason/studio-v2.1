
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronRight,
  Video,
  Play,
  MessageSquare,
  Tag,
  Clock,
  History,
  HardDrive,
  BarChart2,
  Send,
  Search,
  Filter,
  Star,
  CheckCircle2,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, Member, MediaComment, VideoAnnotation } from '@/components/providers/team-provider';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

export default function FilesPage() {
  const { activeTeam, addFile, addExternalLink, deleteFile, user, isPro, hasFeature, purchasePro, isSuperAdmin, markMediaAsViewed, addMediaComment, addMediaTag, addMediaAnnotation } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkCategory, setLinkCategory] = useState<string>('Other');
  
  const [uploadCategory, setUploadCategory] = useState<string>('Other');
  const [uploadDescription, setUploadDescription] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  const [newComment, setNewPostComment] = useState('');
  const [newTag, setNewTag] = useState('');
  const [annoTime, setAnnoTime] = useState('');
  const [annoLabel, setAnnoLabel] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles, isLoading } = useCollection<TeamFile>(filesQuery);
  const teamFiles = useMemo(() => rawFiles || [], [rawFiles]);

  const totalUsedBytes = useMemo(() => {
    return teamFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  }, [teamFiles]);

  const STORAGE_LIMIT = isPro ? 10 * 1024 * 1024 * 1024 : 500 * 1024 * 1024; // 10GB or 500MB
  const storagePercentage = (totalUsedBytes / STORAGE_LIMIT) * 100;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredFiles = useMemo(() => {
    return teamFiles.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           f.category?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = activeCategory === 'all' || f.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [teamFiles, searchTerm, activeCategory]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) return null;

  const isAdmin = activeTeam.role === 'Admin' || isSuperAdmin;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (totalUsedBytes + file.size > STORAGE_LIMIT) {
        toast({ title: "Storage Limit Exceeded", description: "Upgrade to Squad Pro for 10GB of storage.", variant: "destructive" });
        return;
      }
      const type = file.name.split('.').pop()?.toLowerCase() || 'file';
      const reader = new FileReader();
      reader.onload = (event) => {
        addFile(file.name, type, file.size, event.target?.result as string, uploadCategory, uploadDescription);
        toast({ title: "Vault Synchronized", description: `${file.name} is now available.` });
        setUploadDescription('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddLink = () => {
    if (!linkTitle || !linkUrl) return;
    addExternalLink(linkTitle, linkUrl, linkCategory, linkDescription);
    setIsLinkOpen(false);
    setLinkTitle(''); setLinkUrl(''); setLinkDescription(''); setLinkCategory('Other');
    toast({ title: "Tactical Link Added" });
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'link') return <LinkIcon className="h-6 w-6 text-primary" />;
    if (['mp4', 'mov', 'avi', 'video'].includes(t)) return <Video className="h-6 w-6 text-primary" />;
    if (['jpg', 'png', 'jpeg', 'gif'].includes(t)) return <ImageIcon className="h-6 w-6 text-primary" />;
    return <FileText className="h-6 w-6 text-muted-foreground" />;
  };

  const handleVideoProgress = () => {
    if (!videoRef.current || !selectedFile || !user) return;
    const progress = videoRef.current.currentTime / videoRef.current.duration;
    const isAlreadyViewed = selectedFile.viewedBy?.[user.id];
    
    if (progress >= 0.75 && !isAlreadyViewed) {
      markMediaAsViewed(selectedFile.id);
      toast({ title: "Watch Threshold Met", description: "Verified viewed at 75% progress." });
    }
  };

  const handleAnnotation = () => {
    if (!selectedFile || !annoTime || !annoLabel) return;
    addMediaAnnotation(selectedFile.id, parseInt(annoTime), annoLabel);
    setAnnoTime(''); setAnnoLabel('');
  };

  const handleComment = () => {
    if (!selectedFile || !newComment.trim()) return;
    addMediaComment(selectedFile.id, newComment);
    setNewPostComment('');
  };

  const handleAddTag = () => {
    if (!selectedFile || !newTag.trim()) return;
    addMediaTag(selectedFile.id, newTag);
    setNewTag('');
  };

  const isViewed = selectedFile?.viewedBy?.[user?.id || ''];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 mb-2">Tactical Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Media Vault</h1>
          <p className="text-sm font-bold text-muted-foreground">Official squad repository & video study hub.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            
            <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-full h-11 px-6 font-black uppercase text-xs border-2">
                  <LinkIcon className="h-4 w-4 mr-2" /> Add Link
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Tactical Destination</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Share External Strategy Resources</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label><Input placeholder="e.g. Game Film Highlights" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">URL</Label><Input placeholder="https://youtube.com/..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Strategy Category</Label>
                      <Select value={linkCategory} onValueChange={setLinkCategory}>
                        <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="Game Tape">Game Tape</SelectItem><SelectItem value="Practice Session">Practice Session</SelectItem><SelectItem value="Highlights">Highlights</SelectItem><SelectItem value="Compliance">Compliance</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Description (Optional)</Label><Textarea placeholder="Context for the squad..." value={linkDescription} onChange={e => setLinkDescription(e.target.value)} className="rounded-xl min-h-[80px] border-2 font-bold resize-none" /></div>
                  </div>
                  <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleAddLink}>Save Tactical Link</Button></DialogFooter>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg">
                  <Upload className="h-4 w-4 mr-2" /> Upload Media
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Vault Submission</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Enroll Local Media to Roster</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Category</Label>
                      <Select value={uploadCategory} onValueChange={setUploadCategory}>
                        <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="Game Tape">Game Tape</SelectItem><SelectItem value="Practice Session">Practice Session</SelectItem><SelectItem value="Highlights">Highlights</SelectItem><SelectItem value="Compliance">Compliance</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Description</Label><Textarea placeholder="Explain the tactical value..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-bold resize-none" /></div>
                    <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all" onClick={handleUploadClick}>
                      <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform"><Upload className="h-8 w-8 text-primary" /></div>
                      <div><p className="text-sm font-black uppercase tracking-tight">Select File</p><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Video, Photo, or PDF</p></div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center gap-3">
                <HardDrive className="h-4 w-4 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-widest">Storage Audit</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <p className="text-[10px] font-black uppercase opacity-60">Utilization</p>
                  <p className="text-xs font-black">{formatSize(totalUsedBytes)} / {formatSize(STORAGE_LIMIT)}</p>
                </div>
                <Progress value={storagePercentage} className="h-2 rounded-full" />
              </div>
              {!isPro && (
                <div className="p-4 bg-primary/5 rounded-2xl border-2 border-dashed border-primary/20 space-y-3">
                  <p className="text-[9px] font-bold text-primary uppercase leading-relaxed text-center">Upgrade to Squad Pro for 10GB of tactical storage.</p>
                  <Button size="sm" className="w-full h-8 rounded-lg text-[8px] font-black uppercase" onClick={purchasePro}>Get 10GB Elite</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-widest">Navigation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-1">
              {[
                { id: 'all', label: 'All Resources', icon: FolderClosed },
                { id: 'Game Tape', label: 'Game Tape', icon: Video },
                { id: 'Practice Session', label: 'Practice Sessions', icon: BarChart2 },
                { id: 'Highlights', label: 'Highlights', icon: Star },
                { id: 'Compliance', label: 'Compliance', icon: ShieldCheck }
              ].map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest",
                    activeCategory === cat.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <cat.icon className="h-4 w-4" />
                    <span>{cat.label}</span>
                  </div>
                  <ChevronRight className="h-3 w-3 opacity-40" />
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, tag or category..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredFiles.map(file => {
              const viewedByMe = file.viewedBy?.[user?.id || ''];
              return (
                <Card 
                  key={file.id} 
                  className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5 cursor-pointer bg-white"
                  onClick={() => setSelectedFile(file)}
                >
                  <div className="aspect-video bg-muted relative flex items-center justify-center overflow-hidden">
                    {file.type === 'link' ? (
                      <div className="absolute inset-0 bg-primary/5 flex items-center justify-center"><Globe className="h-12 w-12 text-primary opacity-20" /></div>
                    ) : (
                      <div className="absolute inset-0 bg-black/5" />
                    )}
                    <div className="relative z-10 p-4 rounded-full bg-white/20 backdrop-blur-md text-primary opacity-0 group-hover:opacity-100 transition-all scale-50 group-hover:scale-100">
                      <Play className="h-6 w-6 fill-current" />
                    </div>
                    <Badge className="absolute top-4 left-4 bg-black/50 text-white border-none font-black text-[8px] uppercase tracking-widest backdrop-blur-sm">{file.category}</Badge>
                    {viewedByMe && (
                      <div className="absolute top-4 right-4 bg-green-500 text-white rounded-full p-1 shadow-lg">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6 space-y-3">
                    <div className="space-y-1">
                      <h3 className="font-black text-sm uppercase tracking-tight truncate leading-none">{file.name}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{file.type} • {file.size}</p>
                    </div>
                    {file.description && <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed italic">"{file.description}"</p>}
                    <div className="pt-3 border-t flex items-center justify-between text-[9px] font-black text-muted-foreground uppercase tracking-tighter">
                      <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {format(new Date(file.date), 'MMM d')}</span>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {file.comments?.length || 0}</span>
                        {viewedByMe && <span className="text-green-600 font-black">VIEWED</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredFiles.length === 0 && (
              <div className="col-span-full py-24 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed space-y-4 opacity-40">
                <FolderClosed className="h-12 w-12 mx-auto" />
                <p className="text-sm font-black uppercase tracking-widest">Vault Empty</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Detail Modal */}
      <Dialog open={!!selectedFile} onOpenChange={o => !o && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-7xl h-full sm:h-[90vh] p-0 overflow-hidden rounded-none sm:rounded-[3rem] border-none shadow-2xl flex flex-col">
          <DialogTitle className="sr-only">Previewing {selectedFile?.name}</DialogTitle>
          {selectedFile && (
            <div className="flex flex-col lg:flex-row h-full">
              <div className="flex-1 bg-black flex flex-col relative">
                <div className="flex-1 flex items-center justify-center p-4">
                  {selectedFile.type === 'link' ? (
                    <div className="text-center space-y-8 bg-white/5 p-12 rounded-[3rem] border-2 border-dashed border-white/10 max-w-lg">
                      <Globe className="h-20 w-20 text-primary mx-auto opacity-40" />
                      <div className="space-y-2">
                        <h4 className="text-2xl font-black uppercase text-white tracking-tight leading-none">{selectedFile.name}</h4>
                        <p className="text-white/40 font-mono text-[10px] break-all">{selectedFile.url}</p>
                      </div>
                      <div className="space-y-4">
                        <Button onClick={() => { window.open(selectedFile.url, '_blank'); markMediaAsViewed(selectedFile.id); }} className="rounded-full h-14 px-10 font-black uppercase">Launch Strategy Hub</Button>
                        {!selectedFile.viewedBy?.[user?.id || ''] && (
                          <p className="text-[10px] font-black uppercase text-amber-500 animate-pulse">Launching hub will verify your view status</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <video 
                      ref={videoRef}
                      src={selectedFile.url} 
                      controls 
                      className="max-w-full max-h-full rounded-2xl shadow-2xl" 
                      onTimeUpdate={handleVideoProgress}
                    />
                  )}
                </div>
                
                {/* Visual viewed confirmation for videos */}
                {selectedFile.type !== 'link' && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
                    {isViewed ? (
                      <Badge className="bg-green-500 text-white border-none h-10 px-6 font-black uppercase tracking-widest shadow-2xl flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" /> Verified Viewed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-black/50 backdrop-blur-md text-white border-white/20 h-10 px-6 font-black uppercase tracking-widest">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Watch 75% to verify
                      </Badge>
                    )}
                  </div>
                )}

                {/* Annotations bar for video */}
                {selectedFile.type !== 'link' && (
                  <div className="bg-black/50 backdrop-blur-md p-4 border-t border-white/10 shrink-0 overflow-x-auto no-scrollbar flex gap-3">
                    <Badge className="bg-primary text-white border-none h-10 px-4 flex items-center gap-2 font-black uppercase text-[10px] shrink-0">
                      Tactical Moments <ChevronRight className="h-3 w-3" />
                    </Badge>
                    {selectedFile.annotations?.map(anno => (
                      <button 
                        key={anno.id} 
                        onClick={() => { if (videoRef.current) videoRef.current.currentTime = anno.timestamp; }}
                        className="h-10 px-4 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 transition-all flex items-center gap-3 shrink-0 group"
                      >
                        <span className="text-[10px] font-black text-primary group-hover:scale-110 transition-transform">{Math.floor(anno.timestamp / 60)}:{String(anno.timestamp % 60).padStart(2, '0')}</span>
                        <span className="text-[10px] font-bold text-white/80">{anno.label}</span>
                      </button>
                    ))}
                    {isAdmin && (
                      <Dialog>
                        <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/5 border border-dashed border-white/20 hover:border-primary"><Plus className="h-4 w-4" /></Button></DialogTrigger>
                        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl">
                          <DialogHeader><DialogTitle className="text-xl font-black uppercase">Tag Moment</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Timestamp (seconds)</Label><Input type="number" value={annoTime} onChange={e => setAnnoTime(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Label</Label><Input placeholder="e.g. Offensive Break" value={annoLabel} onChange={e => setAnnoLabel(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                          </div>
                          <DialogFooter><Button className="w-full h-12 rounded-xl font-black shadow-xl" onClick={handleAnnotation}>Mark Sequence</Button></DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </div>

              <aside className="w-full lg:w-96 bg-white flex flex-col border-l">
                <div className="p-6 border-b space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <Badge className="bg-primary/10 text-primary border-none text-[8px] uppercase font-black px-2">{selectedFile.category}</Badge>
                      <h3 className="text-xl font-black uppercase tracking-tight">{selectedFile.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)} className="rounded-full"><XCircle className="h-5 w-5" /></Button>
                  </div>
                  {selectedFile.description && (
                    <div className="bg-muted/30 p-4 rounded-2xl border-2 border-dashed">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Study Notes</p>
                      <p className="text-xs font-medium leading-relaxed italic">{selectedFile.description}</p>
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 px-1">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest">Tactical Discussion</h4>
                    </div>
                    <div className="space-y-4">
                      {selectedFile.comments?.map(comment => (
                        <div key={comment.id} className="flex gap-3">
                          <Avatar className="h-8 w-8 rounded-lg border shadow-sm shrink-0">
                            <AvatarFallback className="font-black text-[10px]">{comment.authorName[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 bg-muted/30 p-3 rounded-2xl space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black truncate max-w-[100px]">{comment.authorName}</span>
                              <span className="text-[8px] font-bold text-muted-foreground">{format(new Date(comment.createdAt), 'MMM d, HH:mm')}</span>
                            </div>
                            <p className="text-[11px] font-medium text-foreground/80 leading-relaxed">{comment.text}</p>
                          </div>
                        </div>
                      ))}
                      {(!selectedFile.comments || selectedFile.comments.length === 0) && (
                        <div className="text-center py-8 opacity-30"><p className="text-[10px] font-black uppercase tracking-widest">No team analysis yet</p></div>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                <div className="p-6 border-t space-y-4 bg-muted/5">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Add tactical insight..." 
                      className="rounded-xl h-11 text-xs border-2 bg-white" 
                      value={newComment} 
                      onChange={e => setNewPostComment(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && handleComment()}
                    />
                    <Button size="icon" className="h-11 w-11 rounded-xl shadow-lg" onClick={handleComment}><Send className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <Button variant="ghost" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setFileToDelete(selectedFile.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button className="flex-1 h-11 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20" onClick={() => setSelectedFile(null)}>Close Hub</Button>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!fileToDelete} onOpenChange={o => !o && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black uppercase">Purge Resource?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2">This action is permanent and will remove this media from the squad vault for all members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => { if(fileToDelete) { deleteFile(fileToDelete); setFileToDelete(null); setSelectedFile(null); toast({ title: "Vault Updated" }); } }} 
              className="rounded-xl font-black bg-destructive text-white"
            >
              Purge Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
