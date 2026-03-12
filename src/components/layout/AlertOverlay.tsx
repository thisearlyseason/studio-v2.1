
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Megaphone, Bell, Info, History, Clock, X, Lock, Users, ShieldAlert, GraduationCap, Baby, Trash2 } from 'lucide-react';
import { useTeam, TeamAlert } from '@/components/providers/team-provider';
import { formatDistanceToNow } from 'date-fns';

const SEEN_ALERTS_KEY = 'squad_seen_alerts_ids';
const DISMISSED_ALERTS_KEY = 'squad_dismissed_alerts_ids';

/**
 * Handles the automatic one-time popup for high priority alerts
 * respecting the target audience.
 */
export function AlertOverlay() {
  const { alerts = [], user, isStaff, isPlayer, isParent } = useTeam();
  const [currentAlertId, setCurrentAlertId] = useState<string | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SEEN_ALERTS_KEY);
    if (stored) {
      try {
        setSeenIds(JSON.parse(stored));
      } catch (e) {}
    }
    setHasInitialized(true);
  }, []);

  // Filter alerts based on current user role/audience
  const myAlerts = alerts.filter(alert => {
    if (alert.audience === 'everyone') return true;
    if (alert.audience === 'coaches' && isStaff) return true;
    if (alert.audience === 'players' && isPlayer) return true;
    if (alert.audience === 'parents' && isParent) return true;
    return false;
  });

  useEffect(() => {
    if (!hasInitialized || myAlerts.length === 0) return;

    // Find the newest alert that hasn't been seen yet
    const unseenAlert = myAlerts.find(a => !seenIds.includes(a.id));
    if (unseenAlert && !isAlertOpen) {
      setCurrentAlertId(unseenAlert.id);
      setIsAlertOpen(true);
    }
  }, [myAlerts, seenIds, isAlertOpen, hasInitialized]);

  const markAsSeen = (id: string) => {
    setSeenIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(updated));
      // Notify other components (like Shell bell indicator)
      window.dispatchEvent(new Event('storage'));
      return updated;
    });
  };

  const handleUnderstood = () => {
    if (currentAlertId) markAsSeen(currentAlertId);
    setIsAlertOpen(false);
  };

  const latestAlert = myAlerts.find(a => a.id === currentAlertId);
  if (!latestAlert) return null;

  return (
    <Dialog open={isAlertOpen} onOpenChange={(open) => {
      if (!open) {
        if (currentAlertId) markAsSeen(currentAlertId);
        setIsAlertOpen(false);
      }
    }}>
      <DialogContent className="sm:max-w-md border-t-4 border-t-primary rounded-[2.5rem] overflow-hidden shadow-2xl">
        <DialogTitle className="sr-only">Priority Broadcast: {latestAlert.title}</DialogTitle>
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Megaphone className="h-32 w-32 -rotate-12" />
        </div>
        <DialogHeader className="pt-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-2 rounded-xl text-primary animate-bounce">
              <Bell className="h-6 w-6" />
            </div>
            <div className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">High Priority Broadcast</div>
          </div>
          <DialogTitle className="text-2xl font-black leading-tight tracking-tight uppercase">
            {latestAlert.title}
          </DialogTitle>
          <DialogDescription className="text-base font-bold pt-2 text-foreground/80 leading-relaxed italic">
            "{latestAlert.message}"
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <Button className="w-full rounded-2xl h-14 text-lg font-black shadow-xl shadow-primary/20" onClick={handleUnderstood}>
            Understood
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AlertsHistoryDialog({ children }: { children: React.ReactNode }) {
  const { alerts = [], isStaff, isPlayer, isParent, deleteAlert } = useTeam();
  const [isOpen, setIsOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    const loadIds = () => {
      const storedSeen = localStorage.getItem(SEEN_ALERTS_KEY);
      if (storedSeen) {
        try { setSeenIds(JSON.parse(storedSeen)); } catch (e) {}
      }
      const storedDismissed = localStorage.getItem(DISMISSED_ALERTS_KEY);
      if (storedDismissed) {
        try { setDismissedIds(JSON.parse(storedDismissed)); } catch (e) {}
      }
    };
    loadIds();
  }, [isOpen]);

  const myAlerts = alerts.filter(alert => {
    if (dismissedIds.includes(alert.id)) return false;
    if (alert.audience === 'everyone') return true;
    if (alert.audience === 'coaches' && isStaff) return true;
    if (alert.audience === 'players' && isPlayer) return true;
    if (alert.audience === 'parents' && isParent) return true;
    return false;
  });

  const markAllAsSeen = () => {
    const allIds = myAlerts.map(a => a.id);
    const updated = Array.from(new Set([...seenIds, ...allIds]));
    localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(updated));
    setSeenIds(updated);
    window.dispatchEvent(new Event('storage'));
  };

  const dismissAlertLocal = (id: string) => {
    const updated = [...dismissedIds, id];
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(updated));
    setDismissedIds(updated);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
        <DialogTitle className="sr-only">Squad Alert Inbox</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <DialogHeader className="p-8 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="h-6 w-6 text-primary" />
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Alerts History</DialogTitle>
            </div>
            {myAlerts.length > 0 && (
              <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest h-8 px-3 hover:bg-primary/5 text-primary" onClick={markAllAsSeen}>
                Mark all read
              </Button>
            )}
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[450px] px-8 pb-8">
          <div className="space-y-4 pt-4">
            {myAlerts.length > 0 ? myAlerts.map((alert) => (
              <div key={alert.id} className="group relative p-5 rounded-2xl bg-muted/30 border-2 border-transparent hover:border-primary/10 transition-all">
                {!seenIds.includes(alert.id) && (
                  <div className="absolute top-5 right-5 h-2.5 w-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(255,0,0,0.5)]" />
                )}
                <div className="flex items-start gap-4">
                  <div className="bg-white p-2.5 rounded-xl shadow-sm border shrink-0">
                    <Megaphone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-black text-sm tracking-tight leading-tight uppercase truncate pr-6">{alert.title}</h4>
                      <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-primary/20 text-primary">{alert.audience}</Badge>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">"{alert.message}"</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Clock className="h-3 w-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{formatDistanceToNow(new Date(alert.createdAt))} ago</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white text-muted-foreground hover:text-primary" onClick={() => dismissAlertLocal(alert.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        {isStaff && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-white text-destructive" onClick={() => deleteAlert(alert.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-16 opacity-30">
                <Bell className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No active alerts found.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAlertButton() {
  const { createAlert, activeTeam, isSuperAdmin, purchasePro } = useTeam();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<TeamAlert['audience']>('everyone');

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canAlert = activeTeam?.isPro || isSuperAdmin;

  if (!isAdmin) return null;

  if (!canAlert) {
    return (
      <Button variant="outline" size="icon" className="h-10 w-10 md:h-11 md:w-11 rounded-full border-primary/20 text-primary/40 opacity-50 relative" onClick={purchasePro}>
        <Megaphone className="h-5 w-5 md:h-4 md:w-4" />
        <Lock className="absolute -top-1 -right-1 h-3 w-3 bg-black text-white p-0.5 rounded-full border-2 border-background" />
      </Button>
    );
  }

  const handleCreate = () => {
    if (!title || !message) return;
    createAlert(title, message, audience);
    setIsCreateOpen(false);
    setTitle('');
    setMessage('');
    setAudience('everyone');
  };

  return (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 md:h-11 md:w-11 rounded-full border-primary/20 text-primary hover:bg-primary/5 shadow-sm transition-all active:scale-95">
          <Megaphone className="h-5 w-5 md:h-4 md:w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Deploy Broadcast</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Targeted High-Priority Messaging</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Target Audience</Label>
              <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
                <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="everyone" className="font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><Users className="h-3 w-3" /> Everyone</div></SelectItem>
                  <SelectItem value="coaches" className="font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><ShieldAlert className="h-3 w-3" /> Coaches & Staff</div></SelectItem>
                  <SelectItem value="players" className="font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><GraduationCap className="h-3 w-3" /> Players Only</div></SelectItem>
                  <SelectItem value="parents" className="font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><Baby className="h-3 w-3" /> Parents Only</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Headline</Label>
              <Input placeholder="e.g. Venue Conflict Resolved" value={title} onChange={e => setTitle(e.target.value)} className="rounded-xl h-12 border-2 font-black" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Tactical Brief</Label>
              <Textarea placeholder="Define the urgent context..." value={message} onChange={e => setMessage(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-medium" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleCreate} disabled={!title || !message}>Dispatch Broadcast</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
