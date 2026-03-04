
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  Play, 
  ExternalLink, 
  Trash2, 
  Lock, 
  Sparkles, 
  Dumbbell, 
  ChevronRight,
  X,
  Camera,
  Loader2,
  Youtube,
  XCircle,
  ImageIcon,
  Video,
  HardDrive,
  Filter,
  FolderClosed,
  Star,
  ShieldCheck,
  MessageSquare,
  CheckCircle2,
  Upload,
  Link as LinkIcon,
  Globe,
  Edit3,
  Save
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';

export default function DrillsAndGamePlayPage() {
  const { activeTeam, addDrill, deleteDrill, hasFeature, isSuperAdmin, purchasePro, isStaff, addFile, addExternalLink, deleteFile, user, isPro, markMediaAsViewed, addMediaComment } = useTeam();
  const db = useFirestore();

  const [viewMode, setViewMode] = useState<'drills' | 'gameplay'>('drills');
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: rawDrills } = useCollection(drillsQuery);
  const drills = useMemo(() => rawDrills || [], [rawDrills]);
  const [isAddDrillOpen, setIsAddDrillOpen] = useState(false);
  const [selectedDrill, setSelectedDrill] = useState<any>(null);
  const [editingDrillId, setEditingDrillId] = useState<string | null>(null);

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);
  const { data: rawFiles } = useCollection<TeamFile>(filesQuery);
  const teamFiles = useMemo(() => rawFiles || [], [rawFiles]);
  
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isEditFilmOpen, setIsEditFilmOpen] = useState(false);
  const [editingFilmId, setEditingFilmId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newPhoto, setNewPhoto] = useState<string | undefined>();
  const [uploadCat, setUploadCat] = useState('Game Tape');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const totalUsedBytes = useMemo(() => teamFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0), [teamFiles]);
  const STORAGE_LIMIT = isPro ? 10 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
  const storagePercentage = (totalUsedBytes / STORAGE_LIMIT) * 100;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredDrills = useMemo(() => drills.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.description.toLowerCase().includes(searchTerm.toLowerCase())), [drills, searchTerm]);
  
  const filteredFiles = useMemo(() => {
    return teamFiles.filter(f => {
      const isGameplay = ['Game Tape', 'Practice Session', 'Highlights'].includes(f.category);
      if (!isGameplay) return false;
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = activeCategory === 'all' || f.category === activeCategory;
      return matchesSearch && matchesCat;
    });
  }, [teamFiles, searchTerm, activeCategory]);

  if (!mounted || !activeTeam) return null;

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const handleVideoProgress = () => {
    if (!videoRef.current || !selectedFile || !user) return;
    const progress = videoRef.current.currentTime / videoRef.current.duration;
    if (progress >= 0.75 && !selectedFile.viewedBy?.[user.id]) {
      markMediaAsViewed(selectedFile.id);
      toast({ title: "Verified Viewed", description: "75% watch threshold met." });
    }
  };

  const handleAddDrill = async () => {
    if (!newTitle || !newDesc) return;
    if (editingDrillId) {
      updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'drills', editingDrillId), {
        title: newTitle,
        description: newDesc,
        videoUrl: newUrl
      });
      toast({ title: "Drill Updated" });
    } else {
      addDrill({ title: newTitle, description: newDesc, videoUrl: newUrl, photoUrl: newPhoto, createdAt: new Date().toISOString() });
      toast({ title: "Drill Published" });
    }
    setIsAddDrillOpen(false);
    resetForm();
  };

  const handleEditDrill = (e: React.MouseEvent, drill: any) => {
    e.stopPropagation();
    setEditingDrillId(drill.id);
    setNewTitle(drill.title);
    setNewDesc(drill.description);
    setNewUrl(drill.videoUrl || '');
    setIsAddDrillOpen(true);
  };

  const handleEditFilm = (e: React.MouseEvent, file: TeamFile) => {
    e.stopPropagation();
    setEditingFilmId(file.id);
    setNewTitle(file.name);
    setNewDesc(file.description || '');
    setUploadCat(file.category);
    setIsEditFilmOpen(true);
  };

  const handleSaveFilmEdits = () => {
    if (!editingFilmId || !activeTeam?.id) return;
    updateDocumentNonBlocking(doc(db, 'teams', activeTeam.id, 'files', editingFilmId), {
      name: newTitle,
      description: newDesc,
      category: uploadCat
    });
    toast({ title: "Film Metadata Updated" });
    setIsEditFilmOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingDrillId(null);
    setEditingFilmId(null);
    setNewTitle('');
    setNewDesc('');
    setNewUrl('');
    setNewPhoto(undefined);
    setUploadCat('Game Tape');
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (totalUsedBytes + file.size > STORAGE_LIMIT) {
        toast({ title: "Quota Exceeded", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        addFile(file.name, file.name.split('.').pop() || 'file', file.size, ev.target?.result as string, uploadCat, newDesc);
        setIsUploadOpen(false);
        setNewDesc('');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight uppercase">Playbook</h1>
          <p className="text-muted-foreground text-sm font-bold">Study the playbook and analyze the tape.</p>
        </div>
        
        <div className="bg-muted/50 p-1.5 rounded-2xl border-2 flex items-center shadow-inner shrink-0">
          <button 
            onClick={() => { setViewMode('drills'); resetForm(); }}
            className={cn("px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all", viewMode === 'drills' ? "bg-white text-primary shadow-md" : "text-muted-foreground hover:text-foreground")}
          >
            Drills
          </button>
          <button 
            onClick={() => { setViewMode('gameplay'); resetForm(); }}
            className={cn("px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all", viewMode === 'gameplay' ? "bg-white text-primary shadow-md" : "text-muted-foreground hover:text-foreground")}
          >
            Game Play
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          {viewMode === 'gameplay' && (
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
                {!isPro && isAdmin && <Button size="sm" className="w-full h-8 rounded-lg text-[8px] font-black uppercase" onClick={purchasePro}>Upgrade to 10GB</Button>}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-6">
              <div className="flex items-center gap-3">
                <Filter className="h-4 w-4 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-widest">Navigation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-1">
              {viewMode === 'drills' ? (
                <div className="p-4 text-center opacity-40"><Dumbbell className="h-8 w-8 mx-auto mb-2" /><p className="text-[10px] font-black uppercase tracking-widest">Global Playbook</p></div>
              ) : (
                ['all', 'Game Tape', 'Practice Session', 'Highlights'].map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} className={cn("w-full flex items-center justify-between p-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest", activeCategory === cat ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>
                    <span>{cat === 'all' ? 'All Film' : cat}</span>
                    <ChevronRight className="h-3 w-3 opacity-40" />
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={`Search ${viewMode === 'drills' ? 'drills' : 'game film'}...`} className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                {viewMode === 'drills' ? (
                  <Button onClick={() => { resetForm(); setIsAddDrillOpen(true); }} className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-lg shadow-primary/20"><Plus className="h-4 w-4 mr-2" /> Add Drill</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => { resetForm(); setIsLinkOpen(true); }} className="rounded-full h-12 px-6 font-black uppercase text-xs border-2"><LinkIcon className="h-4 w-4 mr-2" /> Add Link</Button>
                    <Button onClick={() => { resetForm(); setIsUploadOpen(true); }} className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-lg shadow-primary/20"><Upload className="h-4 w-4 mr-2" /> Upload Film</Button>
                  </>
                )}
              </div>
            )}
          </div>

          {!isPro && viewMode === 'gameplay' ? (
            <div className="py-24 text-center space-y-6 bg-primary/5 rounded-[3rem] border-2 border-dashed border-primary/20">
              <div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl relative"><Video className="h-10 w-10 text-primary" /><Lock className="absolute -top-2 -right-2 h-6 w-6 bg-black text-white p-1 rounded-full border-2 border-background" /></div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Game Film Locked</h3>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto">Film analysis and storage require a Pro subscription.</p>
              {isAdmin && <Button onClick={purchasePro} className="h-12 px-10 rounded-xl font-black uppercase">Upgrade to Elite</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {viewMode === 'drills' ? (
                filteredDrills.map(drill => (
                  <Card key={drill.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5 cursor-pointer bg-white" onClick={() => setSelectedDrill(drill)}>
                    <div className="aspect-video bg-muted relative overflow-hidden">
                      <img src={drill.thumbnailUrl || "https://picsum.photos/seed/drill/400/300"} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={drill.title} />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                        <Play className="h-10 w-10 text-white fill-current opacity-0 group-hover:opacity-100 transition-opacity scale-50 group-hover:scale-100 transition-transform" />
                      </div>
                      {isAdmin && (
                        <Button variant="secondary" size="icon" className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/90 text-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleEditDrill(e, drill)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <CardContent className="p-6 space-y-2">
                      <h3 className="font-black text-sm uppercase tracking-tight truncate">{drill.title}</h3>
                      <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed">{drill.description}</p>
                    </CardContent>
                  </Card>
                ))
              ) : (
                filteredFiles.map(file => {
                  const viewed = file.viewedBy?.[user?.id || ''];
                  return (
                    <Card key={file.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5 cursor-pointer bg-white" onClick={() => setSelectedFile(file)}>
                      <div className="aspect-video bg-muted relative overflow-hidden">
                        {file.type === 'link' ? <div className="absolute inset-0 flex items-center justify-center"><Globe className="h-12 w-12 text-primary opacity-20" /></div> : <div className="absolute inset-0 bg-black/5" />}
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                          <Play className="h-10 w-10 text-white fill-current opacity-0 group-hover:opacity-100 transition-opacity scale-50 group-hover:scale-100 transition-transform" />
                        </div>
                        <Badge className="absolute top-4 left-4 bg-black/50 text-white border-none font-black text-[8px] uppercase tracking-widest">{file.category}</Badge>
                        {viewed && <div className="absolute top-4 right-4 bg-green-500 text-white rounded-full p-1 shadow-lg"><CheckCircle2 className="h-3 w-3" /></div>}
                        {isAdmin && (
                          <Button variant="secondary" size="icon" className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-white/90 text-primary shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleEditFilm(e, file)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <CardContent className="p-6 space-y-2">
                        <h3 className="font-black text-sm uppercase tracking-tight truncate">{file.name}</h3>
                        <div className="flex items-center justify-between text-[9px] font-black text-muted-foreground uppercase">
                          <span>{file.type} • {file.size}</span>
                          {viewed && <span className="text-green-600">WATCHED</span>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isAddDrillOpen} onOpenChange={(o) => { setIsAddDrillOpen(o); if(!o) resetForm(); }}>
        <DialogContent className="sm:max-w-4xl p-0 sm:rounded-[2.5rem] h-[100dvh] sm:h-[90vh] border-none shadow-2xl overflow-hidden flex flex-col">
          <DialogTitle className="sr-only">{editingDrillId ? "Refine Drill" : "Publish Drill"}</DialogTitle>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col lg:flex-row min-h-full">
              <div className="lg:w-5/12 p-6 lg:p-10 bg-muted/30 lg:border-r space-y-8 shrink-0">
                <DialogHeader>
                  <DialogTitle className="text-2xl lg:text-3xl font-black uppercase tracking-tight">
                    {editingDrillId ? "Refine Drill" : "Publish Drill"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Drill Name</Label><Input placeholder="e.g. Transition Flow" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="rounded-xl h-12 border-2 font-bold" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Video URL (Opt)</Label><Input placeholder="https://youtube.com/..." value={newUrl} onChange={e => setNewUrl(e.target.value)} className="rounded-xl h-12 border-2 font-bold" /></div>
                </div>
              </div>
              <div className="lg:w-7/12 p-6 lg:p-10 space-y-8 flex flex-col bg-background">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Execution Instructions</Label><Textarea placeholder="Define the play protocol..." value={newDesc} onChange={e => setNewDesc(e.target.value)} className="rounded-2xl lg:rounded-[2rem] min-h-[300px] p-6 text-base font-bold bg-muted/10 border-2 resize-none" /></div>
              </div>
            </div>
          </div>
          <div className="p-6 lg:p-8 bg-background/80 backdrop-blur-md border-t shrink-0 flex justify-center">
            <Button className="w-full max-w-4xl h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleAddDrill} disabled={!newTitle || !newDesc}>
              {editingDrillId ? "Commit Updates" : "Publish to Squad Playbook"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditFilmOpen} onOpenChange={(o) => { setIsEditFilmOpen(o); if(!o) resetForm(); }}>
        <DialogContent className="rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase tracking-tight">Update Film Data</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Film Title</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Category</Label>
                <Select value={uploadCat} onValueChange={setUploadCat}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl"><SelectItem value="Game Tape">Game Tape</SelectItem><SelectItem value="Practice Session">Practice Session</SelectItem><SelectItem value="Highlights">Highlights</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Study Notes</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="rounded-xl min-h-[100px] border-2 resize-none font-medium" /></div>
            </div>
          </div>
          <DialogFooter className="p-8 border-t bg-background/80 backdrop-blur-md">
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSaveFilmEdits}>Commit Strategic Updates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDrill} onOpenChange={o => !o && setSelectedDrill(null)}>
        <DialogContent className="sm:max-w-5xl p-0 rounded-none sm:rounded-[3rem] border-none shadow-2xl h-[100dvh] sm:h-[90vh] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {selectedDrill && (
              <div className="flex flex-col lg:flex-row min-h-full">
                <DialogTitle className="sr-only">{selectedDrill.title}</DialogTitle>
                <div className="flex-1 bg-black relative aspect-video lg:aspect-auto flex items-center justify-center shrink-0">
                  <img src={selectedDrill.thumbnailUrl} className="w-full h-full object-contain" alt="Drill Media" />
                  <Button variant="ghost" size="icon" className="absolute top-6 left-6 text-white bg-black/20 hover:bg-black/40 rounded-full" onClick={() => setSelectedDrill(null)}><X className="h-5 w-5" /></Button>
                </div>
                <div className="w-full lg:w-96 bg-white p-8 space-y-6">
                  <Badge className="bg-primary/10 text-primary border-none uppercase font-black px-2">Drill Guide</Badge>
                  <h2 className="text-3xl font-black uppercase tracking-tight">{selectedDrill.title}</h2>
                  <div className="space-y-4">
                    <p className="text-base font-medium leading-relaxed text-foreground/80">{selectedDrill.description}</p>
                  </div>
                  <div className="pt-6 border-t flex gap-3">
                    {isAdmin && <Button variant="ghost" size="icon" className="text-destructive h-12 w-12 rounded-xl border-2" onClick={() => { deleteDrill(selectedDrill.id); setSelectedDrill(null); }}><Trash2 className="h-5 w-5" /></Button>}
                    <Button className="flex-1 h-12 rounded-xl font-black uppercase" onClick={() => setSelectedDrill(null)}>Close Hub</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedFile} onOpenChange={o => !o && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-7xl p-0 overflow-hidden rounded-none sm:rounded-[3rem] border-none shadow-2xl h-[100dvh] sm:h-[90vh] flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {selectedFile && (
              <div className="flex-1 flex flex-col lg:flex-row min-h-full">
                <DialogTitle className="sr-only">Viewing {selectedFile.name}</DialogTitle>
                <div className="flex-1 bg-black flex flex-col relative shrink-0">
                  <div className="flex-1 flex items-center justify-center p-4">
                    {selectedFile.type === 'link' ? (
                      <div className="text-center space-y-8 bg-white/5 p-12 rounded-[3rem] border-2 border-dashed border-white/10 max-w-lg">
                        <Globe className="h-20 w-20 text-primary opacity-40 mx-auto" />
                        <h4 className="text-2xl font-black uppercase text-white">{selectedFile.name}</h4>
                        <Button onClick={() => { window.open(selectedFile.url, '_blank'); markMediaAsViewed(selectedFile.id); }} className="rounded-full h-14 px-10 font-black uppercase">Study External Tape</Button>
                      </div>
                    ) : (
                      <video ref={videoRef} src={selectedFile.url} controls className="max-w-full max-h-full rounded-2xl shadow-2xl" onTimeUpdate={handleVideoProgress} />
                    )}
                  </div>
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
                    {selectedFile.viewedBy?.[user?.id || ''] ? (
                      <Badge className="bg-green-500 text-white border-none h-10 px-6 font-black uppercase flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Verified Viewed</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-black/50 backdrop-blur-md text-white h-10 px-6 font-black uppercase">Watch 75% to Verify</Badge>
                    )}
                  </div>
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
                    {selectedFile.description && <p className="text-xs font-medium italic opacity-60">"{selectedFile.description}"</p>}
                  </div>
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><h4 className="text-[10px] font-black uppercase">Team Analysis</h4></div>
                    <div className="space-y-4">
                      {selectedFile.comments?.map(c => (
                        <div key={c.id} className="flex gap-3 bg-muted/30 p-3 rounded-2xl">
                          <Avatar className="h-8 w-8 rounded-lg shrink-0"><AvatarFallback className="font-black text-[10px]">{c.authorName[0]}</AvatarFallback></Avatar>
                          <div className="min-w-0 flex-1"><p className="text-[10px] font-black truncate">{c.authorName}</p><p className="text-[11px] font-medium leading-relaxed">{c.text}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-6 border-t flex gap-2 bg-white sticky bottom-0">
                    <Input placeholder="Tactical insight..." className="rounded-xl h-11 text-xs border-2" value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && (addMediaComment(selectedFile.id, newComment), setNewComment(''))} />
                    <Button size="icon" className="h-11 w-11 rounded-xl" onClick={() => (addMediaComment(selectedFile.id, newComment), setNewComment(''))}><MessageSquare className="h-4 w-4" /></Button>
                  </div>
                </aside>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={(o) => { setIsUploadOpen(o); if(!o) resetForm(); }}>
        <DialogContent className="rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Enroll Game Tape</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Film Category</Label>
                <Select value={uploadCat} onValueChange={setUploadCat}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl"><SelectItem value="Game Tape">Game Tape</SelectItem><SelectItem value="Practice Session">Practice Session</SelectItem><SelectItem value="Highlights">Highlights</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Study Notes</Label><Textarea placeholder="Explain the focus of this film..." value={newDesc} onChange={e => setNewDesc(e.target.value)} className="rounded-xl min-h-[100px] border-2 resize-none font-medium" /></div>
              <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-4 cursor-pointer hover:border-primary/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} className="hidden" accept="video/*,image/*,application/pdf" onChange={handleUploadFile} />
                <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm"><Upload className="h-8 w-8 text-primary" /></div>
                <div><p className="text-sm font-black uppercase">Select Media File</p></div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkOpen} onOpenChange={(o) => { setIsLinkOpen(o); if(!o) resetForm(); }}>
        <DialogContent className="rounded-[2.5rem] p-0 border-none shadow-2xl overflow-hidden h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase">External Strategy Link</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Hub Title</Label><Input placeholder="e.g. Rival Scout Video" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Destination URL</Label><Input placeholder="https://..." value={newUrl} onChange={e => setNewUrl(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Category</Label>
                <Select value={uploadCat} onValueChange={setUploadCat}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl"><SelectItem value="Game Tape">Game Tape</SelectItem><SelectItem value="Practice Session">Practice Session</SelectItem><SelectItem value="Highlights">Highlights</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="p-8 border-t bg-background/80 backdrop-blur-md">
            <Button className="w-full h-14 rounded-2xl text-lg font-black" onClick={() => (addExternalLink(newTitle, newUrl, uploadCat, newDesc), setIsLinkOpen(false), resetForm())}>Save Strategic Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
