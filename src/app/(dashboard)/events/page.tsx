
"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft,
  Trophy,
  Sun,
  Cloud,
  Wind,
  Thermometer,
  Zap,
  Activity,
  ArrowUpRight,
  ChevronRight,
  CheckCircle2,
  CalendarDays,
  MapPin,
  Clock,
  Download,
  Trash2,
  Plus,
  X,
  Users,
  Info,
  ExternalLink,
  FileSignature,
  Loader2,
  Calendar as CalendarIcon
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
import { format, isPast, isSameDay, startOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { downloadICS } from '@/lib/calendar-utils';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary text-white',
  practice: 'bg-emerald-600 border-emerald-600 text-white',
  meeting: 'bg-amber-500 border-amber-500 text-white',
  tournament: 'bg-black border-black text-white',
  other: 'bg-slate-600 border-slate-600 text-white',
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

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, children, members }: { event: TeamEvent, updateRSVP: (eventId: string, status: string, teamId?: string) => Promise<void>, isAdmin: boolean, onEdit: any, onDelete: any, children: React.ReactNode, members: Member[] }) {
  const { user, exportAttendanceCSV } = useTeam();
  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';

  const handleSyncToCalendar = () => {
    const calendarEvent = {
      title: event.title,
      start: new Date(event.date),
      end: event.endDate ? new Date(event.endDate) : undefined,
      location: event.location,
      description: event.description
    };
    downloadICS([calendarEvent], `${event.title.replace(/\s+/g, '_')}.ics`);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-y-auto max-h-[90vh] custom-scrollbar">
        <DialogTitle className="sr-only">{event.title} Details</DialogTitle>
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-1/3 flex flex-col text-white bg-black p-8 relative shrink-0">
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="flex gap-2">
                <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{(event.eventType || 'other').toUpperCase()}</Badge>
                {event.isLeagueGame && (
                  <Badge className={cn("uppercase font-black tracking-widest text-[9px] h-6 px-3 border-none", event.isHome ? "bg-white text-black" : "bg-primary/20 text-white")}>
                    {event.isHome ? 'HOME TEAM' : 'VISITING TEAM'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-8 relative z-10">
              <div className="space-y-4">
                <h2 className="text-3xl font-black tracking-tighter leading-tight uppercase">{event.title}</h2>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/10 space-y-3 font-bold text-sm">
                  <div className="flex items-center gap-3"><CalendarDays className="h-4 w-4 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                  <div className="flex items-center gap-3"><Clock className="h-4 w-4 text-primary" />{event.startTime}</div>
                  <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{event.location}</span></div>
                </div>
                <Button variant="outline" className="w-full h-12 rounded-xl border-white/20 bg-white/5 text-white hover:bg-primary hover:border-transparent font-black uppercase text-[10px] tracking-widest transition-all" onClick={handleSyncToCalendar}>
                  <CalendarIcon className="h-4 w-4 mr-2 text-white" /> <span className="text-white">Add to Calendar</span>
                </Button>
              </div>

                <div className="space-y-4 pt-4 border-t border-white/10">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mb-4">Tactical RSVP</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => updateRSVP(event.id, 'going', event.teamId)} className={cn("h-12 rounded-xl font-black text-xs uppercase flex items-center justify-center transition-all", myRsvp === 'going' ? "bg-green-600 text-white border-none shadow-lg shadow-green-600/20" : "bg-white/5 border border-white/10 text-white")}>Going</button>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => updateRSVP(event.id, 'maybe', event.teamId)} className={cn("h-12 rounded-xl font-black text-xs uppercase flex items-center justify-center transition-all", myRsvp === 'maybe' ? "bg-amber-400 text-black border-none shadow-lg shadow-amber-400/20" : "bg-white/5 border border-white/10 text-white")}>Maybe</button>
                      <button onClick={() => updateRSVP(event.id, 'declined', event.teamId)} className={cn("h-12 rounded-xl font-black text-xs uppercase flex items-center justify-center transition-all", myRsvp === 'declined' ? "bg-red-600 text-white border-none shadow-lg shadow-red-600/20" : "bg-white/5 border border-white/10 text-white")}>Decline</button>
                    </div>
                  </div>
                </div>
            </div>
            {isAdmin && (
              <div className="mt-auto pt-8 flex flex-col gap-3 relative z-10">
                <Button variant="outline" className="w-full h-12 rounded-xl border-white/20 bg-white/5 text-white hover:bg-primary hover:border-transparent font-black uppercase text-[10px] transition-all" onClick={() => exportAttendanceCSV(event.id)}>
                  <Download className="h-4 w-4 mr-2 text-white" /> <span className="text-white">Export RSVP Ledger</span>
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px]" onClick={() => onEdit(event)}>Edit Hub</Button>
                  <Button variant="destructive" size="icon" className="h-12 w-12 rounded-xl" onClick={() => onDelete(event.id)}><Trash2 className="h-5 w-5" /></Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 p-8 lg:p-10 bg-background text-foreground">
            <Tabs defaultValue="attendance" className="w-full">
              <TabsList className="bg-muted/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1 mb-8">
                <TabsTrigger value="attendance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                {event.isTournament && (
                  <TabsTrigger value="matches" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Matches</TabsTrigger>
                )}
                <TabsTrigger value="brief" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Brief</TabsTrigger>
              </TabsList>

              <TabsContent value="matches" className="mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {event.tournamentGames?.map((game: any) => (
                    <Card key={game.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 bg-white overflow-hidden p-6 space-y-4 transition-all hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{game.time}</Badge>
                          {game.round && <Badge className="bg-muted text-foreground border-none text-[7px] font-black uppercase px-2 h-4">{game.round}</Badge>}
                        </div>
                        {game.isCompleted && <Badge className="bg-black text-white border-none text-[8px] font-black uppercase px-2 h-5">FINAL</Badge>}
                      </div>
                      <div className="grid grid-cols-7 items-center gap-4 text-center">
                        <div className="col-span-3 min-w-0">
                          <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team1}</p>
                          <p className={cn("text-2xl font-black", game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-foreground")}>{game.score1}</p>
                        </div>
                        <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                        <div className="col-span-3 min-w-0">
                          <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team2}</p>
                          <p className={cn("text-2xl font-black", game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-foreground")}>{game.score2}</p>
                        </div>
                      </div>
                      {game.location && (
                        <p className="text-[9px] font-bold text-muted-foreground uppercase text-center flex items-center justify-center gap-1.5 pt-2 border-t border-muted">
                          <MapPin className="h-3 w-3 opacity-40" /> {game.location}
                        </p>
                      )}
                    </Card>
                  ))}
                  {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                    <div className="col-span-full py-20 text-center bg-muted/10 rounded-3xl border-2 border-dashed opacity-40">
                      <Clock className="h-12 w-12 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Match itinerary being established.</p>
                    </div>
                  )}
                </div>
              </TabsContent>
              
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
                              "border-none font-black text-[8px] uppercase px-3 h-5",
                              rsvp === 'going' ? "bg-green-600 text-white" : rsvp === 'maybe' ? "bg-amber-400 text-black" : (rsvp === 'declined' || rsvp === 'no') ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"
                            )}>
                              {rsvp === 'no_response' ? 'No Response' : rsvp === 'no' ? 'Declined' : rsvp}
                            </Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="brief" className="mt-0 space-y-8 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Info className="h-5 w-5 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Coordinator Protocol</h3>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground leading-relaxed italic border-l-4 border-primary/20 pl-6 py-2">
                    "{event.description || 'Championship itinerary established. No secondary coordination notes provided.'}"
                  </p>
                </div>

                <div className="pt-8 border-t space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Thermometer className="h-5 w-5 text-orange-500" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Conditions Pulse</h3>
                    </div>
                    <Badge className="bg-orange-100/50 text-orange-700 border-none font-black text-[8px] h-5 px-3">SIMULATED FORECAST</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-muted/30 p-5 rounded-3xl border shadow-inner text-center space-y-2">
                      <Sun className="h-6 w-6 mx-auto text-amber-500" />
                      <p className="text-xs font-black uppercase">{((event.location?.length || 0) % 15) + 65}°F</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase">Fair Skies</p>
                    </div>
                    <div className="bg-muted/30 p-5 rounded-3xl border shadow-inner text-center space-y-2">
                      <Wind className="h-6 w-6 mx-auto text-blue-400" />
                      <p className="text-xs font-black uppercase">{((event.location?.length || 0) % 5) + 5} MPH</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase">Local Gusts</p>
                    </div>
                    <div className="bg-muted/30 p-5 rounded-3xl border shadow-inner text-center space-y-2">
                      <Cloud className="h-6 w-6 mx-auto text-slate-400" />
                      <p className="text-xs font-black uppercase">{(event.title.length % 20)}%</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase">Precip Probability</p>
                    </div>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-2xl border-2 border-primary/10 text-center">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest italic leading-none">
                      Focus: Peak Competition Parameters Optimal for {event.location || 'Assigned Venue'}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeamEvents, updateRSVP, isSuperAdmin, isStaff, addEvent, updateEvent, deleteEvent, members } = useTeam();
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('game');

  const filteredEvents = useMemo(() => { 
    const now = new Date(); 
    const list = activeTeamEvents || []; 
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.endDate || e.date)) || isSameDay(new Date(e.endDate || e.date), now)); 
    return list.filter(e => isPast(new Date(e.endDate || e.date)) && !isSameDay(new Date(e.endDate || e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
  }, [activeTeamEvents, filterMode]);

  const handleCreateEvent = async () => { 
    if (!newTitle || !newDate || !newTime) return;
    try {
      const payload: any = { 
        title: newTitle, eventType, 
        date: new Date(newDate).toISOString(), 
        endDate: newEndDate ? new Date(newEndDate).toISOString() : new Date(newDate).toISOString(),
        startTime: newTime, location: newLocation, description: newDescription 
      }; 
      const success = editingEvent ? await updateEvent(editingEvent.id, payload) : await addEvent(payload); 
      if (success) { setIsCreateOpen(false); resetForm(); }
    } catch (e) { toast({ title: "Deployment Error", variant: "destructive" }); }
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setEventType('game'); setEditingEvent(null);
  };

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setNewTitle(event.title); 
    setEventType(event.eventType || 'game'); 
    setNewDate(format(new Date(event.date), 'yyyy-MM-dd')); 
    if (event.endDate) setNewEndDate(format(new Date(event.endDate), 'yyyy-MM-dd'));
    setNewTime(event.startTime); 
    setNewLocation(event.location); 
    setNewDescription(event.description); 
    setIsCreateOpen(true); 
  };

  const isAdmin = isStaff || isSuperAdmin;

  const nextTournament = useMemo(() => {
    return (activeTeamEvents || [])
      .filter(e => new Date(e.date) >= startOfDay(new Date()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  }, [activeTeamEvents]);

  return (
    <div className="space-y-12 pb-32">
      {nextTournament && (
        <div className="relative group overflow-hidden rounded-[3rem] border-2 shadow-2xl bg-black text-white p-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="absolute top-0 right-0 p-12 opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-1000">
             <Trophy className="h-64 w-64" />
          </div>
          <div className="relative z-10 space-y-6 flex-1">
             <div className="flex items-center gap-3">
               <Badge className="bg-primary text-white border-none font-black tracking-widest text-[10px] h-7 px-4 shadow-lg shadow-primary/20">NEXT FOCUS</Badge>
               <div className="flex items-center gap-2 text-white/40 font-black uppercase text-[10px] tracking-widest bg-white/5 px-3 py-1 rounded-full">
                  <Zap className="h-3 w-3 text-amber-500" /> Strategic Alignment Required
               </div>
             </div>
             <div>
               <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-tight italic">{nextTournament.title}</h3>
               <div className="flex flex-wrap items-center gap-6 mt-4 opacity-70">
                 <div className="flex items-center gap-2 text-sm font-bold uppercase"><CalendarIcon className="h-4 w-4" /> {formatDateRange(nextTournament.date, nextTournament.endDate)}</div>
                 <div className="flex items-center gap-2 text-sm font-bold uppercase"><MapPin className="h-4 w-4" /> {nextTournament.location}</div>
               </div>
             </div>
          </div>
          <div className="relative z-10 w-full md:w-auto shrink-0 flex flex-col items-center justify-center p-8 bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 ring-1 ring-white/5 space-y-4">
             <div className="text-center">
               <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Squad Readiness</p>
               <p className="text-3xl font-black leading-none uppercase">Verified</p>
             </div>
             <EventDetailDialog event={nextTournament} updateRSVP={updateRSVP} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent} members={members}>
               <Button className="w-full h-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-xs tracking-widest shadow-xl px-10">
                 Open Intel <ArrowUpRight className="ml-2 h-4 w-4" />
               </Button>
             </EventDetailDialog>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Squad Itinerary</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule Hub</h1></div>
        {isStaff && ( <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { resetForm(); setIsCreateOpen(true); }}>+ New Activity</Button> )}
      </div>
      
      <Dialog open={isCreateOpen} onOpenChange={(o) => { if(!o) resetForm(); setIsCreateOpen(o); }}>
        <DialogContent className="sm:max-w-4xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogTitle className="sr-only">Schedule New Team Activity</DialogTitle>
          <div className="flex flex-col lg:flex-row">
            <div className="w-full lg:w-5/12 bg-muted/30 p-10 space-y-8 lg:border-r">
              <DialogHeader><DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingEvent ? "Update" : "Launch"} Activity</DialogTitle></DialogHeader>
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Activity Type</Label>
                  <Select value={eventType} onValueChange={(v: EventType) => setEventType(v)}>
                    <SelectTrigger className="h-12 rounded-xl border-2 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl"><SelectItem value="game" className="font-bold">Match Day</SelectItem><SelectItem value="practice" className="font-bold">Training</SelectItem><SelectItem value="meeting" className="font-bold">Tactical Meeting</SelectItem><SelectItem value="other" className="font-bold">Event</SelectItem></SelectContent>
                  </Select>
                </div> 
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title *</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date *</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" /></div>
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date (Opt)</Label><Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-12 rounded-xl border-2 font-black" /></div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Time *</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl border-2 font-black" />
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
                  <div className={cn("w-24 lg:w-32 flex flex-col items-center justify-center border-r-2 shrink-0 px-2 text-center", EVENT_TYPE_COLORS[event.eventType || 'other'])}>
                    <span className="text-[9px] font-black uppercase opacity-60 leading-none mb-1">{format(new Date(event.date), 'MMM').toUpperCase()}</span>
                    <span className="text-3xl lg:text-4xl font-black tracking-tighter leading-none">{format(new Date(event.date), 'd')}</span>
                  </div>
                  <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex gap-2 mb-1.5">
                          <Badge className="text-[7px] uppercase font-black">{(event.eventType || 'Activity')}</Badge>
                          <Badge variant="outline" className="text-[7px] uppercase font-black text-primary border-primary/20">{event.startTime}</Badge>
                          {event.isLeagueGame && (
                            <Badge className={cn("text-[7px] uppercase font-black border-none", event.isHome ? "bg-primary text-white" : "bg-black text-white")}>
                              {event.isHome ? 'HOME' : 'AWAY'}
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-black tracking-tight leading-none truncate group-hover:text-primary transition-colors uppercase">{event.title}</h3>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> {event.location}</p>
                          <p className="text-[8px] font-black text-primary uppercase">{formatDateRange(event.date, event.endDate)}</p>
                        </div>
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
