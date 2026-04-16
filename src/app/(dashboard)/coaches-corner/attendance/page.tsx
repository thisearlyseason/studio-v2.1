"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  ChevronRight,
  MapPin, 
  Clock, 
  Filter, 
  Search, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Users, 
  Calendar,
  Trophy,
  ArrowUpDown,
  Download,
  AlertCircle,
  Loader2,
  MoreVertical,
  Activity,
  UserPlus,
  History as HistoryIcon,
  Zap
} from 'lucide-react';
import { format, isBefore, startOfDay } from 'date-fns';
import { useTeam, TeamEvent, Member } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent,
  DialogTitle
} from '@/components/ui/dialog';

const RSVP_STATUSES = [
  { id: 'going', label: 'Going', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  { id: 'maybe', label: 'Maybe', icon: HelpCircle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'declined', label: 'Declined', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'no_response', label: 'No Response', icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted/10' }
];

export default function AttendanceTrackingPage() {
  const router = useRouter();
  const { members, activeTeamEvents, activeTeam, updateRSVP, isStaff } = useTeam();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'attendance'>('name');
  const [filterType, setFilterType] = useState<'all' | 'game' | 'practice'>('all');
  type AthleteWithStats = Member & {
    stats: {
      going: number;
      maybe: number;
      declined: number;
      noResponse: number;
      rate: number;
    }
  };

  const [selectedAthlete, setSelectedAthlete] = useState<AthleteWithStats | null>(null);
  const [includePast, setIncludePast] = useState(false);

  // Tactical data pipeline: Filter events to games only (or all if selected) and sort by proximity
  const trackedEvents = useMemo(() => {
    if (!activeTeamEvents) return [];
    
    let filtered = activeTeamEvents;
    
    if (filterType !== 'all') {
      filtered = filtered.filter(e => e.eventType === filterType);
    }
    
    if (!includePast) {
      filtered = filtered.filter(e => !isBefore(new Date(e.date), startOfDay(new Date())));
    }
    
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeTeamEvents, filterType, includePast]);

  // Player roster pipeline
  const athletes = useMemo(() => {
    const coachPositions = ['Coach', 'Assistant Coach', 'Manager', 'Staff', 'Athletic Director'];
    return members.filter(m => !coachPositions.includes(m.position))
      .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, searchTerm]);

  // Attendance analytics pipeline
  const athletesWithStats = useMemo(() => {
    return athletes.map(athlete => {
      let going = 0, maybe = 0, declined = 0, noResponse = 0;
      
      trackedEvents.forEach(event => {
        const rsvp = event.userRsvps?.[athlete.id] || 'no_response';
        if (rsvp === 'going') going++;
        else if (rsvp === 'maybe') maybe++;
        else if (rsvp === 'declined' || rsvp === 'no') declined++;
        else noResponse++;
      });
      
      const total = trackedEvents.length;
      const rate = total > 0 ? (going / total) * 100 : 0;
      
      return { ...athlete, stats: { going, maybe, declined, noResponse, rate } };
    }).sort((a, b) => {
      if (sortBy === 'attendance') return b.stats.rate - a.stats.rate;
      return a.name.localeCompare(b.name);
    });
  }, [athletes, trackedEvents, sortBy]);

  const handleOverrideRSVP = async (athleteId: string, eventId: string, status: string) => {
    try {
      await updateRSVP(eventId, status, activeTeam?.id, athleteId);
      toast({ 
        title: "Override Successful", 
        description: `Manual RSVP updated for ${athletes.find(a => a.id === athleteId)?.name}.` 
      });
    } catch (error) {
      toast({ 
        title: "Command Failed", 
        description: "Failed to override attendance signature.", 
        variant: "destructive" 
      });
    }
  };

  if (!isStaff) return null; // Component level access check

  return (
    <div className="space-y-10 pb-32 animate-in fade-in duration-700">
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 bg-muted/50 hover:bg-white shadow-sm ring-1 ring-black/5" onClick={() => router.back()}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Attendance Intel</Badge>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <h1 className="text-4xl font-black uppercase tracking-tighter text-foreground mt-1">RSVP Matrix</h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            className={cn("h-10 px-4 rounded-xl font-black text-[10px] uppercase transition-all tracking-widest", includePast ? "bg-primary text-white border-none shadow-lg" : "bg-white/50")}
            onClick={() => setIncludePast(!includePast)}
          >
            <HistoryIcon className="h-4 w-4 mr-2" />
            {includePast ? "Hide History" : "Show History"}
          </Button>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              placeholder="Filter roster..." 
              className="h-12 w-[240px] pl-11 rounded-[1.25rem] border-2 font-black text-xs uppercase"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white/50">
                <Filter className="h-4 w-4 mr-2" />
                {filterType === 'all' ? 'All Activities' : filterType === 'game' ? 'Games Only' : 'Drills Only'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl border-none shadow-2xl p-2 min-w-[150px]">
              <DropdownMenuItem onClick={() => setFilterType('all')} className="rounded-xl font-black text-[10px] uppercase px-3 h-10 cursor-pointer">All Feed</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterType('game')} className="rounded-xl font-black text-[10px] uppercase px-3 h-10 cursor-pointer">Games</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterType('practice')} className="rounded-xl font-black text-[10px] uppercase px-3 h-10 cursor-pointer">Practices</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700">
            <Trophy className="h-32 w-32" />
          </div>
          <div className="relative z-10 space-y-2">
            <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">Total Events</p>
            <p className="text-5xl font-black tracking-tighter leading-none italic">{trackedEvents.length}</p>
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest pt-2">Active Intelligence Log</p>
          </div>
        </Card>

        {RSVP_STATUSES.slice(0, 3).map(status => {
          const total = trackedEvents.length * athletes.length;
          const count = athletesWithStats.reduce((acc, a) => acc + (a.stats[status.id === 'going' ? 'going' : status.id === 'maybe' ? 'maybe' : 'declined'] || 0), 0);
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          const Icon = status.icon;

          return (
            <Card key={status.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-4 ring-1 ring-black/5 hover:ring-primary/20 transition-all">
              <div className="flex items-center justify-between">
                <div className={cn("p-3 rounded-2xl bg-muted/30", status.color)}><Icon className="h-6 w-6" /></div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none mb-1">{status.label}</p>
                  <p className="text-2xl font-black tracking-tighter text-foreground">{count}</p>
                </div>
              </div>
              <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                <div className={cn("h-full transition-all duration-1000", status.id === 'going' ? 'bg-green-500' : status.id === 'maybe' ? 'bg-amber-400' : 'bg-red-500')} style={{ width: `${percent}%` }} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Main Matrix Vault - Desktop Table */}
      <Card className="hidden md:block rounded-[3rem] border-none shadow-2xl bg-white overflow-hidden ring-1 ring-black/5 mx-auto max-w-full lg:max-w-6xl">
        <div className="p-0 border-none relative">
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-primary/10 bg-muted/20">
                    <th className="p-6 text-left sticky left-0 bg-white z-30 w-[240px] shadow-[10px_0_15px_-10px_rgba(0,0,0,0.1)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <Users className="h-3 w-3 text-primary" />
                           <span className="text-[10px] font-black uppercase text-primary tracking-widest">Team Deployment</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setSortBy(s => s === 'name' ? 'attendance' : 'name')}>
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </th>
                    {trackedEvents.map((event, idx) => (
                      <th key={event.id} className="p-6 text-center w-[280px] border-l border-primary/5">
                        <div className="space-y-2">
                          <div className="flex justify-center">
                             <Badge variant="outline" className={cn("text-[7px] font-black uppercase px-2 h-4 border-none text-white", event.eventType === 'game' ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-emerald-600 shadow-lg shadow-emerald-600/20')}>{event.eventType}</Badge>
                          </div>
                          <h4 className="font-black text-xs uppercase italic tracking-tighter truncate leading-none max-w-[200px] mx-auto">{event.title}</h4>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">{format(new Date(event.date), 'MMM dd')}</p>
                        </div>
                      </th>
                    ))}
                    <th className="p-6 text-center w-[120px] bg-muted/30 border-l-2 border-primary/10 sticky right-0 z-20 backdrop-blur-sm shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">
                       <span className="text-[10px] font-black uppercase text-primary tracking-widest italic leading-none">Squad<br/>Impact</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {athletesWithStats.map((athlete) => (
                    <tr key={athlete.id} className="group hover:bg-muted/5 transition-all">
                      <td className="p-6 sticky left-0 bg-white group-hover:bg-muted/5 z-20 transition-all border-r border-primary/5 shadow-[10px_0_15px_-10px_rgba(0,0,0,0.1)]">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12 rounded-2xl border-2 border-white ring-4 ring-primary/5 shadow-lg group-hover:scale-105 transition-transform">
                            <AvatarImage src={athlete.avatar} />
                            <AvatarFallback className="font-black text-sm">{athlete.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-black text-xs uppercase leading-none truncate mb-1.5">{athlete.name}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[7px] font-black uppercase px-1.5 h-4 border-muted-foreground/20 text-muted-foreground">#{athlete.jersey || '00'}</Badge>
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate max-w-[80px]">{athlete.position || 'Recruit'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      {trackedEvents.map((event) => {
                        const rsvp = event.userRsvps?.[athlete.id] || 'no_response';
                        const statusObj = RSVP_STATUSES.find(s => {
                           if (s.id === 'declined' && rsvp === 'no') return true;
                           return s.id === rsvp;
                        }) || RSVP_STATUSES[3];
                        const Icon = statusObj.icon;

                        return (
                          <td key={event.id} className="p-4 text-center border-l border-primary/5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className={cn(
                                  "w-[240px] h-[60px] mx-auto rounded-2xl flex flex-col items-center justify-center gap-1.5 border-2 border-transparent transition-all hover:bg-white hover:shadow-xl hover:border-primary/20 hover:scale-[1.02] active:scale-95 group/cell px-4",
                                  statusObj.bg
                                )}>
                                  <div className="flex items-center gap-2">
                                    <Icon className={cn("h-4 w-4 transition-transform group-hover/cell:scale-110", statusObj.color)} />
                                    <span className={cn("text-[9px] font-black uppercase tracking-widest", statusObj.color)}>{statusObj.label}</span>
                                  </div>
                                  <div className="w-12 h-0.5 rounded-full bg-current opacity-20" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="rounded-2xl border-none shadow-2xl p-2 min-w-[180px]">
                                <DropdownMenuLabel className="text-[9px] font-black uppercase text-muted-foreground px-3 mb-2 tracking-widest flex items-center gap-2">
                                  <Zap className="h-3 w-3 text-primary" /> Tactical Override
                                </DropdownMenuLabel>
                                {RSVP_STATUSES.slice(0, 3).map(s => {
                                   const SIcon = s.icon;
                                   return (
                                     <DropdownMenuItem key={s.id} onClick={() => handleOverrideRSVP(athlete.id, event.id, s.id)} className="rounded-xl font-black text-[10px] uppercase px-3 h-11 gap-3 cursor-pointer">
                                       <div className={cn("p-1.5 rounded-lg", s.bg)}>
                                         <SIcon className={cn("h-3.5 w-3.5", s.color)} />
                                       </div>
                                       {s.label}
                                     </DropdownMenuItem>
                                   );
                                })}
                                <DropdownMenuSeparator className="bg-primary/5 mx-2 my-2" />
                                <DropdownMenuItem onClick={() => handleOverrideRSVP(athlete.id, event.id, 'no_response')} className="rounded-xl font-black text-[10px] uppercase px-3 h-11 gap-3 cursor-pointer text-muted-foreground opacity-60">
                                   <div className="p-1.5 rounded-lg bg-muted">
                                     <AlertCircle className="h-3.5 w-3.5" />
                                   </div>
                                   Reset Intel
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        );
                      })}

                      <td className="p-6 text-center bg-muted/10 border-l-2 border-primary/10 sticky right-0 z-10 backdrop-blur-sm shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">
                         <div className="space-y-2">
                            <p className="text-xl font-black tracking-tighter text-foreground leading-none">{Math.round(athlete.stats.rate)}%</p>
                            <div className="flex items-center gap-1 justify-center">
                               <div className="h-1.5 w-12 rounded-full bg-muted/50 overflow-hidden">
                                  <div className={cn("h-full transition-all duration-1000", athlete.stats.rate > 80 ? "bg-green-500" : athlete.stats.rate > 50 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${athlete.stats.rate}%` }} />
                               </div>
                            </div>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" className="h-2.5 bg-primary/5" />
          </ScrollArea>
        </div>
      </Card>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Squad Readiness</h3>
          <Button variant="ghost" size="sm" className="h-8 rounded-lg font-black text-[10px] uppercase" onClick={() => setSortBy(s => s === 'name' ? 'attendance' : 'name')}>
            <ArrowUpDown className="h-3 w-3 mr-2" /> {sortBy}
          </Button>
        </div>
        {athletesWithStats.map((athlete) => {
          const nextEvent = trackedEvents[0];
          const rsvp = nextEvent?.userRsvps?.[athlete.id] || 'no_response';
          const statusObj = RSVP_STATUSES.find(s => (s.id === 'declined' && rsvp === 'no') || s.id === rsvp) || RSVP_STATUSES[3];
          
          return (
            <Card 
              key={athlete.id} 
              className="rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white active:scale-95 transition-all"
              onClick={() => setSelectedAthlete(athlete)}
            >
              <div className="p-5 flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-14 w-14 rounded-2xl border-2 border-white shadow-lg">
                    <AvatarImage src={athlete.avatar} />
                    <AvatarFallback className="font-black text-sm">{athlete.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className={cn("absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center", statusObj.bg)}>
                    <statusObj.icon className={cn("h-3 w-3", statusObj.color)} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm uppercase truncate leading-none mb-1">{athlete.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-2 h-5 border-none shadow-sm", statusObj.bg, statusObj.color)}>
                      {statusObj.label === 'No Response' ? 'PENDING' : statusObj.label.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-2xl font-black tracking-tighter leading-none", athlete.stats.rate > 80 ? "text-green-500" : athlete.stats.rate > 50 ? "text-amber-500" : "text-red-500")}>
                    {Math.round(athlete.stats.rate)}%
                  </p>
                  <p className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest mt-1">Impact</p>
                </div>
              </div>
              {nextEvent && (
                <div className="px-5 pb-5 pt-0">
                  <div className="bg-muted/30 rounded-2xl p-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-sm"><Calendar className="h-3.5 w-3.5 text-primary" /></div>
                      <div className="min-w-0">
                        <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] leading-none mb-1">Next Deployment</p>
                        <p className="text-[10px] font-black uppercase truncate max-w-[150px]">{nextEvent.title}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-active:translate-x-1 transition-all" />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Athlete History Dialog */}
      <Dialog open={!!selectedAthlete} onOpenChange={(open: boolean) => !open && setSelectedAthlete(null)}>
        <DialogContent className="sm:max-w-2xl p-0 sm:rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden flex flex-col max-h-[90vh]">
          <DialogTitle className="sr-only">Athlete Attendance History</DialogTitle>
          {selectedAthlete && (
            <>
              <div className="p-8 bg-black text-white relative flex items-center gap-6 overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none">
                  <HistoryIcon className="h-32 w-32" />
                </div>
                <Avatar className="h-20 w-20 rounded-[2rem] border-2 border-primary ring-4 ring-primary/20">
                  <AvatarImage src={selectedAthlete.avatar} />
                  <AvatarFallback className="text-xl font-black">{selectedAthlete.name[0]}</AvatarFallback>
                </Avatar>
                <div className="relative z-10">
                  <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em] mb-1">Combat History</p>
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter">{selectedAthlete.name}</h2>
                  <div className="flex items-center gap-4 mt-2">
                    <Badge className="bg-white/10 text-white border-white/20 font-black uppercase text-[9px]">#{selectedAthlete.jersey || '00'}</Badge>
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">{selectedAthlete.position}</span>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 p-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    {RSVP_STATUSES.map(status => {
                      const count = selectedAthlete.stats[status.id === 'going' ? 'going' : status.id === 'maybe' ? 'maybe' : status.id === 'declined' ? 'declined' : 'noResponse'];
                      return (
                        <div key={status.id} className="text-center p-4 bg-muted/20 rounded-2xl border-2 border-dashed">
                          <p className={cn("text-xl font-black leading-none mb-1", status.color)}>{count}</p>
                          <p className="text-[7px] font-black uppercase text-muted-foreground tracking-widest">{status.label === 'No Response' ? 'Pending' : status.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="space-y-4 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Deployment Records</p>
                    <div className="space-y-3">
                      {trackedEvents.map(event => {
                        const rsvp = event.userRsvps?.[selectedAthlete.id] || 'no_response';
                        const statusObj = RSVP_STATUSES.find(s => (s.id === 'declined' && rsvp === 'no') || s.id === rsvp) || RSVP_STATUSES[3];
                        return (
                          <div key={event.id} className="flex items-center justify-between p-4 rounded-2xl border-2 border-muted/50 bg-white group hover:border-primary/20 transition-all">
                            <div className="flex items-center gap-4">
                              <div className={cn("p-2 rounded-xl", statusObj.bg)}>
                                <statusObj.icon className={cn("h-4 w-4", statusObj.color)} />
                              </div>
                              <div>
                                <p className="text-[11px] font-black uppercase leading-none mb-1">{event.title}</p>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase">{format(new Date(event.date), 'MMM dd, yyyy')}</p>
                              </div>
                            </div>
                            <Badge className={cn("text-[8px] font-black uppercase border-none px-3 h-6", statusObj.bg, statusObj.color)}>
                              {statusObj.label === 'No Response' ? 'PENDING' : statusObj.label.toUpperCase()}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <div className="p-6 border-t bg-muted/10 flex justify-end">
                <Button className="rounded-xl font-black uppercase text-[10px] h-10 px-8" onClick={() => setSelectedAthlete(null)}>Close Intel</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Global Intelligence Export */}
      <div className="flex justify-center">
        <Button 
          variant="outline" 
          className="rounded-[2rem] border-2 h-16 px-10 font-black uppercase text-xs tracking-[0.2em] shadow-xl group overflow-hidden relative"
          onClick={() => {
            const getCSVData = () => {
              const headers = ['Athlete', 'Jersey', 'Position', 'Attendance Rate', ...trackedEvents.map(e => `"${e.title}"`)];
              const rows = athletesWithStats.map(a => {
                 return [
                   `"${a.name}"`, 
                   `"${a.jersey || ''}"`, 
                   `"${a.position || ''}"`, 
                   `"${Math.round(a.stats.rate)}%"`, 
                   ...trackedEvents.map(e => {
                      const rsvp = e.userRsvps?.[a.id] || 'no_response';
                      const status = RSVP_STATUSES.find(s => (s.id === 'declined' && rsvp === 'no') || s.id === rsvp) || RSVP_STATUSES[3];
                      return `"${status.label}"`;
                   })
                 ].join(',');
              });
              return [headers.join(','), ...rows].join('\n');
            };
            
            const blob = new Blob([getCSVData()], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `squad_attendance_audit_${format(new Date(), 'yyyy_MM_dd')}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Export Initiated', description: 'Attendance matrix downloading to local drive.' });
          }}
        >
          <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
          <Download className="h-4 w-4 mr-3 text-primary group-hover:animate-bounce" />
          Export Audit Log
        </Button>
      </div>

      {!activeTeamEvents && (
        <div className="py-20 text-center space-y-6 opacity-40 italic border-4 border-dashed rounded-[4rem]">
          <Loader2 className="h-16 w-16 mx-auto animate-spin" />
          <p className="text-xl font-black uppercase tracking-widest">Syncing Matrix...</p>
        </div>
      )}
      
      {trackedEvents.length === 0 && activeTeamEvents && (
        <div className="py-32 text-center space-y-4 opacity-40 bg-muted/10 rounded-[4rem] border-4 border-dashed mx-auto max-w-2xl">
          <Calendar className="h-20 w-20 mx-auto" />
          <div>
            <h3 className="text-2xl font-black uppercase">No Intel Found</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-2">{includePast ? "Select a valid event filter." : "No upcoming events matched the current filter criteria."}</p>
          </div>
          <Button variant="outline" className="rounded-xl font-black uppercase text-[10px] h-10 px-6 border-2 mt-4" onClick={() => setIncludePast(true)}>
             Scan Historical Records
          </Button>
        </div>
      )}
    </div>
  );
}
