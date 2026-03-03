
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
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile, Member, TeamEvent, MediaComment, VideoAnnotation } from '@/components/providers/team-provider';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

export default function FilesPage() {
  const { activeTeam, addFile, addExternalLink, deleteFile, user, isPro, hasFeature, purchasePro, isSuperAdmin, members, updateMember, createAlert, addMediaComment, addMediaTag, addMediaAnnotation } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkCategory, setLinkCategory] = useState<string>('Other');
  const [linkCompliance, setLinkCompliance] = useState<string>('none');
  const [uploadCategory, setUploadCategory] = useState<string>('Other');
  const [uploadCompliance, setUploadCompliance] = useState<string>('none');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  const [newComment, setNewPostComment] = useState('');
  const [newTag, setNewTag] = useState('');
  const [annoTime, setAnnoTime] = useState('');
  const [annoLabel, setAnnoLabel] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const canAccess = hasFeature('media_uploads');
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
        addFile(file.name, type, file.size, event.target?.result as string, uploadCategory, uploadCompliance !== 'none' ? uploadCompliance : undefined);
        toast({ title: "Vault Synchronized", description: `${file.name} is now available.` });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddLink = () => {
    if (!linkTitle || !linkUrl) return;
    addExternalLink(linkTitle, linkUrl, linkCategory, linkCompliance !== 'none' ? linkCompliance : undefined);
    setIsLinkOpen(false);
    setLinkTitle(''); setLinkUrl(''); setLinkCategory('Other'); setLinkCompliance('none');
    toast({ title: "Tactical Link Added" });
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'link') return <LinkIcon className="h-6 w-6 text-primary" />;
    if (['mp4', 'mov', 'avi', 'video'].includes(t)) return <Video className="h-6 w-6 text-primary" />;
    if (['jpg', 'png', 'jpeg', 'gif'].includes(t)) return <ImageIcon className="h-6 w-6 text-primary" />;
    return <FileText className="h-6 w-6 text-muted-foreground" />;
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
              <DialogContent className="rounded-3xl border-none shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase">Tactical Destination</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label><Input placeholder="e.g. Game Film Highlights" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">URL</Label><Input placeholder="https://youtube.com/..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Category</Label>
                      <Select value={linkCategory} onValueChange={setLinkCategory}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="Game">Game</SelectItem><SelectItem value="Practice">Practice</SelectItem><SelectItem value="Highlight">Highlight</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Compliance</Label>
                      <Select value={linkCompliance} onValueChange={setLinkCompliance}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="waiverSigned">Waiver Req.</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter><Button className="w-full h-12 rounded-xl font-black uppercase" onClick={handleAddLink}>Save Link</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Button className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={handleUploadClick}>
              <Upload className="h-4 w-4 mr-2" /> Upload Media
            </Button>
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
                { id: 'Game', label: 'Game Tape', icon: Video },
                { id: 'Practice', label: 'Practice Sessions', icon: BarChart2 },
                { id: 'Highlight', label: 'Highlights', icon: Star },
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
            {filteredFiles.map(file => (
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
                </div>
                <CardContent className="p-6 space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-black text-sm uppercase tracking-tight truncate leading-none">{file.name}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{file.type} • {file.size}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {file.tags?.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="outline" className="text-[7px] font-black uppercase border-primary/20 text-primary">{tag}</Badge>
                    ))}
                  </div>
                  <div className="pt-3 border-t flex items-center justify-between text-[9px] font-black text-muted-foreground uppercase tracking-tighter">
                    <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {format(new Date(file.date), 'MMM d')}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {file.comments?.length || 0}</span>
                      <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {file.tags?.length || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
          {selectedFile && (
            <>
              <DialogTitle className="sr-only">Previewing {selectedFile.name}</DialogTitle>
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
                        <Button onClick={() => window.open(selectedFile.url, '_blank')} className="rounded-full h-14 px-10 font-black uppercase">Launch Strategy Hub</Button>
                      </div>
                    ) : (
                      <video src={selectedFile.url} controls className="max-w-full max-h-full rounded-2xl shadow-2xl" />
                    )}
                  </div>
                  {/* Annotations bar for video */}
                  {selectedFile.type !== 'link' && (
                    <div className="bg-black/50 backdrop-blur-md p-4 border-t border-white/10 shrink-0 overflow-x-auto no-scrollbar flex gap-3">
                      <Badge className="bg-primary text-white border-none h-10 px-4 flex items-center gap-2 font-black uppercase text-[10px] shrink-0">
                        Tactical Moments <ChevronRight className="h-3 w-3" />
                      </Badge>
                      {selectedFile.annotations?.map(anno => (
                        <button key={anno.id} className="h-10 px-4 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 transition-all flex items-center gap-3 shrink-0 group">
                          <span className="text-[10px] font-black text-primary group-hover:scale-110 transition-transform">{Math.floor(anno.timestamp / 60)}:{String(anno.timestamp % 60).padStart(2, '0')}</span>
                          <span className="text-[10px] font-bold text-white/80">{anno.label}</span>
                        </button>
                      ))}
                      {isAdmin && (
                        <Dialog>
                          <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-white/5 border border-dashed border-white/20 hover:border-primary"><Plus className="h-4 w-4" /></Button></DialogTrigger>
                          <DialogContent className="sm:max-w-md rounded-[2.5rem]">
                            <DialogHeader><DialogTitle className="text-xl font-black uppercase">Tag Moment</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Timestamp (seconds)</Label><Input type="number" value={annoTime} onChange={e => setAnnoTime(e.target.value)} /></div>
                              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Label</Label><Input placeholder="e.g. Offensive Break" value={annoLabel} onChange={e => setAnnoLabel(e.target.value)} /></div>
                            </div>
                            <DialogFooter><Button className="w-full h-12 rounded-xl" onClick={handleAnnotation}>Mark Sequence</Button></DialogFooter>
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
                      <Button variant="ghost" size="icon" onClick={() => setSelectedFile(null)}><XCircle className="h-5 w-5" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedFile.tags?.map(tag => (
                        <Badge key={tag} className="bg-muted text-muted-foreground border-none text-[8px] px-2 h-5 font-bold">{tag}</Badge>
                      ))}
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Input size={1} className="h-5 text-[8px] w-16 px-1 rounded-md" placeholder="+ tag" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag()} />
                        </div>
                      )}
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 px-1">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Discussion</h4>
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
                          <div className="text-center py-8 opacity-30"><p className="text-[10px] font-black uppercase tracking-widest">No study notes yet</p></div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>

                  <div className="p-6 border-t space-y-4">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Add study note..." 
                        className="rounded-xl h-11 text-xs" 
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
                      <Button className="flex-1 h-11 rounded-xl font-black uppercase text-xs tracking-widest" onClick={() => setSelectedFile(null)}>Close Hub</Button>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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
