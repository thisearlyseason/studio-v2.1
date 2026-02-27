
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Plus, ChevronRight, Info, Repeat, CheckCircle2, Users, Link as LinkIcon, UserPlus, Trash2, HelpCircle, XCircle, UserCheck } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
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
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, children }: EventDetailDialogProps) {
  const { members } = useTeam();
  const db = useFirestore();
  const regQuery = useMemoFirebase(() => {
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event.id, event.teamId]);
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
      <DialogContent className="sm:max-w-[550px] overflow-y-auto max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-2 sticky top-0 bg-background z-10 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black tracking-tight">{event.title}</DialogTitle>
              <DialogDescription className="font-bold text-primary">
                {event.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </DialogDescription>
            </div>
            {event.allowExternalRegistration && <Badge className="bg-blue-500 font-black px-3 h-7 uppercase tracking-tighter">Public Open</Badge>}
          </div>
        </DialogHeader>

        <div className="px-6 py-4 bg-muted/20 border-b flex justify-around">
          <div className="text-center">
            <p className="text-2xl font-black text-green-600">{goingList.length}</p>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Going</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-amber-600">{maybeList.length}</p>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Maybe</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-red-600">{notGoingList.length}</p>
            <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">No</p>
          </div>
        </div>

        <Tabs defaultValue="details" className="w-full">
          <div className="px-6 pt-4 sticky top-[88px] bg-background z-10 pb-2 border-b">
            <TabsList className="grid w-full grid-cols-2 rounded-xl h-11">
              <TabsTrigger value="details" className="rounded-lg font-bold">Event Details</TabsTrigger>
              <TabsTrigger value="attendance" className="rounded-lg font-bold">Attendance ({attendanceData.length})</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="details" className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2.5 rounded-xl text-primary shrink-0"><Clock className="h-5 w-5" /></div>
                <div>
                  <p className="font-black text-sm uppercase tracking-widest">Time & Location</p>
                  <p className="text-sm font-medium text-muted-foreground">{event.startTime} @ {event.location}</p>
                </div>
              </div>
              
              {event.maxRegistrations && (
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-2.5 rounded-xl text-primary shrink-0"><Users className="h-5 w-5" /></div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-widest">Capacity</p>
                    <p className="text-sm font-medium text-muted-foreground">{registrations?.length || 0} / {event.maxRegistrations} External Sign-ups</p>
                  </div>
                </div>
              )}

              <div className="p-4 bg-muted/30 rounded-2xl border-2 border-dashed">
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{event.description}"</p>
              </div>
            </div>
            
            {event.allowExternalRegistration && (
              <Button variant="outline" className="w-full h-12 gap-2 border-dashed border-primary/30 text-primary font-bold rounded-xl" onClick={copyRegLink}>
                <LinkIcon className="h-4 w-4" /> Copy Public Sign-up Link
              </Button>
            )}

            <div className="space-y-3 pt-4 border-t">
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Your Response (Required)</p>
              <div className="grid grid-cols-3 gap-3">
                <Button 
                  variant={event.userRsvp === 'notGoing' ? 'default' : 'outline'} 
                  className={cn(
                    "rounded-xl h-12 font-bold transition-all",
                    event.userRsvp === 'notGoing' ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : "hover:border-red-600 hover:text-red-600"
                  )} 
                  onClick={() => updateRSVP(event.id, 'notGoing')}
                >
                  <XCircle className="h-4 w-4 mr-2" /> No
                </Button>
                <Button 
                  variant={event.userRsvp === 'maybe' ? 'default' : 'outline'} 
                  className={cn(
                    "rounded-xl h-12 font-bold transition-all",
                    event.userRsvp === 'maybe' ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : "hover:border-amber-500 hover:text-amber-500"
                  )} 
                  onClick={() => updateRSVP(event.id, 'maybe')}
                >
                  <HelpCircle className="h-4 w-4 mr-2" /> Maybe
                </Button>
                <Button 
                  variant={event.userRsvp === 'going' ? 'default' : 'outline'}
                  className={cn(
                    "rounded-xl h-12 font-bold transition-all",
                    event.userRsvp === 'going' ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "hover:border-green-600 hover:text-green-600"
                  )} 
                  onClick={() => updateRSVP(event.id, 'going')}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Going
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="p-6 space-y-8">
            {/* Going Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-[10px] font-black uppercase text-green-600 tracking-widest">Going ({goingList.length})</span>
              </div>
              {goingList.length > 0 ? goingList.map((person) => (
                <div key={person.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-2xl ring-1 ring-black/5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={person.avatar} />
                      <AvatarFallback className="font-bold text-xs">{person.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black">{person.name}</span>
                        {person.isExternal && <Badge className="text-[8px] h-3.5 bg-blue-500 font-black uppercase px-1.5">Public</Badge>}
                      </div>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{person.role}</span>
                    </div>
                  </div>
                  {person.isExternal && person.regData?.status === 'pending' && isAdmin && (
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] font-black text-primary hover:bg-primary/10 rounded-full" onClick={() => promoteToRoster(event.teamId, event.id, person.regData!)}>
                      <UserPlus className="h-3 w-3 mr-1" /> Add to Roster
                    </Button>
                  )}
                  {person.isExternal && person.regData?.status === 'added' && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-[8px] font-black uppercase h-5">Rostered</Badge>
                  )}
                </div>
              )) : <p className="text-xs text-muted-foreground italic px-1">No one confirmed yet.</p>}
            </div>

            {/* Maybe Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <HelpCircle className="h-4 w-4 text-amber-600" />
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Maybe ({maybeList.length})</span>
              </div>
              {maybeList.length > 0 ? maybeList.map((person) => (
                <div key={person.id} className="flex items-center gap-3 p-3 bg-muted/20 rounded-2xl ring-1 ring-black/5 opacity-80">
                  <Avatar className="h-8 w-8 grayscale">
                    <AvatarImage src={person.avatar} />
                    <AvatarFallback className="font-bold text-xs">{person.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-xs font-black">{person.name}</span>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{person.role}</span>
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground italic px-1">No undecided responses.</p>}
            </div>

            {/* Not Going Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-[10px] font-black uppercase text-red-600 tracking-widest">Not Going ({notGoingList.length})</span>
              </div>
              {notGoingList.length > 0 ? notGoingList.map((person) => (
                <div key={person.id} className="flex items-center gap-3 p-3 bg-muted/20 rounded-2xl ring-1 ring-black/5 opacity-60">
                  <Avatar className="h-8 w-8 grayscale brightness-50">
                    <AvatarImage src={person.avatar} />
                    <AvatarFallback className="font-bold text-xs">{person.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-xs font-black line-through">{person.name}</span>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">{person.role}</span>
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground italic px-1">No negative responses yet.</p>}
            </div>
          </TabsContent>
        </Tabs>
        <div className="p-6 border-t bg-muted/10 sticky bottom-0">
          <Button variant="ghost" className="w-full font-bold" onClick={(e) => {
            // Find parent dialog close button or simply trust auto behavior
          }}>
            Close Details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, events, addEvent, updateRSVP, formatTime, promoteToRoster, user } = useTeam();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [allowExternal, setAllowExternal] = useState(false);
  const [maxRegs, setMaxRegs] = useState('');

  const isAdmin = activeTeam?.role === 'Admin';

  const handleCreateEvent = () => {
    if (!newTitle || !newDate || !newTime) {
      toast({
        title: "Missing Information",
        description: "Please provide a title, date, and time for the event.",
        variant: "destructive"
      });
      return;
    }
    
    const [hours, minutes] = newTime.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    const formattedStartTime = `${displayHours}:${minutes} ${ampm}`;

    const eventDate = new Date(newDate);
    if (isNaN(eventDate.getTime())) {
      toast({
        title: "Invalid Date",
        description: "The selected date is invalid. Please try again.",
        variant: "destructive"
      });
      return;
    }

    addEvent({
      title: newTitle,
      date: eventDate,
      startTime: formattedStartTime,
      location: newLocation,
      description: newDescription,
      recurrence: 'none',
      allowExternalRegistration: allowExternal,
      maxRegistrations: maxRegs ? parseInt(maxRegs) : undefined
    });
    
    setIsCreateOpen(false);
    resetForm();
    toast({ title: "Event Created", description: `${newTitle} has been scheduled.` });
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewTime(''); setNewLocation(''); setNewDescription('');
    setAllowExternal(false); setMaxRegs('');
  };

  if (!activeTeam) return <div className="p-10 text-center animate-pulse">Loading schedule...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule</h1>
        {isAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New Event</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[500px] overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create Team Event</DialogTitle>
                <DialogDescription>Schedule events and manage registrations.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Event Title</Label>
                  <Input placeholder="e.g. Open Tryouts, Team BBQ" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Time</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Location</Label><Input placeholder="Where is it?" value={newLocation} onChange={e => setNewLocation(e.target.value)} /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Optional details..." value={newDescription} onChange={e => setNewDescription(e.target.value)} /></div>
                
                <div className="p-4 bg-muted/30 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Public Registration</Label>
                      <p className="text-[10px] text-muted-foreground">Allow people outside the team to sign up.</p>
                    </div>
                    <Checkbox checked={allowExternal} onCheckedChange={(v) => setAllowExternal(!!v)} />
                  </div>
                  {allowExternal && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                      <Label className="text-xs">Registration Limit (Optional)</Label>
                      <Input type="number" placeholder="No limit" value={maxRegs} onChange={e => setMaxRegs(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter><Button className="w-full rounded-xl h-11" onClick={handleCreateEvent}>Create Event</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-12">
          <TabsTrigger value="list" className="rounded-full h-10">List View</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-full h-10">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4 mt-4">
          {events.length > 0 ? events.map((event) => (
            <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} promoteToRoster={promoteToRoster}>
              <Card className="overflow-hidden hover:border-primary transition-all duration-300 cursor-pointer group hover:shadow-lg border-none shadow-sm ring-1 ring-black/5">
                <div className="flex items-stretch">
                  <div className="bg-primary/5 w-16 flex flex-col items-center justify-center border-r shrink-0">
                    <span className="text-[10px] font-black uppercase text-primary">{event.date.toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-2xl font-black text-primary">{event.date.getDate()}</span>
                  </div>
                  <div className="flex-1 p-4 space-y-2 min-w-0">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-lg leading-tight group-hover:text-primary truncate">{event.title}</h3>
                      <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-y-1 gap-x-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <div className="flex items-center"><Clock className="h-3.5 w-3.5 mr-1.5 text-primary/50" />{event.startTime}</div>
                        {event.location && <div className="flex items-center truncate"><MapPin className="h-3.5 w-3.5 mr-1.5 text-primary/50" />{event.location}</div>}
                      </div>
                      <div className="flex gap-2">
                        {event.userRsvp && (
                          <Badge variant="secondary" className={cn(
                            "text-[8px] h-4 font-black uppercase",
                            event.userRsvp === 'going' ? "bg-green-100 text-green-700" :
                            event.userRsvp === 'maybe' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {event.userRsvp === 'going' ? 'Going' : event.userRsvp === 'maybe' ? 'Maybe' : 'No'}
                          </Badge>
                        )}
                        {event.allowExternalRegistration && <Badge variant="outline" className="text-[8px] h-4 border-blue-200 text-blue-600">Public</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </EventDetailDialog>
          )) : (
            <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-muted/20">
              <p className="text-muted-foreground italic font-medium">Your squad's schedule is empty.</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden"><CardContent className="p-4"><Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md mx-auto w-full" /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
