
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Clock, 
  Plus, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  Users, 
  Link as LinkIcon, 
  UserPlus, 
  Trash2, 
  HelpCircle, 
  XCircle, 
  Edit3, 
  Copy,
  Trophy,
  CalendarDays,
  ArrowRight,
  Lock,
  Sparkles,
  Download,
  ListPlus,
  Table as TableIcon,
  ChevronLeft,
  Loader2,
  CalendarCheck,
  CalendarX,
  CircleHelp,
  ShieldCheck,
  FileCheck,
  Share2,
  Check,
  Zap,
  MoreVertical,
  Play,
  X,
  ShieldAlert,
  Signature,
  Shield,
  History,
  Wand2,
  Timer,
  CalendarPlus,
  Scale,
  Signature as SignIcon,
  FileText
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent, CustomFormField, FormFieldType, TournamentGame, League } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, collectionGroup, where, limit, doc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isSameDay, isPast, isFuture, addMinutes, addDays, parse } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { generateGoogleCalendarLink, downloadICS, CalendarEvent } from '@/lib/calendar-utils';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  hasAttendance: boolean;
  purchasePro: () => void;
  children: React.ReactNode;
}

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  if (startDate.getMonth() === endDate.getMonth()) return `${format(startDate, 'MMM d')}-${format(endDate, 'd')}`;
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1]) standings[t1] = { name: t1, wins: 0, losses: 0, ties: 0, points: 0 };
    if (!standings[t2]) standings[t2] = { name: t2, wins: 0, losses: 0, ties: 0, points: 0 };
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members = [], teams = [], user, updateEvent, signTeamTournamentWaiver, submitEventWaiver, isPro, activeTeam } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [isWaiverDialogOpen, setIsWaiverDialogOpen] = useState(false);
  const [isTeamAgreementOpen, setIsTeamAgreementOpen] = useState(false);

  const regQuery = useMemoFirebase(() => {
    if (!db || !event?.id || !event?.teamId) return null;
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event?.id, event?.teamId]);
  const { data: rawRegistrations } = useCollection<any>(regQuery);
  const registrations = rawRegistrations || [];

  const isEliteUnlocked = !!event.isTournamentPaid;
  
  // ROBUST MATCHING LOGIC: Find exactly which team in the tournament list belongs to the current user
  const myParticipatingTeamName = useMemo(() => {
    if (!event.tournamentTeams) return null;
    const myAdminTeamNamesLower = teams.filter(t => t.role === 'Admin').map(t => t.name.toLowerCase());
    return event.tournamentTeams.find(tn => myAdminTeamNamesLower.includes(tn.toLowerCase()));
  }, [teams, event.tournamentTeams]);

  const isWaiverSignedForMyTeam = myParticipatingTeamName ? !!event.teamAgreements?.[myParticipatingTeamName]?.agreed : false;
  const hasUserSignedIndividualWaiver = !!event.specialWaiverResponses?.[user?.id || '']?.agreed;

  const attendanceData = useMemo(() => {
    const internal = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
      const member = members.find(m => m.userId === uid);
      return { id: uid, name: member?.name || 'Unknown Member', avatar: member?.avatar, role: member?.position || 'Member', status };
    });
    const external = registrations.map(reg => ({ id: reg.id, name: reg.name, avatar: undefined, role: 'Public Registrant', status: 'going' }));
    return [...internal, ...external];
  }, [event.userRsvps, members, registrations]);

  const goingList = attendanceData.filter(a => a.status === 'going');
  const tournamentStandings = useMemo(() => (event.isTournament && event.tournamentTeams) ? calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []) : [], [event]);
  
  const groupedGames = useMemo(() => {
    if (!event.tournamentGames) return {};
    const groups: Record<string, TournamentGame[]> = {};
    [...event.tournamentGames].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(game => {
      const key = game.pool ? `Pool ${game.pool}` : format(new Date(game.date), 'EEEE, MMM d');
      if (!groups[key]) groups[key] = [];
      groups[key].push(game);
    });
    return groups;
  }, [event.tournamentGames]);

  const currentStatus = event.userRsvps?.[user?.id || ''];
  const isUserStaff = members.find(m => m.userId === user?.id && ['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader', 'Manager', 'Platform Admin'].includes(m.position));

  const syncTournamentSchedule = () => {
    if (!event.tournamentGames || !myParticipatingTeamName) return;
    const myGames = event.tournamentGames.filter(g => g.team1 === myParticipatingTeamName || g.team2 === myParticipatingTeamName);
    if (myGames.length === 0) {
      toast({ title: "No Matches Found", description: "Your team has no matches scheduled yet.", variant: "destructive" });
      return;
    }
    const events = myGames.map(g => ({
      title: `${g.team1} vs ${g.team2}`,
      start: parse(`${g.date} ${g.time}`, 'yyyy-MM-dd h:mm a', new Date()),
      location: event.location,
      description: `Match for ${event.title}`
    }));
    downloadICS(events, `${event.title.replace(/\s+/g, '_')}_Schedule.ics`);
    toast({ title: "Schedule Exported" });
  };

  return (
    <Dialog onOpenChange={(open) => { if(!open) setEditingGame(null); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-7xl p-0 overflow-hidden sm:rounded-[2.5rem] h-full sm:h-[90vh] flex flex-col border-none shadow-2xl">
        <DialogTitle className="sr-only">{event.title} Detail Hub</DialogTitle>
        <div className="flex flex-col lg:flex-row h-full min-h-0">
          {/* Left Strategic Pane */}
          <div className="lg:w-1/3 bg-black text-white p-6 lg:p-8 lg:border-r space-y-8 flex flex-col shrink-0">
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <Badge className={cn("uppercase font-black tracking-widest text-[9px] px-3 h-6", event.isTournament ? "bg-primary text-white" : "bg-white/20 text-white")}>
                  {event.isTournament ? (event.isTournamentPaid ? "Elite Tournament" : "Basic Tournament") : "Team Match"}
                </Badge>
                <DialogClose asChild>
                  <X className="h-5 w-5 text-white/40 cursor-pointer hover:text-white" />
                </DialogClose>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl lg:text-4xl font-black tracking-tighter leading-none uppercase">{event.title}</h2>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Strategic Deployment</p>
              </div>
              <div className="space-y-4 pt-4">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
                  <div className="flex items-center gap-3 font-bold text-sm"><CalendarDays className="h-4 w-4 text-primary" /><span>{formatDateRange(event.date, event.endDate)}</span></div>
                  <div className="flex items-center gap-3 font-bold text-sm"><Clock className="h-4 w-4 text-primary" /><span>{event.startTime}</span></div>
                  <div className="flex items-center gap-3 font-bold text-sm"><MapPin className="h-4 w-4 text-primary" /><span className="truncate">{event.location}</span></div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full rounded-xl h-12 font-black text-xs uppercase gap-3 border-white bg-white/10 text-white hover:bg-white/20">
                        <CalendarPlus className="h-4 w-4" /> {event.isTournament ? 'Sync Full Schedule' : 'Add to Calendar'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 rounded-xl">
                      <DropdownMenuLabel className="text-[10px] font-black uppercase">Calendar Sync</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {event.isTournament ? (
                        <DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={syncTournamentSchedule}>Download iCal / Outlook</DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={() => window.open(generateGoogleCalendarLink({ title: event.title, start: new Date(event.date), location: event.location, description: event.description }), '_blank')}>Google Calendar</DropdownMenuItem>
                          <DropdownMenuItem className="font-bold py-3 cursor-pointer" onClick={() => downloadICS([{ title: event.title, start: new Date(event.date), location: event.location, description: event.description }], `${event.title}.ics`)}>iCal / Outlook</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {event.requiresSpecialWaiver && !hasUserSignedIndividualWaiver && (
                  <Button onClick={() => setIsWaiverDialogOpen(true)} className="w-full rounded-xl h-14 font-black text-sm uppercase gap-3 bg-red-600 text-white shadow-xl shadow-red-600/20">
                    <SignIcon className="h-5 w-5" /> Sign Required Waiver
                  </Button>
                )}

                {myParticipatingTeamName && !isWaiverSignedForMyTeam && (
                  <Button onClick={() => setIsTeamAgreementOpen(true)} className="w-full rounded-xl h-14 font-black text-sm uppercase gap-3 bg-primary text-white shadow-xl shadow-primary/20">
                    <Signature className="h-5 w-5" /> Sign for {myParticipatingTeamName}
                  </Button>
                )}
              </div>
            </div>
            
            {event.isTournament && (
              <div className="space-y-4 pt-4 min-h-0 flex-1 flex flex-col">
                <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] px-1 shrink-0">Leaderboard</h4>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {isEliteUnlocked ? (
                    tournamentStandings.length > 0 ? (
                      <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
                        {tournamentStandings.map((team, i) => (
                          <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[10px] font-black text-primary w-4">{i + 1}</span>
                              <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                            </div>
                            <Badge className="bg-primary text-white border-none font-black text-[9px] px-2 h-5 shrink-0">{team.points} PTS</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                        <p className="text-[10px] font-black uppercase text-white/40">No match data synced</p>
                      </div>
                    )
                  ) : (
                    <div className="p-8 text-center bg-primary/10 rounded-3xl border border-dashed border-primary/40 space-y-4">
                      <Lock className="h-8 w-8 text-primary mx-auto opacity-40" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Elite Standings Locked</p>
                      {isAdmin && <Button variant="secondary" size="sm" className="h-8 rounded-lg text-[8px] font-black uppercase w-full bg-primary text-white" onClick={() => router.push('/pricing')}>Get Elite Module</Button>}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {isAdmin && (
              <div className="pt-6 border-t border-white/10 flex gap-3 mt-auto shrink-0">
                <Button variant="secondary" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px] bg-white/10 text-white hover:bg-white/20" onClick={() => onEdit(event)}>
                  <Edit3 className="h-4 w-4 mr-2" /> Edit Hub
                </Button>
                <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-red-500 hover:bg-red-500/10" onClick={() => onDelete(event.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Right Interactive Pane */}
          <div className="flex-1 flex flex-col bg-background min-h-0">
            <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 lg:px-10 py-6 border-b bg-muted/30 shrink-0">
                <TabsList className="bg-white/50 h-14 p-1.5 rounded-2xl shadow-inner border w-full lg:w-fit overflow-x-auto no-scrollbar">
                  {event.isTournament && (
                    <TabsTrigger value="bracket" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Schedule</TabsTrigger>
                  )}
                  <TabsTrigger value="roster" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Roster</TabsTrigger>
                  <TabsTrigger value="compliance" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                </TabsList>
              </div>
              
              <div className="flex-1 min-h-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6 lg:p-10 pb-32">
                    <TabsContent value="bracket" className="mt-0 space-y-10">
                      {Object.entries(groupedGames).map(([groupTitle, games]) => (
                        <div key={groupTitle} className="space-y-6">
                          <div className="flex items-center gap-4 px-2">
                            <Badge className="bg-black text-white font-black uppercase text-[10px] px-4 h-7 shadow-lg">{groupTitle}</Badge>
                            <div className="h-px bg-muted flex-1" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {games.map((game) => (
                              <button key={game.id} onClick={() => isAdmin && setEditingGame(game)} className="w-full p-5 bg-white rounded-3xl border shadow-sm transition-all text-left relative overflow-hidden group ring-1 ring-black/5 active:scale-95">
                                <div className="flex justify-between items-center mb-4">
                                  <Badge variant="outline" className="text-[8px] font-black uppercase border-black/10 tracking-widest px-2 h-5">{game.time}</Badge>
                                  {game.isCompleted && <Badge className="text-[8px] font-black uppercase h-5 px-2 bg-black text-white">Final</Badge>}
                                </div>
                                <div className="grid grid-cols-7 items-center gap-4">
                                  <div className="col-span-3 text-right">
                                    <p className="font-black text-xs uppercase truncate mb-1">{game.team1}</p>
                                    <p className="text-3xl font-black text-primary leading-none">{game.score1}</p>
                                  </div>
                                  <div className="col-span-1 flex items-center justify-center opacity-20 font-black text-[10px]">VS</div>
                                  <div className="col-span-3">
                                    <p className="font-black text-xs uppercase truncate mb-1">{game.team2}</p>
                                    <p className="text-3xl font-black text-primary leading-none">{game.score2}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                    
                    <TabsContent value="roster" className="mt-0">
                      {!isPro ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
                          <Users className="h-12 w-12" />
                          <p className="text-xs font-black uppercase tracking-widest">Upgrade to Pro to unlock attendance tracking</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {goingList.map(person => (
                            <div key={person.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border shadow-sm">
                              <Avatar className="h-12 w-12 rounded-xl border-2 border-background shadow-sm">
                                <AvatarImage src={person.avatar} />
                                <AvatarFallback className="font-black bg-muted text-xs">{person.name[0]}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-sm uppercase truncate leading-none mb-1">{person.name}</p>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{person.role}</p>
                              </div>
                              <div className="bg-green-500 h-2 w-2 rounded-full" />
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="compliance" className="mt-0 space-y-12">
                      {event.requiresSpecialWaiver && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-1">
                            <SignIcon className="h-4 w-4 text-red-600" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Individual Participant Signatures</h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(event.specialWaiverResponses || {}).map(([uid, sig]: [string, any]) => {
                              const member = members.find(m => m.userId === uid);
                              return (
                                <div key={uid} className="flex items-center justify-between p-4 rounded-2xl border bg-white shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                      <AvatarImage src={member?.avatar} />
                                      <AvatarFallback className="text-[10px] font-black">{member?.name?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-xs font-black uppercase">{member?.name}</p>
                                      <p className="text-[7px] font-bold text-muted-foreground uppercase">{format(new Date(sig.timestamp), 'MMM d, h:mm a')}</p>
                                    </div>
                                  </div>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {event.isTournament && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 px-1">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Official Squad Agreements</h4>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {event.tournamentTeams?.map(teamName => { 
                              const res = event.teamAgreements?.[teamName]; 
                              return (
                                <div key={teamName} className="flex items-center justify-between p-5 rounded-2xl border bg-white shadow-sm">
                                  <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center border text-primary"><ShieldAlert className="h-5 w-5" /></div>
                                    <div>
                                      <p className="font-black text-sm uppercase tracking-tight">{teamName}</p>
                                      <p className="text-[8px] font-bold text-muted-foreground uppercase">{res?.captainName ? `Verified by ${res.captainName}` : 'Participating Squad'}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    {res?.agreed ? (
                                      <Badge className="bg-green-100 text-green-700 h-8 px-5 border-none font-black text-[10px] uppercase tracking-widest rounded-full"><Check className="h-3.5 w-3.5 mr-2" /> Verified</Badge>
                                    ) : (
                                      <Badge variant="outline" className="h-8 px-5 font-black text-[10px] uppercase tracking-widest opacity-40 rounded-full border-dashed">Pending</Badge>
                                    )}
                                    {isAdmin && (
                                      <Checkbox 
                                        checked={res?.agreed || false} 
                                        onCheckedChange={(v) => { 
                                          updateEvent(event.id, { [`teamAgreements.${teamName}`]: { agreed: !!v, captainName: user?.name || 'Verified by Host', timestamp: new Date().toISOString() } }); 
                                        }} 
                                        className="h-6 w-6 rounded-lg" 
                                      />
                                    )}
                                  </div>
                                </div>
                              ); 
                            })}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </div>
                </ScrollArea>
              </div>

              {!isUserStaff && (
                <div className="p-6 border-t bg-muted/20 shrink-0">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
                    <div className="text-center sm:text-left space-y-1">
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Match Response</p>
                      <p className="text-xs font-medium text-foreground/60 italic">Your status updates the roster.</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="outline" className={cn("flex-1 sm:w-28 h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'notGoing' ? "bg-red-600 text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'notGoing')}>Decline</Button>
                      <Button variant="outline" className={cn("flex-1 sm:w-28 h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'maybe' ? "bg-amber-500 text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
                      <Button variant="outline" className={cn("flex-1 sm:w-40 h-12 rounded-xl font-black text-xs uppercase", currentStatus === 'going' ? "bg-primary text-white" : "bg-white border-2")} onClick={() => updateRSVP(event.id, 'going')}><CheckCircle2 className="h-4 w-4 mr-2" /> I'm Going</Button>
                    </div>
                  </div>
                </div>
              )}
            </Tabs>
          </div>
        </div>

        {/* Individual Waiver Dialog */}
        <Dialog open={isWaiverDialogOpen} onOpenChange={setIsWaiverDialogOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Required Participant Waiver</DialogTitle>
              <DialogDescription className="font-bold text-red-600 uppercase text-[10px] tracking-widest">Action Required for Participation</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[300px] border-2 rounded-2xl p-6 bg-muted/30">
              <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{event.specialWaiverText}</p>
            </ScrollArea>
            <div className="bg-primary/5 p-4 rounded-2xl border flex items-start gap-3">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">By clicking below, you officially sign this waiver for {event.title} as {user?.name}.</p>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black bg-red-600 shadow-xl shadow-red-600/20" onClick={() => { submitEventWaiver(event.id, true); setIsWaiverDialogOpen(false); toast({ title: "Waiver Signed" }); }}>Verify & Sign Legally</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Team Agreement Dialog */}
        <Dialog open={isTeamAgreementOpen} onOpenChange={setIsTeamAgreementOpen}>
          <DialogContent className="sm:max-w-xl rounded-3xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Squad Participation Agreement</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Formal Enrollment Certification</DialogDescription>
            </DialogHeader>
            <div className="p-1 bg-muted rounded-2xl border-2">
              <ScrollArea className="max-h-[350px] p-6 bg-white rounded-xl">
                {event.teamWaiverText ? (
                  <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap text-foreground/80">{event.teamWaiverText}</p>
                ) : (
                  <div className="text-center py-10 opacity-40 space-y-2">
                    <FileText className="h-8 w-8 mx-auto" />
                    <p className="text-xs font-black uppercase">Standard Participation Terms Apply</p>
                  </div>
                )}
              </ScrollArea>
            </div>
            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Authority Verification</p>
              </div>
              <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                As a representative of <strong>{myParticipatingTeamName}</strong>, clicking below verifies that your squad understands and accepts all tournament coordination protocols.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button className="w-full h-16 rounded-2xl text-lg font-black bg-primary shadow-xl shadow-primary/20" onClick={() => { if(myParticipatingTeamName) { signTeamTournamentWaiver(event.teamId, event.id, myParticipatingTeamName); setIsTeamAgreementOpen(false); } }}>Verify & Sign for Squad</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Global Game Editor Modal */}
        <Dialog open={!!editingGame} onOpenChange={(o) => !o && setEditingGame(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0">
            <div className="h-2 bg-primary w-full" />
            <div className="p-8 space-y-6">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Game Ledger Entry</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update Match Results</DialogDescription>
              </DialogHeader>
              {editingGame && (
                <div className="space-y-6 py-2">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Game Date</Label>
                    <input type="date" value={editingGame.date} onChange={e => setEditingGame({...editingGame, date: e.target.value})} className="w-full h-12 rounded-xl font-bold border-2 bg-background px-3" />
                  </div>
                  <div className="grid grid-cols-2 gap-6 items-end">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase truncate">{editingGame.team1}</Label>
                      <Input type="number" value={editingGame.score1} onChange={e => setEditingGame({...editingGame, score1: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase truncate">{editingGame.team2}</Label>
                      <Input type="number" value={editingGame.score2} onChange={e => setEditingGame({...editingGame, score2: parseInt(e.target.value) || 0})} className="h-12 rounded-xl font-black text-xl text-center" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase">Final Result</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase">Mark match as complete</p>
                    </div>
                    <Checkbox checked={editingGame.isCompleted} onCheckedChange={v => setEditingGame({...editingGame, isCompleted: !!v})} className="h-6 w-6 rounded-lg" />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); toast({ title: "Ledger Updated" }); }}>Commit Results</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, isSuperAdmin, hasFeature, purchasePro, user, isStaff } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  const allEvents = rawEvents || [];

  const filteredEvents = useMemo(() => {
    if (filterMode === 'live') return allEvents.filter(e => !isPast(new Date(e.date)) || isSameDay(new Date(e.date), new Date()));
    return allEvents.filter(e => isPast(new Date(e.date)) && !isSameDay(new Date(e.date), new Date())).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allEvents, filterMode]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const [isEliteTournament, setIsEliteTournament] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TeamEvent | null>(null);
  
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [requiresWaiver, setRequiresWaiver] = useState(false);
  const [waiverText, setWaiverText] = useState('');
  const [teamWaiverText, setTeamWaiverText] = useState('');
  const [tournamentTeams, setTournamentTeams] = useState<string[]>([]);
  const [tournamentGames, setTournamentGames] = useState<TournamentGame[]>([]);
  const [newTeamName, setNewTeamName] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [genStartTime, setGenStartTime] = useState('09:00');
  const [genMatchLength, setGenMatchLength] = useState('60');
  const [genType, setGenType] = useState('round_robin');

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;

  const handleEdit = (event: TeamEvent) => { 
    setEditingEvent(event); 
    setIsTournamentMode(!!event.isTournament); 
    setIsEliteTournament(!!event.isTournamentPaid); 
    setNewTitle(event.title); 
    setNewDate(new Date(event.date).toISOString().split('T')[0]); 
    if (event.endDate) setNewEndDate(new Date(event.endDate).toISOString().split('T')[0]); 
    setNewTime(event.startTime); 
    setNewLocation(event.location); 
    setNewDescription(event.description); 
    setRequiresWaiver(!!event.requiresSpecialWaiver);
    setWaiverText(event.specialWaiverText || '');
    setTeamWaiverText(event.teamWaiverText || '');
    setTournamentTeams(event.tournamentTeams || []); 
    setTournamentGames(event.tournamentGames || []); 
    setIsCreateOpen(true); 
  };

  const handleGenerateSchedule = async () => {
    if (tournamentTeams.length < 2) return;
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1000));

    try {
      const games: TournamentGame[] = [];
      const teams = [...tournamentTeams];
      
      if (genType === 'round_robin') {
        if (teams.length % 2 !== 0) teams.push("BYE");
        const numTeams = teams.length;
        const rounds = numTeams - 1;
        const half = numTeams / 2;
        let currentDay = new Date(newDate || new Date());
        let currentTime = genStartTime;

        for (let round = 0; round < rounds; round++) {
          for (let i = 0; i < half; i++) {
            const t1 = teams[i]; const t2 = teams[numTeams - 1 - i];
            if (t1 !== "BYE" && t2 !== "BYE") {
              games.push({ id: `gen_${Date.now()}_${round}_${i}`, team1: t1, team2: t2, score1: 0, score2: 0, date: currentDay.toISOString().split('T')[0], time: currentTime, isCompleted: false, round: round + 1 });
              const [h, m] = currentTime.split(':').map(Number);
              const next = addMinutes(new Date(2000, 0, 1, h, m), parseInt(genMatchLength) + 15);
              currentTime = format(next, 'HH:mm');
              if (parseInt(currentTime.split(':')[0]) > 20) { currentDay = addDays(currentDay, 1); currentTime = genStartTime; }
            }
          }
          teams.splice(1, 0, teams.pop()!);
        }
      } else if (genType === 'pool_play') {
        const poolSize = 4;
        const numPools = Math.ceil(teams.length / poolSize);
        let currentDay = new Date(newDate || new Date());
        
        for (let p = 0; p < numPools; p++) {
          const poolTeams = teams.slice(p * poolSize, (p + 1) * poolSize);
          const poolChar = String.fromCharCode(65 + p);
          let poolTime = genStartTime;
          
          for (let i = 0; i < poolTeams.length; i++) {
            for (let j = i + 1; j < poolTeams.length; j++) {
              games.push({ id: `gen_p${poolChar}_${Date.now()}_${i}_${j}`, team1: poolTeams[i], team2: poolTeams[j], score1: 0, score2: 0, date: currentDay.toISOString().split('T')[0], time: poolTime, isCompleted: false, pool: poolChar });
              const [h, m] = poolTime.split(':').map(Number);
              const next = addMinutes(new Date(2000, 0, 1, h, m), parseInt(genMatchLength) + 10);
              poolTime = format(next, 'HH:mm');
            }
          }
        }
      }

      setTournamentGames(games);
      toast({ title: "Tactical Schedule Forged" });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => { setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setRequiresWaiver(false); setWaiverText(''); setTeamWaiverText(''); setTournamentTeams([]); setTournamentGames([]); };
  
  const handleCreateEvent = () => { 
    if (!newTitle || !newDate) return; 
    const payload: any = { title: newTitle, date: new Date(newDate).toISOString(), startTime: newTime || 'TBD', location: newLocation, description: newDescription, isTournament: isTournamentMode, isTournamentPaid: isEliteTournament, requiresSpecialWaiver: requiresWaiver, specialWaiverText: waiverText, teamWaiverText, tournamentTeams, tournamentGames, lastUpdated: new Date().toISOString() }; 
    if (isTournamentMode && newEndDate) payload.endDate = new Date(newEndDate).toISOString(); 
    if (editingEvent) updateEvent(editingEvent.id, payload); else addEvent(payload); 
    setIsCreateOpen(false); resetForm(); 
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Tactical Hub</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule</h1></div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { setIsTournamentMode(false); setIsEliteTournament(false); setIsCreateOpen(true); }}>+ Match</Button>
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-black text-white" onClick={() => { setIsTournamentMode(true); setIsEliteTournament(false); setIsCreateOpen(true); }}><Trophy className="h-4 w-4 mr-2 text-primary" /> Tournament</Button>
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-primary text-white border-none" onClick={() => { setIsTournamentMode(true); setIsEliteTournament(true); setIsCreateOpen(true); }}><Sparkles className="h-4 w-4 mr-2" /> Elite Hub</Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl overflow-hidden p-0 sm:rounded-[2.5rem] h-full sm:h-auto sm:max-h-[90vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">{editingEvent ? "Update" : "Launch"} Event Hub</DialogTitle>
          <div className="flex flex-col lg:flex-row h-full min-h-0">
            <div className="lg:w-5/12 p-6 lg:p-8 lg:border-r bg-primary/5 space-y-6 overflow-y-auto custom-scrollbar">
              <DialogHeader>
                <DialogTitle className="text-2xl lg:text-3xl font-black tracking-tight">{editingEvent ? "Update" : "Launch"} {isTournamentMode ? "Tournament" : "Match"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label><Input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-black border-2" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label><input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>
                  {isTournamentMode ? (<div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label><input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>) : (<div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time</Label><input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" /></div>)}
                </div>
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label><Input value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl font-bold border-2" /></div>
                <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">General Description</Label><Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="rounded-xl min-h-[80px] border-2 text-xs font-bold" /></div>
                
                <div className="space-y-6 pt-6 border-t mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Compliance Strategy</h3>
                  </div>
                  
                  <div className="space-y-4 bg-white p-4 rounded-2xl border">
                    <div className="flex items-center justify-between"><Label className="text-[10px] font-black uppercase">Individual participant Waiver?</Label><Switch checked={requiresWaiver} onCheckedChange={setRequiresWaiver} /></div>
                    {requiresWaiver && (
                      <div className="space-y-2">
                        <Label className="text-[8px] font-black uppercase text-muted-foreground ml-1">Participant Legal Text (Individual)</Label>
                        <Textarea placeholder="Terms for players/parents to sign personally..." value={waiverText} onChange={e => setWaiverText(e.target.value)} className="rounded-xl min-h-[100px] border-2 text-xs font-bold bg-muted/10" />
                      </div>
                    )}
                  </div>
                  
                  {isTournamentMode && (
                    <div className="space-y-4 bg-white p-4 rounded-2xl border">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase">Squad Participation Agreement</Label>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase leading-tight italic">This text is signed once by the guest coach for their entire squad.</p>
                        <Textarea placeholder="Define tournament rules and squad liability terms..." value={teamWaiverText} onChange={e => setTeamWaiverText(e.target.value)} className="rounded-xl min-h-[120px] border-2 text-xs font-bold bg-muted/10" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 lg:p-8 space-y-6 bg-background flex flex-col min-h-0 overflow-hidden">
              {isTournamentMode ? (
                <Tabs defaultValue="teams" className="flex-1 flex flex-col min-h-0">
                  <TabsList className="bg-muted/50 h-11 p-1 mb-6 shrink-0"><TabsTrigger value="teams" className="font-black text-[10px] uppercase px-6 flex-1">Squads</TabsTrigger><TabsTrigger value="games" className="font-black text-[10px] uppercase px-6 flex-1">Brackets</TabsTrigger><TabsTrigger value="generator" className="font-black text-[10px] uppercase px-6 flex-1">Generator</TabsTrigger></TabsList>
                  <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="space-y-6">
                        <TabsContent value="teams" className="space-y-6 mt-0">
                          <div className="flex gap-2"><Input placeholder="Squad Name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 rounded-xl" /><Button onClick={() => { if(newTeamName.trim() && !tournamentTeams.includes(newTeamName.trim())) { setTournamentTeams([...tournamentTeams, newTeamName.trim()]); setNewTeamName(''); } }} className="h-12 px-6 rounded-xl">Add</Button></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{tournamentTeams.map((t, i) => (<div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border"><span className="font-black text-xs uppercase truncate">{t}</span><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setTournamentTeams(tournamentTeams.filter((_, idx) => idx !== i))}><X className="h-3.5 w-3.5" /></Button></div>))}</div>
                        </TabsContent>
                        <TabsContent value="games" className="space-y-6 mt-0">
                          <div className="flex items-center justify-between"><Button variant="outline" size="sm" onClick={() => setTournamentGames([...tournamentGames, { id: `game_${Date.now()}`, team1: tournamentTeams[0] || 'Team A', team2: tournamentTeams[1] || 'Team B', score1: 0, score2: 0, date: newDate, time: '10:00 AM', isCompleted: false }])} className="font-black text-[10px] uppercase">+ New Match</Button></div>
                          {tournamentGames.map((game) => (
                            <div key={game.id} className="p-4 bg-muted/20 rounded-2xl border-2 space-y-4 relative">
                              <div className="flex gap-2"><input type="date" value={game.date} onChange={e => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, date: e.target.value} : g))} className="flex-1 h-9 rounded-xl font-bold bg-background px-3 border text-xs" /><input type="time" value={game.time} onChange={e => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, time: e.target.value} : g))} className="w-24 h-9 rounded-xl font-bold bg-background px-3 border text-xs" /></div>
                              <div className="flex items-center gap-4"><Select value={game.team1} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team1: v} : g))}><SelectTrigger className="h-10 rounded-xl font-bold"><SelectValue /></SelectTrigger><SelectContent>{tournamentTeams.map((t, idx) => <SelectItem key={idx} value={t}>{t}</SelectItem>)}</SelectContent></Select><span className="font-black text-[10px]">VS</span><Select value={game.team2} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team2: v} : g))}><SelectTrigger className="h-10 rounded-xl font-bold"><SelectValue /></SelectTrigger><SelectContent>{tournamentTeams.map((t, idx) => <SelectItem key={idx} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                              <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => setTournamentGames(tournamentGames.filter(g => g.id !== game.id))}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          ))}
                        </TabsContent>
                        <TabsContent value="generator" className="space-y-6 mt-0">
                          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1"><Label className="text-[10px] font-black uppercase">Type</Label><Select value={genType} onValueChange={setGenType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="round_robin">Round Robin</SelectItem><SelectItem value="pool_play">Pool Play</SelectItem></SelectContent></Select></div>
                              <div className="space-y-1"><Label className="text-[10px] font-black uppercase">Duration (Min)</Label><Input type="number" value={genMatchLength} onChange={e => setGenMatchLength(e.target.value)} /></div>
                            </div>
                            <Button className="w-full h-14 rounded-xl font-black uppercase" onClick={handleGenerateSchedule} disabled={isGenerating}>{isGenerating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Forging...</> : "Generate Tactical Schedule"}</Button>
                          </div>
                        </TabsContent>
                      </div>
                    </ScrollArea>
                  </div>
                </Tabs>
              ) : (<div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[2rem] text-center opacity-60"><Zap className="h-10 w-10 text-primary mx-auto mb-2" /><p className="font-bold uppercase tracking-widest text-xs">Standard Match Protocol</p></div>)}
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 shrink-0" onClick={handleCreateEvent}>{editingEvent ? "Update" : "Publish"} Event Hub</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-12">
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2>
            <div className="flex bg-muted/50 p-1 rounded-xl border"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase">History</Button></div>
          </div>
          <div className="grid gap-4">
            {filteredEvents.map((event) => (
              <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} onEdit={handleEdit} onDelete={deleteEvent} hasAttendance={true} purchasePro={purchasePro}>
                <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
                  <div className="flex items-stretch h-32">
                    <div className={cn("w-20 lg:w-24 flex flex-col items-center justify-center border-r-2 shrink-0", event.isTournament ? "bg-black text-white" : "bg-primary/5 text-primary")}>
                      <span className="text-[8px] font-black uppercase opacity-60">{format(new Date(event.date), 'MMM')}</span>
                      <span className="text-3xl lg:text-4xl font-black">{format(new Date(event.date), 'dd')}</span>
                    </div>
                    <div className="flex-1 p-4 lg:p-6 flex flex-col justify-center min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex gap-2 mb-1.5">{event.isTournament && <Badge className="bg-black text-white text-[7px] uppercase">Tournament</Badge>}<Badge variant="outline" className="text-[7px] uppercase">{event.startTime}</Badge></div>
                          <h3 className="text-lg lg:text-xl font-black tracking-tight leading-none truncate">{event.title}</h3>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {event.location}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all mt-2" />
                      </div>
                    </div>
                  </div>
                </Card>
              </EventDetailDialog>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Switch({ checked, onCheckedChange }: { checked: boolean, onCheckedChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onCheckedChange(!checked)} className={cn("w-10 h-6 rounded-full transition-colors relative", checked ? "bg-primary" : "bg-muted")}>
      <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}
