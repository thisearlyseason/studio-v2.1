"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  CheckCircle2, 
  Trash2, 
  CalendarDays, 
  Loader2, 
  X, 
  Users,
  FileSignature,
  Info,
  ExternalLink
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTeam, TeamEvent, EventType, Member } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { format, isPast, isSameDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary text-white',
  practice: 'bg-emerald-600 border-emerald-600 text-white',
  meeting: 'bg-amber-500 border-amber-500 text-white',
  tournament: 'bg-black border-black text-white',
  other: 'bg-slate-600 border-slate-600 text-white',
};

const normalizeTime = (t: string) => {
  if (!t || t === 'TBD') return '12:00';
  if (t.toUpperCase().includes('M')) {
    try {
      const parts = t.trim().split(/\s+/);
      const timePart = parts[0];
      const period = parts[1]?.toUpperCase() || (t.toUpperCase().includes('PM') ? 'PM' : 'AM');
      let [hStr, mStr] = timePart.split(':');
      let h = parseInt(hStr);
      let m = parseInt(mStr) || 0;
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    } catch (e) {
      return '12:00';
    }
  }
  return t.includes(':') ? t : '12:00';
};

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`;
  }
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, children, members }: { event: TeamEvent, updateRSVP: any, isAdmin: boolean, onEdit: any, onDelete: any, children: React.ReactNode, members: Member[] }) {
  const { user } = useTeam();
  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent data-dark-header="true" className="sm:max-w-5xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden">
        <DialogTitle className="sr-only">{event.title} Details</DialogTitle>
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-1/3 flex flex-col text-white bg-black p-8 relative shrink-0">
            <div className="flex justify-between items-start mb-8 relative z-10">
              <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{(event.eventType || 'other').toUpperCase()}</Badge>
            </div>
            <div className="space-y-8 relative z-10">
              <div className="space-y-4">
                <h2 className="text-3xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 font-bold text-sm">
                  <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                  <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-primary" />{event.startTime}</div>
                  <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{event.location}</span></div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mb-4">Tactical RSVP</p>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant={myRsvp === 'going' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'going' ? "bg-primary border-none" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'going')}>Going</Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant={myRsvp === 'maybe' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-50" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
                    <Button variant={myRsvp === 'declined' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'declined')}>Decline</Button>
                  </div>
                </div>
              </div>
            </div>
            {isAdmin && (
              <div className="mt-auto pt-8 flex gap-3 relative z-10">
                <Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px]" onClick={() => onEdit(event)}>Edit Hub</Button>
                <Button variant="destructive" size="icon" className="h-12 w-12 rounded-xl" onClick={() => onDelete(event.id)}><Trash2 className="h-5 w-5" /></Button>
              </div>
            )}
          </div>
          
          <div className="flex-1 p-8 lg:p-10 bg-background">
            <Tabs defaultValue="attendance" className="w-full">
              <TabsList className="bg-muted/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1 mb-8">
                <TabsTrigger value="attendance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                <TabsTrigger value="brief" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Brief</TabsTrigger>
                {event.isTournament && (
                  <>
                    <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                    <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                  </>
                )}
              </TabsList>
              
              <TabsContent value="attendance" className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Roster Pulse</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {members.map(member => {
                      const rsvp = event.userRsvps?.[member.userId] || 'no_response';
                      return (
                        <Card key={member.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 rounded-xl border">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-xs uppercase truncate">{member.name}</p>
                              <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                            </div>
                            <Badge className={cn(
                              "border-none font-black text-[8px] uppercase px-2 h-5",
                              rsvp === 'going' ? "bg-green-100 text-green-700" : rsvp === 'maybe' ? "bg-amber-100 text-amber-700" : rsvp === 'declined' ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                            )}>{rsvp}</Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="brief" className="mt-0">
                <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20">
                  <p className="text-sm font-medium text-foreground/80 leading-relaxed italic whitespace-pre-wrap">
                    "{event.description || 'No coordination notes established for this deployment.'}"
                  </p>
                </div>
              </TabsContent>

              {event.isTournament && (
                <>
                  <TabsContent value="portals" className="mt-0 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Card className="rounded-[2rem] border-none shadow-md bg-black text-white p-6 space-y-4 group cursor-pointer" onClick={() => window.open(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`, '_blank')}>
                        <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">LIVE HUB</Badge>
                        <h4 className="text-xl font-black uppercase tracking-tight">Spectator Portal</h4>
                        <p className="text-[10px] text-white/60 font-medium leading-relaxed italic">Public link for fans to track real-time standings and schedules.</p>
                        <Button variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[10px] bg-white/10 border-white/20 text-white">Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                      </Card>
                      <Card className="rounded-[2rem] border-none shadow-md bg-white border-2 p-6 space-y-4 group cursor-pointer" onClick={() => window.open(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`, '_blank')}>
                        <Badge className="bg-muted text-muted-foreground border-none font-black text-[8px] h-5 px-2">ADMIN ONLY</Badge>
                        <h4 className="text-xl font-black uppercase tracking-tight">Scorekeeper Portal</h4>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">Mobile entry hub for field marshals to post verified match results.</p>
                        <Button className="w-full h-10 rounded-xl font-black uppercase text-[10px]">Open Scorer Hub <ExternalLink className="ml-2 h-3 w-3" /></Button>
                      </Card>
                    </div>
                  </TabsContent>
                  <TabsContent value="compliance" className="mt-0">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <FileSignature className="h-5 w-5 text-primary" />
                          <h3 className="text-xl font-black uppercase tracking-tight">Team Agreement Ledger</h3>
                        </div>
                        <Button variant="outline" className="h-9 px-4 rounded-xl font-black uppercase text-[10px] border-2" onClick={() => window.open(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`, '_blank')}>Open Waiver Portal <ExternalLink className="ml-2 h-3 w-3" /></Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {event.tournamentTeams?.map(teamName => {
                          const agreement = event.teamAgreements?.[teamName];
                          return (
                            <Card key={teamName} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", agreement ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground/30")}>
                                  {agreement ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                                </div>
                                <span className="font-black text-sm uppercase truncate">{teamName}</span>
                              </div>
                              {agreement ? (
                                <div className="text-right">
                                  <p className="text-[8px] font-black uppercase text-muted-foreground">Signed by {agreement.captainName}</p>
                                  <p className="text-[7px] font-bold text-muted-foreground opacity-40">{format(new Date(agreement.signedAt), 'MMM d, h:mm a')}</p>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[7px] font-black uppercase border-muted-foreground/20 text-muted-foreground">Pending Execution</Badge>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { householdEvents, updateRSVP, isSuperAdmin, isStaff, addEvent, updateEvent, deleteEvent, members } = useTeam();
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('game');

  const filteredEvents = useMemo(() => { 
    const now = new Date(); 
    const list = householdEvents || []; 
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.endDate || e.date)) || isSameDay(new Date(e.endDate || e.date), now)); 
    return list.filter(e => isPast(new Date(e.endDate || e.date)) && !isSameDay(new Date(e.endDate || e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
  }, [householdEvents, filterMode]);

  const handleCreateEvent = async () => { 
    if (!newTitle || !newDate || !newTime) return;
    const timeISO = normalizeTime(newTime);
    try {
      const eventDate = new Date(`${newDate}T${timeISO}`);
      const payload: any = { 
        title: newTitle, 
        eventType, 
        date: eventDate.toISOString(), 
        startTime: newTime, 
        location: newLocation, 
        description: newDescription, 
        lastUpdated: new Date().toISOString() 
      }; 
      const success = editingEvent ? await updateEvent(editingEvent.id, payload) : await addEvent(payload); 
      if (success) { setIsCreateOpen(false); setEditingEvent(null); resetForm(); }
    } catch (e) { toast({ title: "Deployment Error", variant: "destructive" }); }
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setEventType('game'); setEditingEvent(null);
  };

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setNewTitle(event.title); 
    setEventType(event.eventType || 'game'); 
    setNewDate(format(new Date(event.date), 'yyyy-MM-dd')); 
    setNewTime(event.startTime); 
    setNewLocation(event.location); 
    setNewDescription(event.description); 
    setIsCreateOpen(true); 
  };

  const isAdmin = isStaff || isSuperAdmin;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Squad Itinerary</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule Hub</h1></div>
        {isStaff && ( <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { resetForm(); setIsCreateOpen(true); }}>+ New Activity</Button> )}
      </div>
      
      <Dialog open={isCreateOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsCreateOpen(o); }}>
        <DialogContent className="sm:max-w-4xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden flex flex-col">
          <div className="flex-1 flex flex-col lg:flex-row">
            <div className="w-full lg:w-5/12 bg-muted/30 p-10 space-y-8 lg:border-r">
              <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingEvent ? "Update" : "Launch"} Activity</DialogTitle></DialogHeader>
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Activity Type</Label>
                  <Select value={eventType} onValueChange={(v: EventType) => setEventType(v)}>
                    <SelectTrigger className="h-12 rounded-xl border-2 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl"><SelectItem value="game">Match Day</SelectItem><SelectItem value="practice">Training</SelectItem><SelectItem value="meeting">Tactical Meeting</SelectItem><SelectItem value="other">Event</SelectItem></SelectContent>
                  </Select>
                </div> 
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title *</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date *</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" /></div>
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Time *</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl border-2 font-black" /></div>
                </div>
              </div>
            </div>
            <div className="flex-1 p-10 space-y-6 bg-white">
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Location</Label><Input value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Event Brief</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[150px] border-2 font-medium" /></div>
            </div>
          </div>
          <div className="p-8 bg-background border-t shrink-0 flex items-center justify-end gap-4">
            <Button variant="outline" className="rounded-xl h-12 font-black uppercase text-[10px] border-2" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-primary/20" onClick={handleCreateEvent}>Deploy Activity</Button>
          </div>
        </DialogContent>
      </Dialog>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-2"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2><div className="flex bg-muted/50 p-1 rounded-xl border shadow-inner"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase">History</Button></div></div>
        <div className="grid gap-4">
          {filteredEvents.map((event) => (
            <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent} members={members}>
              <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
                <div className="flex items-stretch h-32">
                  <div className={cn("w-24 lg:w-32 flex flex-col items-center justify-center border-r-2 shrink-0 px-2 text-center", event.isTournament ? "bg-black text-white" : EVENT_TYPE_COLORS[event.eventType || 'other'])}>
                    <span className="text-[9px] font-black uppercase opacity-60 leading-none mb-1">{format(new Date(event.date), 'MMM').toUpperCase()}</span>
                    <span className="text-3xl lg:text-4xl font-black tracking-tighter leading-none">{format(new Date(event.date), 'd')}</span>
                  </div>
                  <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex gap-2 mb-1.5"><Badge className="text-[7px] uppercase font-black">{event.isTournament ? 'Elite Series' : (event.eventType || 'Activity')}</Badge><Badge variant="outline" className="text-[7px] uppercase font-black text-primary border-primary/20">{event.startTime}</Badge></div>
                        <h3 className="text-xl font-black tracking-tight leading-none truncate group-hover:text-primary transition-colors">{event.title}</h3>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1"><MapPin className="h-3 w-3 text-primary" /> {event.location}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all mt-2" />
                    </div>
                  </div>
                </div>
              </Card>
            </EventDetailDialog> 
          ))}
        </div>
      </section>
    </div>
  );
}
