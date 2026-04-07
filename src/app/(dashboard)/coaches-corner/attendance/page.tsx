"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
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
  const [filterType, setFilterType] = useState<'all' | 'game' | 'practice'>('game');
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
          <div className="bg-white/50 p-1 rounded-2xl border-2 flex items-center shadow-sm">
             <Button 
               variant={filterType === 'game' ? 'default' : 'ghost'} 
               size="sm" 
               className="h-10 px-6 rounded-xl font-black text-[10px] uppercase transition-all"
               onClick={() => setFilterType('game')}
             >
               <Trophy className="h-3.5 w-3.5 mr-2" /> Games
             </Button>
             <Button 
               variant={filterType === 'practice' ? 'default' : 'ghost'} 
               size="sm" 
               className="h-10 px-6 rounded-xl font-black text-[10px] uppercase transition-all"
               onClick={() => setFilterType('practice')}
             >
               <Activity className="h-3.5 w-3.5 mr-2" /> Drills
             </Button>
          </div>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black uppercase tracking-tight">Team Attendance</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setSortBy(s => s === 'name' ? 'attendance' : 'name')}>
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </div>
        {athletesWithStats.map((athlete) => (
          <Card key={athlete.id} className="rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-4 flex items-center gap-4">
              <Avatar className="h-14 w-14 rounded-xl border-2 border-white shadow">
                <AvatarImage src={athlete.avatar} />
                <AvatarFallback className="font-black text-sm">{athlete.name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm uppercase truncate">{athlete.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{athlete.position || 'Recruit'}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-2xl font-black tracking-tighter", athlete.stats.rate > 80 ? "text-green-500" : athlete.stats.rate > 50 ? "text-amber-500" : "text-red-500")}>{Math.round(athlete.stats.rate)}%</p>
                <p className="text-[8px] text-muted-foreground uppercase tracking-widest">Attendance</p>
              </div>
            </div>
            <div className="h-1.5 bg-muted/20">
              <div className={cn("h-full transition-all", athlete.stats.rate > 80 ? "bg-green-500" : athlete.stats.rate > 50 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${athlete.stats.rate}%` }} />
            </div>
            <div className="p-3 bg-muted/10 grid grid-cols-4 gap-2 text-center">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-green-500">{athlete.stats.going}</p>
                <p className="text-[7px] text-muted-foreground uppercase">Going</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-amber-500">{athlete.stats.maybe}</p>
                <p className="text-[7px] text-muted-foreground uppercase">Maybe</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-red-500">{athlete.stats.declined}</p>
                <p className="text-[7px] text-muted-foreground uppercase">Declined</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground">{athlete.stats.noResponse}</p>
                <p className="text-[7px] text-muted-foreground uppercase">No RSP</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Global Intelligence Export */}
      <div className="flex justify-center">
        <Button 
          variant="outline" 
          className="rounded-[2rem] border-2 h-16 px-10 font-black uppercase text-xs tracking-[0.2em] shadow-xl group overflow-hidden relative"
          onClick={() => {
            toast({ title: "Module Locked", description: "Export capabilities coming in next tactical update." });
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
