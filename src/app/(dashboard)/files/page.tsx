
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
  ExternalLink
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

export default function FilesPage() {
  const { activeTeam, files, addFile } = useTeam();
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<TeamFile | null>(null);
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
    if (t === 'pdf') return <FileText className="h-6 w-6 text-red-500" />;
    if (['jpg', 'png', 'jpeg', 'gif'].includes(t)) return <ImageIcon className="h-6 w-6 text-blue-500" />;
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
        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={handleUploadClick}>
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      <div className="grid gap-3 w-full">
        {teamFiles.length > 0 ? teamFiles.map((file) => (
          <Card key={file.id} className="hover:bg-accent/50 transition-colors border-none shadow-sm overflow-hidden w-full">
            <CardContent className="p-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
              <div className="h-12 w-12 rounded-xl bg-background flex items-center justify-center border shadow-sm shrink-0">
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate pr-2" title={file.name}>{file.name}</h3>
                <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground mt-1 flex-wrap">
                  <span>{file.size}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {mounted ? format(file.date, 'MMM d, yyyy') : '...'}
                  </span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-3.5 bg-muted">
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
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )) : (
          <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-2xl w-full">
            <p className="text-muted-foreground italic">No files shared yet.</p>
          </div>
        )}
      </div>

      <div 
        className="bg-muted/30 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer hover:bg-muted/50 transition-colors w-full"
        onClick={handleUploadClick}
      >
        <div className="bg-white p-3 rounded-full shadow-sm">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div className="w-full max-w-[280px]">
          <h3 className="font-bold">Upload new documents</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Share PDFs or images up to 10MB with your team.
          </p>
        </div>
        <Button variant="outline" className="mt-2 border-primary/20 text-primary">Browse Files</Button>
      </div>

      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-black/90 border-none text-white">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0">
            <DialogTitle className="text-lg font-bold truncate pr-8">{selectedFile?.name}</DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              Uploaded by {selectedFile?.uploadedBy} on {selectedFile?.date && format(selectedFile.date, 'MMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/40">
            {selectedFile && (
              <>
                {['jpg', 'png', 'jpeg', 'gif'].includes(selectedFile.type.toLowerCase()) ? (
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
                    <p className="text-sm font-medium">Preview not available for this file type.</p>
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
            <Button variant="ghost" onClick={() => setSelectedFile(null)} className="text-white hover:bg-white/10">Close</Button>
            {selectedFile && (
              <Button onClick={() => handleDownload(selectedFile)} className="bg-white text-black hover:bg-white/90">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
