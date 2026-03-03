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
  History
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam, TeamEvent, CustomFormField, FormFieldType, TournamentGame, League } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, collectionGroup, where, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, isSameDay, isPast, isFuture } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';

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

function FeaturePaywall({ purchasePro, title, desc, icon: Icon }: { purchasePro: () => void, title: string, desc: string, icon: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-6 animate-in fade-in duration-500 h-full">
      <div className="bg-primary/10 p-6 rounded-[2rem] relative"><Icon className="h-12 w-12 text-primary" /><Lock className="absolute -top-2 -right-2 h-6 w-6 bg-black text-white p-1 rounded-full border-2 border-background shadow-lg" /></div>
      <div className="space-y-2"><h3 className="text-xl font-black uppercase tracking-tight">{title}</h3><p className="text-sm text-muted-foreground font-bold uppercase tracking-widest max-w-xs mx-auto leading-relaxed">{desc}</p></div>
      <Button className="rounded-xl h-12 px-8 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20" onClick={purchasePro}>Upgrade Squad</Button>
    </div>
  );
}

function EventDetailDialog({ event, updateRSVP, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members = [], teams = [], user, updateEvent, signTeamTournamentWaiver, activeTeam, isPro } = useTeam();
  const db = useFirestore();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);

  const regQuery = useMemoFirebase(() => {
    if (!db || !event?.id || !event?.teamId) return null;
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event?.id, event?.teamId]);
  const { data: rawRegistrations } = useCollection<any>(regQuery);
  const registrations = rawRegistrations || [];

  const isEliteUnlocked = !!event.isTournamentPaid;
  
  const myTeamNames = teams.filter(t => t.role === 'Admin').map(t => t.name);
  const myParticipatingTeamName = event.tournamentTeams?.find(tn => myTeamNames.includes(tn));
  const isWaiverSignedForMyTeam = myParticipatingTeamName ? !!event.teamAgreements?.[myParticipatingTeamName]?.agreed : false;

  const copyPublicLink = () => {
    if (!isEliteUnlocked) { toast({ title: "Elite Feature", description: "This hub requires an Elite Tournament Module." }); return; }
    const url = `${window.location.origin}/tournaments/public/${event.teamId}/${event.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Spectator Hub Link Copied" });
  };

  const downloadAuditCSV = () => {
    if (!isEliteUnlocked) return;
    const standings = calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []);
    const matchRows = (event.tournamentGames || []).map(g => [g.date, g.time, g.team1, g.score1, g.team2, g.score2, g.winnerId || 'TBD', event.location]);
    const standingsRows = standings.map(s => [s.name, s.wins, s.losses, s.ties, s.points]);
    
    let csvContent = "data:text/csv;charset=utf-8,STANDINGS\nName,Wins,Losses,Ties,Points\n";
    csvContent += standingsRows.map(e => e.join(",")).join("\n");
    csvContent += "\n\nMATCHES\nDate,Time,Team 1,Score 1,Team 2,Score 2,Winner,Location\n";
    csvContent += matchRows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_${event.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      if (!groups[game.date]) groups[game.date] = [];
      groups[game.date].push(game);
    });
    return groups;
  }, [event.tournamentGames]);

  const currentStatus = event.userRsvps?.[user?.id || ''];
  const isUserStaff = members.find(m => m.userId === user?.id && ['Coach', 'Team Lead', 'Assistant Coach', 'Squad Leader', 'Manager', 'Platform Admin'].includes(m.position));

  return (
    <Dialog onOpenChange={(open) => { if(!open) setEditingGame(null); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-7xl p-0 overflow-hidden sm:rounded-[2.5rem] h-full sm:h-[90vh] flex flex-col border-none shadow-2xl">
        <DialogTitle className="sr-only">{event.title}</DialogTitle>
        <ScrollArea className="flex-1">
          <div className="flex flex-col lg:flex-row h-full min-h-full">
            {/* Left Strategic Pane */}
            <div className="lg:w-1/3 bg-black text-white p-6 lg:p-8 lg:border-r space-y-8 flex flex-col">
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
                  {event.isTournament && (
                    <Button onClick={copyPublicLink} variant="outline" className={cn("w-full rounded-xl h-12 font-black text-xs uppercase gap-3 border-white", isEliteUnlocked ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white/40 border-dashed")}>
                      {isEliteUnlocked ? <Share2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}Share Spectator Hub {isEliteUnlocked ? "" : "(Elite Only)"}
                    </Button>
                  )}
                  {myParticipatingTeamName && !isWaiverSignedForMyTeam && (
                    <Button onClick={() => signTeamTournamentWaiver(event.teamId, event.id, myParticipatingTeamName)} className="w-full rounded-xl h-14 font-black text-sm uppercase gap-3 bg-primary text-white shadow-xl shadow-primary/20">
                      <Signature className="h-5 w-5" /> Sign Team Waiver
                    </Button>
                  )}
                </div>
              </div>
              {event.isTournament && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Global Standings</h4>
                    {isEliteUnlocked && isAdmin && <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-primary" onClick={downloadAuditCSV}><Download className="h-3.5 w-3.5" /></Button>}
                  </div>
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
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Elite Standings Locked</p>
                        <p className="text-[8px] font-bold text-white/60 uppercase leading-relaxed text-center">Standings and public hubs require the Elite Tournament Module Add-on.</p>
                      </div>
                      <Button variant="secondary" size="sm" className="h-8 rounded-lg text-[8px] font-black uppercase tracking-widest w-full bg-primary text-white" onClick={() => router.push('/pricing')}>Get Elite Module</Button>
                    </div>
                  )}
                </div>
              )}
              {isAdmin && (
                <div className="pt-6 border-t border-white/10 flex gap-3 mt-auto">
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
            <div className="flex-1 flex flex-col bg-background h-full">
              <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1 flex flex-col">
                <div className="px-6 lg:px-10 py-6 border-b bg-muted/30">
                  <TabsList className="bg-white/50 h-14 p-1.5 rounded-2xl shadow-inner border w-full lg:w-fit overflow-x-auto no-scrollbar">
                    {event.isTournament && (
                      <TabsTrigger value="bracket" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Match Schedule</TabsTrigger>
                    )}
                    <TabsTrigger value="roster" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Squad Roster</TabsTrigger>
                    {event.isTournament && (
                      <TabsTrigger value="admin" className="rounded-xl font-black text-[10px] lg:text-xs uppercase px-4 lg:px-8 flex-1 lg:flex-none data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                    )}
                  </TabsList>
                </div>
                
                <div className="flex-1 p-6 lg:p-10">
                  <TabsContent value="bracket" className="mt-0 space-y-10">
                    <div className="space-y-12">
                      {Object.entries(groupedGames).map(([date, games]) => (
                        <div key={date} className="space-y-6">
                          <div className="flex items-center gap-4 px-2">
                            <Badge className="bg-black text-white font-black uppercase text-[10px] px-4 h-7 shadow-lg">{format(new Date(date), 'EEEE, MMM d')}</Badge>
                            <div className="h-px bg-muted flex-1" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {games.map((game) => (
                              <button key={game.id} onClick={() => isAdmin && setEditingGame(game)} className="p-5 bg-white rounded-3xl border shadow-sm transition-all text-left relative overflow-hidden group ring-1 ring-black/5 active:scale-95">
                                <div className="flex justify-between items-center mb-4">
                                  <Badge variant="outline" className="text-[8px] font-black uppercase border-black/10 tracking-widest px-2 h-5">{game.time}</Badge>
                                  {game.isCompleted && <Badge className="text-[8px] font-black uppercase h-5 px-2 bg-black text-white">Final</Badge>}
                                </div>
                                <div className="grid grid-cols-7 items-center gap-4">
                                  <div className="col-span-3 text-right">
                                    <div className="flex items-center justify-end gap-2 mb-1">
                                      <p className="font-black text-xs uppercase truncate">{game.team1}</p>
                                      {game.winnerId === game.team1 && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                    </div>
                                    <p className="text-3xl font-black text-primary leading-none">{game.score1}</p>
                                  </div>
                                  <div className="col-span-1 flex items-center justify-center opacity-20 font-black text-[10px]">VS</div>
                                  <div className="col-span-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      {game.winnerId === game.team2 && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                      <p className="font-black text-xs uppercase truncate">{game.team2}</p>
                                    </div>
                                    <p className="text-3xl font-black text-primary leading-none">{game.score2}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="roster" className="mt-0 h-full">
                    {!isPro ? (
                      <FeaturePaywall purchasePro={purchasePro} icon={Users} title="Squad Roster Locked" desc="Detailed event rosters and real-time RSVP tracking require a Pro squad subscription." />
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
                  <TabsContent value="admin" className="mt-0 space-y-6 h-full">
                    {!isEliteUnlocked ? (
                      <FeaturePaywall purchasePro={() => router.push('/pricing')} icon={ShieldCheck} title="Audit Ledger Locked" desc="Compliance audits and digital signature tracking require the Elite Tournament Module Add-on." />
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                          {event.tournamentTeams?.map(teamName => { 
                            const res = event.teamAgreements?.[teamName]; 
                            return (
                              <div key={teamName} className="flex items-center justify-between p-5 rounded-2xl border bg-white shadow-sm">
                                <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center border text-primary"><ShieldAlert className="h-5 w-5" /></div>
                                  <div>
                                    <p className="font-black text-sm uppercase tracking-tight">{teamName}</p>
                                    <p className="text-[8px] font-bold text-muted-foreground uppercase">Participating Squad</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  {res?.agreed ? (
                                    <Badge className="bg-green-100 text-green-700 h-7 px-4 border-none font-black text-[9px] uppercase tracking-widest rounded-full"><Check className="h-3 w-3 mr-2" /> Verified</Badge>
                                  ) : (
                                    <Badge variant="outline" className="h-7 px-4 font-black text-[9px] uppercase tracking-widest opacity-40 rounded-full border-dashed">Pending</Badge>
                                  )}
                                  {isAdmin && (
                                    <Checkbox checked={res?.agreed || false} onCheckedChange={() => { updateEvent(event.id, { [`teamAgreements.${teamName}`]: { agreed: !res?.agreed, captainName: user?.name || 'Verified by Host', timestamp: new Date().toISOString() } }); }} className="h-6 w-6 rounded-lg" />
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
                {!isUserStaff && (
                  <div className="p-6 border-t bg-muted/20 sticky bottom-0">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
                      <div className="text-center sm:text-left space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Attendance Response</p>
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
              </div>
            </div>
          </div>
        </ScrollArea>

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
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g).map(g => { if (g.isCompleted) { if (g.score1 > g.score2) return { ...g, winnerId: g.team1 }; if (g.score2 > g.score1) return { ...g, winnerId: g.team2 }; } return g; }); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); toast({ title: "Ledger Updated" }); }}>Commit Results</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, isSuperAdmin, hasFeature, purchasePro, user } = useTeam();
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

  const leaguesQuery = useMemoFirebase(() => { if (!activeTeam?.leagueIds?.length || !db) return null; return query(collection(db, 'leagues'), where('__name__', 'in', activeTeam.leagueIds)); }, [activeTeam?.leagueIds, db]);
  const { data: teamLeagues } = useCollection<League>(leaguesQuery);
  const leagueOpponents = useMemo(() => { if (!teamLeagues) return []; const all: any[] = []; teamLeagues.forEach(l => { Object.entries(l.teams).forEach(([tid, tdata]) => { if (tid !== activeTeam?.id) all.push({ teamId: tid, teamName: tdata.teamName, leagueId: l.id, leagueName: l.name }); }); }); return all; }, [teamLeagues, activeTeam?.id]);

  const invitedTournamentsQuery = useMemoFirebase(() => {
    if (!activeTeam?.id || !activeTeam?.name || !db || !user || activeTeam.isDemo) return null;
    const teamName = activeTeam.name.trim();
    if (teamName === '' || teamName === 'Select Squad' || teamName === 'Unnamed Team' || teamName.startsWith('Guest')) return null;
    return query(collectionGroup(db, 'events'), where('tournamentTeams', 'array-contains', teamName), limit(20));
  }, [activeTeam?.id, activeTeam?.name, activeTeam?.isDemo, db, user?.id]);
  const { data: rawInvites } = useCollection<TeamEvent>(invitedTournamentsQuery);
  const invitedTournaments = rawInvites || [];

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
  const [tournamentTeams, setTournamentTeams] = useState<string[]>([]);
  const [tournamentGames, setTournamentGames] = useState<TournamentGame[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | 'none'>('none');
  const [selectedOpponentTeamId, setSelectedOpponentTeamId] = useState<string | 'manual'>('manual');

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canAccessElite = (user?.tournamentCredits || 0) > 0;

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
    setTournamentTeams(event.tournamentTeams || []); 
    setTournamentGames(event.tournamentGames || []); 
    setSelectedLeagueId(event.leagueId || 'none'); 
    setSelectedOpponentTeamId(event.opponentTeamId || 'manual'); 
    setIsCreateOpen(true); 
  };

  const handleOpenEliteBuilder = () => {
    if (!canAccessElite) {
      toast({ title: "Elite Module Required", description: "You need 1 Tournament Credit to publish an Elite event hub.", variant: "destructive" });
      router.push('/pricing');
      return;
    }
    setIsTournamentMode(true);
    setIsEliteTournament(true);
    setIsCreateOpen(true);
  };

  const resetForm = () => { setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); setNewLocation(''); setNewDescription(''); setTournamentTeams([]); setTournamentGames([]); setIsEliteTournament(false); setSelectedLeagueId('none'); setSelectedOpponentTeamId('manual'); };
  
  const handleCreateEvent = () => { 
    if (!newTitle || !newDate) return; 
    
    if (isEliteTournament && !canAccessElite && !editingEvent) {
      toast({ title: "Elite Module Required", description: "You need 1 Tournament Credit to publish an Elite event hub.", variant: "destructive" });
      router.push('/pricing');
      return;
    }

    const payload: any = { title: newTitle, date: new Date(newDate).toISOString(), startTime: newTime || 'TBD', location: newLocation, description: newDescription, isTournament: isTournamentMode, isTournamentPaid: isEliteTournament, tournamentTeams, tournamentGames, lastUpdated: new Date().toISOString() }; 
    if (isTournamentMode && newEndDate) payload.endDate = new Date(newEndDate).toISOString(); 
    if (!isTournamentMode && selectedLeagueId !== 'none') { payload.leagueId = selectedLeagueId; payload.opponentTeamId = selectedOpponentTeamId; } 
    if (editingEvent) updateEvent(editingEvent.id, payload); else addEvent(payload); 
    setIsCreateOpen(false); 
    resetForm(); 
  };

  const formatBadgeDate = (start: string | Date, end?: string | Date) => {
    const startDate = new Date(start); const startDay = format(startDate, 'dd');
    if (!end) return startDay; const endDate = new Date(end);
    if (isSameDay(startDate, endDate)) return startDay; return `${startDay}-${format(endDate, 'dd')}`;
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] px-3 h-6">Tactical Hub</Badge><h1 className="text-4xl font-black uppercase tracking-tight">Schedule</h1></div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg" onClick={() => { setIsTournamentMode(false); setIsEliteTournament(false); setIsCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Match
            </Button>
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-black text-white" onClick={() => { setIsTournamentMode(true); setIsEliteTournament(false); setIsCreateOpen(true); }}>
              <Trophy className="h-4 w-4 mr-2 text-primary" /> Tournament
            </Button>
            <Button size="sm" className="rounded-full h-11 px-6 font-black uppercase text-xs shadow-lg bg-primary text-white border-none relative group overflow-hidden" onClick={handleOpenEliteBuilder}>
              <Sparkles className="h-4 w-4 mr-2" /> 
              Elite Tournament Hub
              {!canAccessElite && <Lock className="absolute top-1 right-1 h-3 w-3 opacity-40" />}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl overflow-hidden p-0 sm:rounded-[2.5rem] h-full sm:h-auto sm:max-h-[90vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">Event Builder</DialogTitle>
          <ScrollArea className="flex-1">
            <div className="flex flex-col lg:flex-row h-full min-h-full lg:min-h-[600px]">
              {/* Context Sidebar */}
              <div className="lg:w-5/12 p-6 lg:p-8 lg:border-r space-y-6 bg-primary/5">
                <DialogHeader>
                  {isEliteTournament && <Badge className="bg-amber-500 text-white border-none font-black uppercase text-[8px] h-5 px-2 w-fit mb-2">Elite Add-on</Badge>}
                  <h2 className="text-2xl lg:text-3xl font-black tracking-tight">{editingEvent ? "Update" : "Launch"} {isTournamentMode ? (isEliteTournament ? "Elite Tournament" : "Tournament") : "Match"}</h2>
                  <p className="font-black text-primary uppercase tracking-widest text-[10px]">Strategic Coordination</p>
                </DialogHeader>
                <div className="space-y-4">
                  {!isTournamentMode && leagueOpponents.length > 0 && (
                    <div className="space-y-1.5 pb-2">
                      <Label className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest ml-1 text-primary">League Match? (Optional)</Label>
                      <Select value={selectedOpponentTeamId === 'manual' ? 'manual' : `${selectedLeagueId}_${selectedOpponentTeamId}`} onValueChange={(val) => { if (val === 'manual') { setSelectedOpponentTeamId('manual'); setSelectedLeagueId('none'); } else { const opt = leagueOpponents.find(o => `${o.leagueId}_${o.teamId}` === val); if (opt) { setSelectedOpponentTeamId(opt.teamId); setSelectedLeagueId(opt.leagueId); setNewTitle(`Vs ${opt.teamName}`); } } }}>
                        <SelectTrigger className="rounded-xl h-12 border-2 border-primary/20 bg-primary/5 font-black text-xs"><SelectValue placeholder="Select League Opponent" /></SelectTrigger>
                        <SelectContent className="rounded-xl"><SelectItem value="manual" className="font-bold">One-Off Match (Manual Name)</SelectItem>{leagueOpponents.map(o => (<SelectItem key={`${o.leagueId}_${o.teamId}`} value={`${o.leagueId}_${o.teamId}`} className="font-bold">{o.teamName} ({o.leagueName})</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label>
                    <Input placeholder={isTournamentMode ? "Regional Championship" : "e.g. Vs Tigers"} value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-black border-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                      <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" />
                    </div>
                    {isTournamentMode ? (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                        <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Time</Label>
                        <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full h-12 rounded-xl font-black border-2 bg-background px-3" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                    <Input placeholder="Stadium Name" value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                  </div>
                </div>
              </div>

              {/* Functional Ledger */}
              <div className="flex-1 p-6 lg:p-8 space-y-6 bg-background flex flex-col">
                {isTournamentMode ? (
                  <Tabs defaultValue="teams" className="flex-1 flex flex-col">
                    <TabsList className="bg-muted/50 h-11 p-1 mb-6 shrink-0">
                      <TabsTrigger value="teams" className="font-black text-[10px] uppercase px-6 flex-1">Teams</TabsTrigger>
                      <TabsTrigger value="games" className="font-black text-[10px] uppercase px-6 flex-1">Matchups</TabsTrigger>
                    </TabsList>
                    <TabsContent value="teams" className="space-y-6 mt-0 flex-1">
                      <div className="flex gap-2">
                        <Input placeholder="Team Name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 rounded-xl font-bold" />
                        <Button onClick={() => { if(newTeamName.trim() && !tournamentTeams.includes(newTeamName.trim())) { setTournamentTeams([...tournamentTeams, newTeamName.trim()]); setNewTeamName(''); } }} className="h-12 px-6 rounded-xl font-black uppercase">Add</Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tournamentTeams.map((t, i) => (
                          <div key={`${t}-${i}`} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border">
                            <span className="font-black text-xs uppercase truncate pr-2">{t}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTournamentTeams(tournamentTeams.filter((_, idx) => idx !== i))}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                    <TabsContent value="games" className="space-y-6 mt-0 flex-1">
                      <Button variant="outline" size="sm" onClick={() => setTournamentGames([...tournamentGames, { id: `game_${Date.now()}`, team1: tournamentTeams[0] || 'Team A', team2: tournamentTeams[1] || 'Team B', score1: 0, score2: 0, date: newDate, time: '10:00 AM', isCompleted: false }])} className="font-black text-[10px] uppercase">+ New Match</Button>
                      <div className="space-y-4">
                        {tournamentGames.map((game) => (
                          <div key={game.id} className="p-4 bg-muted/20 rounded-2xl border-2 space-y-4 relative group">
                            <input type="date" value={game.date} onChange={e => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, date: e.target.value} : g))} className="w-full h-9 rounded-xl font-bold bg-background px-3 border" />
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                              <Select value={game.team1} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team1: v} : g))}>
                                <SelectTrigger className="h-10 rounded-xl font-bold w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{tournamentTeams.map((t, idx) => <SelectItem key={`${t}-${idx}-1`} value={t}>{t}</SelectItem>)}</SelectContent>
                              </Select>
                              <div className="flex items-center gap-2 shrink-0">
                                <Input type="number" value={game.score1} onChange={e => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, score1: parseInt(e.target.value) || 0} : g))} className="w-16 h-10 text-center font-black" />
                                <span className="opacity-20 font-black text-[10px]">VS</span>
                                <Input type="number" value={game.score2} onChange={e => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, score2: parseInt(e.target.value) || 0} : g))} className="w-16 h-10 text-center font-black" />
                              </div>
                              <Select value={game.team2} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team2: v} : g))}>
                                <SelectTrigger className="h-10 rounded-xl font-bold w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>{tournamentTeams.map((t, idx) => <SelectItem key={`${t}-${idx}-2`} value={t}>{t}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-white shadow-sm border rounded-full text-destructive" onClick={() => setTournamentGames(tournamentGames.filter(g => g.id !== game.id))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[2rem] text-center opacity-60">
                    <Zap className="h-10 w-10 text-primary mx-auto mb-2" />
                    <p className="font-bold uppercase tracking-widest text-xs">Standard Match Protocol</p>
                  </div>
                )}
                <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-6 shrink-0" onClick={handleCreateEvent}>
                  {editingEvent ? "Update" : "Publish"} Event Hub
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="space-y-12">
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-primary" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Itinerary</h2></div>
            <div className="flex bg-muted/50 p-1 rounded-xl border"><Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-8 rounded-lg font-black text-[10px] uppercase tracking-widest">Live</Button><Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-8 rounded-lg font-black text-[10px] uppercase tracking-widest"><History className="h-3 w-3 mr-1.5" /> History</Button></div>
          </div>
          <div className="grid gap-4">
            {filteredEvents.length > 0 ? filteredEvents.map((event) => {
              const hasRange = event.endDate && !isSameDay(new Date(event.date), new Date(event.endDate));
              return (
                <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} onEdit={handleEdit} onDelete={(id) => { if(confirm("Purge Event?")) deleteEvent(id); }} hasAttendance={true} purchasePro={purchasePro}>
                  <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden bg-white">
                    <div className="flex items-stretch h-32">
                      <div className={cn("w-20 lg:w-24 flex flex-col items-center justify-center border-r-2 shrink-0", event.isTournament ? "bg-black text-white" : "bg-primary/5 text-primary")}>
                        <span className="text-[8px] lg:text-[10px] font-black uppercase mb-1 opacity-60">{format(new Date(event.date), 'MMM')}</span>
                        <span className={cn("font-black tracking-tighter text-center leading-none", hasRange ? "text-base lg:text-lg px-1" : "text-3xl lg:text-4xl")}>{formatBadgeDate(event.date, event.endDate)}</span>
                      </div>
                      <div className="flex-1 p-4 lg:p-6 flex flex-col justify-center min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex gap-2 mb-1.5">
                              {event.isTournament && <Badge className={cn("text-[7px] lg:text-[8px] font-black uppercase h-4 px-2", event.isTournamentPaid ? "bg-amber-500 text-white" : "bg-black text-white")}>{event.isTournamentPaid ? "Elite Hub" : "Tournament"}</Badge>}
                              <Badge variant="outline" className="text-[7px] lg:text-[8px] font-black uppercase h-4 px-2 truncate">{event.startTime}</Badge>
                            </div>
                            <h3 className="text-lg lg:text-xl font-black tracking-tight leading-none truncate pr-2">{event.title}</h3>
                            <div className="flex flex-col gap-1 mt-1"><p className="text-[9px] lg:text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 truncate"><MapPin className="h-3 w-3 text-primary shrink-0" /> {event.location}</p></div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all group-hover:translate-x-1 mt-2 shrink-0" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </EventDetailDialog>
              );
            }) : (
              <div className="text-center py-12 bg-muted/10 rounded-[2rem] border-2 border-dashed opacity-40">
                <CalendarX className="h-8 w-8 mx-auto mb-2" />
                <p className="text-xs font-black uppercase tracking-widest">No {filterMode} matches scheduled.</p>
              </div>
            )}
          </div>
        </section>

        {invitedTournaments.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-2"><ShieldAlert className="h-4 w-4 text-amber-500" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">External Tournament Invitations</h2></div>
            <div className="grid gap-4">{invitedTournaments.map((event) => {
              const hasRange = event.endDate && !isSameDay(new Date(event.date), new Date(event.endDate));
              return (
                <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={false} onEdit={() => {}} onDelete={() => {}} hasAttendance={false} purchasePro={purchasePro}>
                  <Card className="hover:border-amber-500/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-2 ring-amber-500/10 overflow-hidden bg-amber-50/30">
                    <div className="flex items-stretch h-32">
                      <div className="w-20 lg:w-24 bg-amber-500/5 flex flex-col items-center justify-center border-r-2 shrink-0"><span className="text-[8px] lg:text-[10px] font-black uppercase text-amber-600 mb-1">{format(new Date(event.date), 'MMM')}</span><span className={cn("font-black text-amber-600 tracking-tighter text-center leading-none", hasRange ? "text-base lg:text-lg px-1" : "text-3xl lg:text-4xl")}>{formatBadgeDate(event.date, event.endDate)}</span></div>
                      <div className="flex-1 p-4 lg:p-6 flex flex-col justify-center min-w-0"><div className="flex items-start justify-between"><div className="min-w-0 flex-1"><div className="flex gap-2 mb-1.5"><Badge className="bg-amber-600 text-white text-[7px] lg:text-[8px] font-black uppercase h-4 px-2">Invited Participant</Badge></div><h3 className="text-lg lg:text-xl font-black tracking-tight leading-none truncate pr-2">{event.title}</h3><div className="flex flex-col gap-1 mt-1"><p className="text-[9px] lg:text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 truncate"><MapPin className="h-3 w-3 text-amber-600 shrink-0" /> {event.location}</p></div></div><div className="flex flex-col items-end gap-2"><ChevronRight className="h-5 w-5 text-amber-600 opacity-20 group-hover:opacity-100 transition-all group-hover:translate-x-1 mt-2" />{event.teamAgreements?.[activeTeam?.name || '']?.agreed ? <Badge className="bg-green-600 text-white font-black text-[7px] uppercase h-4">Verified</Badge> : <Badge className="bg-amber-600 text-white font-black text-[7px] uppercase h-4 animate-pulse">Action Req.</Badge>}</div></div></div>
                    </div>
                  </Card>
                </EventDetailDialog>
              );
            })}</div>
          </section>
        )}
      </div>
    </div>
  );
}