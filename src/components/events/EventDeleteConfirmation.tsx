'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface EventDeleteConfirmationProps {
  event: {
    id: string;
    title: string;
  };
  onDelete: (eventId: string) => void;
}

export function EventDeleteConfirmation({ event, onDelete }: EventDeleteConfirmationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasConfirmed = useRef(false);

  const handleOpenChange = (open: boolean) => {
    if (open) hasConfirmed.current = false;
    setIsOpen(open);
  };

  const handleConfirm = () => {
    if (hasConfirmed.current) return;
    hasConfirmed.current = true;
    onDelete(event.id);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button aria-label={`Delete ${event.title}`} variant="destructive" size="icon" className="h-12 w-12 rounded-2xl shadow-lg shadow-red-600/10">
              <Trash2 className="h-5 w-5" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="bg-destructive text-white border-none">
          Destroy Activity Log
        </TooltipContent>
      </Tooltip>
      <AlertDialogContent className="rounded-2xl border-none shadow-2xl bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-black uppercase">Delete Activity?</AlertDialogTitle>
          <AlertDialogDescription className="font-medium text-muted-foreground">
            This will permanently delete {event.title}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-white hover:bg-destructive/90 font-black"
          >
            Confirm Deletion
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
