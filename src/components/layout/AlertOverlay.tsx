"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Megaphone, Bell, History, Clock, X, Lock, Users, ShieldAlert, GraduationCap, Baby, Trash2, Zap, Shield, CheckCircle2 } from 'lucide-react';
import { useTeam, TeamAlert } from '@/components/providers/team-provider';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

/**
 * Handles the automatic one-time popup for high priority alerts
 * respecting the target audience.
 */
export function AlertOverlay() {
  const { alerts, seenAlertIds, markAlertAsSeen, isStaff, isPlayer, isParent } = useTeam();
  const [currentAlertId, setCurrentAlertId] = useState<string | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [locallyAcknowledgedIds, setLocallyAcknowledgedIds] = useState<string[]>([]);

  // Tactical logic to find the next unread alert
  const findNextAlert = useCallback(() => {
    const myAlerts = (alerts || []).filter(alert => {
      if (alert.audience === 'everyone') return true;
      if (alert.audience === 'coaches' && isStaff) return true;
      if (alert.audience === 'players' && isPlayer) return true;
      if (alert.audience === 'parents' && isParent) return true;
      return false;
    });

    return myAlerts.find(a => !seenAlertIds.includes(a.id) && !locallyAcknowledgedIds.includes(a.id));
  }, [alerts, seenAlertIds, locallyAcknowledgedIds, isStaff, isPlayer, isParent]);

  useEffect(() => {
    if (isAlertOpen) return;

    const unseenAlert = findNextAlert();
    if (unseenAlert) {
      setCurrentAlertId(unseenAlert.id);
      // Brief delay to ensure state settled before opening
      const timer = setTimeout(() => setIsAlertOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, [findNextAlert, isAlertOpen]);

  const handleUnderstood = () => {
    if (currentAlertId) {
      // Immediate local state update to prevent pop-back
      setLocallyAcknowledgedIds(prev => [...prev, currentAlertId]);
      markAlertAsSeen(currentAlertId);
      setIsAlertOpen(false);
      setCurrentAlertId(null);
    }
  };

  const latestAlert = alerts.find(a => a.id === currentAlertId);
  if (!latestAlert) return null;

  return (
    <Dialog open={isAlertOpen} onOpenChange={(open) => {
      if (!open) handleUnderstood();
    }}>
      <DialogContent className="sm:max-w-lg p-0 rounded-[3rem] overflow-hidden border-none shadow-[0_30px_100px_rgba(255,0,0,0.2)] bg-white">
        <DialogTitle className="sr-only">High Priority Squad Alert</DialogTitle>
        <DialogDescription className="sr-only">Important directive from squad command</DialogDescription>
        {/* Championship Header */}
        <div className="bg-primary text-white p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none">
            <Megaphone className="h-40 w-48" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-md p-2.5 rounded-2xl border border-white/20 animate-pulse">
                <Bell className="h-6 w-6 text-white" />
              </div>
              <Badge className="bg-white text-primary border-none font-black uppercase tracking-[0.2em] text-[9px] h-6 px-3 shadow-lg">Priority Broadcast</Badge>
            </div>
            <h2 className="text-3xl md:text-4xl font-black leading-[0.9] tracking-tighter uppercase max-w-[90%]">
              {latestAlert.title}
            </h2>
          </div>
        </div>

        <div className="p-8 lg:p-10 space-y-8">
          <div className="space-y-6">
            <div className="bg-muted/30 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/10 relative group">
              <QuoteIcon className="absolute -top-4 -left-2 h-10 w-10 text-primary/10" />
              <p className="text-lg font-bold text-foreground leading-relaxed italic relative z-10">
                "{latestAlert.message}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/20 p-4 rounded-2xl flex items-center gap-3 border border-transparent">
                <div className="bg-white p-2 rounded-lg shadow-sm border"><Users className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0">
                  <p className="text-[8px] font-black uppercase text-muted-foreground">Target</p>
                  <p className="text-[10px] font-bold uppercase truncate">{latestAlert.audience}</p>
                </div>
              </div>
              <div className="bg-muted/20 p-4 rounded-2xl flex items-center gap-3 border border-transparent">
                <div className="bg-white p-2 rounded-lg shadow-sm border"><Clock className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0">
                  <p className="text-[8px] font-black uppercase text-muted-foreground">Dispatch</p>
                  <p className="text-[10px] font-bold uppercase truncate">{formatDistanceToNow(new Date(latestAlert.createdAt))} ago</p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button 
              className="w-full h-16 rounded-[2rem] text-lg font-black uppercase tracking-widest shadow-2xl shadow-primary/30 active:scale-95 transition-all hover:ring-4 hover:ring-primary/10" 
              onClick={handleUnderstood}
            >
              Acknowledged Hub Directive
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 7.55228 14.017 7V5C14.017 4.44772 14.4647 4 15.017 4H19.017C21.2261 4 23.017 5.79086 23.017 8V15C23.017 18.3137 20.3307 21 17.017 21H14.017ZM1 15C1 18.3137 3.68629 21 7 21H10V18C10 16.8954 9.10457 16 8 16H5C4.44772 16 4 15.5523 4 15V9C4 8.44772 4.44772 8 5 8H9V4H5C2.79086 4 1 5.79086 1 8V15Z" />
    </svg>
  );
}

export function AlertsHistoryDialog({ children }: { children: React.ReactNode }) {
  const { alerts, markAlertAsSeen, markAllAlertsAsSeen, seenAlertIds, isStaff, isPlayer, isParent, deleteAlert } = useTeam();
  const [isOpen, setIsOpen] = useState(false);

  const myAlerts = (alerts || []).filter(alert => {
    if (alert.audience === 'everyone') return true;
    if (alert.audience === 'coaches' && isStaff) return true;
    if (alert.audience === 'players' && isPlayer) return true;
    if (alert.audience === 'parents' && isParent) return true;
    return false;
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white">
        <DialogTitle className="sr-only">Squad Alert Inbox</DialogTitle>
        <DialogDescription className="sr-only">History of all broadcasts dispatched to you</DialogDescription>
        <div className="h-2 bg-primary w-full" />
        <DialogHeader className="p-8 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/5 p-2 rounded-xl text-primary">
                <History className="h-6 w-6" />
              </div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Broadcast Inbox</DialogTitle>
            </div>
            {myAlerts.length > 0 && (
              <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest h-8 px-3 hover:bg-primary/5 text-primary" onClick={markAllAlertsAsSeen}>
                Archive All
              </Button>
            )}
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[450px] px-8 pb-10">
          <div className="space-y-4 pt-4">
            {myAlerts.length > 0 ? myAlerts.map((alert) => {
              const isUnread = !seenAlertIds.includes(alert.id);
              return (
                <div key={alert.id} className={cn(
                  "group relative p-5 rounded-[2rem] border-2 transition-all duration-300",
                  isUnread ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/20 border-transparent opacity-60"
                )}>
                  {isUnread && (
                    <div className="absolute top-5 right-5 h-2 w-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(255,0,0,0.5)]" />
                  )}
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "p-3 rounded-2xl shrink-0 transition-colors shadow-sm",
                      isUnread ? "bg-primary text-white" : "bg-white text-muted-foreground"
                    )}>
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h4 className="font-black text-sm tracking-tight leading-tight uppercase truncate pr-6">{alert.title}</h4>
                        <Badge variant="outline" className={cn(
                          "text-[7px] font-black uppercase px-1.5 h-4 border-none",
                          isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>{alert.audience}</Badge>
                      </div>
                      <p className="text-xs font-medium text-foreground/80 leading-relaxed italic">"{alert.message}"</p>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-1.5 opacity-40">
                          <Clock className="h-3 w-3" />
                          <span className="text-[9px] font-black uppercase tracking-widest">{formatDistanceToNow(new Date(alert.createdAt))} ago</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isUnread && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl bg-white/50 hover:bg-primary hover:text-white" onClick={() => markAlertAsSeen(alert.id)}>
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {isStaff && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl bg-white/50 hover:bg-destructive hover:text-white" onClick={() => deleteAlert(alert.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-20 opacity-20 flex flex-col items-center gap-4">
                <div className="bg-muted p-6 rounded-[2rem]">
                  <Bell className="h-12 w-12" />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.3em]">Broadcast Inbox Clear</p>
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
    toast({ title: "Broadcast Dispatched", description: "All relevant squad members have been notified." });
  };

  return (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-10 w-10 md:h-11 md:w-11 rounded-full border-primary/20 text-primary hover:bg-primary/5 shadow-sm transition-all active:scale-95 group">
          <Megaphone className="h-5 w-5 md:h-4 md:w-4 group-hover:animate-pulse" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[3rem] border-none shadow-2xl overflow-hidden p-0 bg-white">
        <DialogTitle className="sr-only">Deploy Broadcast</DialogTitle>
        <DialogDescription className="sr-only">Dispatch high priority directive to the roster</DialogDescription>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-10 space-y-8">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Deploy Broadcast</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Institutional High-Priority Alert</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Target Roster Segment</Label>
              <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
                <SelectTrigger className="h-14 rounded-2xl border-2 font-black shadow-inner focus:ring-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-2">
                  <SelectItem value="everyone" className="font-black uppercase text-[10px] py-3"><div className="flex items-center gap-3 text-foreground"><Users className="h-4 w-4 text-primary" /> Global Roster</div></SelectItem>
                  <SelectItem value="coaches" className="font-black uppercase text-[10px] py-3"><div className="flex items-center gap-3 text-foreground"><Shield className="h-4 w-4 text-primary" /> Command Staff Only</div></SelectItem>
                  <SelectItem value="players" className="font-black uppercase text-[10px] py-3"><div className="flex items-center gap-3 text-foreground"><GraduationCap className="h-4 w-4 text-primary" /> Athletes Only</div></SelectItem>
                  <SelectItem value="parents" className="font-black uppercase text-[10px] py-3"><div className="flex items-center gap-3 text-foreground"><Baby className="h-4 w-4 text-primary" /> Guardians Only</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Directive Headline</Label>
              <Input placeholder="e.g. Mandatory Venue Update" value={title} onChange={e => setTitle(e.target.value)} className="rounded-2xl h-14 border-2 font-black text-base shadow-inner text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Operational Instructions</Label>
              <Textarea placeholder="Define the urgent context and requirements..." value={message} onChange={e => setMessage(e.target.value)} className="rounded-[1.5rem] min-h-[150px] border-2 font-medium p-6 bg-muted/10 focus:bg-white transition-all shadow-inner resize-none text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all border-none" onClick={handleCreate} disabled={!title || !message}>
              Dispatch Strategic Broadcast
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}