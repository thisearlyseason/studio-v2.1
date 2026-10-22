"use client";

import * as React from 'react';
import { Bell } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const AlertsBellButton = React.forwardRef<HTMLButtonElement, ButtonProps & { unreadCount: number }>(
  ({ unreadCount, className, ...props }, ref) => (
    <Button
      {...props}
      ref={ref}
      variant="ghost"
      size="icon"
      aria-label={`Open alerts${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      className={cn('relative shrink-0 overflow-visible h-10 w-10 md:h-11 md:w-11 rounded-2xl hover:bg-primary/5 text-foreground transition-all active:scale-95', className)}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <span aria-hidden="true" data-unread-indicator className="absolute right-1 top-1 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
      )}
    </Button>
  ),
);
AlertsBellButton.displayName = 'AlertsBellButton';
