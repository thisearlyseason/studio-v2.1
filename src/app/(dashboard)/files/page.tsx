
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
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam, TeamFile } from '@/components/providers/team-provider';
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
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function FilesPage() {
  const { activeTeam, addFile, deleteFile, user, isPro, purchasePro, isSuperAdmin, isStaff } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('Compliance');
  const [uploadDescription, setUploadDescription] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles } = useCollection<TeamFile>(filesQuery);
  const teamFiles = useMemo(() => {
    const all = rawFiles || [];
    // Only show non-gameplay files here (Compliance and Other)
    return all.filter(f => !['Game Tape', 'Practice Session', 'Highlights'].includes(f.category));
  }, [rawFiles]);

  const filteredFiles = useMemo(() => {
    return teamFiles.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [teamFiles, searchTerm]);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !activeTeam) return null;

  const isAdmin = activeTeam.role === 'Admin' || isSuperAdmin;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        addFile(file.name, file.name.split('.').pop()?.toLowerCase() || 'file', file.size, event.target?.result as string, uploadCategory, uploadDescription);
        toast({ title: "Document Archived", description: `${file.name} is now available.` });
        setUploadDescription('');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 mb-2">Squad Repository</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight">Compliance & Docs</h1>
          <p className="text-sm font-bold text-muted-foreground">Official squad repository for waivers and administration.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <Dialog>
              <DialogTrigger asChild>
                <Button className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg shadow-primary/20">
                  <Upload className="h-4 w-4 mr-2" /> Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Archive Document</DialogTitle>
                    <DialogDescription className="font-bold text-primary uppercase text-[10px]">Enroll administrative resources</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Type</Label>
                      <Select value={uploadCategory} onValueChange={setUploadCategory}>
                        <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="Compliance">Compliance & Waivers</SelectItem><SelectItem value="Other">Other Documents</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Notes</Label><Textarea placeholder="Context for the squad..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-bold resize-none" /></div>
                    <div className="p-10 border-2 border-dashed rounded-[2rem] bg-muted/20 text-center space-y-4 group cursor-pointer hover:border-primary/20 transition-all" onClick={() => fileInputRef.current?.click()}>
                      <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm group-hover:scale-110 transition-transform"><FileText className="h-8 w-8 text-primary" /></div>
                      <p className="text-sm font-black uppercase">Select File</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search official docs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-11 h-14 rounded-2xl bg-muted/50 border-none shadow-inner font-black" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.map(file => (
            <Card key={file.id} className="group border-none shadow-sm hover:shadow-xl transition-all duration-500 rounded-[2rem] overflow-hidden ring-1 ring-black/5 bg-white">
              <CardHeader className="p-6 pb-2">
                <div className="flex justify-between items-start">
                  <div className="bg-primary/5 p-3 rounded-2xl text-primary"><FileText className="h-6 w-6" /></div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{file.category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-2 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-black text-sm uppercase tracking-tight truncate">{file.name}</h3>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase">{file.size} • {format(new Date(file.date), 'MMM d, yyyy')}</p>
                </div>
                {file.description && <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 leading-relaxed italic">"{file.description}"</p>}
              </CardContent>
              <CardFooter className="p-6 pt-0 flex gap-2">
                <Button className="flex-1 h-10 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20" onClick={() => window.open(file.url, '_blank')}>View Hub</Button>
                {isAdmin && <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => setFileToDelete(file.id)}><Trash2 className="h-4 w-4" /></Button>}
              </CardFooter>
            </Card>
          ))}
          {filteredFiles.length === 0 && (
            <div className="col-span-full py-24 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed space-y-4 opacity-40">
              <FolderClosed className="h-12 w-12 mx-auto" />
              <p className="text-sm font-black uppercase tracking-widest">No Documents Found</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!fileToDelete} onOpenChange={o => !o && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-[2.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black uppercase">Purge Document?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-base pt-2">This action is permanent and will remove this document from the squad repository for all members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(fileToDelete) { deleteFile(fileToDelete); setFileToDelete(null); toast({ title: "Vault Updated" }); } }} className="rounded-xl font-black bg-red-600">Purge Permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
