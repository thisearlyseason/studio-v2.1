
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  Video
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
import { useTeam } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function DrillsPage() {
  const { activeTeam, addDrill, deleteDrill, hasFeature, isSuperAdmin, purchasePro } = useTeam();
  const db = useFirestore();

  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('createdAt', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawDrills, isLoading } = useCollection(drillsQuery);
  const drills = useMemo(() => rawDrills || [], [rawDrills]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDrill, setSelectedDrill] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | undefined>();
  const [primaryMedia, setPrimaryMedia] = useState<'video' | 'image'>('video');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredDrills = useMemo(() => {
    return drills.filter(d => 
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      d.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [drills, searchTerm]);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Loading drills...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canAccessLibrary = hasFeature('media_uploads');

  if (!canAccessLibrary) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl">
            <Dumbbell className="h-16 w-16 text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 bg-black text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-sm:px-4 space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Squad Training</h1>
          <p className="text-muted-foreground font-bold leading-relaxed">
            Create a custom library of drills, tactics, and video lessons for your squad with a Pro subscription.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-black/5">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Training Suite</span>
              <Badge className="bg-primary text-white border-none font-bold">Elite Content</Badge>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Custom Drill Directory</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> YouTube Video Integration</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Photo Aid Uploads</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 hover:bg-primary/90" onClick={purchasePro}>
              Unlock Training Library
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      try {
        const compressed = await compressImage(e.target.files[0]);
        setNewPhotoUrl(compressed);
      } catch (error) {
        toast({ title: "Upload Failed", variant: "destructive" });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleAddDrill = async () => {
    if (!newTitle || !newDescription) return;
    addDrill({
      title: newTitle,
      description: newDescription,
      videoUrl: newVideoUrl,
      photoUrl: newPhotoUrl,
      primaryMedia: primaryMedia,
      thumbnailUrl: newPhotoUrl || "https://picsum.photos/seed/drill/400/300"
    });
    setIsAddOpen(false);
    setNewTitle(''); setNewDescription(''); setNewVideoUrl(''); setNewPhotoUrl(undefined);
    toast({ title: "Drill Added", description: "Your new training exercise is live." });
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      if (match && match[2].length === 11) {
        return `https://www.youtube.com/embed/${match[2]}`;
      }
    } catch (e) { return null; }
    return null;
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Training Library</h1>
          <p className="text-muted-foreground text-sm font-bold">Master the plays and coordinate perfection.</p>
        </div>
        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-lg shadow-primary/20 px-6 font-black uppercase text-xs tracking-widest h-11">
                <Plus className="h-4 w-4 mr-2" />
                Add Drill
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl rounded-[2.5rem] overflow-hidden p-0 max-h-[90vh] flex flex-col border-none shadow-2xl">
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
                  <div className="p-8 bg-muted/30 lg:border-r space-y-6">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-black">Publish Training Drill</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Define coordination exercises</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Drill Name</Label>
                        <Input placeholder="e.g. Full Court Press" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="rounded-xl h-12 bg-background shadow-sm border-2 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">YouTube Integration</Label>
                        <div className="relative">
                          <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="https://youtube.com/..." value={newVideoUrl} onChange={e => setNewVideoUrl(e.target.value)} className="rounded-xl h-12 pl-11 bg-background shadow-sm border-2 font-bold" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Visual Aid</Label>
                        <div className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-background hover:border-primary/20 transition-all bg-background/50" onClick={() => fileInputRef.current?.click()}>
                          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                          {newPhotoUrl ? (
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-lg border">
                              <img src={newPhotoUrl} className="w-full h-full object-cover" alt="Preview" />
                              <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-xl" onClick={(e) => { e.stopPropagation(); setNewPhotoUrl(undefined); }}><X className="h-4 w-4" /></Button>
                            </div>
                          ) : (
                            <>
                              <div className="bg-white p-3 rounded-2xl shadow-sm mb-3"><Camera className="h-6 w-6 text-primary" /></div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tap to upload diagram</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3 bg-white/50 p-4 rounded-xl border border-black/5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Primary Media Focus</Label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Button variant={primaryMedia === 'video' ? 'default' : 'outline'} className="h-10 rounded-lg text-[10px] font-black" onClick={() => setPrimaryMedia('video')}><Video className="h-3 w-3 mr-2" /> Video First</Button>
                          <Button variant={primaryMedia === 'image' ? 'default' : 'outline'} className="h-10 rounded-lg text-[10px] font-black" onClick={() => setPrimaryMedia('image')}><ImageIcon className="h-3 w-3 mr-2" /> Image First</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-8 space-y-6 flex flex-col justify-between bg-background">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Detailed Instructions</Label>
                      <Textarea placeholder="Explain step-by-step..." value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-[2rem] min-h-[300px] p-6 text-base leading-relaxed bg-muted/10 border-2 font-bold" />
                    </div>
                    <DialogFooter>
                      <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-6" onClick={handleAddDrill} disabled={!newTitle || !newDescription || isUploading}>
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                        Publish to Squad Library
                      </Button>
                    </DialogFooter>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search training directory..." className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner font-black" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrills.length > 0 ? filteredDrills.map((drill) => (
          <Card key={drill.id} className="group overflow-hidden border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-3xl ring-1 ring-black/5 cursor-pointer flex flex-col" onClick={() => setSelectedDrill({ ...drill, viewerPrimary: drill.primaryMedia || (drill.videoUrl ? 'video' : 'image') })}>
            <div className="relative aspect-video overflow-hidden">
              <img src={drill.thumbnailUrl || "https://picsum.photos/seed/training/400/300"} alt={drill.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-0 group-hover:scale-100 transition-transform">{drill.videoUrl ? <Play className="h-6 w-6 fill-current ml-1" /> : <ImageIcon className="h-6 w-6" />}</div>
              </div>
              {drill.videoUrl && <div className="absolute top-3 right-3"><Badge className="bg-primary text-white border-none text-[9px] font-black uppercase tracking-widest px-2 h-5 shadow-lg">Video</Badge></div>}
            </div>
            <CardContent className="p-5 space-y-2 flex-1 flex flex-col">
              <h3 className="font-black text-lg tracking-tight group-hover:text-primary transition-colors line-clamp-1">{drill.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1 font-bold">{drill.description}</p>
              <div className="flex items-center justify-between pt-4 mt-auto">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Added {new Date(drill.createdAt).toLocaleDateString()}</span>
                <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        )) : (
          <div className="col-span-full py-20 text-center bg-muted/20 border-2 border-dashed rounded-[2.5rem] space-y-4">
            <Dumbbell className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
            <div>
              <p className="font-black text-lg uppercase tracking-tight">No drills found</p>
              <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest opacity-60">Time to build your squad's playbook.</p>
            </div>
            {isAdmin && <Button variant="outline" className="rounded-full px-8 lg:px-10 font-black uppercase text-[10px] tracking-widest border-2 h-10 lg:h-12" onClick={() => setIsAddOpen(true)}>Create First Drill</Button>}
          </div>
        )}
      </div>

      <Dialog open={!!selectedDrill} onOpenChange={(open) => !open && setSelectedDrill(null)}>
        <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 overflow-hidden flex flex-col lg:flex-row max-h-[95vh] border-none shadow-2xl">
          {selectedDrill && (
            <>
              <div className="flex-1 bg-black relative flex items-center justify-center min-h-[300px] lg:min-h-0">
                <div className="sr-only">
                  <DialogTitle>{selectedDrill.title}</DialogTitle>
                  <DialogDescription>{selectedDrill.description}</DialogDescription>
                </div>
                
                {selectedDrill.viewerPrimary === 'video' && getYouTubeEmbedUrl(selectedDrill.videoUrl) ? (
                  <div className="w-full h-full aspect-video">
                    <iframe src={getYouTubeEmbedUrl(selectedDrill.videoUrl)} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                ) : (
                  <img src={selectedDrill.photoUrl || selectedDrill.thumbnailUrl} className="w-full h-full object-contain p-2" alt={selectedDrill.title} />
                )}

                {/* Tactical Mini-Toggle / Thumbnail */}
                {(selectedDrill.videoUrl && selectedDrill.photoUrl) && (
                  <div className="absolute bottom-6 right-6 z-20 flex gap-2">
                    <button 
                      onClick={() => setSelectedDrill({...selectedDrill, viewerPrimary: 'video'})}
                      className={cn("h-16 w-24 rounded-xl border-2 overflow-hidden shadow-2xl transition-all hover:scale-105", selectedDrill.viewerPrimary === 'video' ? "border-primary ring-2 ring-primary/30" : "border-white/20 opacity-60")}
                    >
                      <div className="w-full h-full bg-black/50 flex items-center justify-center relative">
                        <img src={selectedDrill.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover opacity-40" alt="Video thumb" />
                        <Play className="h-4 w-4 text-white relative z-10" />
                      </div>
                    </button>
                    <button 
                      onClick={() => setSelectedDrill({...selectedDrill, viewerPrimary: 'image'})}
                      className={cn("h-16 w-24 rounded-xl border-2 overflow-hidden shadow-2xl transition-all hover:scale-105", selectedDrill.viewerPrimary === 'image' ? "border-primary ring-2 ring-primary/30" : "border-white/20 opacity-60")}
                    >
                      <img src={selectedDrill.photoUrl} className="w-full h-full object-cover" alt="Photo thumb" />
                    </button>
                  </div>
                )}

                <Button variant="secondary" size="icon" className="absolute top-6 left-6 rounded-full bg-black/50 text-white border-none hover:bg-black/70 lg:hidden" onClick={() => setSelectedDrill(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="w-full lg:w-[400px] flex flex-col bg-background p-8 lg:h-full overflow-y-auto custom-scrollbar">
                <div className="flex-1">
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[10px]">Training Resource</Badge>
                        <h3 className="text-3xl font-black tracking-tight leading-tight">{selectedDrill.title}</h3>
                      </div>
                      <div className="hidden lg:block">
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setSelectedDrill(null)}><XCircle className="h-5 w-5 text-muted-foreground" /></Button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Expert Instructions</h4>
                      <p className="text-base leading-relaxed text-foreground/80 font-black whitespace-pre-wrap">{selectedDrill.description}</p>
                    </div>
                    {selectedDrill.videoUrl && !getYouTubeEmbedUrl(selectedDrill.videoUrl) && (
                      <Button asChild variant="outline" className="h-12 rounded-xl w-full gap-3 font-black uppercase text-xs tracking-widest border-2 border-primary/20 text-primary mt-4 shadow-sm">
                        <a href={selectedDrill.videoUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open Source Video</a>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="pt-8 border-t mt-6 flex gap-3">
                  {isAdmin && <Button variant="ghost" className="rounded-xl h-12 w-12 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => { if(confirm("Purge?")) { deleteDrill(selectedDrill.id); setSelectedDrill(null); } }}><Trash2 className="h-5 w-5" /></Button>}
                  <Button className="flex-1 rounded-xl h-12 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20" onClick={() => setSelectedDrill(null)}>Close Resource</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
