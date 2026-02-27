
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
import { useTeam, EventRecurrence } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';

export default function EventsPage() {
  const { activeTeam, events, addEvent, updateRSVP } = useTeam();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [mounted, setMounted] = useState(false);
  
  // New Event Form State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRecurrence, setNewRecurrence] = useState<EventRecurrence>('none');

  useEffect(() => {
    setMounted(true);
  }, []);

  const teamEvents = events.filter(e => e.teamId === activeTeam.id);

  const handleCreateEvent = () => {
    if (!newTitle || !newDate || !newTime) return;
    addEvent({
      title: newTitle,
      date: new Date(newDate),
      startTime: newTime,
      location: newLocation,
      description: newDescription,
      recurrence: newRecurrence
    });
    setIsCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDate('');
    setNewTime('');
    setNewLocation('');
    setNewDescription('');
    setNewRecurrence('none');
  };

  if (!mounted) {
    return <div className="p-10 text-center animate-pulse">Loading schedule...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Create Team Event</DialogTitle>
              <DialogDescription>Schedule a practice, game, or team outing.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input id="title" placeholder="e.g. Practice, Game Day" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={newRecurrence} onValueChange={(v: EventRecurrence) => setNewRecurrence(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Repeats..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time event</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" placeholder="Where is it?" value={newLocation} onChange={e => setNewLocation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Optional details..." value={newDescription} onChange={e => setNewDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={handleCreateEvent}>Create Event</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        
        <TabsContent value="list" className="space-y-4 mt-4">
          {teamEvents.length > 0 ? teamEvents.map((event) => (
            <Dialog key={event.id}>
              <DialogTrigger asChild>
                <Card className="overflow-hidden hover:border-primary transition-colors cursor-pointer group">
                  <div className="flex items-stretch">
                    <div className="bg-primary/5 w-16 flex flex-col items-center justify-center border-r shrink-0">
                      <span className="text-xs font-bold uppercase text-primary">
                        {event.date.toLocaleString('default', { month: 'short' })}
                      </span>
                      <span className="text-2xl font-black text-primary">
                        {event.date.getDate()}
                      </span>
                    </div>
                    <div className="flex-1 p-4 space-y-2 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors truncate">{event.title}</h3>
                          {event.recurrence !== 'none' && <Repeat className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex flex-wrap gap-y-1 gap-x-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="h-3.5 w-3.5 mr-1.5" />
                          {event.startTime}
                        </div>
                        {event.location && (
                          <div className="flex items-center truncate">
                            <MapPin className="h-3.5 w-3.5 mr-1.5" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                      <div className="pt-2 flex items-center gap-2">
                        {event.userRsvp && (
                          <Badge className={cn(
                            "text-[10px] font-bold uppercase tracking-wider h-5",
                            event.userRsvp === 'going' ? "bg-green-500" : event.userRsvp === 'maybe' ? "bg-amber-500" : "bg-red-500"
                          )}>
                            {event.userRsvp}
                          </Badge>
                        )}
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {event.rsvps.going} confirmed
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </DialogTrigger>
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
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Time</p>
                      <p className="text-sm text-muted-foreground">{event.startTime} - {event.endTime || 'Finish'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Location</p>
                      <p className="text-sm text-muted-foreground">{event.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                      <Info className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Description</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                    </div>
                  </div>
                  <div className="pt-4 grid grid-cols-3 gap-2">
                    <div className="text-center p-3 bg-green-50 rounded-xl">
                      <p className="text-xl font-black text-green-600">{event.rsvps.going}</p>
                      <p className="text-[10px] font-bold text-green-700 uppercase">Going</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-xl">
                      <p className="text-xl font-black text-muted-foreground">{event.rsvps.maybe}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Maybe</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-xl">
                      <p className="text-xl font-black text-red-600">{event.rsvps.notGoing}</p>
                      <p className="text-[10px] font-bold text-red-700 uppercase">No</p>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex gap-2 sm:flex-row flex-col">
                  <Button 
                    variant={event.userRsvp === 'notGoing' ? 'destructive' : 'outline'} 
                    className="flex-1"
                    onClick={() => updateRSVP(event.id, 'notGoing')}
                  >
                    Can't Go
                  </Button>
                  <Button 
                    variant={event.userRsvp === 'maybe' ? 'secondary' : 'outline'} 
                    className="flex-1"
                    onClick={() => updateRSVP(event.id, 'maybe')}
                  >
                    Maybe
                  </Button>
                  <Button 
                    className={cn("flex-1", event.userRsvp === 'going' ? "bg-green-600 hover:bg-green-700" : "")}
                    onClick={() => updateRSVP(event.id, 'going')}
                  >
                    {event.userRsvp === 'going' && <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Going
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )) : (
            <div className="text-center py-20 border-2 border-dashed rounded-2xl">
              <p className="text-muted-foreground italic">No events scheduled for {activeTeam.name}.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border mx-auto w-full"
              />
              <div className="mt-6 space-y-4">
                <h4 className="font-semibold text-sm text-muted-foreground px-1">Selected Date Details</h4>
                {teamEvents.filter(e => e.date.toDateString() === date?.toDateString()).length > 0 ? (
                  teamEvents.filter(e => e.date.toDateString() === date?.toDateString()).map(event => (
                    <div key={event.id} className="flex gap-4 items-center p-3 rounded-lg border bg-accent/30">
                      <div className="bg-primary text-white p-2 rounded-md h-fit">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{event.startTime} @ {event.location}</p>
                      </div>
                      <Button variant="outline" size="sm">View</Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-8 text-muted-foreground italic">No team events for this day.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
