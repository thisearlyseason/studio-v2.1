
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
  Trash2, 
  Dumbbell, 
  ChevronRight,
  Loader2,
  Video,
  Filter,
  CheckCircle2,
  Upload,
  Edit3,
  Info,
  Package,
  HardDrive
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
import { collection, query, orderBy, doc, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PlaybookAndGamePlayPage() {
  const { activeTeam, addDrill, deleteDrill, purchasePro, isStaff, addFile, deleteFile, user, isPro, markMediaAsViewed } = useTeam();
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
  const [uploadCat, setUploadCat] = useState('Game Tape');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newUrl, setNewUrl] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDrills = useMemo(() => drills.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase())), [drills, searchTerm]);
  const filteredFiles = useMemo(() => teamFiles.filter(f => ['Game Tape', 'Practice Session', 'Highlights'].includes(f.category) && f.name.toLowerCase().includes(searchTerm.toLowerCase())), [teamFiles, searchTerm]);

  const handleAddDrill = async () => {
    if (!newTitle || !newDesc) return;
    addDrill({ title: newTitle, description: newDesc, videoUrl: newUrl, createdAt: new Date().toISOString() });
    setIsAddDrillOpen(false);
    setNewTitle(''); setNewDesc(''); setNewUrl('');
    toast({ title: "Drill Published" });
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        addFile(file.name, file.name.split('.').pop() || 'file', file.size, ev.target?.result as string, uploadCat, newDesc);
        setIsUploadOpen(false);
        setNewDesc('');
      };
      reader.readAsDataURL(file);
    }
  };

  if (isDrillsLoading || isFilesLoading) return <div className="py-20 text-center animate-pulse"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /><p className="text-xs font-black uppercase mt-4">Opening Tactical Hub...</p></div>;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight uppercase">Playbook Hub</h1>
          <p className="text-muted-foreground text-sm font-bold">Execution protocols and match study archives.</p>
        </div>
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 shadow-inner">
          <button onClick={() => setViewMode('drills')} className={cn("px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all", viewMode === 'drills' ? "bg-white text-primary shadow-md" : "text-muted-foreground")}>Drills</button>
          <button onClick={() => setViewMode('gameplay')} className={cn("px-8 h-11 rounded-xl font-black text-xs uppercase tracking-widest transition-all", viewMode === 'gameplay' ? "bg-white text-primary shadow-md" : "text-muted-foreground")}>Game Play</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 p-8 bg-black text-white relative group overflow-hidden">
            <Package className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10 space-y-4">
              <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">SQUAD READY</Badge>
              <h3 className="text-xl font-black uppercase leading-tight">Master Execution</h3>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Verify squad comprehension via study audits.</p>
            </div>
          </Card>
          <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-4">
            <div className="flex items-center gap-3"><Info className="h-5 w-5 text-primary" /><h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Repository</h4></div>
            <p className="text-[11px] font-medium italic text-muted-foreground leading-relaxed">Playbook data is private to the active squad and authorized staff.</p>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={`Search ${viewMode}...`} className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {isStaff && (
              <Button onClick={() => viewMode === 'drills' ? setIsAddDrillOpen(true) : setIsUploadOpen(true)} className="rounded-full h-12 px-8 font-black uppercase text-xs shadow-lg shadow-primary/20 shrink-0">
                <Plus className="h-4 w-4 mr-2" /> Add {viewMode === 'drills' ? 'Drill' : 'Film'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {viewMode === 'drills' ? filteredDrills.map(drill => (
              <Card key={drill.id} className="rounded-[2rem] overflow-hidden border-none shadow-sm ring-1 ring-black/5 cursor-pointer bg-white group hover:shadow-xl transition-all" onClick={() => setSelectedDrill(drill)}>
                <div className="aspect-video bg-muted relative">
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Play className="h-10 w-10 text-white fill-current opacity-0 group-hover:opacity-100 transition-all scale-50 group-hover:scale-100" />
                  </div>
                </div>
                <CardContent className="p-6 space-y-2">
                  <h3 className="font-black text-sm uppercase truncate">{drill.title}</h3>
                  <p className="text-[10px] font-medium text-muted-foreground line-clamp-2">{drill.description}</p>
                </CardContent>
              </Card>
            )) : filteredFiles.map(file => (
              <Card key={file.id} className="rounded-[2rem] overflow-hidden border-none shadow-sm ring-1 ring-black/5 cursor-pointer bg-white group hover:shadow-xl transition-all" onClick={() => setSelectedFile(file)}>
                <div className="aspect-video bg-black/90 flex items-center justify-center relative">
                  <Play className="h-10 w-10 text-white fill-current opacity-40 group-hover:opacity-100 transition-all" />
                  <Badge className="absolute top-4 left-4 bg-black/50 border-none font-black text-[8px] uppercase">{file.category}</Badge>
                </div>
                <CardContent className="p-6 space-y-2">
                  <h3 className="font-black text-sm uppercase truncate">{file.name}</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{file.size} • {new Date(file.date).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={isAddDrillOpen} onOpenChange={setIsAddDrillOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">New Drill Enrollment</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">New Protocol</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px]">Enroll training resource</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Headline</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Study Link (Opt)</Label><Input value={newUrl} onChange={e => setNewUrl(e.target.value)} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Instructions</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} className="min-h-[120px] rounded-xl border-2 p-4 font-medium" /></div>
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl" onClick={handleAddDrill}>Commit Protocol</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">Game Film Archiving Hub</DialogTitle>
          <div className="h-2 bg-black w-full" />
          <div className="p-8 lg:p-12 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Archive Film</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px]">Enroll Match footage</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Category</Label>
                <Select value={uploadCat} onValueChange={setUploadCat}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-bold focus:border-primary/20 transition-all"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl"><SelectItem value="Game Tape" className="font-bold">Match Day Film</SelectItem><SelectItem value="Practice Session" className="font-bold">Training Session</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleUploadFile} />
                <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform"><Video className="h-8 w-8 text-primary" /></div>
                <p className="text-sm font-black uppercase">Select Video File</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
