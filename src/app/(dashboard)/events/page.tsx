
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Users, Plus, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Morning Practice',
    date: new Date(),
    startTime: '07:00 AM',
    endTime: '09:00 AM',
    location: 'Pitch 4, Central Park',
    description: 'Drills and tactical session.',
    rsvps: { going: 12, notGoing: 2, maybe: 4 }
  },
  {
    id: '2',
    title: 'Away Game vs. Titans',
    date: new Date(Date.now() + 86400000 * 2),
    startTime: '02:00 PM',
    location: 'Stadium East',
    description: 'Season semi-finals.',
    rsvps: { going: 18, notGoing: 1, maybe: 0 }
  }
];

export default function EventsPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [view, setView] = useState('list');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Team Event</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input id="title" placeholder="e.g. Practice, Game Day" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" placeholder="Where is it?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Optional details..." />
              </div>
              <Button className="w-full">Create Event</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list" className="w-full" onValueChange={setView}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        
        <TabsContent value="list" className="space-y-4 mt-4">
          {MOCK_EVENTS.map((event) => (
            <Card key={event.id} className="overflow-hidden hover:border-primary transition-colors cursor-pointer group">
              <div className="flex items-stretch">
                <div className="bg-primary/5 w-16 flex flex-col items-center justify-center border-r">
                  <span className="text-xs font-bold uppercase text-primary">
                    {event.date.toLocaleString('default', { month: 'short' })}
                  </span>
                  <span className="text-2xl font-black text-primary">
                    {event.date.getDate()}
                  </span>
                </div>
                <div className="flex-1 p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{event.title}</h3>
                    <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex flex-wrap gap-y-1 gap-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1.5" />
                      {event.startTime}
                    </div>
                    {event.location && (
                      <div className="flex items-center">
                        <MapPin className="h-3.5 w-3.5 mr-1.5" />
                        {event.location}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
                      {event.rsvps.going} Going
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {event.rsvps.maybe} Maybe
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
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
                {MOCK_EVENTS.filter(e => e.date.toDateString() === date?.toDateString()).length > 0 ? (
                  MOCK_EVENTS.filter(e => e.date.toDateString() === date?.toDateString()).map(event => (
                    <div key={event.id} className="flex gap-4 items-center p-3 rounded-lg border bg-accent/30">
                      <div className="bg-primary text-white p-2 rounded-md h-fit">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{event.startTime} @ {event.location}</p>
                      </div>
                      <Button variant="outline" size="sm">RSVP</Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-8 text-muted-foreground italic">No events scheduled for this day.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
