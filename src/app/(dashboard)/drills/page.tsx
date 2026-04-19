"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  Play, 
  Trash2, 
  Dumbbell, 
  Loader2,
  Video,
  Info,
  Package,
  Bookmark,
  Upload,
  Lock,
  Edit2,
  Clock,
  ChevronRight,
  CheckCircle2,
  Bell,
  BellOff,
  Users,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DialogClose } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { useTeam, TeamFile } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, limit, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const getYoutubeThumbnail = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?\s*v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  if (!match || match[2].length !== 11) return null;
  const videoId = match[2];
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
};

export default function PlaybookAndGamePlayPage() {
  const { activeTeam, addDrill, deleteDrill, purchasePro, isStaff, addFile, deleteFile, user, isPro, members } = useTeam();
  const db = useFirestore();

  const [viewMode, setViewMode] = useState<'drills' | 'gameplay'>('drills');
  const [searchTerm, setSearchTerm] = useState('');
  
  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('createdAt', 'desc'), limit(20));
  }, [activeTeam?.id, db]);
  const { data: rawDrills, isLoading: isDrillsLoading } = useCollection(drillsQuery);
  const drills = useMemo(() => rawDrills || [], [rawDrills]);

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'), limit(20));
  }, [activeTeam?.id, db]);
  const { data: rawFiles, isLoading: isFilesLoading } = useCollection<TeamFile>(filesQuery);
  const teamFiles = useMemo(() => rawFiles || [], [rawFiles]);

  const [isAddDrillOpen, setIsAddDrillOpen] = useState(false);
  const [selectedDrill, setSelectedDrill] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadCat, setUploadCat] = useState<string>('Game Tape');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newUrl, setNewUrl] = useState<string>('');
  const [newCoverUrl, setNewCoverUrl] = useState<string>('');
  const [newMedia, setNewMedia] = useState<{url: string, description: string}[]>([]);
  const [newTime, setNewTime] = useState<string>('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [expandedDrillIds, setExpandedDrillIds] = useState<Set<string>>(new Set());
  const [isWatchersOpen, setIsWatchersOpen] = useState(false);
  const [watchersDrill, setWatchersDrill] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const watchStartRef = useRef<number | null>(null);
  const [watchProgress, setWatchProgress] = useState(0);
  const [hasCompletedWatch, setHasCompletedWatch] = useState(false);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [commentMin, setCommentMin] = useState<string>('');
  const [commentSec, setCommentSec] = useState<string>('');

  const filteredDrills = useMemo(() => drills.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase())), [drills, searchTerm]);
  const filteredFiles = useMemo(() => teamFiles.filter(f => ['Game Tape', 'Practice Session', 'Highlights'].includes(f.category) && f.name.toLowerCase().includes(searchTerm.toLowerCase())), [teamFiles, searchTerm]);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedDrillIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddDrill = async () => {
    if (!newTitle || !newDesc || !activeTeam || !db) return;
    try {
      if (editingItemId) {
        await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', editingItemId), {
          title: newTitle,
          description: newDesc,
          videoUrl: newUrl,
          coverImageUrl: newCoverUrl,
          additionalMedia: newMedia.filter(m => m.url),
          estimatedTime: newTime
        });
        toast({ title: "Drill Updated", description: "Strategic protocol modified." });
      } else {
        await addDrill({ 
          title: newTitle, 
          description: newDesc, 
          videoUrl: newUrl, 
          coverImageUrl: newCoverUrl,
          additionalMedia: newMedia.filter(m => m.url),
          estimatedTime: newTime,
          createdAt: new Date().toISOString(), 
          comments: [],
          mandatoryWatch: false,
          mandatoryWatchThreshold: 75,
          watchedBy: {}
        });
        toast({ title: "Drill Published", description: "Strategic execution protocol active." });
      }
      setIsAddDrillOpen(false);
      setNewTitle(''); setNewDesc(''); setNewUrl(''); setNewCoverUrl(''); setNewMedia([]); setNewTime(''); setEditingItemId(null);
    } catch(err) {
      toast({ title: "Operation Failed", variant: "destructive" });
    }
  };

  const handleAddFilm = async () => {
    if (!newTitle || !newUrl || !activeTeam || !db) return;
    try {
      if (editingItemId) {
        await updateDoc(doc(db, 'teams', activeTeam.id, 'files', editingItemId), {
          name: newTitle,
          url: newUrl,
          category: uploadCat,
          description: newDesc,
        });
        toast({ title: "Film Updated", description: "Archive modified." });
      } else {
        await addFile(newTitle, 'video_link', 0, newUrl, uploadCat, newDesc);
        toast({ title: "Film Archived", description: "Institutional tape secured in vault." });
      }
      setIsUploadOpen(false);
      setNewTitle(''); setNewUrl(''); setNewDesc(''); setEditingItemId(null);
    } catch (err) {
      toast({ title: "Operation Failed", variant: "destructive" });
    }
  };

  const openEditDrill = (e: React.MouseEvent, drill: any) => {
    e.stopPropagation();
    setNewTitle(drill.title || '');
    setNewDesc(drill.description || '');
    setNewUrl(drill.videoUrl || '');
    setNewCoverUrl(drill.coverImageUrl || '');
    setNewMedia(drill.additionalMedia || []);
    setNewTime(drill.estimatedTime || '');
    setEditingItemId(drill.id);
    setIsAddDrillOpen(true);
  };

  const openEditFile = (e: React.MouseEvent, f: any) => {
    e.stopPropagation();
    setNewTitle(f.name || '');
    setNewUrl(f.url || '');
    setNewDesc(f.description || '');
    setUploadCat(f.category || 'Game Tape');
    setEditingItemId(f.id);
    setIsUploadOpen(true);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        await addFile(file.name, file.name.split('.').pop() || 'file', file.size, ev.target?.result as string, uploadCat, newDesc);
        setIsUploadOpen(false);
        setNewDesc('');
        toast({ title: "File Uploaded", description: "Strategic asset archived." });
      };
      reader.readAsDataURL(file);
    }
  };

  const [commentText, setCommentText] = useState<string>('');
  const [commentTime, setCommentTime] = useState<string>('');

  const handleAddComment = async (id: string, currentComments: any[], type: 'drills' | 'files') => {
    if (!commentText || !activeTeam || !db) return;
    
    let secs = undefined;
    const m = parseInt(commentMin) || 0;
    const s = parseInt(commentSec) || 0;
    if (commentMin || commentSec) {
      secs = m * 60 + s;
    }

    const newC = {
      id: `c_${Date.now()}`,
      text: commentText,
      timestamp: secs ?? null,
      authorName: user?.name || 'Teammate',
      authorId: user?.id,
      createdAt: new Date().toISOString()
    };
    const updated = [...(currentComments || []), newC];
    if (type === 'drills') {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', id), { comments: updated });
      setSelectedDrill((prev: any) => ({ ...prev, comments: updated }));
    } else {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { comments: updated });
      setSelectedFile((prev: any) => ({ ...prev, comments: updated }));
    }
    setCommentText(''); setCommentMin(''); setCommentSec('');
  };

  const handleDeleteComment = async (id: string, commentId: string, currentComments: any[], type: 'drills' | 'files') => {
    if (!activeTeam || !db) return;
    const updated = currentComments.filter(c => c.id !== commentId);
    if (type === 'drills') {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', id), { comments: updated });
      setSelectedDrill((prev: any) => ({ ...prev, comments: updated }));
    } else {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { comments: updated });
      setSelectedFile((prev: any) => ({ ...prev, comments: updated }));
    }
    toast({ title: "Comment Cleared" });
  };

  const handleEditComment = async (id: string, commentId: string, currentComments: any[], newText: string, type: 'drills' | 'files') => {
    if (!activeTeam || !db || !newText) return;
    const updated = currentComments.map(c => c.id === commentId ? { ...c, text: newText, updatedAt: new Date().toISOString() } : c);
    if (type === 'drills') {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', id), { comments: updated });
      setSelectedDrill((prev: any) => ({ ...prev, comments: updated }));
    } else {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'files', id), { comments: updated });
      setSelectedFile((prev: any) => ({ ...prev, comments: updated }));
    }
    setEditingCommentId(null);
    setEditingCommentText('');
    toast({ title: "Mark Updated" });
  };

  const seekTo = (seconds: number | undefined) => {
    if (seconds == null) return;
    if (iframeRef.current && iframeRef.current.src.includes('youtube.com')) {
      iframeRef.current.contentWindow?.postMessage(JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [seconds, true]
      }), '*');
      iframeRef.current.contentWindow?.postMessage(JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: []
      }), '*');
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  // Toggle mandatory watch on a drill/film
  const toggleMandatoryWatch = async (e: React.MouseEvent, item: any, type: 'drills' | 'files') => {
    e.stopPropagation();
    if (!activeTeam || !db || !isStaff) return;
    const newVal = !item.mandatoryWatch;
    const collName = type === 'drills' ? 'drills' : 'files';
    await updateDoc(doc(db, 'teams', activeTeam.id, collName, item.id), {
      mandatoryWatch: newVal,
      mandatoryWatchThreshold: 75
    });
    toast({ title: newVal ? "Mandatory Watch ON" : "Mandatory Watch OFF", description: newVal ? "Roster must watch 75% of this video." : "Mandatory watch requirement removed." });
  };

  // Track 75% watch progress for current viewer
  const startWatchTracking = useCallback((drillId: string, duration: number) => {
    if (!user?.id || !activeTeam || !db) return;
    watchStartRef.current = Date.now();
    const requiredMs = duration * 0.75 * 1000;
    
    watchTimerRef.current = setTimeout(async () => {
      try {
        const watchedBy = { [`${user.id}`]: { userId: user.id, name: user.name || 'Viewer', watchedAt: new Date().toISOString(), percentage: 75 } };
        await updateDoc(doc(db, 'teams', activeTeam.id, 'drills', drillId), {
          [`watchedBy.${user.id}`]: watchedBy[user.id]
        });
        setHasCompletedWatch(true);
        toast({ title: "✓ Watch Verified", description: "You've completed 75% of this drill." });
      } catch (err) {
        // Silent fail
      }
    }, Math.min(requiredMs, 30000)); // Cap at 30s for demo
  }, [user?.id, user?.name, activeTeam, db]);

  useEffect(() => {
    return () => {
      if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedDrill || selectedFile) {
      setWatchProgress(0);
      setHasCompletedWatch(false);
    }
    return () => {
      if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
    };
  }, [selectedDrill?.id, selectedFile?.id]);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState<string>('');

  if (isDrillsLoading || isFilesLoading) return <div className="py-20 text-center animate-pulse"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /><p className="text-xs font-black uppercase mt-4">Opening Tactical Hub...</p></div>;

  const renderWatchBadge = (item: any) => {
    if (!item.mandatoryWatch) return null;
    const watchedCount = Object.keys(item.watchedBy || {}).length;
    const rosterCount = members?.length || 0;
    return (
      <Badge className="bg-amber-500 text-white border-none font-black text-[7px] uppercase flex items-center gap-1">
        <Eye className="h-2.5 w-2.5" />
        {watchedCount}/{rosterCount} WATCHED
      </Badge>
    );
  };

  const hasUserWatched = (item: any) => {
    return user?.id && item.watchedBy && item.watchedBy[user.id];
  };

  return (
    <div className="relative min-h-[calc(100vh-10rem)]">
      {!isPro && (
        <div 
          className="absolute inset-x-[-2rem] inset-y-[-2rem] z-50 flex items-center justify-center p-6 sm:p-10 animate-in fade-in zoom-in duration-500"
          style={{ 
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.8) 100%)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <Card className="max-w-md w-full rounded-[3.5rem] border-none shadow-[0_40px_80px_-15px_rgba(0,0,0,0.15)] bg-white overflow-hidden ring-1 ring-black/5">
            <div className="h-2 bg-primary w-full" />
            <div className="p-10 text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-primary/5 rounded-[2rem] flex items-center justify-center ring-1 ring-primary/10 animate-pulse">
                <Lock className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">Tactical Playbook</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Institutional-grade drills, private game tape, and advanced tactical archives require a Pro subscription.
                </p>
              </div>
              <Button 
                onClick={purchasePro}
                className="w-full h-14 rounded-2xl bg-primary text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-lg shadow-primary/20"
              >
                Upgrade to Pro
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className={cn("space-y-8 pb-20 animate-in fade-in duration-500", !isPro && "blur-[8px] grayscale pointer-events-none")}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest mb-1">Execution Hub</Badge>
            <h1 className="text-4xl font-black tracking-tight uppercase text-foreground leading-none">Playbook Hub</h1>
          </div>
          <div className="flex bg-muted/30 p-1.5 rounded-2xl border-2 shadow-inner">
            <button onClick={() => setViewMode('drills')} className={cn("px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all", viewMode === 'drills' ? "bg-black text-white shadow-xl" : "text-muted-foreground hover:text-black")}>Drills</button>
            <button 
              onClick={() => isPro ? setViewMode('gameplay') : purchasePro()} 
              className={cn(
                "px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2", 
                viewMode === 'gameplay' ? "bg-black text-white shadow-xl" : "text-muted-foreground hover:text-black"
              )}
            >
              {!isPro && <Lock className="h-3 w-3 text-red-600" />}
              Game Play
            </button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
        <aside className="space-y-6 md:col-span-1">
          <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 p-8 bg-black text-white relative group overflow-hidden">
            <Package className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10 space-y-4">
              <Badge className="bg-white/10 text-white border-none font-black text-[8px] h-5 px-3">SQUAD READY</Badge>
              <h3 className="text-2xl font-black uppercase leading-tight tracking-tighter">Master Execution</h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">Study institutional protocols and game tape to maintain strategic advantage.</p>
            </div>
          </Card>
          
          <div className="bg-muted/30 p-6 rounded-[2.5rem] border-2 border-dashed space-y-4">
            <div className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /><span className="text-[10px] font-black uppercase">Mandatory Watch</span></div>
            <p className="text-[10px] font-medium text-muted-foreground leading-relaxed italic">
              Enable "Mandatory 75% Watch" on any drill or game tape. The coach will see a real-time roster checklist of who has completed at least 75% of the video.
            </p>
          </div>
        </aside>

        <div className="md:col-span-2 lg:col-span-3 space-y-8">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={`Search ${viewMode}...`} className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black text-sm text-foreground" value={searchTerm ?? ""} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {isStaff && (
              <Button onClick={() => {
                setNewTitle(''); setNewUrl(''); setNewDesc('');
                viewMode === 'drills' ? setIsAddDrillOpen(true) : setIsUploadOpen(true);
              }} className="rounded-full h-14 px-8 font-black uppercase text-xs shadow-xl shadow-primary/20 shrink-0">
                <Plus className="h-5 w-5 mr-2" /> Publish {viewMode === 'drills' ? 'Drill' : 'Film'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {viewMode === 'drills' ? filteredDrills.map(drill => (
              <Card key={drill.id} className="rounded-[2.5rem] overflow-hidden border-none shadow-sm ring-1 ring-black/5 cursor-pointer bg-white group hover:shadow-xl transition-all" onClick={() => setSelectedDrill(drill)}>
                <div className="aspect-video bg-black relative overflow-hidden">
                  {drill.coverImageUrl ? (
                    <img src={drill.coverImageUrl} alt={drill.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : drill.videoUrl && getYoutubeThumbnail(drill.videoUrl) ? (
                    <img src={getYoutubeThumbnail(drill.videoUrl)!} alt={drill.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                  ) : null}
                  {drill.videoUrl ? (
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-12 w-12 text-white fill-current opacity-40 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />
                     </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                      <Dumbbell className="h-16 w-16 text-white" />
                    </div>
                  )}
                  <Badge className="absolute top-4 left-4 bg-primary text-white border-none font-black text-[8px] uppercase">Drill Protocol</Badge>
                  {drill.estimatedTime && (
                    <Badge className="absolute top-4 right-4 bg-black/80 text-white border-none font-black text-[8px] uppercase"><Clock className="h-3 w-3 mr-1 inline" /> {drill.estimatedTime}</Badge>
                  )}
                  {/* Green checkmark if user watched */}
                  {hasUserWatched(drill) && (
                    <div className="absolute bottom-4 right-4 bg-green-500 text-white rounded-full p-1.5 shadow-lg">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={3} />
                    </div>
                  )}
                  {drill.mandatoryWatch && !hasUserWatched(drill) && (
                    <div className="absolute bottom-4 right-4 bg-amber-500 text-white rounded-full p-1.5 shadow-lg">
                      <Bell className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <CardContent className="p-6 space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-black text-lg uppercase truncate tracking-tight text-foreground">{drill.title}</h3>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {renderWatchBadge(drill)}
                      <Badge variant="secondary" className="rounded-lg h-5 text-[8px] font-black uppercase">{(drill.comments?.length || 0)} MARKS</Badge>
                      {isStaff && (
                        <div className="flex bg-muted/50 rounded-xl overflow-hidden shadow-inner">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-black/5 rounded-none" onClick={(e) => { e.stopPropagation(); openEditDrill(e, drill); }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Modify Protocol</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50 rounded-none border-l" onClick={(e) => toggleMandatoryWatch(e, drill, 'drills')}>
                                {drill.mandatoryWatch ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">{drill.mandatoryWatch ? 'Turn Off Mandatory Watch' : 'Turn on Mandatory 75% Watch'}</TooltipContent>
                          </Tooltip>
                          {drill.mandatoryWatch && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/5 rounded-none border-l" onClick={(e) => { e.stopPropagation(); setWatchersDrill(drill); setIsWatchersOpen(true); }}>
                                  <Users className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">View Roster Watch Status</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 rounded-none border-l" onClick={(e) => { e.stopPropagation(); deleteDrill(drill.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Purge from Playbook</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className={cn(
                    "text-xs font-medium text-muted-foreground leading-relaxed transition-all",
                    !expandedDrillIds.has(drill.id) && "line-clamp-3"
                  )}>
                    {drill.description}
                  </p>
                  {drill.description.length > 120 && (
                    <button 
                      onClick={(e) => toggleExpand(e, drill.id)}
                      className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline pt-1"
                    >
                      {expandedDrillIds.has(drill.id) ? "Minimize Protocol" : "Read Full Protocol"}
                    </button>
                  )}
                  {isStaff && drill.mandatoryWatch && (
                    <div className="pt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setWatchersDrill(drill); setIsWatchersOpen(true); }}
                        className="text-[9px] font-black text-amber-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                      >
                        <Users className="h-2.5 w-2.5" />
                        {Object.keys(drill.watchedBy || {}).length}/{(members || []).length} Roster Watched
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )) : filteredFiles.map(file => (
              <Card key={file.id} className="rounded-[2.5rem] overflow-hidden border-none shadow-sm ring-1 ring-black/5 cursor-pointer bg-white group hover:shadow-xl transition-all" onClick={() => setSelectedFile(file)}>
                <div className="aspect-video bg-black flex items-center justify-center relative overflow-hidden">
                  {file.url && (file.url.includes('youtube.com') || file.url.includes('youtu.be/')) && getYoutubeThumbnail(file.url) ? (
                    <img src={getYoutubeThumbnail(file.url)!} alt={file.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Play className="h-12 w-12 text-white fill-current opacity-40 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />
                    </div>
                  )}
                  <Badge className="absolute top-4 left-4 bg-black/60 border-none font-black text-[8px] uppercase">{file.category}</Badge>
                  {(file as any).mandatoryWatch && !hasUserWatched(file) && (
                    <div className="absolute bottom-4 right-4 bg-amber-500 text-white rounded-full p-1.5 shadow-lg">
                      <Bell className="h-4 w-4" />
                    </div>
                  )}
                  {hasUserWatched(file) && (
                    <div className="absolute bottom-4 right-4 bg-green-500 text-white rounded-full p-1.5 shadow-lg">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <CardContent className="p-6 space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-black text-lg uppercase truncate tracking-tight text-foreground">{file.name}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="rounded-lg h-5 text-[8px] font-black uppercase">{(file.comments?.length || 0)} MARKS</Badge>
                      {isStaff && (
                        <div className="flex bg-muted/50 rounded-xl overflow-hidden shadow-inner">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-black/5 rounded-none" onClick={(e) => { e.stopPropagation(); openEditFile(e, file); }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Update Film Metadata</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:bg-amber-50 rounded-none border-l" onClick={(e) => toggleMandatoryWatch(e, file as any, 'files')}>
                                {(file as any).mandatoryWatch ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">{(file as any).mandatoryWatch ? 'Turn Off Mandatory Watch' : 'Turn on Mandatory 75% Watch'}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 rounded-none border-l" onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Purge Archive</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{file.size} • {new Date(file.date).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Roster Watch Status Dialog */}
      <Dialog open={isWatchersOpen} onOpenChange={setIsWatchersOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-lg p-0 border-none shadow-2xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Roster Watch Status</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">75% mandatory watch compliance for "{watchersDrill?.title}"</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
              {(members || []).map(m => {
                const watched = watchersDrill?.watchedBy?.[m.userId || m.id];
                return (
                  <div key={m.id} className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border-2 transition-all",
                    watched ? "bg-green-50 border-green-100" : "bg-muted/20 border-transparent"
                  )}>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 rounded-xl border-2 border-white shadow-sm">
                        <AvatarImage src={m.avatar} />
                        <AvatarFallback className="font-black text-xs">{m.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-black text-xs uppercase">{m.name}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">{m.position}</p>
                      </div>
                    </div>
                    {watched ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" strokeWidth={3} />
                        <span className="text-[9px] font-black text-green-700 uppercase">Verified 75%</span>
                      </div>
                    ) : (
                      <span className="text-[9px] font-black text-muted-foreground uppercase opacity-40">Not Watched</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                {Object.keys(watchersDrill?.watchedBy || {}).length}/{(members || []).length} members have completed 75% of this video
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDrillOpen} onOpenChange={setIsAddDrillOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-lg p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <div className="bg-black text-white p-8 lg:p-10 space-y-2">
            <DialogTitle className="font-black text-2xl uppercase tracking-tighter">{editingItemId ? 'Update Drill' : 'Publish Drill'}</DialogTitle>
            <DialogDescription className="text-white/40 text-[10px] font-black uppercase tracking-widest">{editingItemId ? 'Modify an existing execution protocol.' : 'Enroll a new execution protocol into the playbook.'}</DialogDescription>
          </div>
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="sm:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Drill Title</Label>
                <Input placeholder="e.g. 5-4-3 Double Play Rotation" className="h-14 rounded-2xl border-2 font-black text-lg" value={newTitle ?? ""} onChange={e => setNewTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1 flex items-center gap-1"><Clock className="h-3 w-3" /> Time</Label>
                <Input placeholder="e.g. 15 mins" className="h-14 rounded-2xl border-2 font-black text-lg" value={newTime ?? ""} onChange={e => setNewTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Strategic Instructions</Label>
              <Textarea placeholder="Describe the drill setup, reps, and coaching cues..." className="rounded-2xl border-2 font-medium min-h-[120px] p-4 resize-none" value={newDesc ?? ""} onChange={e => setNewDesc(e.target.value)} />
            </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Additional Media (Images/Videos)</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-[8px] font-black uppercase" onClick={() => setNewMedia([...newMedia, {url: '', description: ''}])}>
                    <Plus className="h-3 w-3 mr-1" /> Add New Slot
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Cover Photo URL (Image Only)" className="h-12 rounded-xl border-2 font-bold" value={newCoverUrl ?? ""} onChange={e => setNewCoverUrl(e.target.value)} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" className="h-12 rounded-xl" onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e: any) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setNewCoverUrl(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        };
                        input.click();
                      }}>
                        <Upload className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg">
                      Upload Cover Image
                    </TooltipContent>
                  </Tooltip>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Primary Video URL (YouTube/Vimeo)</Label>
                  <Input placeholder="Strategy Video URL" className="h-12 rounded-xl border-2 font-bold" value={newUrl ?? ""} onChange={e => setNewUrl(e.target.value)} />
                </div>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {newMedia.map((m, i) => (
                    <div key={i} className="space-y-3 p-5 bg-muted/30 rounded-2xl border-2 border-dashed">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[8px] font-black uppercase tracking-widest">Media Slot {i + 1}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => setNewMedia(newMedia.filter((_, idx) => idx !== i))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Remove Media Slot</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Image/Video URL" className="h-11 rounded-xl border font-bold text-xs flex-1" value={m.url ?? ""} onChange={e => {
                          const next = [...newMedia];
                          next[i] = { ...next[i], url: e.target.value };
                          setNewMedia(next);
                        }} />
                        <Button variant="outline" className="h-11 rounded-xl px-4 hover:bg-primary/5 hover:text-primary transition-colors shrink-0" onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*,video/*';
                          input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const next = [...newMedia];
                                next[i] = { ...next[i], url: ev.target?.result as string };
                                setNewMedia(next);
                              };
                              reader.readAsDataURL(file);
                            }
                          };
                          input.click();
                        }}>
                          <Upload className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input 
                        placeholder="Add sub-text or internal description for this media..." 
                        className="h-10 rounded-xl border font-black text-[9px] uppercase tracking-widest placeholder:opacity-50" 
                        value={m.description ?? ""} 
                        onChange={e => {
                          const next = [...newMedia];
                          next[i] = { ...next[i], description: e.target.value };
                          setNewMedia(next);
                        }} 
                      />
                    </div>
                  ))}
                </div>
          <DialogFooter className="p-8 pt-0 flex flex-col sm:flex-row gap-3">
            <Button variant="ghost" onClick={() => { setIsAddDrillOpen(false); setEditingItemId(null); }} className="rounded-2xl h-14 font-black uppercase text-[10px] flex-1">Abort</Button>
            <Button onClick={handleAddDrill} disabled={!newTitle || !newDesc} className="rounded-2xl h-14 font-black uppercase text-[10px] flex-1 shadow-xl shadow-primary/20">{editingItemId ? 'Commit Updates' : 'Commit to Playbook'}</Button>
          </DialogFooter>
        </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-lg p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <div className="bg-primary text-white p-8 lg:p-10 space-y-2">
            <DialogTitle className="font-black text-2xl uppercase tracking-tighter">{editingItemId ? 'Update Tape' : 'Archive Film'}</DialogTitle>
            <DialogDescription className="text-white/60 text-[10px] font-black uppercase tracking-widest">{editingItemId ? 'Modify existing tape parameters.' : 'Enshrine game tape or tournament footage in the vault.'}</DialogDescription>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Tape Title</Label>
              <Input placeholder="e.g. Regional Finals vs Lancers" className="h-14 rounded-2xl border-2 font-black text-lg" value={newTitle ?? ""} onChange={e => setNewTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.1em] ml-1">Archive Category</Label>
              <Select value={uploadCat} onValueChange={setUploadCat}>
                <SelectTrigger className="h-14 rounded-2xl border-2 font-black uppercase text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="Game Tape" className="font-black uppercase text-[10px]">Game Tape</SelectItem>
                  <SelectItem value="Practice Session" className="font-black uppercase text-[10px]">Practice Session</SelectItem>
                  <SelectItem value="Highlights" className="font-black uppercase text-[10px]">Highlights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] ml-1">Video Source (URL)</Label>
              <Input placeholder="https://youtu.be/..." className="h-12 rounded-xl border-2 font-bold" value={newUrl ?? ""} onChange={e => setNewUrl(e.target.value)} />
              <div className="relative py-4 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t"></div></div>
                <span className="relative bg-white px-4 text-[9px] font-black text-muted-foreground uppercase">OR UPLOAD RAW FILE</span>
              </div>
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleUploadFile} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full h-14 rounded-2xl border-2 font-black uppercase text-[10px] border-dashed">
                <Upload className="h-4 w-4 mr-2" /> Upload MP4/MOV
              </Button>
            </div>
          </div>
          <DialogFooter className="p-8 pt-0">
            <Button onClick={handleAddFilm} disabled={!newTitle || (!newUrl && !fileInputRef.current?.files?.length)} className="w-full h-16 rounded-[2rem] font-black uppercase text-xs shadow-xl shadow-primary/20">Enshrine in Vault</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!selectedDrill || !!selectedFile} onOpenChange={() => { setSelectedDrill(null); setSelectedFile(null); }}>
        <DialogContent className="rounded-none sm:rounded-[3rem] w-full sm:max-w-6xl h-full sm:h-auto sm:max-h-[95vh] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground flex flex-col">
          <DialogTitle className="sr-only">Tactical Viewer - {selectedDrill?.title || selectedFile?.name}</DialogTitle>
          {(selectedDrill || selectedFile) && (() => {
            const data = selectedDrill || selectedFile;
            const url = selectedDrill ? selectedDrill.videoUrl : selectedFile!.url;
            const type = selectedDrill ? 'drills' : 'files';
            const isMandatory = data.mandatoryWatch;
            const userHasWatched = hasUserWatched(data);
            
            return (
              <div className="flex flex-col h-full overflow-hidden bg-muted/10">
                {/* STICKY TACTICAL HEADER */}
                <div className="bg-black shrink-0 relative shadow-2xl z-20 sm:rounded-t-[3rem] overflow-hidden p-0 sm:p-4 lg:p-8">
                  
                  {/* Mandatory Watch Banner */}
                  {isMandatory && (
                    <div className={cn(
                      "mb-4 px-4 py-3 rounded-2xl flex items-center justify-between",
                      userHasWatched ? "bg-green-500/20 border border-green-500/30" : "bg-amber-500/20 border border-amber-500/30"
                    )}>
                      <div className="flex items-center gap-2">
                        {userHasWatched ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" strokeWidth={3} />
                        ) : (
                          <Bell className="h-4 w-4 text-amber-400" />
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest text-white">
                          {userHasWatched ? "Watch Verified ✓ 75% Complete" : "Mandatory 75% Watch Required"}
                        </span>
                      </div>
                      {isStaff && (
                        <button
                          onClick={() => { setWatchersDrill(data); setIsWatchersOpen(true); }}
                          className="text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          {Object.keys(data.watchedBy || {}).length}/{(members || []).length} watched
                        </button>
                      )}
                    </div>
                  )}

                  <div className="aspect-video bg-neutral-900 rounded-[2.5rem] overflow-hidden shadow-2xl relative group mb-8">
                    {url && (url.includes('youtube.com') || url.includes('youtu.be/')) ? (
                      <iframe
                        ref={iframeRef}
                        src={`https://www.youtube.com/embed/${url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|u\/\w\/))([^\?&"'>]+)/)?.[1]}?enablejsapi=1&autoplay=1`}
                        className="w-full h-full border-none"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        onLoad={() => {
                          if (isMandatory && !userHasWatched && data.id) {
                            startWatchTracking(data.id, 300); // assume 5 min video
                          }
                        }}
                      />
                    ) : url ? (
                      <video
                        ref={videoRef}
                        src={url}
                        controls
                        autoPlay
                        className="w-full h-full"
                        onTimeUpdate={(e) => {
                          const video = e.currentTarget;
                          const pct = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
                          setWatchProgress(pct);
                          if (pct >= 75 && isMandatory && !userHasWatched && user?.id && activeTeam && db) {
                            updateDoc(doc(db, 'teams', activeTeam.id, 'drills', data.id), {
                              [`watchedBy.${user.id}`]: { userId: user.id, name: user.name || 'Viewer', watchedAt: new Date().toISOString(), percentage: 75 }
                            }).catch(() => {});
                            setHasCompletedWatch(true);
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/10">
                        <Video className="h-20 w-20 text-white/5 animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* Additional Media Section */}
                  {data.additionalMedia && data.additionalMedia.length > 0 && (
                    <div className="space-y-6 pt-4">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-px flex-1 bg-white/10" />
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Strategic Archive</h4>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {data.additionalMedia.map((media: any, idx: number) => {
                          const mediaUrl = typeof media === 'string' ? media : media.url;
                          const mediaDesc = typeof media === 'object' ? media.description : '';
                          return (
                            <div key={idx} className="space-y-3 group/media">
                              <div className="aspect-video bg-neutral-900 rounded-3xl overflow-hidden ring-1 ring-white/10 group-hover/media:ring-primary/50 transition-all shadow-lg relative">
                                {mediaUrl && (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be/')) ? (
                                  <iframe
                                    src={`https://www.youtube.com/embed/${mediaUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|u\/\w\/))([^\?&"'>]+)/)?.[1]}`}
                                    className="w-full h-full border-none"
                                  />
                                ) : mediaUrl && (mediaUrl.includes('mp4') || mediaUrl.includes('mov') || mediaUrl.startsWith('data:video')) ? (
                                  <video src={mediaUrl} controls className="w-full h-full" />
                                ) : mediaUrl ? (
                                  <button 
                                    className="relative w-full h-full cursor-zoom-in group/asset"
                                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(mediaUrl); }}
                                  >
                                    <img 
                                      src={mediaUrl} 
                                      alt={`Ref ${idx + 1}`} 
                                      className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-110" 
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center">
                                       <Search className="h-8 w-8 text-white opacity-40 group-hover/asset:scale-110 transition-transform" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Package className="h-8 w-8 text-white/10" />
                                  </div>
                                )}
                                <Badge className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white border-white/10 font-bold text-[8px] uppercase">Asset {idx + 1}</Badge>
                              </div>
                              {mediaDesc && (
                                <div className="px-2">
                                  <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-relaxed line-clamp-2 italic group-hover/media:text-white/80 transition-colors">
                                    {mediaDesc}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* SCROLLABLE DATA HUB */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x bg-white">
                  {/* Left Column: Descriptions & Extra Media */}
                  <div className="flex-1 overflow-y-auto p-4 lg:p-10 space-y-10 custom-scrollbar">

                {/* Right Side: Info and Comments */}
                <div className="w-full lg:w-[400px] flex flex-col bg-white border-l divide-y overflow-hidden">
                  <div className="p-8 space-y-4 shrink-0 bg-white">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <h3 className="font-black text-2xl tracking-tighter uppercase leading-none truncate">{data.title || data.name}</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2">{new Date(data.createdAt || data.date).toLocaleDateString()}</p>
                      </div>
                      {isStaff && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-muted-foreground hover:text-black hover:bg-black/5 rounded-xl shrink-0" 
                                onClick={(e) => {
                                  if (selectedDrill) {
                                    openEditDrill(e, selectedDrill);
                                    setSelectedDrill(null);
                                  } else {
                                    openEditFile(e, selectedFile);
                                    setSelectedFile(null);
                                  }
                                }}
                              >
                                <Edit2 className="h-5 w-5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Quick Modify</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-red-500 hover:bg-red-50 rounded-xl shrink-0" 
                                onClick={() => { 
                                  selectedDrill ? deleteDrill(data.id) : deleteFile(data.id); 
                                  setSelectedDrill(null); setSelectedFile(null);
                                }}
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Erase from Vault</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                      {selectedDrill ? data.description : (data.description || 'No institutional notes archived.')}
                    </p>

                    {/* Mandatory Watch Toggle in viewer */}
                    {isStaff && (
                      <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border-2 border-dashed">
                        <div className="flex items-center gap-2">
                          <Bell className="h-4 w-4 text-amber-500" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Mandatory 75% Watch</p>
                            <p className="text-[8px] text-muted-foreground">Require roster to watch 75%</p>
                          </div>
                        </div>
                        <Switch
                          checked={!!data.mandatoryWatch}
                          onCheckedChange={async (checked) => {
                            if (!activeTeam || !db) return;
                            const collName = selectedDrill ? 'drills' : 'files';
                            await updateDoc(doc(db, 'teams', activeTeam.id, collName, data.id), {
                              mandatoryWatch: checked,
                              mandatoryWatchThreshold: 75
                            });
                            if (selectedDrill) {
                              setSelectedDrill((prev: any) => ({ ...prev, mandatoryWatch: checked }));
                            } else {
                              setSelectedFile((prev: any) => ({ ...prev, mandatoryWatch: checked }));
                            }
                            toast({ title: checked ? "Mandatory Watch Enabled" : "Mandatory Watch Disabled" });
                          }}
                        />
                      </div>
                    )}

                    )}
                  </div>

                  {/* Right Column: Coach Marks */}
                  <div className="w-full lg:w-[450px] flex flex-col overflow-hidden bg-zinc-50/50">
                    <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    <div className="flex items-center justify-between sticky top-0 bg-transparent z-10 pb-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{isStaff ? "Coach Marks & Tags" : "Roster Comments"}</h4>
                      <Badge variant="outline" className="h-5 text-[8px] font-black uppercase border-primary/20 text-primary">{(data.comments || []).length} {isStaff ? "Marks" : "Comments"}</Badge>
                    </div>

                    <div className="space-y-4">
                      {(data.comments || []).length === 0 ? (
                        <div className="text-center py-10 opacity-30 italic text-xs font-black uppercase">No tactical marks archived.</div>
                      ) : (
                        (data.comments || []).map((c: any) => (
                          <div 
                            key={c.id} 
                            className={cn(
                              "bg-white p-5 rounded-3xl shadow-sm border space-y-3 group/cmt hover:ring-2 hover:ring-primary/20 transition-all",
                              c.timestamp != null && "cursor-pointer hover:bg-primary/5"
                            )} 
                            onClick={() => seekTo(c.timestamp)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                {c.timestamp != null && (
                                  <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase h-5 shadow-lg shadow-primary/20">
                                    {Math.floor(c.timestamp / 60)}:{String(c.timestamp % 60).padStart(2, '0')}
                                  </Badge>
                                )}
                                <span className="text-[9px] font-black uppercase text-primary tracking-widest">{c.authorName}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover/cmt:opacity-100 transition-opacity">
                                {(c.authorId === user?.id || isStaff) && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6 text-muted-foreground hover:bg-muted/10" 
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setEditingCommentId(c.id); 
                                            setEditingCommentText(c.text); 
                                          }}
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Edit Mark</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6 text-red-500 hover:bg-red-50" 
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            handleDeleteComment(data.id, c.id, data.comments, type); 
                                          }}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest">Delete Mark</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                              </div>
                            </div>
                            {editingCommentId === c.id ? (
                              <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                <Textarea 
                                  value={editingCommentText ?? ""} 
                                  onChange={e => setEditingCommentText(e.target.value)}
                                  className="rounded-xl border-2 font-bold text-xs min-h-[60px]"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-7 text-[8px] font-black uppercase" onClick={() => handleEditComment(data.id, c.id, data.comments, editingCommentText, type)}>Save</Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-[8px] font-black uppercase" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs font-bold leading-relaxed">{c.text}</p>
                            )}
                            <p className="text-[7px] font-black text-muted-foreground uppercase">
                              {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(c.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="p-8 space-y-4 bg-white border-t shrink-0">
                    <div className="flex gap-2">
                      {isStaff && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Input 
                            placeholder="M" 
                            className="w-12 h-12 rounded-xl border-2 font-black text-xs text-center border-primary/10 shadow-inner" 
                            value={commentMin ?? ""} 
                            onChange={e => setCommentMin(e.target.value)} 
                          />
                          <span className="font-black text-muted-foreground">:</span>
                          <Input 
                            placeholder="S" 
                            className="w-12 h-12 rounded-xl border-2 font-black text-xs text-center border-primary/10 shadow-inner" 
                            value={commentSec ?? ""} 
                            onChange={e => setCommentSec(e.target.value)} 
                          />
                        </div>
                      )}
                      <Input 
                        placeholder={isStaff ? "Add coaching cue or tag timestamp..." : "Add a comment..."} 
                        className="flex-1 h-12 rounded-xl border-2 font-bold text-xs border-primary/10 shadow-inner px-4" 
                        value={commentText ?? ""} 
                        onChange={e => setCommentText(e.target.value)} 
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && commentText) {
                            handleAddComment(data.id, data.comments, type);
                          }
                        }}
                      />
                      {isStaff && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              className="h-12 w-12 rounded-xl bg-muted/30 p-0 text-muted-foreground hover:bg-black/5" 
                              onClick={() => {
                                if (videoRef.current) {
                                  const s = Math.floor(videoRef.current.currentTime);
                                  setCommentMin(Math.floor(s / 60).toString());
                                  setCommentSec(String(s % 60).padStart(2, '0'));
                                } else {
                                  toast({ title: "YouTube Timestamp", description: "For YouTube, please enter the time manually (e.g. 1:24)" });
                                }
                              }}
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-black text-white border-white/10 font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg">
                            Capture timestamp from video
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <Button 
                      className="w-full h-12 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-black/5 bg-black text-white hover:scale-[1.02] transition-all" 
                      onClick={() => handleAddComment(data.id, data.comments, type)} 
                      disabled={!commentText}
                    >
                      <Bookmark className="h-3 w-3 mr-2" /> {isStaff ? "Publish Mark" : "Post Comment"}
                    </Button>
                    
                    {/* Confirmed Completed Button */}
                    <Button 
                      variant="outline"
                      className="w-full h-12 rounded-xl font-black uppercase text-[10px] border-2 border-emerald-500/20 text-emerald-600 hover:bg-emerald-50 shadow-sm"
                      onClick={() => { setSelectedDrill(null); setSelectedFile(null); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-2" strokeWidth={3} /> Confirmed Completed
                    </Button>
                  </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      
      {/* Tactical Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-0 border-none bg-black/90 backdrop-blur-xl overflow-hidden rounded-[2.5rem] flex items-center justify-center">
          <DialogTitle className="sr-only">Tactical Asset Preview</DialogTitle>
          <button 
            className="absolute top-6 right-6 z-[60] h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {lightboxUrl && (
            <img 
              src={lightboxUrl} 
              alt="Tactical Preview" 
              className="max-w-full max-h-[85vh] object-contain shadow-2xl animate-in zoom-in duration-300" 
            />
          )}
        </DialogContent>
      </Dialog>

        </div>
      </div>
  );
}
