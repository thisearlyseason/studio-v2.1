
"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Trophy,
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
  Loader2,
  Dumbbell,
  Package,
  Calendar as CalendarIcon
} from 'lucide-react';
import { AnimatedScore } from '@/components/ui/animated-score';
import { 
  Dialog, 
  DialogClose,
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTeam, TeamEvent, EventType, Member, EventAssignment, TournamentGame } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isPast, isSameDay, startOfDay, parseISO } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { downloadICS } from '@/lib/calendar-utils';
import { WeatherPulse } from '@/components/WeatherPulse';
import { EventDetailDialog, formatDateRange, formatDayRange } from './EventDetailDialog';

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  game: 'bg-primary border-primary text-white',
  practice: 'bg-emerald-600 border-emerald-600 text-white',
  meeting: 'bg-amber-500 border-amber-500 text-white',
  tournament: 'bg-black border-black text-white',
  other: 'bg-slate-600 border-slate-600 text-white',
};



export default function EventsPage() {
  const { activeTeam, activeTeamEvents, updateRSVP, isSuperAdmin, isStaff, addEvent, updateEvent, deleteEvent, members, createAlert } = useTeam();
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
  const [opponent, setOpponent] = useState('');
  const [assignments, setAssignments] = useState<{ id: string; title: string, assigneeId: string | null, assigneeName?: string | null }[]>([]);
  const [selectedDrillIds, setSelectedDrillIds] = useState<string[]>([]);

  const db = useFirestore();
  const drillsQuery = useMemoFirebase(() => (activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'drills'), orderBy('title', 'asc')) : null, [activeTeam?.id, db]);
  const { data: teamDrills } = useCollection(drillsQuery);

  const addAssignmentField = () => {
    setAssignments([...assignments, { id: `as_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, title: '', assigneeId: null }]);
  };

  const updateAssignmentField = (id: string, updates: any) => {
    setAssignments(assignments.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const removeAssignmentField = (id: string) => {
    setAssignments(assignments.filter(a => a.id !== id));
  };

  const filteredEvents = useMemo(() => { 
    const nowStart = startOfDay(new Date()); 
    const baseList = activeTeamEvents || []; 

    // TACTICAL EXPANSION: Flatten tournaments into individual match entries for the itinerary
    const expandedList: TeamEvent[] = [];
    
    baseList.forEach(event => {
      // 1. Add the main event entry (Tournament or individual activity)
      expandedList.push(event);
      
      // 2. If it's a tournament with games, extract individual game entries
      if (event.isTournament && event.tournamentGames && event.tournamentGames.length > 0) {
        event.tournamentGames.forEach((game: any, idx: number) => {
          if (!game.date) return;
          
          // CRITICAL FILTER: Only show games that the active team is actually playing in
          const isMyGame = activeTeam && (
            game.team1Id === activeTeam.id || 
            game.team2Id === activeTeam.id || 
            game.team1 === activeTeam.teamName || 
            game.team2 === activeTeam.teamName ||
            game.team1 === activeTeam.name ||
            game.team2 === activeTeam.name
          );

          if (!isMyGame) return;
          
          // TACTICAL FILTER: Skip placeholder/TBD matches in the itinerary stream
          const isTBD = (game.team1 || '').toLowerCase().includes('tbd') || (game.team2 || '').toLowerCase().includes('tbd');
          if (isTBD) return;
          
          // Synthesize a match event entry
          expandedList.push({
            ...event,
            id: game.id || `${event.id}_match_${idx}`,
            title: `[Match] ${game.team1} vs ${game.team2}`,
            date: game.date,
            endDate: game.date,
            startTime: game.time,
            location: game.location || event.location,
            eventType: 'tournament', // Force 'tournament' type for black match styling
            isTournamentMatch: true,
            parentTournamentId: event.id
          } as any);
        });
      }
    });

    if (filterMode === 'live') {
      return expandedList
        .filter(e => {
          const eventEnd = startOfDay(new Date(e.endDate || e.date));
          return eventEnd >= nowStart;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    
    // History mode: Show past events and games, sorted most recent first
    return expandedList
      .filter(e => {
        const eventEnd = startOfDay(new Date(e.endDate || e.date));
        return eventEnd < nowStart;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); 
  }, [activeTeamEvents, filterMode]);

  const handleCreateEvent = async () => { 
    if (!newTitle || !newDate || !newTime) return;
    try {
      const payload: any = { 
        title: newTitle, eventType, 
        date: new Date(newDate).toISOString(), 
        endDate: newEndDate ? new Date(newEndDate).toISOString() : new Date(newDate).toISOString(),
        startTime: newTime, location: newLocation, description: newDescription,
        opponent: eventType === 'game' ? opponent : '',
        assignments: assignments.map(a => ({
          ...a,
          status: a.assigneeId ? 'claimed' : 'open'
        })),
        drillIds: eventType === 'practice' ? selectedDrillIds : []
      }; 
      const success = editingEvent ? await updateEvent(editingEvent.id, payload) : await addEvent(payload); 
      
      if (success) {
        // Notify new assignees
        const currentAssignments = editingEvent?.assignments || [];
        for (const task of assignments) {
          if (task.assigneeId) {
            const wasAlreadyAssigned = currentAssignments.some(a => a.id === task.id && a.assigneeId === task.assigneeId);
            if (!wasAlreadyAssigned) {
              await createAlert(
                "New Task Assigned",
                `You have been assigned to: ${task.title} for ${newTitle || payload.title}`,
                task.assigneeId as any
              );
            }
          }
        }
        
        setIsCreateOpen(false); 
        resetForm(); 
      }
    } catch (e) { toast({ title: "Deployment Error", variant: "destructive" }); }
  };

  const resetForm = () => {
    setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setEventType('game'); setOpponent(''); setEditingEvent(null); setAssignments([]); setSelectedDrillIds([]);
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
    setAssignments(event.assignments || []);
    setOpponent(event.opponent || '');
    setSelectedDrillIds(event.drillIds || []);
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
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Squad Match vs Tigers" className="h-12 rounded-xl font-bold border-2" />
                </div>
                {eventType === 'game' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Opponent / Competitor</Label>
                    <Input value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="e.g. Tigers Squad" className="h-12 rounded-xl font-black border-2 border-primary/20 bg-primary/5 focus:bg-white transition-all capitalize" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                           "h-12 w-full justify-start text-left font-black rounded-xl border-2 px-4 italic uppercase tracking-tight bg-white hover:bg-muted/50 transition-all text-[10px]",
                            !newDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-primary shrink-0" />
                          {newDate ? format(parseISO(newDate), "MMM dd, yyyy") : <span>Pick Date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white" align="start">
                        <Calendar
                          mode="single"
                          selected={newDate ? new Date(newDate) : undefined}
                          onSelect={(date) => setNewDate(date ? format(date, "yyyy-MM-dd") : '')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date (Opt)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                           "h-12 w-full justify-start text-left font-black rounded-xl border-2 px-4 italic uppercase tracking-tight bg-white hover:bg-muted/50 transition-all text-[10px]",
                            !newEndDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 text-primary shrink-0" />
                          {newEndDate ? format(parseISO(newEndDate), "MMM dd, yyyy") : <span>Pick Date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-[2rem] overflow-hidden bg-white" align="start">
                        <Calendar
                          mode="single"
                          selected={newEndDate ? new Date(newEndDate) : undefined}
                          onSelect={(date) => setNewEndDate(date ? format(date, "yyyy-MM-dd") : '')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Time *</Label><Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl border-2 font-black px-4 pr-10" />
                </div>
              </div>
            </div>
            <div className="flex-1 p-10 space-y-6 bg-white">
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Location</Label><Input value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl border-2 font-bold" /></div>
              <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase ml-1">Event Brief</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[100px] border-2 font-medium" /></div>
              
              {eventType === 'practice' && (
                <div className="pt-6 border-t space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Tactical Plan (Drills)</Label>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase ml-1">Select institutional drills to include in this practice</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto p-2 border-2 border-dashed rounded-2xl bg-muted/20 custom-scrollbar">
                    {teamDrills && teamDrills.length > 0 ? teamDrills.map((drill: any) => {
                      const isSelected = selectedDrillIds.includes(drill.id);
                      return (
                        <div 
                          key={drill.id} 
                          onClick={() => setSelectedDrillIds(prev => isSelected ? prev.filter(id => id !== drill.id) : [...prev, drill.id])}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                            isSelected ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-transparent hover:border-primary/30"
                          )}
                        >
                          <Dumbbell className={cn("h-4 w-4 shrink-0", isSelected ? "text-white" : "text-primary")} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase truncate">{drill.title}</p>
                            <p className={cn("text-[8px] font-bold uppercase opacity-60", isSelected ? "text-white" : "text-muted-foreground")}>{drill.category || 'Skill'}</p>
                          </div>
                          {isSelected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                        </div>
                      );
                    }) : (
                      <div className="col-span-full py-10 text-center opacity-30 italic text-[9px] font-black uppercase tracking-widest">
                        Your Playbook is empty. <br/> Import drills first.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Logistics Assignments</Label>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase ml-1">Deploy tasks to squad members or volunteers</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addAssignmentField} className="rounded-xl h-9 px-4 font-black uppercase text-[9px] border-2">+ Add Task</Button>
                </div>

                <div className="space-y-3">
                  {assignments.map((as, idx) => (
                    <div key={as.id} className="p-4 bg-muted/20 rounded-2xl border-2 border-dashed space-y-3 animate-in slide-in-from-right-2 duration-300">
                      <div className="flex items-center gap-3">
                        <Input 
                          placeholder="Task Title (e.g. Bring Hydration)" 
                          value={as.title} 
                          onChange={e => updateAssignmentField(as.id, { title: e.target.value })}
                          className="h-10 rounded-xl font-bold bg-white text-[11px]"
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeAssignmentField(as.id)} className="h-10 w-10 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1/2">
                          <Select 
                            value={as.assigneeId || 'open'} 
                            onValueChange={(v) => {
                              if (v === 'open') {
                                updateAssignmentField(as.id, { assigneeId: null, assigneeName: null });
                              } else {
                                const m = members.find(m => m.userId === v || m.id === v);
                                updateAssignmentField(as.id, { assigneeId: v, assigneeName: m?.name || 'Selected Member' });
                              }
                            }}
                          >
                            <SelectTrigger className="h-9 rounded-lg bg-white text-[10px] font-bold">
                              <SelectValue placeholder="Assign To" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="open" className="text-[10px] font-bold uppercase">Open for Pickup</SelectItem>
                              {members.map(m => (
                                <SelectItem key={m.id} value={m.userId || m.id} className="text-[10px] font-bold">{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[9px] font-black uppercase opacity-40 italic">
                          {as.assigneeId ? 'Pre-Assigned' : 'Volunteer Requested'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {assignments.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed rounded-2xl opacity-30 italic text-[9px] font-black uppercase tracking-widest">
                      No logistics tasks defined.
                    </div>
                  )}
                </div>
              </div>
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
                    <span className="text-3xl lg:text-4xl font-black tracking-tighter leading-none">{formatDayRange(event.date, event.endDate)}</span>
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
                          {(event as any).isTournamentMatch && (
                            <Badge className="text-[7px] uppercase font-black bg-amber-500 text-white border-none">Tournament Match</Badge>
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
