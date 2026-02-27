
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Plus, ChevronRight, Info, Repeat, CheckCircle2, Users, Link as LinkIcon, UserPlus, Trash2 } from 'lucide-react';
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

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: RSVPStatus) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  promoteToRoster: (teamId: string, eventId: string, reg: EventRegistration) => Promise<void>;
  children: React.ReactNode;
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, children }: EventDetailDialogProps) {
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

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {event.title}
            {event.allowExternalRegistration && <Badge className="bg-blue-500">Public Registration</Badge>}
          </DialogTitle>
          <DialogDescription>
            {event.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 justify-center py-4 border-y bg-muted/20 rounded-xl my-2">
          <div className="text-center px-4">
            <p className="text-2xl font-black text-green-600">{event.rsvps.going}</p>
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Going</p>
          </div>
          <div className="text-center px-4 border-x border-muted">
            <p className="text-2xl font-black text-amber-600">{event.rsvps.maybe}</p>
            <p className="text-[9px] font-bold uppercase text-muted-foreground">Maybe</p>
          </div>
          <div className="text-center px-4">
            <p className="text-2xl font-black text-blue-600">{registrations?.length || 0}</p>
            <p className="text-[9px] font-bold uppercase text-muted-foreground">External</p>
          </div>
        </div>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="registrants" disabled={!isAdmin}>Sign-ups</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 p-2 rounded-lg text-primary"><Clock className="h-5 w-5" /></div>
              <div>
                <p className="font-bold text-sm">Time & Location</p>
                <p className="text-sm text-muted-foreground">{event.startTime} @ {event.location}</p>
              </div>
            </div>
            {event.maxRegistrations && (
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-lg text-primary"><Users className="h-5 w-5" /></div>
                <div>
                  <p className="font-bold text-sm">Capacity</p>
                  <p className="text-sm text-muted-foreground">{registrations?.length || 0} / {event.maxRegistrations} Registered</p>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed italic">"{event.description}"</p>
            
            {event.allowExternalRegistration && (
              <Button variant="outline" className="w-full gap-2 border-dashed" onClick={copyRegLink}>
                <LinkIcon className="h-4 w-4" /> Copy Public Sign-up Link
              </Button>
            )}

            <DialogFooter className="flex gap-2 sm:flex-row flex-col pt-4">
              <Button variant={event.userRsvp === 'notGoing' ? 'destructive' : 'outline'} className="flex-1" onClick={() => updateRSVP(event.id, 'notGoing')}>Can't Go</Button>
              <Button variant={event.userRsvp === 'maybe' ? 'secondary' : 'outline'} className="flex-1" onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
              <Button className={cn("flex-1", event.userRsvp === 'going' ? "bg-green-600" : "")} onClick={() => updateRSVP(event.id, 'going')}>Going</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="registrants" className="py-4">
            <ScrollArea className="h-64 rounded-md border p-2">
              {registrations && registrations.length > 0 ? registrations.map((reg) => (
                <div key={reg.id} className="flex items-center justify-between p-3 border-b last:border-none">
                  <div>
                    <p className="font-bold text-sm">{reg.name}</p>
                    <p className="text-[10px] text-muted-foreground">{reg.email} • {reg.phone}</p>
                  </div>
                  {reg.status === 'pending' ? (
                    <Button size="sm" variant="ghost" className="h-8 text-primary font-bold" onClick={() => promoteToRoster(event.teamId, event.id, reg)}>
                      <UserPlus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="bg-green-100 text-green-700">Added</Badge>
                  )}
                </div>
              )) : (
                <div className="text-center py-10 text-muted-foreground italic text-sm">No external sign-ups yet.</div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
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
                      {event.allowExternalRegistration && <Badge variant="outline" className="text-[8px] h-4">Public</Badge>}
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
