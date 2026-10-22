import React from 'react';
import { Download, Video, ExternalLink, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PlaybookResource, PLAYBOOK_RESOURCE_TYPES } from '@/lib/sports-hub-types';
import { isExternalPurchaseUrl, isStoreDistribution } from '@/lib/app-distribution';

interface PlaybookCardProps {
  resource: PlaybookResource;
  className?: string;
}

export function PlaybookCard({ resource, className }: PlaybookCardProps) {
  const typeInfo = PLAYBOOK_RESOURCE_TYPES.find((t) => t.value === resource.type);

  const difficultyColor = {
    beginner: 'bg-green-100 text-green-700 border-green-200',
    intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
    advanced: 'bg-red-100 text-red-700 border-red-200',
  }[resource.difficulty || 'beginner'];

  return (
    <div className={cn(
      'group bg-card border rounded-2xl overflow-hidden depth-card transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5',
      className
    )}>
      {resource.isVideo ? (
        <div className="relative h-40 bg-black flex items-center justify-center overflow-hidden">
          {resource.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resource.previewUrl} alt={resource.title} className="w-full h-full object-cover opacity-60" />
          ) : (
            <div className="hero-gradient absolute inset-0" />
          )}
          <div className="relative z-10 h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40">
            <Video className="h-7 w-7 text-white fill-white" />
          </div>
        </div>
      ) : (
        <div className="h-2 hero-gradient" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest">
              {typeInfo?.emoji} {typeInfo?.label || resource.type}
            </Badge>
            {resource.difficulty && (
              <Badge variant="outline" className={cn('text-[9px] font-black uppercase tracking-widest', difficultyColor)}>
                {resource.difficulty}
              </Badge>
            )}
          </div>
          {resource.isFeatured && <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />}
        </div>
        <h3 className="font-black tracking-tight text-sm leading-snug mb-1.5 group-hover:text-primary transition-colors">
          {resource.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-4 font-medium leading-relaxed">
          {resource.description}
        </p>
        <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4">
          {resource.sport && <span>{resource.sport}</span>}
          {resource.sport && resource.ageGroup && <span className="text-muted-foreground/40">·</span>}
          {resource.ageGroup && <span>{resource.ageGroup}</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Download className="h-3 w-3" />{resource.downloadCount} downloads
          </span>
          {resource.fileUrl && (!isStoreDistribution || !isExternalPurchaseUrl(resource.fileUrl)) ? (
            <a href={resource.fileUrl} target="_blank" rel="noopener noreferrer" download>
              <Button size="sm" className="h-8 text-[9px] font-black uppercase tracking-widest gap-1.5">
                <Download className="h-3 w-3" />Download
              </Button>
            </a>
          ) : resource.videoUrl && (!isStoreDistribution || !isExternalPurchaseUrl(resource.videoUrl)) ? (
            <a href={resource.videoUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-8 text-[9px] font-black uppercase tracking-widest gap-1.5">
                <ExternalLink className="h-3 w-3" />Watch
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
