
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
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTeam } from '@/components/providers/team-provider';

export default function FilesPage() {
  const { activeTeam, files, addFile } = useTeam();
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const teamFiles = files.filter(f => f.teamId === activeTeam.id);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = file.name.split('.').pop() || 'file';
      const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      addFile(file.name, type, size);
    }
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'pdf') return <FileText className="h-6 w-6 text-red-500" />;
    if (['jpg', 'png', 'jpeg', 'gif'].includes(t)) return <ImageIcon className="h-6 w-6 text-blue-500" />;
    return <FileIcon className="h-6 w-6 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Files</h1>
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

      <div className="grid gap-3">
        {teamFiles.length > 0 ? teamFiles.map((file) => (
          <Card key={file.id} className="hover:bg-accent/50 transition-colors border-none shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-background flex items-center justify-center border shadow-sm shrink-0">
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate pr-2">{file.name}</h3>
                <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground mt-1">
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
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )) : (
          <div className="text-center py-20 bg-muted/20 border-2 border-dashed rounded-2xl">
            <p className="text-muted-foreground italic">No files shared yet.</p>
          </div>
        )}
      </div>

      <div 
        className="bg-muted/30 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={handleUploadClick}
      >
        <div className="bg-white p-3 rounded-full shadow-sm">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="font-bold">Upload new documents</h3>
          <p className="text-xs text-muted-foreground max-w-[200px] mt-1">
            Share PDFs or images up to 10MB with your team.
          </p>
        </div>
        <Button variant="outline" className="mt-2 border-primary/20 text-primary">Browse Files</Button>
      </div>
    </div>
  );
}
