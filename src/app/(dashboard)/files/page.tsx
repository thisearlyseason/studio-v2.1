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
  Loader2
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
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';

export default function FilesPage() {
  const { activeTeam, addFile, deleteFile, user, isPro } = useTeam();
  const db = useFirestore();
  
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Localized data fetching for performance
  const filesQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'files'), orderBy('date', 'desc'));
  }, [activeTeam?.id, db]);

  const { data: rawFiles, isLoading } = useCollection(filesQuery);
  const teamFiles = useMemo(() => rawFiles || [], [rawFiles]);

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

  if (!isPro) {
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
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> 10GB Shared Storage</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> PDF & Image Previews</li>
              <li className="flex items-center gap-3 font-bold text-sm text-foreground/80"><Sparkles className="h-4 w-4 text-primary" /> Multi-Member Uploads</li>
            </ul>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 hover:bg-primary/90">
              Upgrade for $9.99 USD/mo
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isAdmin = activeTeam.role === 'Admin';

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
        addFile(file.name, type, size, url);
      };
      reader.readAsDataURL(file);
    }
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'pdf') return <FileText className="h-6 w-6 text-primary" />;
    if (['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(t)) return <ImageIcon className="h-6 w-6 text-primary" />;
    return <FileIcon className="h-6 w-6 text-muted-foreground" />;
  };

  const handleDownload = (file: any) => {
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

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Team Library</h1>
          <p className="text-sm font-bold text-muted-foreground">Official squad repository and playbooks.</p>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange} 
        />
        <Button size="sm" className="rounded-full px-6 font-black uppercase text-xs h-11 tracking-widest shadow-lg shadow-primary/20" onClick={handleUploadClick}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Resource
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Repository...</p>
        </div>
      ) : (
        <div className="grid gap-3 w-full">
          {teamFiles.length > 0 ? teamFiles.map((file) => {
            const canDelete = isAdmin || (file.uploaderId === user?.id);
            
            return (
              <Card key={file.id} className="hover:bg-muted/30 transition-all border-none shadow-sm overflow-hidden w-full ring-1 ring-black/5 rounded-2xl group">
                <CardContent className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                  <div className="h-14 w-14 rounded-xl bg-primary/5 flex items-center justify-center border shadow-inner shrink-0 transition-colors group-hover:bg-primary/10">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-base truncate pr-2" title={file.name}>{file.name}</h3>
                    <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground uppercase mt-1 flex-wrap tracking-widest">
                      <span className="text-primary">{file.size}</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {mounted ? format(new Date(file.date), 'MMM d, yyyy') : '...'}
                      </span>
                      <Badge variant="secondary" className="text-[9px] py-0 px-2 h-4 bg-muted text-muted-foreground font-black tracking-tighter">
                        {file.uploadedBy}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-auto sm:ml-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
                      onClick={() => setSelectedFile(file)}
                    >
                      <Eye className="h-5 w-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5"
                      onClick={() => handleDownload(file)}
                    >
                      <Download className="h-5 w-5" />
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground">
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-none p-2 min-w-[160px]">
                        <DropdownMenuItem onSelect={() => handleDownload(file)} className="font-black text-xs uppercase tracking-widest p-3 cursor-pointer">
                          <Download className="h-4 w-4 mr-2" />
                          Download
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
                  </div>
                </CardContent>
              </Card>
            );
          }) : (
            <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[2.5rem] w-full space-y-4">
              <FolderClosed className="h-12 w-12 text-muted-foreground opacity-20 mx-auto" />
              <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Repository is currently empty.</p>
              <Button variant="outline" className="rounded-full font-black text-[10px] uppercase tracking-widest border-2" onClick={handleUploadClick}>Browse Local Files</Button>
            </div>
          )}
        </div>
      )}

      {/* Viewer Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-black/95 border-none text-white rounded-[2.5rem] shadow-2xl">
          <DialogTitle className="sr-only">File Preview: {selectedFile?.name}</DialogTitle>
          <DialogDescription className="sr-only">Visual preview of the shared squad resource.</DialogDescription>
          <DialogHeader className="p-6 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-8">
                <DialogTitle className="text-xl font-black truncate tracking-tight">{selectedFile?.name}</DialogTitle>
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
          <DialogFooter className="p-6 border-t border-white/10 flex gap-3 justify-end shrink-0">
            <Button variant="ghost" onClick={() => setSelectedFile(null)} className="text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px] h-12 px-8">Dismiss</Button>
            {selectedFile && (
              <Button onClick={() => handleDownload(selectedFile)} className="bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-widest text-[10px] h-12 px-10 rounded-2xl shadow-xl shadow-primary/20">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
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
                This action is permanent and will remove the document from the shared squad repository for all members.
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
