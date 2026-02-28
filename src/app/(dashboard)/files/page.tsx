"use client";

import React, { useState, useEffect, useRef } from 'react';
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
  FolderClosed
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

export default function FilesPage() {
  const { activeTeam, files, addFile, deleteFile, user, isPro } = useTeam();
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Accessing library...</p>
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
          <div className="absolute -top-2 -right-2 bg-secondary text-white p-2 rounded-full shadow-lg border-2 border-background">
            <Lock className="h-4 w-4" />
          </div>
        </div>
        
        <div className="text-center max-w-sm space-y-3">
          <h1 className="text-3xl font-black tracking-tight">Team Library</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            Store playbooks, waivers, tournament documents, and shared assets securely in your squad's private repository.
          </p>
        </div>

        <Card className="w-full max-w-sm border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white ring-1 ring-black/5">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-primary tracking-widest">Pro Plan Features</span>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold">Premium Storage</Badge>
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

  const isAdmin = activeTeam.membersMap?.[user?.id || ''] === 'Admin';
  const teamFiles = files.filter(f => f.teamId === activeTeam.id);

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

  const handleDownload = (file: TeamFile) => {
    if (!file.url) return;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
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
        <h1 className="text-2xl font-bold">Team Library</h1>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange} 
        />
        <Button size="sm" className="bg-primary hover:bg-primary/90 rounded-full px-6 font-black uppercase text-xs h-11 tracking-widest" onClick={handleUploadClick}>
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      <div className="grid gap-3 w-full">
        {teamFiles.length > 0 ? teamFiles.map((file) => {
          const canDelete = isAdmin || (file.uploaderId === user?.id);
          
          return (
            <Card key={file.id} className="hover:bg-accent/50 transition-colors border-none shadow-sm overflow-hidden w-full ring-1 ring-black/5 rounded-2xl">
              <CardContent className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center border shadow-sm shrink-0">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-sm truncate pr-2" title={file.name}>{file.name}</h3>
                  <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground uppercase mt-1 flex-wrap tracking-widest">
                    <span>{file.size}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-2.5 w-2.5" />
                      {mounted ? format(file.date, 'MMM d, yyyy') : '...'}
                    </span>
                    <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-3.5 bg-secondary text-secondary-foreground font-black tracking-tighter">
                      {file.uploadedBy}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-auto sm:ml-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => setSelectedFile(file)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => handleDownload(file)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-muted">
                      <DropdownMenuItem onSelect={() => handleDownload(file)} className="font-bold">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem 
                          onSelect={() => setFileToDelete(file.id)}
                          className="text-destructive focus:text-destructive font-black"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Resource
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        }) : (
          <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-2xl w-full">
            <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">No files shared yet.</p>
          </div>
        )}
      </div>

      <div 
        className="bg-muted/30 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer hover:bg-muted/50 transition-colors w-full"
        onClick={handleUploadClick}
      >
        <div className="bg-white p-3 rounded-full shadow-sm ring-1 ring-black/5">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div className="w-full max-w-[280px]">
          <h3 className="font-black text-lg uppercase tracking-tight">Upload new documents</h3>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            Share PDFs or images up to 10MB with your team.
          </p>
        </div>
        <Button variant="outline" className="mt-2 border-primary/20 text-primary font-black uppercase text-xs tracking-widest h-10 rounded-xl">Browse Files</Button>
      </div>

      {/* Viewer Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-black/95 border-none text-white rounded-3xl">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-8">
                <DialogTitle className="text-lg font-black truncate tracking-tight">{selectedFile?.name}</DialogTitle>
                <DialogDescription className="text-white/60 text-xs font-bold uppercase tracking-widest">
                  Uploaded by {selectedFile?.uploadedBy} on {selectedFile?.date && format(selectedFile.date, 'MMM d, yyyy')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/40">
            {selectedFile && (
              <>
                {['jpg', 'png', 'jpeg', 'gif', 'webp'].includes(selectedFile.type.toLowerCase()) ? (
                  <img 
                    src={selectedFile.url} 
                    alt={selectedFile.name} 
                    className="max-w-full max-h-full object-contain animate-in zoom-in-95" 
                  />
                ) : selectedFile.type.toLowerCase() === 'pdf' ? (
                  <iframe 
                    src={selectedFile.url} 
                    className="w-full h-full min-h-[70vh] rounded-lg bg-white" 
                    title={selectedFile.name}
                  />
                ) : (
                  <div className="text-center space-y-4">
                    <FileIcon className="h-24 w-24 mx-auto text-white/20" />
                    <p className="text-sm font-black uppercase tracking-widest">Preview not available</p>
                    <Button variant="secondary" onClick={() => handleDownload(selectedFile)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download File
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="p-4 border-t border-white/10 flex gap-2 justify-end shrink-0">
            <Button variant="ghost" onClick={() => setSelectedFile(null)} className="text-white hover:bg-white/10 font-bold uppercase tracking-widest text-xs h-11 px-6">Close</Button>
            {selectedFile && (
              <Button onClick={() => handleDownload(selectedFile)} className="bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-widest text-xs h-11 px-8 rounded-xl">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-2xl tracking-tight">Delete Resource?</AlertDialogTitle>
            <AlertDialogDescription className="font-medium text-base">
              This action cannot be undone. This resource will be permanently removed from the team library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-xl h-12 font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-primary text-white hover:bg-primary/90 rounded-xl h-12 font-black uppercase tracking-widest text-xs"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
