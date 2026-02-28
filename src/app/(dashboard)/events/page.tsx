
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  Users, 
  Link as LinkIcon, 
  UserPlus, 
  Trash2, 
  HelpCircle, 
  XCircle, 
  Edit3, 
  Copy,
  Trophy,
  CalendarDays,
  ArrowRight,
  Lock,
  Sparkles
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  promoteToRoster: (teamId: string, eventId: string, reg: any) => Promise<void>;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  hasAttendance: boolean;
  purchasePro: () => void;
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members } = useTeam();
  const db = useFirestore();
  
  const regQuery = useMemoFirebase(() => {
    if (!isAdmin) return null;
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event.id, event.teamId, isAdmin]);
  
  const { data: registrations } = useCollection<any>(regQuery);

  const copyRegLink = () => {
    const url = `${window.location.origin}/events/register/${event.teamId}?eventId=${event.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied", description: "Share this link with external participants." });
  };

  const attendanceData = useMemo(() => {
    const internal = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
      const member = members.find(m => m.userId === uid);
      return {
        id: uid,
        name: member?.name || 'Unknown Member',
        avatar: member?.avatar,
        role: member?.position || 'Member',
        status,
        isExternal: false
      };
    });

    const external = (registrations || []).map(reg => ({
      id: reg.id,
      name: reg.name,
      avatar: undefined,
      role: 'Public Registrant',
      status: 'going',
      isExternal: true,
      regData: reg
    }));

    return [...internal, ...external];
  }, [event.userRsvps, members, registrations]);

  const goingList = attendanceData.filter(a => a.status === 'going');
  const maybeList = attendanceData.filter(a => a.status === 'maybe');
  const notGoingList = attendanceData.filter(a => a.status === 'notGoing');

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden rounded-[2.5rem] max-h-[90vh] flex flex-col border-none shadow-2xl">
        <DialogTitle className="sr-only">{event.title}</DialogTitle>
        <DialogDescription className="sr-only">Detailed roster and logistics for {event.title}</DialogDescription>
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
            <div className="lg:col-span-4 bg-muted/30 p-8 border-r flex flex-col justify-between">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Badge className={cn("border-none font-black uppercase tracking-widest text-[10px] px-3 h-6", event.isTournament ? "bg-black text-white" : "bg-primary text-white")}>
                    {event.isTournament ? "Tournament Series" : "Match Event"}
                  </Badge>
                  <h2 className="text-3xl font-black tracking-tighter leading-tight">{event.title}</h2>
                  <p className="font-black text-primary text-lg">
                    {event.isTournament && event.endDate ? (
                      `${format(new Date(event.date), 'MMM d')} - ${format(new Date(event.endDate), 'MMM d, yyyy')}`
                    ) : (
                      new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    )}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-background p-4 rounded-2xl shadow-sm border-2 border-black/10">
                    <div className="bg-primary/10 p-3 rounded-xl text-primary"><Clock className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timing</p>
                      <p className="text-sm font-black truncate">{event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 bg-background p-4 rounded-2xl shadow-sm border-2 border-black/10">
                    <div className="bg-primary/10 p-3 rounded-xl text-primary"><MapPin className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location</p>
                      <p className="text-sm font-black truncate">{event.location}</p>
                    </div>
                  </div>
                </div>

                {event.isTournament && event.tournamentSchedule && event.tournamentSchedule.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tournament Schedule</p>
                    <div className="space-y-2">
                      {event.tournamentSchedule.map((match: any) => (
                        <div key={match.id} className="bg-white p-3 rounded-xl border-2 border-black/10 shadow-sm flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary text-white p-1.5 rounded-lg text-[10px] font-black uppercase leading-none text-center min-w-[40px]">
                              {match.date ? format(new Date(match.date), 'MM/dd') : 'TBD'}
                            </div>
                            <div>
                              <p className="text-xs font-black leading-none mb-1">{match.label}</p>
                              <p className="text-[10px] text-muted-foreground font-black uppercase">{match.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-5 bg-background/50 rounded-2xl border-2 border-dashed border-primary/20">
                  <p className="text-sm text-muted-foreground font-black leading-relaxed italic">"{event.description || 'No additional details provided.'}"</p>
                </div>
              </div>

              <div className="pt-8 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  {event.allowExternalRegistration && <Badge className="bg-primary text-white font-black px-3 h-7 uppercase tracking-tighter shadow-lg shadow-primary/20">Public Open</Badge>}
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-primary/20 text-primary hover:bg-primary/5" onClick={() => onEdit(event)}><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5" onClick={() => onDelete(event.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </div>
                {hasAttendance && (
                  <div className="grid grid-cols-3 gap-2 text-center bg-background rounded-2xl p-4 shadow-inner border-2">
                    <div><p className="text-xl font-black text-green-600 leading-none">{goingList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">Going</p></div>
                    <div><p className="text-xl font-black text-amber-600 leading-none">{maybeList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">Maybe</p></div>
                    <div><p className="text-xl font-black text-red-600 leading-none">{notGoingList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">No</p></div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col bg-background">
              {hasAttendance ? (
                <Tabs defaultValue="attendance" className="flex-1 flex flex-col">
                  <div className="px-8 pt-8 pb-4 border-b flex items-center justify-between">
                    <TabsList className="bg-muted/50 rounded-xl p-1 h-11">
                      <TabsTrigger value="attendance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Roster Status ({attendanceData.length})</TabsTrigger>
                      {event.allowExternalRegistration && <TabsTrigger value="links" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 data-[state=active]:bg-primary data-[state=active]:text-white">Access</TabsTrigger>}
                    </TabsList>
                    <DialogClose asChild><Button variant="ghost" size="icon" className="rounded-full h-8 w-8"><XCircle className="h-5 w-5 text-muted-foreground" /></Button></DialogClose>
                  </div>

                  <div className="flex-1 px-8 py-6">
                    <TabsContent value="attendance" className="mt-0 space-y-8">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-[10px] font-black uppercase text-green-600 tracking-[0.2em]">Confirmed Squad ({goingList.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {goingList.length > 0 ? goingList.map((person) => (
                            <div key={person.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-2xl ring-2 ring-black/5 hover:bg-muted/30 transition-all">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 ring-2 ring-background"><AvatarImage src={person.avatar} /><AvatarFallback className="font-black text-xs">{person.name[0]}</AvatarFallback></Avatar>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black truncate">{person.name}</span>
                                    {person.isExternal && <Badge className="text-[7px] h-3.5 bg-primary text-white font-black uppercase px-1 shadow-sm">Public</Badge>}
                                  </div>
                                  <span className="text-[8px] text-muted-foreground font-black uppercase tracking-widest truncate">{person.role}</span>
                                </div>
                              </div>
                              {person.isExternal && person.regData?.status === 'pending' && isAdmin && (
                                <Button size="sm" variant="ghost" className="h-7 text-[9px] font-black text-primary hover:bg-primary/10 rounded-full shrink-0" onClick={() => promoteToRoster(event.teamId, event.id, person.regData!)}><UserPlus className="h-3 w-3 mr-1" /> Add</Button>
                              )}
                            </div>
                          )) : <p className="text-xs text-muted-foreground font-black italic px-1">Awaiting confirmations...</p>}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="links" className="mt-0 pt-4">
                      <div className="bg-primary/5 p-8 rounded-[2rem] border-2 border-dashed border-primary/20 text-center space-y-6">
                        <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
                          <LinkIcon className="h-8 w-8 text-primary" />
                        </div>
                        <h4 className="text-xl font-black tracking-tight">Public Sign-up Portal</h4>
                        <Button className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 gap-3" onClick={copyRegLink}><Copy className="h-4 w-4" /> Copy Registration Link</Button>
                      </div>
                    </TabsContent>
                  </div>

                  <div className="px-8 py-8 border-t bg-muted/10 mt-auto">
                    <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] text-center mb-4">Required: Update your status</p>
                    <div className="grid grid-cols-3 gap-4">
                      <Button variant={event.userRsvp === 'notGoing' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'notGoing' ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20" : "hover:border-red-600 hover:text-red-600")} onClick={() => updateRSVP(event.id, 'notGoing')}><XCircle className="h-4 w-4 mr-2" /> No</Button>
                      <Button variant={event.userRsvp === 'maybe' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'maybe' ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "hover:border-amber-500 hover:text-amber-500")} onClick={() => updateRSVP(event.id, 'maybe')}><HelpCircle className="h-4 w-4 mr-2" /> Maybe</Button>
                      <Button variant={event.userRsvp === 'going' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'going' ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20" : "hover:border-green-600 hover:text-green-600")} onClick={() => updateRSVP(event.id, 'going')}><CheckCircle2 className="h-4 w-4 mr-2" /> Going</Button>
                    </div>
                  </div>
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 p-8 text-center space-y-6">
                  <div className="bg-primary/10 p-6 rounded-[2rem] shadow-xl relative">
                    <Users className="h-12 w-12 text-primary" />
                    <div className="absolute -top-2 -right-2 bg-black text-white p-1.5 rounded-full shadow-lg border-2 border-background"><Lock className="h-3 w-3" /></div>
                  </div>
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-2xl font-black tracking-tight">Attendance Tracking</h3>
                    <p className="text-muted-foreground font-bold text-sm leading-relaxed">
                      Upgrade to a Pro plan to track squad RSVPs, manage public registrations, and view real-time roster status for match days.
                    </p>
                  </div>
                  <Button className="rounded-2xl h-12 px-10 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20" onClick={purchasePro}>
                    <Sparkles className="h-4 w-4 mr-2" /> Unlock Attendance
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, promoteToRoster, isSuperAdmin, hasFeature, purchasePro } = useTeam();
  const db = useFirestore();

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);
  
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  const events = useMemo(() => rawEvents || [], [rawEvents]);

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [mounted, setMounted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [allowExternal, setAllowExternal] = useState(false);
  const [maxRegs, setMaxRegs] = useState('');
  const [tournamentSchedule, setTournamentSchedule] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const tournamentDays = useMemo(() => {
    if (!events) return [];
    return events.filter(e => e.isTournament && e.endDate).flatMap(e => {
      const days = [];
      try {
        let curr = startOfDay(new Date(e.date));
        const last = endOfDay(new Date(e.endDate!));
        while (curr <= last) {
          days.push(new Date(curr));
          curr.setDate(curr.getDate() + 1);
        }
      } catch (err) {}
      return days;
    });
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    if (!date || !events) return [];
    const target = startOfDay(date);
    return events.filter(e => {
      if (e.isTournament && e.endDate) {
        try {
          return isWithinInterval(target, { start: startOfDay(new Date(e.date)), end: endOfDay(new Date(e.endDate)) });
        } catch (err) { return false; }
      }
      return startOfDay(new Date(e.date)).getTime() === target.getTime();
    });
  }, [date, events]);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Loading schedule...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canPlanTournaments = hasFeature('tournaments');
  const hasAttendanceTracking = hasFeature('attendance_tracking');

  const handleEdit = (event: TeamEvent) => {
    setEditingEvent(event);
    setIsTournamentMode(!!event.isTournament);
    setNewTitle(event.title);
    setNewDate(new Date(event.date).toISOString().split('T')[0]);
    if (event.endDate) setNewEndDate(new Date(event.endDate).toISOString().split('T')[0]);
    setNewTime(event.startTime);
    setNewLocation(event.location);
    setNewDescription(event.description);
    setAllowExternal(!!event.allowExternalRegistration);
    setMaxRegs(event.maxRegistrations?.toString() || '');
    setTournamentSchedule(event.tournamentSchedule || []);
    setIsCreateOpen(true);
  };

  const handleDelete = (eventId: string) => {
    if (confirm("Confirm deletion of this event?")) {
      deleteEvent(eventId);
      toast({ title: "Event Deleted" });
    }
  };

  const handleCreateEvent = () => {
    if (!newTitle || !newDate) return;
    const payload: any = {
      title: newTitle,
      date: new Date(newDate).toISOString(),
      startTime: newTime || 'TBD',
      location: newLocation,
      description: newDescription,
      allowExternalRegistration: allowExternal,
      isTournament: isTournamentMode,
      tournamentSchedule: tournamentSchedule.map((m, idx) => ({ ...m, id: `tm_${idx}_${Date.now()}` }))
    };
    if (isTournamentMode && newEndDate) payload.endDate = new Date(newEndDate).toISOString();
    const regLimit = parseInt(maxRegs);
    if (!isNaN(regLimit)) payload.maxRegistrations = regLimit;

    if (editingEvent) updateEvent(editingEvent.id, payload);
    else addEvent(payload);
    
    setIsCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription('');
    setAllowExternal(false); setMaxRegs(''); setTournamentSchedule([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-black uppercase tracking-tight">Schedule</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full shadow-lg shadow-primary/20 h-11 px-6 font-black uppercase text-xs" onClick={() => { setIsTournamentMode(false); setIsCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Event</Button>
            <Button 
              size="sm" 
              variant="secondary" 
              className="rounded-full shadow-md bg-black text-white hover:bg-black/90 h-11 px-6 font-black uppercase text-xs relative overflow-hidden" 
              onClick={() => { 
                if (canPlanTournaments) {
                  setIsTournamentMode(true); 
                  setIsCreateOpen(true); 
                } else {
                  purchasePro();
                }
              }}
            >
              <Trophy className="h-4 w-4 mr-2" />
              New Tournament
              {!canPlanTournaments && <div className="absolute top-0 right-0 bg-primary h-full w-1 flex flex-col items-center justify-center"><Lock className="h-2 w-2 text-white" /></div>}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-4xl rounded-[2.5rem] overflow-hidden p-0 max-h-[95vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">{editingEvent ? "Edit" : "New"} {isTournamentMode ? "Tournament" : "Event"}</DialogTitle>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-2 h-full min-h-[500px]">
              <div className="p-8 lg:border-r space-y-6 bg-primary/5">
                <DialogHeader>
                  <h2 className="text-2xl font-black tracking-tight">{editingEvent ? "Update Schedule" : isTournamentMode ? "Plan Tournament Series" : "Plan New Match"}</h2>
                  <p className="font-black text-primary uppercase tracking-widest text-[10px]">Team Coordination Hub</p>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label>
                    <Input placeholder="e.g. Regional Qualifiers" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">{isTournamentMode ? "Start Date" : "Date"}</Label>
                      <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                    </div>
                    {isTournamentMode ? (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                        <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time</Label>
                        <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                    <Input placeholder="Arena name..." value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Logistics & Strategy</Label>
                    <Textarea placeholder="What should the squad bring?..." value={newDescription} onChange={e => setNewDescription(e.target.value)} className="min-h-[120px] rounded-2xl resize-none border-2 font-black" />
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-6 flex flex-col justify-between">
                <div className="space-y-6">
                  {isTournamentMode && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tournament Schedule Details</Label>
                        <Button variant="ghost" size="sm" onClick={() => setTournamentSchedule([...tournamentSchedule, { date: newDate || '', time: '', label: 'Match' }])} className="h-7 text-[10px] font-black uppercase text-primary hover:bg-primary/5"><Plus className="h-3 w-3 mr-1" /> Add Match</Button>
                      </div>
                      {tournamentSchedule.map((match, i) => (
                        <div key={i} className="bg-white p-4 rounded-2xl border-2 shadow-sm space-y-3">
                          <div className="flex items-center justify-between"><span className="text-[9px] font-black text-primary uppercase">Match #{i+1}</span><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTournamentSchedule(tournamentSchedule.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                          <div className="space-y-3">
                            <Input placeholder="Label (e.g. Quarter Finals)" value={match.label} onChange={e => { const n = [...tournamentSchedule]; n[i].label = e.target.value; setTournamentSchedule(n); }} className="h-10 text-xs rounded-xl font-black" />
                            <div className="grid grid-cols-2 gap-3">
                              <Input type="date" value={match.date} onChange={e => { const n = [...tournamentSchedule]; n[i].date = e.target.value; setTournamentSchedule(n); }} className="h-10 text-[10px] rounded-xl font-black" />
                              <Input type="time" value={match.time} onChange={e => { const n = [...tournamentSchedule]; n[i].time = e.target.value; setTournamentSchedule(n); }} className="h-10 text-[10px] rounded-xl font-black" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-6" onClick={handleCreateEvent}>{editingEvent ? "Commit Changes" : "Launch Squad Schedule"}</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-12 bg-muted/50 border-2 max-w-md mx-auto">
          <TabsTrigger value="list" className="rounded-full h-10 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">List Order</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-full h-10 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white">Calendar View</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4 mt-8">
          {events.length > 0 ? events.map((event) => (
            <EventDetailDialog 
              key={event.id} 
              event={event} 
              updateRSVP={updateRSVP} 
              formatTime={formatTime} 
              isAdmin={isAdmin} 
              promoteToRoster={promoteToRoster} 
              onEdit={handleEdit} 
              onDelete={handleDelete}
              hasAttendance={hasAttendanceTracking}
              purchasePro={purchasePro}
            >
              <Card className={cn("overflow-hidden hover:border-primary/30 transition-all duration-500 cursor-pointer group hover:shadow-2xl border-none shadow-md ring-2 ring-black/5 rounded-[2rem]", event.isTournament && "ring-primary/20")}>
                <div className="flex items-stretch">
                  <div className="w-20 sm:w-24 flex flex-col items-center justify-center border-r-2 shrink-0 transition-colors group-hover:bg-primary/10 bg-primary/5">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-primary">{format(new Date(event.date), 'MMM')}</span>
                    <span className="text-3xl font-black tracking-tighter text-primary">{format(new Date(event.date), 'dd')}</span>
                    {event.isTournament && event.endDate && <div className="mt-1 flex flex-col items-center"><ArrowRight className="h-3 w-3 text-primary/40" /><span className="text-[10px] font-black text-primary">{format(new Date(event.endDate), 'dd')}</span></div>}
                  </div>
                  <div className="flex-1 p-6 space-y-3 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        {event.isTournament && <Badge className="bg-primary text-white font-black text-[8px] uppercase tracking-[0.2em] px-2 h-4 border-none shadow-sm">Tournament</Badge>}
                        <h3 className="font-black text-xl leading-tight group-hover:text-primary transition-colors truncate">{event.title}</h3>
                      </div>
                      <div className="bg-muted h-10 w-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><ChevronRight className="h-5 w-5 text-primary" /></div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-black text-muted-foreground uppercase tracking-widest flex-wrap gap-4">
                      <div className="flex items-center"><Clock className="h-4 w-4 mr-2 text-primary" />{event.startTime}{event.endDate ? ` (Series)` : ''}</div>
                      {event.location && <div className="flex items-center truncate max-w-[200px]"><MapPin className="h-4 w-4 mr-2 text-primary" />{event.location}</div>}
                    </div>
                  </div>
                </div>
              </Card>
            </EventDetailDialog>
          )) : (
            <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-muted/10"><p className="text-muted-foreground font-black uppercase tracking-widest text-xs opacity-40">Your squad's schedule is empty.</p></div>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-none shadow-2xl rounded-[3rem] overflow-hidden"><CardContent className="p-8"><Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md mx-auto w-full" modifiers={{ tournament: tournamentDays }} modifiersClassNames={{ tournament: "bg-primary/10 text-primary font-black border-2 border-primary/20" }}/></CardContent></Card>
            <div className="space-y-6">
              <h3 className="font-black text-lg px-2">{date ? format(date, 'MMMM d') : 'Select a date'}</h3>
              <div className="space-y-4">
                {selectedDayEvents.map(event => (
                  <EventDetailDialog 
                    key={event.id} 
                    event={event} 
                    updateRSVP={updateRSVP} 
                    formatTime={formatTime} 
                    isAdmin={isAdmin} 
                    promoteToRoster={promoteToRoster} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete}
                    hasAttendance={hasAttendanceTracking}
                    purchasePro={purchasePro}
                  >
                    <Card className="cursor-pointer hover:scale-[1.02] transition-all border-none shadow-md rounded-2xl p-4 space-y-2 ring-2 ring-black/5">
                      <span className="text-[8px] font-black uppercase text-primary tracking-[0.2em]">{event.isTournament ? "TOURNAMENT" : "MATCH"}</span>
                      <h4 className="font-black text-base leading-tight">{event.title}</h4>
                      <p className="text-[10px] font-black text-muted-foreground uppercase">{event.startTime} • {event.location}</p>
                    </Card>
                  </EventDetailDialog>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
