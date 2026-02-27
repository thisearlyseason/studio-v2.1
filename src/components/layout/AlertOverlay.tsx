
"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Bell } from 'lucide-react';
import { useTeam, TeamAlert } from '@/components/providers/team-provider';

const SEEN_ALERTS_KEY = 'squad_seen_alerts_ids';

export function AlertOverlay() {
  const { alerts } = useTeam();
  const [currentAlertId, setCurrentAlertId] = useState<string | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load seen IDs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SEEN_ALERTS_KEY);
    if (stored) {
      try {
        setSeenIds(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse seen alerts", e);
      }
    }
    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (!hasInitialized || alerts.length === 0) return;

    const latestAlert = alerts[0];
    
    // Check if we haven't seen this alert and no dialog is currently open
    if (!seenIds.includes(latestAlert.id) && !isAlertOpen) {
      setCurrentAlertId(latestAlert.id);
      setIsAlertOpen(true);
    }
  }, [alerts, seenIds, isAlertOpen, hasInitialized]);

  const markAsSeen = (id: string) => {
    setSeenIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleUnderstood = () => {
    if (currentAlertId) {
      markAsSeen(currentAlertId);
    }
    setIsAlertOpen(false);
  };

  const latestAlert = alerts.find(a => a.id === currentAlertId);

  if (!latestAlert) return null;

  return (
    <Dialog open={isAlertOpen} onOpenChange={(open) => {
      if (!open) {
        if (currentAlertId) markAsSeen(currentAlertId);
        setIsAlertOpen(false);
      }
    }}>
      <DialogContent className="sm:max-w-md border-t-4 border-t-primary rounded-3xl overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Megaphone className="h-32 w-32 -rotate-12" />
        </div>
        <DialogHeader className="pt-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-2 rounded-xl text-primary animate-bounce">
              <Bell className="h-6 w-6" />
            </div>
            <div className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">High Priority Alert</div>
          </div>
          <DialogTitle className="text-2xl font-black leading-tight tracking-tight">
            {latestAlert.title}
          </DialogTitle>
          <DialogDescription className="text-base font-medium pt-2 text-foreground/80 leading-relaxed">
            {latestAlert.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button 
            className="w-full rounded-2xl h-14 text-lg font-black shadow-xl shadow-primary/20" 
            onClick={handleUnderstood}
          >
            Understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAlertButton() {
  const { createAlert, user, activeTeam, isSuperAdmin } = useTeam();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  // Unified Admin Check
  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  if (!isAdmin) return null;

  const handleCreate = () => {
    if (!title || !message) return;
    createAlert(title, message);
    setIsCreateOpen(false);
    setTitle('');
    setMessage('');
  };

  return (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border-primary/20 text-primary hover:bg-primary/5">
          <Megaphone className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Broadcast Team Alert</DialogTitle>
          <DialogDescription>
            This will trigger a popup for every team member. Use only for urgent news.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Alert Headline</Label>
            <Input 
              placeholder="e.g. Practice Moved Indoors" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Detailed Message</Label>
            <Textarea 
              placeholder="Provide more context..." 
              value={message} 
              onChange={e => setMessage(e.target.value)}
              className="rounded-xl min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            className="w-full rounded-2xl h-12 text-base font-bold" 
            onClick={handleCreate}
            disabled={!title || !message}
          >
            Send Alert Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
