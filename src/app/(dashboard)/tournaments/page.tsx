"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Plus, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  Clock, 
  ShieldCheck,
  Zap,
  Users,
  LayoutGrid,
  Filter,
  ArrowRight,
  ShieldAlert,
  Loader2,
  CalendarDays,
  X,
  FileSignature,
  Download,
  Terminal,
  Copy,
  Share2,
  Eye,
  Shield,
  ClipboardList,
  Target,
  CheckCircle2,
  FileText,
  HelpCircle,
  XCircle,
  Search,
  Table as TableIcon,
  Trash2
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame, Member } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, collectionGroup, deleteDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, isPast, isSameDay, addMinutes, eachDayOfInterval, parse as parseDate } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`;
  }
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
    if (!standings[t1] || !standings[t2]) return;
    
    if (game.score1 > game.score2) { 
      standings[t1].wins += 1; 
      standings[t1].points += 1; 
      standings[t2].losses += 1; 
      standings[t2].points -= 1; 
    }
    else if (game.score2 > game.score1) { 
      standings[t2].wins += 1; 
      standings[t2].points += 1; 
      standings[t1].losses += 1; 
      standings[t1].points -= 1; 
    }
    else { 
      standings[t1].ties += 1; 
      standings[t2].ties += 1; 
    }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { user, updateEvent, signTeamTournamentWaiver, isPro, activeTeam, members, formatTime, isStaff, updateRSVP } = useTeam();
  const db = useFirestore();
  
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [genMatchLength, setGenMatchLength] = useState('60');
  const [genBreakLength, setGenBreakLength] = useState('15');
  const [maxGamesPerDay, setMaxGamesPerDay] = useState('10');
  const [maxGamesPerTeam, setMaxGamesPerTeam] = useState('5');
  const [maxTotalGames, setMaxTotalGames] = useState('20');
  const [dayConfigs, setDayConfigs] = useState<Record<string, { start: string, end: string }>>({});
  const [baseUrl, setBaseUrl] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');

  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';

  const isOrganizer = isStaff && event.teamId === activeTeam?.id;

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
    
    if (event.isTournament && event.date) {
      const start = new Date(event.date);
      const end = event.endDate ? new Date(event.endDate) : start;
      try {
        const days = eachDayOfInterval({ start, end });
        const config: Record<string, { start: string, end: string }> = {};
        days.forEach(day => {
          const key = format(day, 'yyyy-MM-dd');
          config[key] = { start: '09:00', end: '21:00' };
        });
        setDayConfigs(config);
      } catch (e) {}
    }
  }, [event.date, event.endDate, event.isTournament]);

  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []), [event.tournamentTeams, event.tournamentGames]);
  
  const itineraryDays = useMemo(() => {
    if (!event.tournamentGames) return [];
    const daysSet = new Set<string>();
    event.tournamentGames.forEach(g => daysSet.add(g.date));
    return Array.from(daysSet).sort();
  }, [event.tournamentGames]);

  const [activeItineraryDay, setActiveItineraryDay] = useState<string>('');

  useEffect(() => {
    if (itineraryDays.length > 0 && !activeItineraryDay) {
      setActiveItineraryDay(itineraryDays[0]);
    }
  }, [itineraryDays, activeItineraryDay]);

  const dayGamesByField = useMemo(() => {
    if (!event.tournamentGames || !activeItineraryDay) return {};
    const filtered = event.tournamentGames.filter(g => g.date === activeItineraryDay);
    const groups: Record<string, TournamentGame[]> = {};
    filtered.forEach(game => {
      const key = game.location || 'Main Hub';
      if (!groups[key]) groups[key] = [];
      groups[key].push(game);
    });
    return groups;
  }, [event.tournamentGames, activeItineraryDay]);

  const handleGenerateSchedule = async () => {
    if (!event.tournamentTeams || event.tournamentTeams.length < 2) {
      toast({ title: "Incomplete Roster", description: "At least 2 squads must be enrolled.", variant: "destructive" });
      return;
    }

    const resources = [...(event.fieldIds || []), ...(event.manualLocations || []).map(m => `manual:${m}`)];
    if (resources.length === 0) resources.push(`manual:${event.location || 'Main Venue'}`);

    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1500));
    try {
      const games: TournamentGame[] = [];
      const teams = [...event.tournamentTeams];
      const matchMinutes = parseInt(genMatchLength);
      const breakMinutes = parseInt(genBreakLength);
      const maxPerDayLimit = parseInt(maxGamesPerDay);
      const maxPerTeamLimit = parseInt(maxGamesPerTeam);
      const totalMatchLimit = parseInt(maxTotalGames);
      
      const teamGameCounts: Record<string, number> = {};
      teams.forEach(t => teamGameCounts[t] = 0);

      const pairings: [string, string][] = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) pairings.push([teams[i], teams[j]]);
      }

      const days = Object.keys(dayConfigs).sort();
      const totalPairings = pairings.length;
      const totalDays = days.length;
      const targetMatchesPerDay = Math.ceil(totalPairings / totalDays);
      let pairingIdx = 0;

      for (const dayKey of days) {
        if (games.length >= totalMatchLimit || pairingIdx >= pairings.length) break;
        const config = dayConfigs[dayKey];
        let dayGameCount = 0;
        
        const resourceTimes: Record<string, string> = {};
        resources.forEach(rid => resourceTimes[rid] = config.start);

        const teamAvailability: Record<string, string> = {};
        teams.forEach(t => teamAvailability[t] = config.start);

        while (pairingIdx < pairings.length && dayGameCount < maxPerDayLimit && dayGameCount < targetMatchesPerDay && games.length < totalMatchLimit) {
          const pair = pairings[pairingIdx];
          if (teamGameCounts[pair[0]] >= maxPerTeamLimit || teamGameCounts[pair[1]] >= maxPerTeamLimit) {
            pairingIdx++; continue;
          }

          let bestResourceId = null;
          let earliestMatchTime = "23:59";

          for (const rid of resources) {
            const fieldReadyAt = resourceTimes[rid];
            const teamsReadyAt = teamAvailability[pair[0]] > teamAvailability[pair[1]] ? teamAvailability[pair[0]] : teamAvailability[pair[1]];
            const actualStart = fieldReadyAt > teamsReadyAt ? fieldReadyAt : teamsReadyAt;

            if (actualStart < earliestMatchTime && actualStart < config.end) {
              earliestMatchTime = actualStart;
              bestResourceId = rid;
            }
          }

          if (!bestResourceId) break;

          const displayTime = format(parseDate(earliestMatchTime, 'HH:mm', new Date()), 'h:mm a');
          let locationLabel = bestResourceId.includes(':') ? bestResourceId.split(':')[1] : bestResourceId;

          games.push({ 
            id: `gen_${Date.now()}_${pairingIdx}`, 
            team1: pair[0], team2: pair[1], score1: 0, score2: 0, 
            date: dayKey, time: displayTime, location: locationLabel, isCompleted: false 
          });

          const [h, m] = earliestMatchTime.split(':').map(Number);
          const nextAvailable = format(addMinutes(new Date(2000, 0, 1, h, m), matchMinutes + breakMinutes), 'HH:mm');
          resourceTimes[bestResourceId] = nextAvailable;
          teamAvailability[pair[0]] = nextAvailable;
          teamAvailability[pair[1]] = nextAvailable;
          teamGameCounts[pair[0]]++; teamGameCounts[pair[1]]++;
          pairingIdx++; dayGameCount++;
        }
      }

      await updateEvent(event.id, { tournamentGames: games });
      toast({ title: "Itinerary Synchronized", description: `${games.length} matchups established.` });
    } catch (err) {
      toast({ title: "Deployment Failure", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    const currentTeams = event.tournamentTeams || [];
    const updatedTeams = [...currentTeams, newTeamName.trim()];
    const emails = event.invitedTeamEmails || {};
    if (newTeamEmail.trim()) {
      emails[newTeamName.trim()] = newTeamEmail.trim();
    }
    await updateEvent(event.id, { tournamentTeams: updatedTeams, invitedTeamEmails: emails });
    setNewTeamName('');
    setNewTeamEmail('');
    toast({ title: "Team Enrolled", description: `${newTeamName} added to roster.` });
  };

  const confirmedTeams = useMemo(() => {
    if (!event.tournamentTeams || !event.teamAgreements) return [];
    return event.tournamentTeams.filter(team => event.teamAgreements?.[team]?.agreed);
  }, [event.tournamentTeams, event.teamAgreements]);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 min-h-screen pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-3 shadow-lg shadow-primary/20">Operational Hub</Badge>
            <h1 className="text-4xl font-black uppercase tracking-tight mt-1">{event.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest"><CalendarIcon className="h-4 w-4 mr-2" /> {formatDateRange(event.date, event.endDate)}</Badge>
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest"><MapPin className="h-4 w-4 mr-2" /> {event.location}</Badge>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-1/3 flex flex-col text-white bg-black rounded-[3rem] p-8 lg:p-10 space-y-8 relative overflow-y-auto sm:overflow-visible">
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Event Brief</p>
            <p className="text-sm font-medium text-white/80 leading-relaxed italic">"{event.description || 'No specific coordination notes established.'}"</p>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Tactical RSVP</p>
            <div className="grid grid-cols-1 gap-2">
              <Button 
                variant={myRsvp === 'going' ? 'default' : 'outline'} 
                className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'going' ? "bg-primary border-none" : "bg-white/5 border-white/10")}
                onClick={() => updateRSVP(event.id, 'going')}
              >
                Going
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant={myRsvp === 'maybe' ? 'default' : 'outline'} 
                  className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-50 border-none" : "bg-white/5 border-white/10")}
                  onClick={() => updateRSVP(event.id, 'maybe')}
                >
                  Maybe
                </Button>
                <Button 
                  variant={myRsvp === 'declined' ? 'default' : 'outline'} 
                  className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600 border-none" : "bg-white/5 border-white/10")}
                  onClick={() => updateRSVP(event.id, 'declined')}
                >
                  Decline
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10 pb-10">
            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leadership Board</h4>
            <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
              {standings.length > 0 ? standings.map((team) => (
                <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                  <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                  <Badge className={cn("text-white border-none font-black text-[9px] px-2 h-5", team.points >= 0 ? "bg-primary" : "bg-destructive")}>{team.points > 0 ? `+${team.points}` : team.points} PTS</Badge>
                </div>
              )) : (
                <p className="p-6 text-center text-[10px] font-bold text-white/20 uppercase tracking-widest italic">Awaiting results...</p>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-[3rem] border-2 shadow-sm overflow-hidden">
          <Tabs defaultValue="bracket" className="w-full flex flex-col h-full">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl shadow-inner border w-full overflow-x-auto flex-wrap sm:flex-nowrap custom-scrollbar">
                <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Itinerary</TabsTrigger>
                <TabsTrigger value="standings" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Standings</TabsTrigger>
                <TabsTrigger value="attendance" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                {isOrganizer && (
                  <>
                    <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                    <TabsTrigger value="manage" className="rounded-xl font-black text-xs uppercase px-6 sm:px-8 data-[state=active]:bg-primary data-[state=active]:text-white">Deploy</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            <div className="flex-1 p-8 lg:p-10 pb-24 overflow-y-auto custom-scrollbar">
              <TabsContent value="bracket" className="mt-0 space-y-10">
                {itineraryDays.length > 0 ? (
                  <div className="space-y-8">
                    <div className="flex bg-muted/50 p-1.5 rounded-2xl border w-fit mx-auto shadow-inner overflow-x-auto max-w-full custom-scrollbar">
                      {itineraryDays.map(day => (
                        <Button 
                          key={day} 
                          variant={activeItineraryDay === day ? 'default' : 'ghost'} 
                          onClick={() => setActiveItineraryDay(day)}
                          className="h-10 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap"
                        >
                          {format(new Date(day), 'MMM d')}
                        </Button>
                      ))}
                    </div>

                    <div className="space-y-12">
                      {Object.entries(dayGamesByField).map(([fieldName, games]) => (
                        <div key={fieldName} className="space-y-6">
                          <Badge className="bg-primary text-white font-black uppercase text-[10px] px-6 h-8 rounded-full shadow-lg shadow-primary/20">{fieldName}</Badge>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            {games.map((game) => (
                              <button 
                                key={game.id} 
                                onClick={() => isOrganizer && setEditingGame(game)} 
                                className="w-full p-8 bg-white rounded-[3rem] border-2 shadow-sm transition-all text-left relative group ring-1 ring-black/5 hover:border-primary/30 active:scale-[0.98]"
                              >
                                <div className="absolute top-6 left-8"><Badge variant="outline" className="text-[10px] font-black uppercase h-7 px-3 border-2">{game.time}</Badge></div>
                                {game.isCompleted && <div className="absolute top-6 right-8"><Badge className="text-[8px] font-black uppercase h-5 px-2 bg-black text-white border-none">FINAL</Badge></div>}
                                <div className="grid grid-cols-7 items-center gap-4 text-center mt-10">
                                  <div className="col-span-3 space-y-2">
                                    <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team1}</p>
                                    <p className={cn("text-3xl font-black", game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-foreground")}>{game.score1}</p>
                                  </div>
                                  <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                                  <div className="col-span-3 space-y-2">
                                    <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team2}</p>
                                    <p className={cn("text-3xl font-black", game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-foreground")}>{game.score2}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-32 bg-muted/10 rounded-[3rem] border-2 border-dashed opacity-40">
                    <Zap className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <p className="font-black uppercase tracking-widest text-lg">Itinerary not yet established.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="standings" className="mt-0">
                <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                        <tr>
                          <th className="px-10 py-6">Squad</th>
                          <th className="px-6 py-6 text-center">W</th>
                          <th className="px-6 py-6 text-center">L</th>
                          <th className="px-6 py-6 text-center">T</th>
                          <th className="px-10 py-6 text-right text-primary font-black">POINTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted/50">
                        {standings.map((team, idx) => (
                          <tr key={team.name} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-10 py-8">
                              <div className="flex items-center gap-4">
                                <span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                                <span className="font-black text-base uppercase tracking-tight truncate">{team.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-8 text-center font-bold text-lg">{team.wins}</td>
                            <td className="px-6 py-8 text-center font-bold text-lg text-muted-foreground">{team.losses}</td>
                            <td className="px-6 py-8 text-center font-bold text-lg text-muted-foreground">{team.ties}</td>
                            <td className="px-10 py-8 text-right font-black text-2xl text-primary">{team.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="attendance" className="mt-0 space-y-12">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tight">{activeTeam?.name} Tourney Roster</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {members.map(member => {
                      const rsvp = event.userRsvps?.[member.userId] || 'no_response';
                      return (
                        <Card key={member.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 rounded-xl border">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                  <p className="font-black text-xs uppercase truncate">{member.name}</p>
                                  <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                            </div>
                            <Badge className={cn(
                              "border-none font-black text-[8px] uppercase px-2 h-5",
                              rsvp === 'going' ? "bg-green-100 text-green-700" : rsvp === 'maybe' ? "bg-amber-100 text-amber-700" : rsvp === 'declined' ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                            )}>{rsvp.replace('_', ' ')}</Badge>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Confirmed Strategic Partners</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {confirmedTeams.map(teamName => (
                      <Card key={teamName} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-5 bg-green-50/30 border-green-100/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="bg-white p-2.5 rounded-xl shadow-sm border border-green-100">
                              <ShieldCheck className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-black text-sm uppercase truncate">{teamName}</p>
                              <p className="text-[8px] font-bold text-green-700 uppercase tracking-widest">VERIFIED SQUAD</p>
                            </div>
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                      </Card>
                    ))}
                    {confirmedTeams.length === 0 && (
                      <div className="col-span-full py-12 text-center border-2 border-dashed rounded-3xl opacity-30 italic font-bold text-xs uppercase tracking-widest">
                        Awaiting squad confirmations...
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {isOrganizer && (
                <TabsContent value="compliance" className="mt-0">
                  <div className="grid grid-cols-1 gap-4">
                    {event.tournamentTeams?.map(team => (
                      <div key={team} className="flex items-center justify-between p-6 bg-white rounded-[2rem] border shadow-sm ring-1 ring-black/5">
                        <div className="flex items-center gap-6">
                          <div className="bg-muted p-3 rounded-2xl"><Users className="h-6 w-6 text-muted-foreground" /></div>
                          <div>
                            <span className="font-black text-lg uppercase tracking-tight">{team}</span>
                            {event.teamAgreements?.[team] && <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">Signed by: {event.teamAgreements[team].captainName}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {event.teamAgreements?.[team]?.agreed ? (
                            <>
                              <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] px-4 h-8 flex items-center gap-2 rounded-full"><CheckCircle2 className="h-4 w-4" /> VERIFIED</Badge>
                              <Button variant="ghost" size="icon" className="h-10 w-10 text-primary" onClick={() => toast({ title: "Audit Success", description: "Signed waiver verified in squad vault." })}><Download className="h-4 w-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Badge variant="outline" className="border-amber-500/20 text-amber-600 font-black text-[10px] px-4 h-8 rounded-full">PENDING</Badge>
                              <Button size="sm" variant="ghost" className="h-8 px-4 text-[8px] font-black uppercase border rounded-full" onClick={() => signTeamTournamentWaiver(event.teamId, event.id, team)}>Manual Override</Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="portals" className="mt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden p-8 space-y-6">
                    <div className="flex items-center gap-4"><Eye className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase">Spectator Hub</h3></div>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">Public link for live scores and standings.</p>
                    <div className="flex gap-2"><Input readOnly value={`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`} className="h-12 text-[10px] font-mono bg-muted/30 border-none" /><Button size="icon" variant="secondary" className="h-12 w-12 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-5 w-5" /></Button></div>
                  </Card>
                  <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden p-8 space-y-6">
                    <div className="flex items-center gap-4"><Terminal className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase">Scorekeeper Hub</h3></div>
                    <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">Portal for marshals to log match results.</p>
                    <div className="flex gap-2"><Input readOnly value={`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`} className="h-12 text-[10px] font-mono bg-muted/30 border-none" /><Button size="icon" variant="secondary" className="h-12 w-12 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-5 w-5" /></Button></div>
                  </Card>
                  {isOrganizer && (
                    <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden p-8 space-y-6">
                      <div className="flex items-center gap-4"><FileSignature className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase">Waiver Portal</h3></div>
                      <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">Public link for digital coach signatures.</p>
                      <div className="flex gap-2"><Input readOnly value={`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`} className="h-12 text-[10px] font-mono bg-muted/30 border-none" /><Button size="icon" variant="secondary" className="h-12 w-12 shrink-0 rounded-xl" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`); toast({ title: "Link Copied" }); }}><Copy className="h-5 w-5" /></Button></div>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {isOrganizer && (
                <TabsContent value="manage" className="mt-0 space-y-10">
                  <div className="bg-muted/20 p-8 rounded-[2.5rem] border-2 border-dashed space-y-6">
                    <div className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase tracking-tight">Tournament Roster</h3></div>
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-2xl border shadow-sm">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label>
                          <Input placeholder="e.g. Metro Warriors" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 border-2 rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Coach Email</Label>
                          <Input placeholder="coach@example.com" value={newTeamEmail} onChange={e => setNewTeamEmail(e.target.value)} className="h-12 border-2 rounded-xl" />
                        </div>
                        <Button className="md:col-span-2 h-12 rounded-xl font-black uppercase text-xs" onClick={handleAddTeam} disabled={!newTeamName.trim()}><Plus className="h-4 w-4 mr-2" /> Enroll Squad</Button>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {event.tournamentTeams?.map(team => (
                          <div key={team} className="flex items-center justify-between p-4 bg-white rounded-2xl border shadow-sm group">
                            <div className="min-w-0">
                              <p className="font-black text-sm uppercase truncate">{team}</p>
                              {event.invitedTeamEmails?.[team] && <p className="text-[8px] font-bold text-muted-foreground truncate">{event.invitedTeamEmails[team]}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100" onClick={() => updateEvent(event.id, { tournamentTeams: event.tournamentTeams!.filter(t => t !== team) })}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 p-8 rounded-[2.5rem] border-2 border-dashed border-primary/20 space-y-8">
                    <div className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /><h3 className="text-lg font-black uppercase tracking-tight">Auto-Scheduler</h3></div>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Match (Min)</Label><Input type="number" value={genMatchLength} onChange={e => setGenMatchLength(e.target.value)} className="h-11 rounded-xl border-2" /></div>
                      <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Break (Min)</Label><Input type="number" value={genBreakLength} onChange={e => setGenBreakLength(e.target.value)} className="h-11 rounded-xl border-2" /></div>
                      <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Max Matches / Day</Label><Input type="number" value={maxGamesPerDay} onChange={e => setMaxGamesPerDay(e.target.value)} className="h-11 rounded-xl border-2" /></div>
                      <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Max Matches / Team</Label><Input type="number" value={maxGamesPerTeam} onChange={e => setMaxGamesPerTeam(e.target.value)} className="h-11 rounded-xl border-2" /></div>
                      <div className="space-y-1.5"><Label className="text-[8px] font-black uppercase tracking-widest ml-1">Total Cap</Label><Input type="number" value={maxTotalGames} onChange={e => setMaxTotalGames(e.target.value)} className="h-11 rounded-xl border-2" /></div>
                    </div>
                    <Button className="w-full h-16 rounded-2xl text-base font-black shadow-xl" onClick={handleGenerateSchedule} disabled={isGenerating}>Deploy Complex Itinerary</Button>
                  </div>
                </TabsContent>
              )}
            </div>
          </Tabs>
        </div>
      </div>

      <Dialog open={!!editingGame} onOpenChange={(open) => !open && setEditingGame(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl overflow-hidden p-0">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader><DialogTitle className="text-2xl font-black uppercase">Result Entry</DialogTitle></DialogHeader>
            {editingGame && (
              <div className="space-y-6 py-2">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-xs font-black uppercase">{editingGame.team1}</Label><Input type="number" value={editingGame.score1} onChange={e => setEditingGame({...editingGame, score1: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-black text-xl text-center" /></div>
                  <div className="space-y-2"><Label className="text-xs font-black uppercase">{editingGame.team2}</Label><Input type="number" value={editingGame.score2} onChange={e => setEditingGame({...editingGame, score2: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-black text-xl text-center" /></div>
                </div>
              </div>
            )}
            <DialogFooter><Button className="w-full h-14 rounded-2xl font-black shadow-xl" onClick={async () => { const updatedGames = (event.tournamentGames || []).map(g => g.id === editingGame?.id ? editingGame : g); await updateEvent(event.id, { tournamentGames: updatedGames }); setEditingGame(null); }}>Commit Result</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TournamentsPage() {
  const { activeTeam, isStaff, isSuperAdmin, purchasePro } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(null);

  const tournamentsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collectionGroup(db, 'events'),
      where('isTournament', '==', true),
      orderBy('date', 'asc')
    );
  }, [db]);

  const { data: allTournaments, isLoading } = useCollection<TeamEvent>(tournamentsQuery);

  const filteredTournaments = useMemo(() => {
    const now = new Date();
    const list = allTournaments || [];
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.endDate || e.date)) || isSameDay(new Date(e.endDate || e.date), now));
    return list.filter(e => isPast(new Date(e.endDate || e.date)) && !isSameDay(new Date(e.endDate || e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTournaments, filterMode]);

  if (selectedTournament) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-10">
        <TournamentDetailView event={selectedTournament} onBack={() => setSelectedTournament(null)} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6">
        <div className="bg-primary/10 p-10 rounded-[3rem] shadow-xl animate-pulse"><Trophy className="h-16 w-16 text-primary" /></div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Accessing Tournament Repositories...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-7 px-4">Institutional Hub</Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">Tournaments</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[11px] ml-1">Elite Bracket & Operational Command</p>
        </div>
        
        {isStaff && (
          <Button onClick={() => router.push('/events')} className="h-16 px-10 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/20 active:scale-95 transition-all">
            <Plus className="h-6 w-6 mr-2" /> Launch Elite Series
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="rounded-[3rem] border-none shadow-xl bg-primary text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Trophy className="h-40 w-40" /></div>
          <CardContent className="p-10 relative z-10 space-y-2">
            <p className="text-5xl font-black leading-none">{allTournaments?.length || 0}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Total Series Hosted</p>
          </CardContent>
        </Card>
        <Card className="rounded-[3rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><ShieldCheck className="h-40 w-40" /></div>
          <CardContent className="p-10 relative z-10 space-y-2">
            <p className="text-5xl font-black leading-none">100%</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Verification Rating</p>
          </CardContent>
        </Card>
        <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Zap className="h-40 w-40 text-primary" /></div>
          <CardContent className="p-10 relative z-10 space-y-2">
            <p className="text-5xl font-black text-primary">PRO</p>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Enabled Modules</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 w-fit shadow-inner">
        <Button variant={filterMode === 'live' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('live')} className="h-10 px-8 rounded-xl font-black text-[10px] uppercase transition-all">Live Series</Button>
        <Button variant={filterMode === 'past' ? 'default' : 'ghost'} size="sm" onClick={() => setFilterMode('past')} className="h-10 px-8 rounded-xl font-black text-[10px] uppercase transition-all">Historical Archive</Button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {filteredTournaments.length > 0 ? filteredTournaments.map((tournament) => (
          <Card key={tournament.id} className="rounded-[3rem] border-none shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden ring-1 ring-black/5 bg-white group cursor-pointer" onClick={() => setSelectedTournament(tournament)}>
            <div className="flex flex-col md:flex-row items-stretch h-full">
              <div className="w-full md:w-40 bg-black text-white flex flex-col items-center justify-center p-8 border-r shrink-0 group-hover:bg-primary transition-colors duration-500">
                <span className="text-[11px] font-black uppercase opacity-60 leading-none mb-1">{format(new Date(tournament.date), 'MMM')}</span>
                <span className="text-5xl font-black tracking-tighter">{format(new Date(tournament.date), 'dd')}</span>
              </div>
              <div className="flex-1 p-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-primary/5 text-primary border-none font-black text-[9px] uppercase px-3 h-6 rounded-full">Elite Series</Badge>
                    <span className="text-xs font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <Clock className="h-4 w-4" /> {tournament.startTime}
                    </span>
                  </div>
                  <h3 className="text-4xl font-black tracking-tight leading-none group-hover:text-primary transition-colors uppercase">{tournament.title}</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> {tournament.location}
                  </p>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{formatDateRange(tournament.date, tournament.endDate)}</p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4 bg-muted/30 px-8 py-4 rounded-[2rem] border-2 border-dashed">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-black uppercase text-muted-foreground mb-1">Squads</span>
                      <span className="text-2xl font-black leading-none">{tournament.tournamentTeams?.length || 0}</span>
                    </div>
                    <div className="w-px h-8 bg-muted-foreground/20" />
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-black uppercase text-muted-foreground mb-1">Matches</span>
                      <span className="text-2xl font-black leading-none">{tournament.tournamentGames?.length || 0}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-full h-16 w-16 hover:bg-primary hover:text-white shadow-xl ring-1 ring-black/5 group-hover:scale-110 transition-all">
                    <ArrowRight className="h-8 w-8" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )) : (
          <div className="text-center py-32 bg-muted/10 rounded-[4rem] border-2 border-dashed space-y-8 opacity-40">
            <div className="bg-white w-24 h-24 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl relative">
              <Trophy className="h-12 w-12 text-muted-foreground" />
              <Zap className="absolute -top-2 -right-2 h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="space-y-2">
              <p className="font-black text-3xl uppercase tracking-tight">No Active Series Hubs</p>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto">Launch an Elite Tournament to unlock strategic brackets and coordination.</p>
            </div>
          </div>
        )}
      </div>

      <Card className="rounded-[4rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-12 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
          <Zap className="h-64 w-64" />
        </div>
        <CardContent className="p-16 relative z-10 space-y-8">
          <Badge className="bg-primary text-white border-none font-black text-[11px] px-6 h-8 rounded-full shadow-lg shadow-primary/40 uppercase tracking-widest">Elite Infrastructure</Badge>
          <h2 className="text-5xl md:text-6xl font-black tracking-tight leading-[0.9] uppercase">Institutional <br />Series Coordination</h2>
          <p className="text-white/60 font-medium text-xl leading-relaxed max-w-3xl">
            This hub provides absolute operational control over championship series. Coordinate complex brackets across multiple venues, verify digital compliance waivers, and distribute real-time results to fans via the automated Public Spectator Hub.
          </p>
          <div className="flex gap-4 pt-4">
            <div className="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-2xl border border-white/10"><ShieldCheck className="h-5 w-5 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Verified Vault</span></div>
            <div className="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-2xl border border-white/10"><Users className="h-5 w-5 text-primary" /><span className="text-[10px] font-black uppercase tracking-widest">Multi-Team Ledger</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
