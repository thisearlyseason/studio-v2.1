
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Plus, ChevronRight, Info, Repeat, CheckCircle2 } from 'lucide-react';
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
import { useTeam, EventRecurrence, TeamEvent, RSVPStatus } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: RSVPStatus) => void;
  formatTime: (date: string | Date) => string;
  children: React.ReactNode;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function EventDetailDialog({ event, updateRSVP, formatTime, children }: EventDetailDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {event.title}
            {event.recurrence !== 'none' && <Badge variant="outline" className="text-[10px] py-0">{event.recurrence}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {event.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary"><Clock className="h-5 w-5" /></div>
            <div>
              <p className="font-bold text-sm">Time</p>
              <p className="text-sm text-muted-foreground">{event.startTime} - {event.endTime || 'Finish'}</p>
            </div>
          </div>
          {event.recurrenceDays && event.recurrenceDays.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 p-2 rounded-lg text-primary"><Repeat className="h-5 w-5" /></div>
              <div>
                <p className="font-bold text-sm">Repeats On</p>
                <p className="text-sm text-muted-foreground">{event.recurrenceDays.join(', ')}</p>
                {event.recurrenceEndDate && <p className="text-[10px] text-muted-foreground mt-0.5">Until {new Date(event.recurrenceEndDate).toLocaleDateString()}</p>}
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary"><MapPin className="h-5 w-5" /></div>
            <div>
              <p className="font-bold text-sm">Location</p>
              <p className="text-sm text-muted-foreground">{event.location}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary"><Info className="h-5 w-5" /></div>
            <div>
              <p className="font-bold text-sm">Description</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:flex-row flex-col">
          <Button variant={event.userRsvp === 'notGoing' ? 'destructive' : 'outline'} className="flex-1 rounded-xl" onClick={() => updateRSVP(event.id, 'notGoing')}>Can't Go</Button>
          <Button variant={event.userRsvp === 'maybe' ? 'secondary' : 'outline'} className="flex-1 rounded-xl" onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
          <Button className={cn("flex-1 rounded-xl", event.userRsvp === 'going' ? "bg-green-600 hover:bg-green-700" : "")} onClick={() => updateRSVP(event.id, 'going')}>
            {event.userRsvp === 'going' && <CheckCircle2 className="h-4 w-4 mr-2" />}
            Going
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, events, addEvent, updateRSVP, formatTime } = useTeam();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [mounted, setMounted] = useState(false);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRecurrence, setNewRecurrence] = useState<EventRecurrence>('none');
  const [newRecurrenceDays, setNewRecurrenceDays] = useState<string[]>([]);
  const [newRecurrenceEndDate, setNewRecurrenceEndDate] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!activeTeam) {
    return <div className="flex flex-col items-center justify-center py-20 text-center animate-pulse"><div className="h-8 w-8 bg-primary/20 rounded-full mb-4" /><p className="text-muted-foreground">Loading schedule...</p></div>;
  }

  const handleCreateEvent = () => {
    if (!newTitle || !newDate || !newTime) return;
    
    // Format input time to 12h for display consistency
    const [hours, minutes] = newTime.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHours = h % 12 || 12;
    const formattedStartTime = `${displayHours}:${minutes} ${ampm}`;

    addEvent({
      title: newTitle,
      date: new Date(newDate),
      startTime: formattedStartTime,
      location: newLocation,
      description: newDescription,
      recurrence: newRecurrence,
      recurrenceDays: newRecurrenceDays,
      recurrenceEndDate: newRecurrenceEndDate
    });
    setIsCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewTime(''); setNewLocation(''); setNewDescription('');
    setNewRecurrence('none'); setNewRecurrenceDays([]); setNewRecurrenceEndDate('');
  };

  const toggleDay = (day: string) => {
    setNewRecurrenceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  if (!mounted) return <div className="p-10 text-center animate-pulse">Loading schedule...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New Event</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px] overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create Team Event</DialogTitle>
              <DialogDescription>Schedule a practice, game, or team outing.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Event Title</Label>
                <Input placeholder="e.g. Practice, Game Day" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={newRecurrence} onValueChange={(v: EventRecurrence) => setNewRecurrence(v)}>
                  <SelectTrigger><SelectValue placeholder="Repeats..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time event</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRecurrence === 'weekly' && (
                <div className="space-y-2 bg-muted/30 p-4 rounded-xl">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Select Days</Label>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {DAYS_OF_WEEK.map(day => (
                      <div key={day} className="flex items-center gap-1.5 bg-background px-2 py-1.5 rounded-lg border hover:border-primary transition-colors cursor-pointer">
                        <Checkbox id={`day-${day}`} checked={newRecurrenceDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                        <Label htmlFor={`day-${day}`} className="text-xs font-medium cursor-pointer">{day}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {newRecurrence !== 'none' && (
                <div className="space-y-2"><Label>End Recurrence Date</Label><Input type="date" value={newRecurrenceEndDate} onChange={e => setNewRecurrenceEndDate(e.target.value)} /></div>
              )}
              <div className="space-y-2"><Label>Location</Label><Input placeholder="Where is it?" value={newLocation} onChange={e => setNewLocation(e.target.value)} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Optional details..." value={newDescription} onChange={e => setNewDescription(e.target.value)} /></div>
            </div>
            <DialogFooter><Button className="w-full rounded-xl h-11" onClick={handleCreateEvent}>Create Event</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-full p-1 h-12">
          <TabsTrigger value="list" className="rounded-full h-10">List View</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-full h-10">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="space-y-4 mt-4">
          {events.length > 0 ? events.map((event) => (
            <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime}>
              <Card className="overflow-hidden hover:border-primary transition-all duration-300 cursor-pointer group hover:shadow-lg border-none shadow-sm ring-1 ring-black/5">
                <div className="flex items-stretch">
                  <div className="bg-primary/5 w-16 flex flex-col items-center justify-center border-r shrink-0">
                    <span className="text-[10px] font-black uppercase text-primary tracking-tighter">{event.date.toLocaleString('default', { month: 'short' })}</span>
                    <span className="text-2xl font-black text-primary tracking-tighter">{event.date.getDate()}</span>
                  </div>
                  <div className="flex-1 p-4 space-y-2 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary truncate">{event.title}</h3>
                        {event.recurrence !== 'none' && <Repeat className="h-3 w-3 text-muted-foreground animate-pulse" />}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex flex-wrap gap-y-1 gap-x-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      <div className="flex items-center"><Clock className="h-3.5 w-3.5 mr-1.5 text-primary/50" />{event.startTime}</div>
                      {event.location && <div className="flex items-center truncate"><MapPin className="h-3.5 w-3.5 mr-1.5 text-primary/50" />{event.location}</div>}
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
