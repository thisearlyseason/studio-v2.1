
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Plus, ChevronRight, Info, Repeat, CheckCircle2, Users, Link as LinkIcon, UserPlus, Trash2, HelpCircle, XCircle, UserCheck, Edit3, Copy } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, EventRecurrence, TeamEvent, RSVPStatus, EventRegistration } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: RSVPStatus) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  promoteToRoster: (teamId: string, eventId: string, reg: EventRegistration) => Promise<void>;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, onEdit, onDelete, children }: EventDetailDialogProps) {
  const { members } = useTeam();
  const db = useFirestore();
  
  const regQuery = useMemoFirebase(() => {
    if (!isAdmin) return null;
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event.id, event.teamId, isAdmin]);
  
  const { data: registrations } = useCollection<EventRegistration>(regQuery);

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
      status: 'going' as RSVPStatus,
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
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden rounded-[2.5rem]">
        <div className="grid grid-cols-1 lg:grid-cols-5 h-full min-h-[500px]">
          {/* Left Column: Event Summary (2/5) */}
          <div className="lg:col-span-2 bg-muted/30 p-8 border-r flex flex-col justify-between">
            <div className="space-y-6">
              <div className="space-y-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-3 h-6">Event Details</Badge>
                <h2 className="text-3xl font-black tracking-tighter leading-tight">{event.title}</h2>
                <p className="font-bold text-primary text-lg">
                  {event.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-background p-4 rounded-2xl shadow-sm border border-black/5">
                  <div className="bg-primary/10 p-3 rounded-xl text-primary"><Clock className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Match Time</p>
                    <p className="text-sm font-bold truncate">{event.startTime}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-background p-4 rounded-2xl shadow-sm border border-black/5">
                  <div className="bg-primary/10 p-3 rounded-xl text-primary"><MapPin className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location</p>
                    <p className="text-sm font-bold truncate">{event.location}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-background/50 rounded-2xl border-2 border-dashed border-primary/10">
                <p className="text-sm text-muted-foreground font-medium leading-relaxed italic">"{event.description || 'No additional details provided for this event.'}"</p>
              </div>
            </div>

            <div className="pt-8 space-y-4">
              <div className="flex items-center justify-between gap-4">
                {event.allowExternalRegistration && <Badge className="bg-blue-500 font-black px-3 h-7 uppercase tracking-tighter shadow-lg shadow-blue-500/20">Public Open</Badge>}
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-primary/20 text-primary hover:bg-primary/5" onClick={() => onEdit(event)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/5" onClick={() => onDelete(event.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center bg-background rounded-2xl p-4 shadow-inner border border-black/5">
                <div><p className="text-xl font-black text-green-600 leading-none">{goingList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">Going</p></div>
                <div><p className="text-xl font-black text-amber-600 leading-none">{maybeList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">Maybe</p></div>
                <div><p className="text-xl font-black text-red-600 leading-none">{notGoingList.length}</p><p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest mt-1">No</p></div>
              </div>
            </div>
          </div>

          {/* Right Column: Attendance & Response (3/5) */}
          <div className="lg:col-span-3 flex flex-col bg-background">
            <Tabs defaultValue="attendance" className="flex-1 flex flex-col">
              <div className="px-8 pt-8 pb-4 border-b flex items-center justify-between">
                <TabsList className="bg-muted/50 rounded-xl p-1 h-11">
                  <TabsTrigger value="attendance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6">Roster Status ({attendanceData.length})</TabsTrigger>
                  {event.allowExternalRegistration && <TabsTrigger value="links" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6">Access</TabsTrigger>}
                </TabsList>
                <DialogClose asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8"><XCircle className="h-5 w-5 text-muted-foreground" /></Button>
                </DialogClose>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar max-h-[500px]">
                <TabsContent value="attendance" className="mt-0 space-y-8">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-[10px] font-black uppercase text-green-600 tracking-[0.2em]">Confirmed Squad ({goingList.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {goingList.length > 0 ? goingList.map((person) => (
                        <div key={person.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-2xl ring-1 ring-black/5 hover:bg-muted/30 transition-all">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 ring-2 ring-background">
                              <AvatarImage src={person.avatar} />
                              <AvatarFallback className="font-bold text-xs">{person.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black truncate">{person.name}</span>
                                {person.isExternal && <Badge className="text-[7px] h-3.5 bg-blue-500 font-black uppercase px-1 shadow-sm">Public</Badge>}
                              </div>
                              <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest truncate">{person.role}</span>
                            </div>
                          </div>
                          {person.isExternal && person.regData?.status === 'pending' && isAdmin && (
                            <Button size="sm" variant="ghost" className="h-7 text-[9px] font-black text-primary hover:bg-primary/10 rounded-full shrink-0" onClick={() => promoteToRoster(event.teamId, event.id, person.regData!)}>
                              <UserPlus className="h-3 w-3 mr-1" /> Add
                            </Button>
                          )}
                        </div>
                      )) : <p className="text-xs text-muted-foreground italic px-1">Awaiting confirmations...</p>}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1 opacity-60">
                      <HelpCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-[10px] font-black uppercase text-amber-600 tracking-[0.2em]">Undecided ({maybeList.length})</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-80">
                      {maybeList.map((person) => (
                        <div key={person.id} className="flex items-center gap-3 p-3 bg-muted/20 rounded-2xl grayscale transition-all">
                          <Avatar className="h-8 w-8"><AvatarImage src={person.avatar} /><AvatarFallback className="font-bold text-xs">{person.name[0]}</AvatarFallback></Avatar>
                          <div className="flex flex-col"><span className="text-xs font-bold">{person.name}</span><span className="text-[8px] text-muted-foreground font-black uppercase">{person.role}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="links" className="mt-0 pt-4">
                  <div className="bg-primary/5 p-8 rounded-[2rem] border-2 border-dashed border-primary/20 text-center space-y-6">
                    <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
                      <LinkIcon className="h-8 w-8 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-black tracking-tight">Public Sign-up Portal</h4>
                      <p className="text-sm text-muted-foreground font-medium max-w-[280px] mx-auto leading-relaxed">
                        Allow external participants to register for this event. You can promote them to the roster later.
                      </p>
                    </div>
                    <Button className="w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 gap-3" onClick={copyRegLink}>
                      <Copy className="h-4 w-4" /> Copy Registration Link
                    </Button>
                  </div>
                </TabsContent>
              </div>

              <div className="px-8 py-8 border-t bg-muted/10">
                <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] text-center mb-4">Required: Update your status</p>
                <div className="grid grid-cols-3 gap-4">
                  <Button variant={event.userRsvp === 'notGoing' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'notGoing' ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20" : "hover:border-red-600 hover:text-red-600")} onClick={() => updateRSVP(event.id, 'notGoing')}><XCircle className="h-4 w-4 mr-2" /> No</Button>
                  <Button variant={event.userRsvp === 'maybe' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'maybe' ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "hover:border-amber-500 hover:text-amber-500")} onClick={() => updateRSVP(event.id, 'maybe')}><HelpCircle className="h-4 w-4 mr-2" /> Maybe</Button>
                  <Button variant={event.userRsvp === 'going' ? 'default' : 'outline'} className={cn("rounded-2xl h-14 font-black transition-all text-[10px] uppercase tracking-widest", event.userRsvp === 'going' ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20" : "hover:border-green-600 hover:text-green-600")} onClick={() => updateRSVP(event.id, 'going')}><CheckCircle2 className="h-4 w-4 mr-2" /> Going</Button>
                </div>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, events, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, promoteToRoster, user, isSuperAdmin } = useTeam();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [allowExternal, setAllowExternal] = useState(false);
  const [maxRegs, setMaxRegs] = useState('');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse">
        <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Loading schedule...</p>
      </div>
    );
  }

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const handleEdit = (event: TeamEvent) => {
    setEditingEvent(event);
    setNewTitle(event.title);
    setNewDate(event.date.toISOString().split('T')[0]);
    
    const timeParts = event.startTime.split(' ');
    const [h, m] = timeParts[0].split(':');
    let hours = parseInt(h);
    if (timeParts[1] === 'PM' && hours < 12) hours += 12;
    if (timeParts[1] === 'AM' && hours === 12) hours = 0;
    const formattedTime = `${hours.toString().padStart(2, '0')}:${m}`;
    
    setNewTime(formattedTime);
    setNewLocation(event.location);
    setNewDescription(event.description);
    setAllowExternal(!!event.allowExternalRegistration);
    setMaxRegs(event.maxRegistrations?.toString() || '');
    setIsCreateOpen(true);
  };

  const handleDelete = (eventId: string) => {
    if (confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      deleteEvent(eventId);
      toast({ title: "Event Deleted" });
    }
  };

  const handleCreateEvent = () => {
    if (!newTitle || !newDate || !newTime) {
      toast({ title: "Missing Information", description: "Please provide a title, date, and time.", variant: "destructive" });
      return;
    }
    
    const [hours, minutes] = newTime.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    const formattedStartTime = `${displayHours}:${minutes} ${ampm}`;

    const eventDate = new Date(newDate);
    if (isNaN(eventDate.getTime())) {
      toast({ title: "Invalid Date", variant: "destructive" });
      return;
    }

    const payload = {
      title: newTitle,
      date: eventDate,
      startTime: formattedStartTime,
      location: newLocation,
      description: newDescription,
      recurrence: 'none' as EventRecurrence,
      allowExternalRegistration: allowExternal,
      maxRegistrations: maxRegs ? parseInt(maxRegs) : undefined
    };

    if (editingEvent) {
      updateEvent(editingEvent.id, payload);
      toast({ title: "Event Updated" });
    } else {
      addEvent(payload);
      toast({ title: "Event Created" });
    }
    
    setIsCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setEditingEvent(null);
    setNewTitle(''); setNewDate(''); setNewTime(''); setNewLocation(''); setNewDescription('');
    setAllowExternal(false); setMaxRegs('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule</h1>
        {isAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm" className="rounded-full shadow-lg shadow-primary/20"><Plus className="h-4 w-4 mr-2" />New Event</Button></DialogTrigger>
            <DialogContent className="sm:max-w-3xl rounded-[2.5rem] overflow-hidden p-0">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="bg-primary/5 p-8 border-r space-y-6">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black tracking-tight">{editingEvent ? "Update Match" : "Plan New Match"}</DialogTitle>
                    <DialogDescription className="font-bold text-primary/60 uppercase tracking-widest text-[10px]">Team Coordination Hub</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label>
                      <Input placeholder="e.g. Open Tryouts, Team BBQ" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl" /></div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                      <Input placeholder="Arena or Field name..." value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl" />
                    </div>
                  </div>
                </div>
                <div className="p-8 space-y-6 flex flex-col justify-between">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Logistics & Strategy</Label>
                      <Textarea placeholder="What should the squad bring? Tactical notes..." value={newDescription} onChange={e => setNewDescription(e.target.value)} className="min-h-[120px] rounded-2xl resize-none" />
                    </div>
                    <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-black">External Sign-ups</Label>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Public Registration Page</p>
                        </div>
                        <Checkbox checked={allowExternal} onCheckedChange={(v) => setAllowExternal(!!v)} className="h-6 w-6 rounded-lg" />
                      </div>
                      {allowExternal && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest">Roster Capacity Limit</Label>
                          <Input type="number" placeholder="Leave blank for unlimited" value={maxRegs} onChange={e => setMaxRegs(e.target.value)} className="h-10 rounded-xl" />
                        </div>
                      )}
                    </div>
                  </div>
                  <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleCreateEvent}>
                    {editingEvent ? "Commit Changes" : "Schedule to Squad"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-12 bg-muted/50 border max-w-md mx-auto">
          <TabsTrigger value="list" className="rounded-full h-10 font-black text-[10px] uppercase tracking-widest">List Order</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-full h-10 font-black text-[10px] uppercase tracking-widest">Calendar View</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4 mt-8">
          {events.length > 0 ? events.map((event) => (
            <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} promoteToRoster={promoteToRoster} onEdit={handleEdit} onDelete={handleDelete}>
              <Card className="overflow-hidden hover:border-primary/30 transition-all duration-500 cursor-pointer group hover:shadow-2xl border-none shadow-md ring-1 ring-black/5 rounded-[2rem]">
                <div className="flex items-stretch">
                  <div className="bg-primary/5 w-20 sm:w-24 flex flex-col items-center justify-center border-r shrink-0 transition-colors group-hover:bg-primary/10">
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">{event.date.toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-3xl font-black text-primary tracking-tighter">{event.date.getDate()}</span>
                  </div>
                  <div className="flex-1 p-6 space-y-3 min-w-0">
                    <div className="flex items-start justify-between">
                      <h3 className="font-black text-xl leading-tight group-hover:text-primary transition-colors truncate">{event.title}</h3>
                      <div className="bg-muted h-10 w-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-4 transition-all">
                        <ChevronRight className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-y-2 gap-x-6 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center"><Clock className="h-4 w-4 mr-2 text-primary/40" />{event.startTime}</div>
                        {event.location && <div className="flex items-center truncate max-w-[200px]"><MapPin className="h-4 w-4 mr-2 text-primary/40" />{event.location}</div>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {event.userRsvp && (
                          <Badge variant="secondary" className={cn(
                            "text-[9px] h-5 font-black uppercase px-2 shadow-sm",
                            event.userRsvp === 'going' ? "bg-green-100 text-green-700" :
                            event.userRsvp === 'maybe' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {event.userRsvp === 'going' ? 'Going' : event.userRsvp === 'maybe' ? 'Maybe' : 'No'}
                          </Badge>
                        )}
                        {event.allowExternalRegistration && <Badge variant="outline" className="text-[9px] h-5 border-blue-200 text-blue-600 bg-blue-50/50 uppercase font-black">Public</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </EventDetailDialog>
          )) : (
            <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-muted/10 space-y-4">
              <div className="bg-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                <Calendar className="h-8 w-8 text-muted-foreground opacity-20" />
              </div>
              <p className="text-muted-foreground italic font-medium">Your squad's schedule is empty. Time to coordinate.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-8">
          <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden"><CardContent className="p-8"><Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md mx-auto w-full scale-110 sm:scale-100" /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
