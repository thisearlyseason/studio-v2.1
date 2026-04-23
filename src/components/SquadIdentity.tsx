"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { ShieldAlert } from 'lucide-react';

interface SquadIdentityProps {
  name?: string;
  teamName?: string;
  logoUrl?: string;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  /** Show the team name alongside the logo */
  showNameWithLogo?: boolean;
  /** Render logo + name side-by-side (horizontal). Defaults to vertical (stacked). */
  horizontal?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  teamId?: string;
}

export function SquadIdentity({ 
  name,
  teamName, 
  logoUrl, 
  className, 
  logoClassName, 
  textClassName,
  showNameWithLogo = false,
  horizontal = false,
  size = 'md',
  teamId
}: SquadIdentityProps) {
  const safeName = teamName || name || "TBD";
  const isTBD = safeName.toLowerCase().includes('tbd');
  const hasLogo = logoUrl && logoUrl.trim() !== "" && logoUrl !== 'undefined';

  const sizeClasses = {
    sm: "h-6 w-6 rounded-md",
    md: "h-10 w-10 rounded-xl",
    lg: "h-14 w-14 rounded-2xl",
    xl: "h-20 w-20 rounded-[2rem]"
  };

  const textSizes = {
    sm: "text-[8px]",
    md: "text-[10px]",
    lg: "text-xs",
    xl: "text-lg"
  };

  const containerClass = cn(
    "flex items-center gap-2",
    horizontal ? "flex-row" : "flex-col justify-center",
    className
  );

  // Logo: show image if URL exists, ShieldAlert placeholder if TBD, nothing if no logo
  const logoNode = hasLogo && !isTBD ? (
    <div className={cn(sizeClasses[size], "shrink-0 bg-muted/5 p-1 flex items-center justify-center overflow-hidden border border-muted/20 shadow-inner", logoClassName)}>
      <img src={logoUrl} alt={safeName} className="w-full h-full object-contain" />
    </div>
  ) : isTBD ? (
    <div className={cn(sizeClasses[size], "shrink-0 bg-muted/10 flex items-center justify-center border-2 border-dashed border-muted/30", logoClassName)}>
      <ShieldAlert className={cn("text-muted-foreground/30", size === 'sm' ? 'h-3 w-3' : 'h-5 w-5')} />
    </div>
  ) : null; // No logo, no initials circle — name will be shown via nameNode

  const nameNode = (showNameWithLogo || !hasLogo) && !isTBD ? (
    <span className={cn(
      textSizes[size],
      horizontal ? "font-black uppercase tracking-tight truncate" : "font-black uppercase tracking-widest truncate max-w-full",
      textClassName
    )}>
      {safeName}
    </span>
  ) : showNameWithLogo ? (
    <span className={cn(
      textSizes[size],
      horizontal ? "font-black uppercase tracking-tight truncate" : "font-black uppercase tracking-widest truncate max-w-full",
      textClassName
    )}>
      {safeName}
    </span>
  ) : null;

  return (
    <div className={containerClass}>
      {logoNode}
      {nameNode}
    </div>
  );
}
