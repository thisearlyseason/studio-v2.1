
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Youtube
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
import { useTeam, Drill } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function DrillsPage() {
  const { activeTeam, drills, addDrill, deleteDrill, user, isPro, isSuperAdmin } = useTeam();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading drills...</p>
      </div>
    );
  }

  // Unified Admin Check
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8 animate-in fade-in slide-in-from-bottom-4">
        <div className="relative">
          <div className="bg-amber-100 p-6 rounded-[2.5rem] shadow-xl">
            <Dumbbell className="h-16 w-16 text-amber-600" />
          </div>
          <div className="absolute -top-2 -right-2 bg-primary text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Squad Training</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Create a custom library of drills, tactics, and video lessons for your squad with a Pro subscription.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Training Suite</span>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-none font-bold">Elite Content</Badge>
            </div>
            <ul className="space-y-4">
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> Custom Drill Directory</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> YouTube Video Integration</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-amber-500" /> Photo Aid Uploads</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
              Unlock Training for $9.99 USD
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const filteredDrills = drills.filter(d => 
    d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      thumbnailUrl: newPhotoUrl || "https://picsum.photos/seed/drill/400/300"
    });

    setIsAddOpen(false);
    resetForm();
    toast({ title: "Drill Added", description: "Your new training exercise is live." });
  };

  const resetForm = () => {
    setNewTitle(''); setNewDescription(''); setNewVideoUrl(''); setNewPhotoUrl(undefined);
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      if (match && match[2].length === 11) {
        return `https://www.youtube.com/embed/${match[2]}`;
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Training Library</h1>
          <p className="text-muted-foreground text-sm font-medium">Master the plays and coordinate perfection.</p>
        </div>
        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Add Drill
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-[2rem] overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>New Training Drill</DialogTitle>
                <DialogDescription>Define an exercise for your squad to study and master.</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <div className="space-y-2">
                  <Label>Drill Name</Label>
                  <Input placeholder="e.g. Full Court Press, Zone Defense" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="rounded-xl h-11" />
                </div>
                <div className="space-y-2">
                  <Label>How to Perform</Label>
                  <Textarea placeholder="Step-by-step instructions..." value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[120px]" />
                </div>
                <div className="space-y-2">
                  <Label>YouTube Video Link (Optional)</Label>
                  <div className="relative">
                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="https://youtube.com/..." value={newVideoUrl} onChange={e => setNewVideoUrl(e.target.value)} className="rounded-xl h-11 pl-10" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Upload Visual Aid (Optional)</Label>
                  <div 
                    className="border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    {newPhotoUrl ? (
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                        <img src={newPhotoUrl} className="w-full h-full object-cover" alt="Preview" />
                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6 rounded-full" onClick={(e) => { e.stopPropagation(); setNewPhotoUrl(undefined); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-xs font-bold text-muted-foreground">Tap to upload diagram or photo</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-12 rounded-xl text-base font-bold" onClick={handleAddDrill} disabled={!newTitle || !newDescription || isUploading}>
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Publish to Squad
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search training directory..." 
          className="pl-11 bg-muted/50 border-none rounded-2xl h-12 shadow-inner"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrills.length > 0 ? filteredDrills.map((drill) => (
          <Card 
            key={drill.id} 
            className="group overflow-hidden border-none shadow-md hover:shadow-xl transition-all duration-300 rounded-3xl ring-1 ring-black/5 cursor-pointer flex flex-col"
            onClick={() => setSelectedDrill(drill)}
          >
            <div className="relative aspect-video overflow-hidden">
              <img 
                src={drill.thumbnailUrl || "https://picsum.photos/seed/training/400/300"} 
                alt={drill.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-0 group-hover:scale-100 transition-transform">
                  <Play className="h-6 w-6 fill-current ml-1" />
                </div>
              </div>
              {drill.videoUrl && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-red-600 text-white border-none text-[9px] font-black uppercase tracking-widest px-2 h-5">Video</Badge>
                </div>
              )}
            </div>
            <CardContent className="p-5 space-y-2 flex-1 flex flex-col">
              <h3 className="font-black text-lg tracking-tight group-hover:text-primary transition-colors line-clamp-1">{drill.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed flex-1">{drill.description}</p>
              <div className="flex items-center justify-between pt-4 mt-auto">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Added {new Date(drill.createdAt).toLocaleDateString()}</span>
                <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
              </div>
            </CardContent>
          </Card>
        )) : (
          <div className="col-span-full py-20 text-center bg-muted/20 border-2 border-dashed rounded-[2.5rem] space-y-4">
            <Dumbbell className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
            <div>
              <p className="font-bold text-lg">No drills found</p>
              <p className="text-sm text-muted-foreground">Time to build your squad's playbook.</p>
            </div>
            {isAdmin && <Button variant="outline" className="rounded-full" onClick={() => setIsAddOpen(true)}>Create First Drill</Button>}
          </div>
        )}
      </div>

      {/* Drill Detail View */}
      <Dialog open={!!selectedDrill} onOpenChange={(open) => !open && setSelectedDrill(null)}>
        <DialogContent className="sm:max-w-3xl rounded-[2.5rem] p-0 overflow-hidden max-h-[90vh] flex flex-col">
          {selectedDrill && (
            <>
              <div className="relative overflow-y-auto">
                {/* Visual Header */}
                <div className="aspect-video w-full bg-black relative">
                  {getYouTubeEmbedUrl(selectedDrill.videoUrl) ? (
                    <iframe 
                      src={getYouTubeEmbedUrl(selectedDrill.videoUrl)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <img 
                      src={selectedDrill.photoUrl || selectedDrill.thumbnailUrl} 
                      className="w-full h-full object-contain"
                      alt={selectedDrill.title}
                    />
                  )}
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    className="absolute top-4 right-4 rounded-full bg-black/50 text-white border-none hover:bg-black/70"
                    onClick={() => setSelectedDrill(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-8 space-y-6">
                  <DialogHeader className="flex flex-row items-start justify-between flex-wrap gap-4 text-left">
                    <div className="space-y-1">
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px]">Training Resource</Badge>
                      <DialogTitle className="text-3xl font-black tracking-tight">{selectedDrill.title}</DialogTitle>
                      <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Published to {activeTeam.name} coordination library
                      </DialogDescription>
                    </div>
                    {isAdmin && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          deleteDrill(selectedDrill.id);
                          setSelectedDrill(null);
                        }}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </DialogHeader>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Instructions</h4>
                    <p className="text-lg leading-relaxed text-foreground/80 font-medium whitespace-pre-wrap">{selectedDrill.description}</p>
                  </div>

                  {selectedDrill.videoUrl && !getYouTubeEmbedUrl(selectedDrill.videoUrl) && (
                    <div className="pt-4">
                      <Button asChild variant="outline" className="rounded-xl h-12 w-full gap-2">
                        <a href={selectedDrill.videoUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open Video Source
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="p-6 border-t bg-muted/10 shrink-0">
                <Button className="w-full rounded-xl h-12 font-bold" onClick={() => setSelectedDrill(null)}>Close Library Item</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
