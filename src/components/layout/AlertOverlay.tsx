
"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Megaphone, Bell, Info, History, Clock, X } from 'lucide-react';
import { useTeam, TeamAlert } from '@/components/providers/team-provider';
import { formatDistanceToNow } from 'date-fns';

const SEEN_ALERTS_KEY = 'squad_seen_alerts_ids';

/**
 * Handles the automatic one-time popup for high priority alerts
 */
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

    // Find the first alert that hasn't been seen yet
    const unseenAlert = alerts.find(a => !seenIds.includes(a.id));
    
    // Check if we found an unseen alert and no dialog is currently open
    if (unseenAlert && !isAlertOpen) {
      setCurrentAlertId(unseenAlert.id);
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

/**
 * A dialog that shows the history of all alerts for the team
 */
export function AlertsHistoryDialog({ children }: { children: React.ReactNode }) {
  const { alerts } = useTeam();
  const [isOpen, setIsOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(SEEN_ALERTS_KEY);
    if (stored) {
      try {
        setSeenIds(JSON.parse(stored));
      } catch (e) {}
    }
  }, [isOpen]);

  const markAllAsSeen = () => {
    const allIds = alerts.map(a => a.id);
    localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(allIds));
    setSeenIds(allIds);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <DialogTitle className="text-xl font-black">Squad Alerts</DialogTitle>
            </div>
            <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest h-7" onClick={markAllAsSeen}>
              Mark all read
            </Button>
          </div>
          <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-1">
            Stay informed on urgent squad coordination
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[400px] px-6 pb-6">
          <div className="space-y-4 pt-4">
            {alerts.length > 0 ? alerts.map((alert) => (
              <div 
                key={alert.id} 
                className="group relative p-4 rounded-2xl bg-muted/30 border-2 border-transparent hover:border-primary/10 transition-all"
              >
                {!seenIds.includes(alert.id) && (
                  <div className="absolute top-4 right-4 h-2 w-2 bg-primary rounded-full animate-pulse" />
                )}
                <div className="flex items-start gap-3">
                  <div className="bg-white p-2 rounded-xl shadow-sm border shrink-0">
                    <Megaphone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm tracking-tight leading-tight mb-1">{alert.title}</h4>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed">{alert.message}</p>
                    <div className="flex items-center gap-1.5 mt-3 opacity-50">
                      <Clock className="h-3 w-3" />
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        {formatDistanceToNow(new Date(alert.createdAt))} ago
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-12 space-y-3">
                <div className="bg-primary/5 w-12 h-12 rounded-full flex items-center justify-center mx-auto opacity-20">
                  <Bell className="h-6 w-6" />
                </div>
                <p className="text-sm font-bold text-muted-foreground italic">No broadcast history found.</p>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-4 bg-muted/10 border-t flex justify-center">
          <DialogClose asChild>
            <Button variant="ghost" className="text-xs font-black uppercase tracking-widest h-9 px-8">Close Inbox</Button>
          </DialogClose>
        </div>
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
