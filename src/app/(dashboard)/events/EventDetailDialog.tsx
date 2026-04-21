"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  X, 
  Zap, 
  CalendarDays, 
  Clock, 
  MapPin, 
  Plus, 
  Download, 
  Trash2, 
  Users,
  Dumbbell,
  Play,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Dialog, 
  DialogClose,
  DialogContent, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTeam, TeamEvent, Member, TournamentGame } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { format, isSameDay, parseISO } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';

export const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = typeof start === 'string' ? (start.includes('T') ? parseISO(start) : new Date(start.replace(/-/g, '/'))) : start;
  if (!end) return format(startDate, 'MMM dd');
  const endDate = typeof end === 'string' ? (end.includes('T') ? parseISO(end) : new Date(end.replace(/-/g, '/'))) : end;
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`;
  }
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

export const formatDayRange = (start: string | Date, end?: string | Date) => {
  const startDate = typeof start === 'string' ? (start.includes('T') ? parseISO(start) : new Date(start.replace(/-/g, '/'))) : start;
  if (!end) return format(startDate, 'd');
  const endDate = typeof end === 'string' ? (end.includes('T') ? parseISO(end) : new Date(end.replace(/-/g, '/'))) : end;
  if (isSameDay(startDate, endDate)) return format(startDate, 'd');
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'd')}-${format(endDate, 'd')}`;
  }
  return format(startDate, 'd'); // Spans months, keep it simple for the box
};

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (eventId: string, status: string, teamId?: string, userId?: string) => Promise<void>;
  isAdmin: boolean;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  children: React.ReactNode;
  members: Member[];
}

export function EventDetailDialog({ 
  event, 
  updateRSVP, 
  isAdmin, 
  onEdit, 
  onDelete, 
  children, 
  members 
}: EventDetailDialogProps) {
  const { user, exportAttendanceCSV, myChildren, isParent, isPlayer, teams, getMember, games, isStaff, claimAssignment, activeTeam } = useTeam();
  const router = useRouter();
  const db = useFirestore();

  const drillsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db || !event.drillIds?.length) return null;
    // Note: 'in' query limited to 30 items
    return query(collection(db, 'teams', activeTeam.id, 'drills'), where('__name__', 'in', event.drillIds.slice(0, 30)));
  }, [activeTeam?.id, db, event.drillIds]);
  const { data: eventDrills, isLoading: isDrillsLoading } = useCollection(drillsQuery);
  
  const linkedGame = useMemo(() => {
    if (event.eventType !== 'game') return null;
    return games.find(g => g.eventId === event.id);
  }, [games, event.id, event.eventType]);
  
  const team = teams.find(t => t.id === event.teamId);
  const relevantParticipants = [
    ...(isParent && !isPlayer ? [] : [{ id: user?.id, name: 'You' }]),
    ...(isParent ? (myChildren || []).filter(c => c.joinedTeamIds?.includes(event.teamId || '')).map(c => ({ id: c.id, name: c.firstName })) : [])
  ];

  const attendees = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
    const member = getMember(uid);
    return { name: member?.name || 'Unknown', status, avatar: member?.avatar, position: member?.position };
  });

  const gamesByDay = useMemo(() => {
     if (!event.tournamentGames) return {};
     const grouped = event.tournamentGames.reduce((acc: any, game: TournamentGame) => {
       const day = game.date;
       if (!acc[day]) acc[day] = [];
       acc[day].push(game);
       return acc;
     }, {});
     
     return Object.fromEntries(
       Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
     );
  }, [event.tournamentGames]);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-4xl w-[95vw] sm:w-[100vw] p-0 sm:rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white text-foreground max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Event Intelligence: {event.title}</DialogTitle>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-black/5 hover:bg-black/10 text-black/40 hover:text-black transition-all">
            <X className="h-5 w-5" />
          </Button>
        </DialogClose>
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto w-full">
          {/* LEFT PANEL: ELITE STATUS & RSVP */}
          <div className="w-full lg:w-2/5 flex flex-col text-white bg-black p-8 relative shrink-0">
            <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none">
              <Zap className="h-48 w-48" />
            </div>
            
            <div className="space-y-6 relative z-10 overflow-visible flex flex-col">
              <div className="flex gap-2 mb-4">
                <Badge className="uppercase font-black tracking-widest text-[9px] h-6 px-3 bg-primary text-white border-none">{(event.eventType || 'other').toUpperCase()}</Badge>
                {event.isLeagueGame && (
                  <Badge className={cn("uppercase font-black tracking-widest text-[9px] h-6 px-3 border-none", event.isHome ? "bg-white text-black" : "bg-primary/20 text-white")}>
                    {event.isHome ? 'HOME' : 'AWAY'}
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em]">{team?.name || 'SQUAD OPERATIONS'}</p>
                <h2 className="text-4xl font-black tracking-tighter leading-tight uppercase italic">{event.title}</h2>
              </div>

              <div className="bg-white/5 p-5 rounded-[2rem] border border-white/10 space-y-4 font-bold text-sm shadow-inner mt-8">
                <div className="flex items-center gap-4 text-white/80"><CalendarDays className="h-5 w-5 text-primary" />{formatDateRange(event.date, event.endDate)}</div>
                <div className="flex items-center gap-4 text-white/80"><Clock className="h-5 w-5 text-primary" />{event.startTime}</div>
                <div className="flex items-center gap-4 text-white/80"><MapPin className="h-5 w-5 text-primary" /><span className="truncate">{event.location}</span></div>
              </div>
              
              <div className="pt-8 border-t border-white/10 space-y-6">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Deployment RSVP</p>
                
                <div className="space-y-4">
                  {relevantParticipants.map((p) => {
                    const rsvp = event.userRsvps?.[p.id || ''] || 'no_response';
                    return (
                      <div key={p.id} className="space-y-4 p-5 bg-white/5 rounded-[2rem] border border-white/10 group hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            {p.name === 'You' ? 'Your RSVP' : `${p.name}'s RSVP`}
                          </div>
                          <Badge className={cn(
                            "text-[8px] font-black uppercase border-none h-5 px-3 shadow-lg", 
                            rsvp === 'going' ? "bg-green-500 text-white" : 
                            rsvp === 'maybe' ? "bg-amber-400 text-black" : 
                            (rsvp === 'declined' || rsvp === 'no') ? "bg-red-500 text-white" : 
                            "bg-white/10 text-white/40"
                          )}>
                            {rsvp === 'no' ? 'DECLINED' : rsvp.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <Button 
                            variant="outline" 
                            className={cn(
                              "h-12 rounded-2xl font-black text-xs uppercase transition-all tracking-widest border-2", 
                              rsvp === 'going' ? "bg-green-600 border-none text-white shadow-xl shadow-green-600/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-green-500/50 hover:bg-green-500/5"
                            )} 
                            onClick={() => updateRSVP((event as any).parentTournamentId || event.id, 'going', undefined, p.id)}
                          >
                            Going
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button 
                              variant="outline" 
                              className={cn(
                                "h-11 rounded-2xl font-black text-[10px] uppercase transition-all tracking-widest border-2", 
                                rsvp === 'maybe' ? "bg-amber-400 text-black border-none shadow-lg shadow-amber-400/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-amber-400/50 hover:bg-amber-400/5"
                              )} 
                              onClick={() => updateRSVP((event as any).parentTournamentId || event.id, 'maybe', undefined, p.id)}
                            >
                              Maybe
                            </Button>
                            <Button 
                              variant="outline" 
                              className={cn(
                                "h-11 rounded-2xl font-black text-[10px] uppercase transition-all tracking-widest border-2", 
                                (rsvp === 'declined' || rsvp === 'no') ? "bg-red-600 text-white border-none shadow-lg shadow-red-600/20 active:scale-95" : "bg-white/5 border-white/10 hover:border-red-500/50 hover:bg-red-500/5"
                              )} 
                              onClick={() => updateRSVP((event as any).parentTournamentId || event.id, 'declined', undefined, p.id)}
                            >
                              Decline
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {linkedGame ? (
                <div className="pt-8 border-t border-white/10 space-y-4 animate-in slide-in-from-bottom-2 duration-700">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">Match Verified</p>
                    <Badge className={cn(
                      "text-[8px] font-black uppercase h-5 px-3",
                      linkedGame.result === 'Win' ? "bg-green-500 text-white" : 
                      linkedGame.result === 'Loss' ? "bg-red-500 text-white" : 
                      "bg-amber-400 text-black"
                    )}>
                      {linkedGame.result}
                    </Badge>
                  </div>
                  <div className="bg-white/10 p-6 rounded-[2rem] border border-white/20 text-center space-y-2 group/game cursor-pointer hover:bg-white/15 transition-all" onClick={() => router.push('/games')}>
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <p className="text-[10px] font-bold opacity-40 uppercase mb-1">Squad</p>
                        <p className="text-3xl font-black">{linkedGame.myScore}</p>
                      </div>
                      <div className="text-xs font-black opacity-20 uppercase italic">vs</div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold opacity-40 uppercase mb-1">Opp</p>
                        <p className="text-3xl font-black">{linkedGame.opponentScore}</p>
                      </div>
                    </div>
                    <p className="text-[9px] font-black uppercase text-primary tracking-widest mt-2 group-hover/game:translate-x-1 transition-transform">View Full Scorecard →</p>
                  </div>
                </div>
              ) : event.eventType === 'game' && isStaff && (
                <div className="pt-8 border-t border-white/10 space-y-4 animate-in slide-in-from-bottom-2 duration-700">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase text-primary tracking-[0.2em]">Match Intelligence</p>
                    <Badge variant="outline" className="text-[8px] font-black text-white/40 uppercase h-5 px-3 border-white/10">Pending Result</Badge>
                  </div>
                  <Button 
                    className="w-full h-14 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-[2rem] font-black uppercase text-[10px] tracking-widest transition-all group"
                    onClick={() => router.push(`/games?recordEventId=${event.id}`)}
                  >
                    Record Match Result <Plus className="ml-2 h-4 w-4 group-hover:rotate-90 transition-transform" />
                  </Button>
                </div>
              )}

              {isAdmin && (
                <div className="mt-8 pt-8 border-t border-white/10 flex flex-col gap-3">
                  <Button variant="outline" className="w-full h-12 rounded-2xl border-white/20 bg-white/5 text-white hover:bg-primary hover:border-transparent font-black uppercase text-[10px] transition-all" onClick={() => exportAttendanceCSV(event.id)}>
                    <Download className="h-4 w-4 mr-2" /> <span>Export Attendance Ledger</span>
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1 rounded-2xl h-12 font-black uppercase text-[10px]" onClick={() => onEdit(event)}>Edit Activity</Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="destructive" size="icon" className="h-12 w-12 rounded-2xl shadow-lg shadow-red-600/10" onClick={() => onDelete(event.id)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-destructive text-white border-none">
                        Destroy Activity Log
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL: TABS & INTELLIGENCE */}
          <div className="flex-1 bg-white flex flex-col">
            <Tabs defaultValue="attendance" className="flex flex-col h-full">
              <div className="px-8 pt-8 shrink-0">
                <TabsList className="flex w-full overflow-x-auto bg-muted/50 p-1.5 rounded-[1.5rem] border shadow-inner h-14 no-scrollbar gap-1 custom-scrollbar-hidden">
                  <TabsTrigger value="attendance" className="rounded-xl font-black uppercase text-[9px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-4 shrink-0">Squad Pulse</TabsTrigger>
                  <TabsTrigger value="matches" className="rounded-xl font-black uppercase text-[9px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-4 shrink-0" disabled={!event.isTournament}>Matches</TabsTrigger>
                  <TabsTrigger value="plan" className="rounded-xl font-black uppercase text-[9px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-4 shrink-0" disabled={!event.drillIds?.length}>Tactical Plan</TabsTrigger>
                  <TabsTrigger value="assignments" className="rounded-xl font-black uppercase text-[9px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-4 shrink-0">Logistics</TabsTrigger>
                  <TabsTrigger value="intel" className="rounded-xl font-black uppercase text-[9px] tracking-tight data-[state=active]:bg-white data-[state=active]:shadow-md px-4 shrink-0">Briefing</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 px-8 pb-8 pt-4 overflow-y-auto">
                <TabsContent value="attendance" className="mt-0 space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><Users className="h-5 w-5" /></div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Attendance Matrix</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {attendees.length > 0 ? attendees.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-muted/20 rounded-[1.5rem] border transition-all hover:bg-white hover:shadow-sm group">
                        <div className="flex items-center gap-3">
                          <Badge className={cn(
                            "h-1.5 w-1.5 rounded-full p-0 border-none",
                            a.status === 'going' ? "bg-green-500" : a.status === 'maybe' ? "bg-amber-400" : "bg-red-500"
                          )} />
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black uppercase tracking-tight text-foreground">{a.name}</span>
                            {a.position && <span className="text-[8px] font-bold text-muted-foreground uppercase">{a.position}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-[8px] font-black uppercase border-none h-5 px-3",
                          a.status === 'going' ? "bg-green-500/10 text-green-700" : 
                          a.status === 'maybe' ? "bg-amber-400/10 text-amber-700" : 
                          "bg-red-500/10 text-red-700"
                        )}>
                          {a.status.toUpperCase()}
                        </Badge>
                      </div>
                    )) : (
                      <div className="py-12 text-center bg-muted/10 rounded-[2rem] border-2 border-dashed">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Intelligence Data Collected</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="matches" className="mt-0 space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><Zap className="h-5 w-5" /></div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Tournament Deployment</h3>
                  </div>
                  
                  {Object.entries(gamesByDay).map(([date, games]: [string, any]) => (
                    <div key={date} className="space-y-4">
                      <div className="flex items-center gap-3 ml-2">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                          {format(date.includes('T') ? parseISO(date) : new Date(date.replace(/-/g, '/')), 'EEEE, MMMM do')}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {games.map((g: any, i: number) => (
                          <div key={i} className="p-5 border rounded-[2rem] bg-muted/10 group hover:bg-white transition-all shadow-none hover:shadow-lg">
                            <div className="flex justify-between items-center mb-4">
                              <Badge className="bg-primary text-white text-[8px] font-black uppercase h-5 px-3 border-none">ROUND: {g.round || 'POOL'}</Badge>
                              <span className="text-[10px] font-black opacity-40">{g.time}</span>
                            </div>
                            <div className="flex items-center justify-center gap-6">
                              <div className="text-center flex-1">
                                <p className="text-[11px] font-black uppercase truncate">{g.team1}</p>
                                {g.team1Score !== undefined && <p className="text-2xl font-black mt-1">{g.team1Score}</p>}
                              </div>
                              <div className="text-[9px] font-black opacity-20 italic">VS</div>
                              <div className="text-center flex-1">
                                <p className="text-[11px] font-black uppercase truncate">{g.team2}</p>
                                {g.team2Score !== undefined && <p className="text-2xl font-black mt-1">{g.team2Score}</p>}
                              </div>
                            </div>
                            {g.location && <p className="text-[8px] font-bold text-muted-foreground uppercase text-center mt-3 opacity-60"><MapPin className="h-2 w-2 inline mr-1" /> {g.location}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="plan" className="mt-0 space-y-6 animate-in fade-in duration-300">
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-xl text-primary"><Dumbbell className="h-5 w-5" /></div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Tactical Itinerary</h3>
                    </div>
                    {eventDrills && eventDrills.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-9 rounded-xl border-2 font-black uppercase text-[9px] tracking-widest hover:bg-primary/5 hover:text-primary transition-all"
                        onClick={async () => {
                          const { jsPDF } = await import('jspdf');
                          const doc = new jsPDF();
                          
                          // Brand Colors
                          const CHASSIS_RED = [220, 38, 38]; // #dc2626
                          const MIDNIGHT = [15, 23, 42];
                          const SLATE = [100, 116, 139];
                          
                          // --- HEADER ---
                          doc.setFillColor(CHASSIS_RED[0], CHASSIS_RED[1], CHASSIS_RED[2]);
                          doc.rect(0, 0, 210, 40, 'F');
                          
                          doc.setFont("helvetica", "bold");
                          doc.setFontSize(28);
                          doc.setTextColor(255, 255, 255);
                          doc.text("SQUAD", 20, 25);
                          
                          doc.setFontSize(10);
                          doc.setTextColor(255, 255, 255);
                          doc.text("TACTICAL INTELLIGENCE UNIT", 20, 32);
                          
                          // Header Diagonal Accent
                          doc.setDrawColor(255, 255, 255);
                          doc.setLineWidth(0.5);
                          doc.line(140, 0, 210, 40);
                          
                          // --- EVENT TITLES ---
                          let y = 60;
                          doc.setTextColor(MIDNIGHT[0], MIDNIGHT[1], MIDNIGHT[2]);
                          doc.setFontSize(22);
                          doc.text(event.title.toUpperCase(), 20, y);
                          
                          y += 12;
                          doc.setFont("helvetica", "normal");
                          doc.setFontSize(10);
                          doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
                          const dateStr = formatDateRange(event.date, event.endDate);
                          doc.text(`DATE: ${dateStr.toUpperCase()}  |  LOCATION: ${event.location.toUpperCase()}`, 20, y);
                          
                          y += 15;
                          doc.setDrawColor(230, 230, 230);
                          doc.setLineWidth(0.1);
                          doc.line(20, y, 190, y);
                          y += 15;
                          
                          // --- DRILLS / ITINERARY ---
                          doc.setFont("helvetica", "bold");
                          doc.setFontSize(14);
                          doc.setTextColor(MIDNIGHT[0], MIDNIGHT[1], MIDNIGHT[2]);
                          doc.text("TACTICAL PLAN", 20, y);
                          y += 10;
                          
                          eventDrills.forEach((drill: any, index: number) => {
                            // Check for page break
                            if (y > 240) {
                              // Footer on previous page
                              doc.setFontSize(8);
                              doc.setTextColor(180, 180, 180);
                              doc.text("SQUAD INTELLIGENCE PORTAL - CONFIDENTIAL", 105, 285, { align: 'center' });
                              
                              doc.addPage();
                              y = 30;
                              
                              // Small header on new page
                              doc.setFillColor(CHASSIS_RED[0], CHASSIS_RED[1], CHASSIS_RED[2]);
                              doc.rect(0, 0, 210, 15, 'F');
                              doc.setFont("helvetica", "bold");
                              doc.setFontSize(10);
                              doc.setTextColor(255, 255, 255);
                              doc.text(`SQUAD TACTICAL BRIEFING: ${event.title.toUpperCase()}`, 20, 10);
                              y = 30;
                            }
                            
                            // Drill Box Accent
                            doc.setFillColor(245, 247, 250);
                            doc.rect(20, y - 5, 170, 7, 'F');
                            
                            // Drill Header
                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(12);
                            doc.setTextColor(CHASSIS_RED[0], CHASSIS_RED[1], CHASSIS_RED[2]);
                            doc.text(`${(index + 1).toString().padStart(2, '0')}  ${drill.title.toUpperCase()}`, 25, y);
                            
                            // Metadata Row
                            y += 8;
                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(8);
                            doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
                            doc.text(`CAT: ${drill.category?.toUpperCase() || 'SKILL'}  |  DUR: ${drill.duration || 10} MIN  |  DIFF: ${drill.difficulty?.toUpperCase() || 'STANDARD'}`, 25, y);
                            
                            // Objective
                            if (drill.objective) {
                              y += 6;
                              doc.setFont("helvetica", "bold");
                              doc.setTextColor(MIDNIGHT[0], MIDNIGHT[1], MIDNIGHT[2]);
                              doc.text(`OBJECTIVE:`, 25, y);
                              doc.setFont("helvetica", "normal");
                              doc.text(drill.objective.toUpperCase(), 48, y);
                            }
                            
                            // Description
                            y += 7;
                            doc.setFont("helvetica", "normal");
                            doc.setFontSize(9);
                            doc.setTextColor(50, 50, 50);
                            const lines = doc.splitTextToSize(drill.description, 160);
                            doc.text(lines, 25, y);
                            
                            y += (lines.length * 5) + 12;
                          });
                          
                          // --- FINAL FOOTER ---
                          doc.setFontSize(8);
                          doc.setTextColor(180, 180, 180);
                          doc.text("SQUAD INTELLIGENCE PORTAL - CONFIDENTIAL PROPERTY", 105, 285, { align: 'center' });
                          doc.text(`GENERATED: ${new Date().toLocaleString().toUpperCase()}`, 105, 290, { align: 'center' });
                          
                          doc.save(`Briefing_${event.title.replace(/\s+/g, '_')}.pdf`);
                        }}
                      >
                        <Download className="h-3 w-3 mr-2" /> Export Tactical Plan
                      </Button>
                    )}
                  </div>
                  
                  {isDrillsLoading ? (
                    <div className="py-12 text-center animate-pulse"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {eventDrills?.map((drill: any) => (
                        <Card key={drill.id} className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white overflow-hidden group hover:shadow-lg transition-all cursor-pointer" onClick={() => router.push('/drills')}>
                           <div className="flex flex-col sm:flex-row">
                              <div className="w-full sm:w-32 aspect-video sm:aspect-square bg-black shrink-0 relative">
                                 {drill.coverImageUrl ? (
                                   <img src={drill.coverImageUrl} className="w-full h-full object-cover opacity-60" />
                                 ) : drill.url ? (
                                   <div className="absolute inset-0 flex items-center justify-center bg-primary/10"><Play className="h-6 w-6 text-primary" /></div>
                                 ) : (
                                   <div className="absolute inset-0 flex items-center justify-center opacity-10"><Dumbbell className="h-8 w-8" /></div>
                                 )}
                                 <Badge className="absolute bottom-2 right-2 bg-black/60 text-white text-[7px] font-black uppercase border-none">{drill.duration || 10}m</Badge>
                              </div>
                              <div className="p-4 flex-1 flex flex-col justify-center">
                                 <div className="flex items-center justify-between gap-2 mb-1">
                                    <h4 className="text-xs font-black uppercase tracking-tight truncate">{drill.title}</h4>
                                    <Badge variant="outline" className="text-[7px] font-black uppercase h-5">{drill.category || 'Skill'}</Badge>
                                 </div>
                                 <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{drill.description}</p>
                              </div>
                              <div className="p-4 bg-muted/20 sm:bg-transparent flex items-center justify-center sm:pr-6">
                                 <ArrowUpRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                              </div>
                           </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="assignments" className="mt-0 space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><Zap className="h-5 w-5" /></div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Logistical Support</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {event.assignments && event.assignments.length > 0 ? event.assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-5 bg-muted/20 rounded-[1.5rem] border group hover:bg-white transition-all">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black uppercase tracking-tight text-foreground">{a.role}</span>
                          <span className="text-[9px] font-bold text-primary uppercase">{a.assignedToName || 'OPEN POSITION'}</span>
                        </div>
                        {!a.assignedToId ? (
                          <Button 
                            size="sm" 
                            className="h-8 rounded-full px-4 text-[9px] font-black uppercase bg-primary hover:shadow-lg transition-all"
                            onClick={() => claimAssignment(event.id, a.id)}
                          >
                            Enlist
                          </Button>
                        ) : (
                          <Badge className="bg-green-500/10 text-green-700 text-[8px] font-black h-6 px-3 border-none">DEPLOYED</Badge>
                        )}
                      </div>
                    )) : (
                      <div className="py-12 text-center bg-muted/10 rounded-[2rem] border-2 border-dashed">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Logistics Required</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="intel" className="mt-0 space-y-6 animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><Zap className="h-5 w-5" /></div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Operational Intelligence</h3>
                  </div>
                  <div className="p-6 bg-muted/20 rounded-[2rem] border border-muted-foreground/10 min-h-[150px]">
                    <p className="text-[11px] font-bold text-foreground leading-relaxed whitespace-pre-wrap italic">
                      {event.description || "No tactical briefing provided for this operation. Awaiting squad leader input."}
                    </p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
