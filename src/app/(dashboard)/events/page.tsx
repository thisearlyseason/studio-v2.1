
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
  X
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
import { useTeam, TeamEvent, CustomFormField, FormFieldType, TournamentGame } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EventDetailDialogProps {
  event: TeamEvent;
  updateRSVP: (id: string, status: string) => void;
  formatTime: (date: string | Date) => string;
  isAdmin: boolean;
  promoteToRoster: (teamId: string, eventId: string, reg: any) => Promise<void>;
  onEdit: (event: TeamEvent) => void;
  onDelete: (eventId: string) => void;
  hasAttendance: boolean;
  purchasePro: () => void;
  children: React.ReactNode;
}

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);

  games.forEach(game => {
    if (!game.isCompleted) return;
    
    const t1 = game.team1;
    const t2 = game.team2;
    
    if (!standings[t1]) standings[t1] = { name: t1, wins: 0, losses: 0, ties: 0, points: 0 };
    if (!standings[t2]) standings[t2] = { name: t2, wins: 0, losses: 0, ties: 0, points: 0 };

    if (game.score1 > game.score2) {
      standings[t1].wins += 1;
      standings[t1].points += 1;
      standings[t2].losses += 1;
      standings[t2].points -= 1;
    } else if (game.score2 > game.score1) {
      standings[t2].wins += 1;
      standings[t2].points += 1;
      standings[t1].losses += 1;
      standings[t1].points -= 1;
    } else {
      standings[t1].ties += 1;
      standings[t2].ties += 1;
    }
  });

  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function EventDetailDialog({ event, updateRSVP, promoteToRoster, isAdmin, onEdit, onDelete, hasAttendance, purchasePro, children }: EventDetailDialogProps) {
  const { members = [], user, addRegistration, submitEventWaiver } = useTeam();
  const db = useFirestore();
  
  const [showInternalForm, setShowInternalForm] = useState(false);
  const [showWaiverStep, setShowWaiverStep] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isSubmittingInternal, setIsSubmittingInternal] = useState(false);

  const regQuery = useMemoFirebase(() => {
    return query(collection(db, 'teams', event.teamId, 'events', event.id, 'registrations'), orderBy('createdAt', 'desc'));
  }, [db, event.id, event.teamId]);
  
  const { data: registrations } = useCollection<any>(regQuery);

  const copyPublicLink = () => {
    const url = `${window.location.origin}/tournaments/public/${event.teamId}/${event.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Public Link Copied", description: "Share this link with fans and parents." });
  };

  const attendanceData = useMemo(() => {
    const internal = Object.entries(event.userRsvps || {}).map(([uid, status]) => {
      const member = members.find(m => m.userId === uid);
      return {
        id: uid,
        name: member?.name || 'Unknown Member',
        avatar: member?.avatar,
        role: member?.position || 'Member',
        status,
        isExternal: false,
        waiverAgreed: event.specialWaiverResponses?.[uid]?.agreed || false
      };
    });

    const external = (registrations || []).map(reg => ({
      id: reg.id,
      name: reg.name,
      avatar: undefined,
      role: 'Public Registrant',
      status: 'going',
      isExternal: true,
      regData: reg,
      waiverAgreed: true
    }));

    return [...internal, ...external];
  }, [event.userRsvps, event.specialWaiverResponses, members, registrations]);

  const goingList = attendanceData.filter(a => a.status === 'going');
  
  const tournamentStandings = useMemo(() => {
    if (!event.isTournament || !event.tournamentTeams) return [];
    return calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []);
  }, [event]);

  const handleRSVPAction = (status: string) => {
    if (status === 'going') {
      if (event.requiresSpecialWaiver && !event.specialWaiverResponses?.[user?.id || '']?.agreed) {
        setShowWaiverStep(true);
        return;
      }
      if (event.isRegistrationRequired) {
        setShowInternalForm(true);
        return;
      }
    }
    updateRSVP(event.id, status);
  };

  const handleWaiverAgreement = async (agreed: boolean) => {
    if (!user) return;
    await submitEventWaiver(event.id, agreed);
    if (agreed) {
      setShowWaiverStep(false);
      if (event.isRegistrationRequired) setShowInternalForm(true);
      else updateRSVP(event.id, 'going');
    } else {
      setShowWaiverStep(false);
      toast({ title: "Waiver Declined", variant: "destructive" });
    }
  };

  const handleInternalSubmit = async () => {
    if (!user) return;
    setIsSubmittingInternal(true);
    const success = await addRegistration(event.teamId, event.id, {
      name: user.name,
      email: user.email,
      phone: user.phone || 'N/A',
      userId: user.id,
      responses: formData
    });
    if (success) {
      updateRSVP(event.id, 'going');
      setShowInternalForm(false);
      toast({ title: "Registration Confirmed" });
    }
    setIsSubmittingInternal(false);
  };

  const currentStatus = event.userRsvps?.[user?.id || ''];

  return (
    <Dialog onOpenChange={(open) => { if(!open) { setShowInternalForm(false); setShowWaiverStep(false); } }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl p-0 overflow-hidden rounded-3xl lg:rounded-[2.5rem] max-h-[95vh] flex flex-col border-none shadow-2xl">
        <DialogTitle className="sr-only">{event.title}</DialogTitle>
        
        {showWaiverStep ? (
          <div className="flex-1 flex flex-col bg-background p-8 lg:p-12">
            <Button variant="ghost" onClick={() => setShowWaiverStep(false)} className="rounded-full h-10 px-4 -ml-4 font-black uppercase text-[10px]"><ChevronLeft className="h-4 w-4 mr-2" /> Back</Button>
            <div className="mt-6 space-y-6">
              <Badge className="bg-amber-100 text-amber-700 uppercase font-black text-[10px]">Mandatory Waiver</Badge>
              <h3 className="text-3xl font-black">Review Terms</h3>
              <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed italic text-foreground/70">
                {event.specialWaiverText}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" className="h-14 rounded-2xl font-black uppercase" onClick={() => handleWaiverAgreement(false)}>Decline</Button>
                <Button className="h-14 rounded-2xl font-black uppercase shadow-xl shadow-primary/20" onClick={() => handleWaiverAgreement(true)}>Agree & Continue</Button>
              </div>
            </div>
          </div>
        ) : showInternalForm ? (
          <div className="flex-1 flex flex-col bg-background p-8 lg:p-12">
            <Button variant="ghost" onClick={() => setShowInternalForm(false)} className="rounded-full h-10 px-4 -ml-4 font-black uppercase text-[10px]"><ChevronLeft className="h-4 w-4 mr-2" /> Back</Button>
            <h3 className="text-3xl font-black mt-6">Complete Registration</h3>
            <div className="space-y-6 mt-8 overflow-y-auto">
              {event.customFormFields?.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">{field.label}</Label>
                  {field.type === 'short_text' && <Input value={formData[field.id] || ''} onChange={e => setFormData(p => ({ ...p, [field.id]: e.target.value }))} className="h-12 rounded-xl font-bold" />}
                  {field.type === 'long_text' && <Textarea value={formData[field.id] || ''} onChange={e => setFormData(p => ({ ...p, [field.id]: e.target.value }))} className="rounded-xl min-h-[100px]" />}
                  {field.type === 'checkbox' && (
                    <div className="flex items-center space-x-3 p-4 bg-muted/30 rounded-xl">
                      <Checkbox checked={!!formData[field.id]} onCheckedChange={v => setFormData(p => ({ ...p, [field.id]: !!v }))} />
                      <Label className="font-bold">{field.label}</Label>
                    </div>
                  )}
                </div>
              ))}
              <Button className="w-full h-14 rounded-2xl font-black text-lg shadow-xl" onClick={handleInternalSubmit} disabled={isSubmittingInternal}>
                {isSubmittingInternal ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Confirm Spot"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
              <div className="lg:col-span-4 bg-muted/30 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r space-y-6">
                <div className="space-y-4">
                  <Badge className={cn("uppercase font-black tracking-widest text-[10px]", event.isTournament ? "bg-black text-white" : "bg-primary text-white")}>
                    {event.isTournament ? "Tournament Hub" : "Team Match"}
                  </Badge>
                  <h2 className="text-3xl font-black tracking-tighter leading-tight">{event.title}</h2>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 font-bold text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>{format(new Date(event.date), 'EEEE, MMM do')}</span>
                    </div>
                    <div className="flex items-center gap-3 font-bold text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                  {event.isTournament && (
                    <Button onClick={copyPublicLink} variant="outline" className="w-full rounded-xl h-11 font-black text-[10px] uppercase gap-2 border-2">
                      <Share2 className="h-3.5 w-3.5" /> Share Public Hub
                    </Button>
                  )}
                  {event.lastUpdated && (
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                      Last Updated: {format(new Date(event.lastUpdated), 'MMM d, h:mm a')}
                    </p>
                  )}
                </div>

                {event.isTournament && tournamentStandings.length > 0 && (
                  <div className="pt-6 border-t space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Live Standings</h4>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border space-y-2">
                      {tournamentStandings.map((team, i) => (
                        <div key={team.name} className="flex justify-between items-center text-xs font-bold uppercase">
                          <span className="truncate pr-2">{i + 1}. {team.name}</span>
                          <span className="text-primary font-black shrink-0">{team.points} PTS</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-auto flex gap-2">
                  {isAdmin && (
                    <>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => onEdit(event)}><Edit3 className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl text-destructive" onClick={() => onDelete(event.id)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col bg-background">
                <Tabs defaultValue={event.isTournament ? "bracket" : "roster"} className="flex-1 flex flex-col">
                  <div className="px-8 pt-8 pb-4 border-b">
                    <TabsList className="bg-muted/50 h-11 p-1">
                      {event.isTournament && <TabsTrigger value="bracket" className="font-black text-[10px] uppercase px-6">Schedule & Scores</TabsTrigger>}
                      <TabsTrigger value="roster" className="font-black text-[10px] uppercase px-6">Roster</TabsTrigger>
                      {isAdmin && <TabsTrigger value="admin" className="font-black text-[10px] uppercase px-6">Admin Audit</TabsTrigger>}
                    </TabsList>
                  </div>

                  <div className="flex-1 p-8 overflow-y-auto">
                    <TabsContent value="bracket" className="mt-0 space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        {event.tournamentGames?.map((game) => (
                          <div key={game.id} className="p-5 bg-muted/20 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all">
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-[10px] font-black uppercase text-muted-foreground">{game.date} @ {game.time}</span>
                              <Badge variant="secondary" className="text-[8px] font-black">{game.isCompleted ? "Final" : "Scheduled"}</Badge>
                            </div>
                            <div className="grid grid-cols-7 items-center gap-4">
                              <div className="col-span-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {game.winnerId === game.team1 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                                  <p className="font-black text-sm uppercase truncate">{game.team1}</p>
                                </div>
                                <p className="text-2xl font-black text-primary">{game.score1}</p>
                              </div>
                              <div className="col-span-1 text-center opacity-30 font-black text-xs">VS</div>
                              <div className="col-span-3">
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-sm uppercase truncate">{game.team2}</p>
                                  {game.winnerId === game.team2 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                                </div>
                                <p className="text-2xl font-black text-primary">{game.score2}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="roster" className="mt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {goingList.map(person => (
                          <div key={person.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border">
                            <Avatar className="h-8 w-8"><AvatarImage src={person.avatar} /><AvatarFallback className="font-bold">{person.name[0]}</AvatarFallback></Avatar>
                            <div className="min-w-0">
                              <p className="font-black text-xs truncate">{person.name}</p>
                              <p className="text-[8px] font-bold text-muted-foreground uppercase">{person.role}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="admin" className="mt-0 space-y-6">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Waiver Compliance Audit</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {members.map(m => {
                            const res = event.specialWaiverResponses?.[m.userId];
                            return (
                              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                                <span className="font-bold text-xs uppercase">{m.name}</span>
                                {res?.agreed ? (
                                  <Badge className="bg-green-100 text-green-700 h-5 px-2 border-none font-black text-[8px] uppercase">Agreed • {format(new Date(res.timestamp), 'MMM d')}</Badge>
                                ) : (
                                  <Badge variant="outline" className="h-5 px-2 font-black text-[8px] uppercase opacity-40">Pending Signature</Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </TabsContent>
                  </div>

                  <div className="p-8 border-t bg-muted/10">
                    <p className="text-[9px] font-black uppercase text-muted-foreground text-center mb-4 tracking-widest">Attendance Response</p>
                    <div className="grid grid-cols-3 gap-4">
                      <Button variant="outline" className={cn("h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'notGoing' && "bg-red-600 text-white")} onClick={() => handleRSVPAction('notGoing')}>No</Button>
                      <Button variant="outline" className={cn("h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'maybe' && "bg-amber-500 text-white")} onClick={() => handleRSVPAction('maybe')}>Maybe</Button>
                      <Button variant="outline" className={cn("h-12 rounded-xl font-black text-[10px] uppercase", currentStatus === 'going' && "bg-green-600 text-white")} onClick={() => handleRSVPAction('going')}>Going</Button>
                    </div>
                  </div>
                </Tabs>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { activeTeam, addEvent, updateEvent, deleteEvent, updateRSVP, formatTime, promoteToRoster, isSuperAdmin, hasFeature, purchasePro } = useTeam();
  const db = useFirestore();

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);
  
  const { data: rawEvents } = useCollection<TeamEvent>(eventsQuery);
  const events = useMemo(() => rawEvents || [], [rawEvents]);

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTournamentMode, setIsTournamentMode] = useState(false);
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

  const isAdmin = activeTeam?.role === 'Admin' || isSuperAdmin;
  const canPlanTournaments = hasFeature('tournaments');

  const handleEdit = (event: TeamEvent) => {
    setEditingEvent(event);
    setIsTournamentMode(!!event.isTournament);
    setNewTitle(event.title);
    setNewDate(new Date(event.date).toISOString().split('T')[0]);
    if (event.endDate) setNewEndDate(new Date(event.endDate).toISOString().split('T')[0]);
    setNewTime(event.startTime);
    setNewLocation(event.location);
    setNewDescription(event.description);
    setTournamentTeams(event.tournamentTeams || []);
    setTournamentGames(event.tournamentGames || []);
    setIsCreateOpen(true);
  };

  const handleCreateEvent = () => {
    if (!newTitle || !newDate) return;
    const payload: any = { 
      title: newTitle, 
      date: new Date(newDate).toISOString(), 
      startTime: newTime || 'TBD', 
      location: newLocation, 
      description: newDescription,
      isTournament: isTournamentMode,
      tournamentTeams,
      tournamentGames,
      lastUpdated: new Date().toISOString()
    };
    if (isTournamentMode && newEndDate) payload.endDate = new Date(newEndDate).toISOString();
    
    if (editingEvent) updateEvent(editingEvent.id, payload);
    else addEvent(payload);
    
    setIsCreateOpen(false);
    resetForm();
  };

  const resetForm = () => { 
    setEditingEvent(null); setNewTitle(''); setNewDate(''); setNewEndDate(''); setNewTime(''); 
    setNewLocation(''); setNewDescription(''); setTournamentTeams([]); setTournamentGames([]); 
  };

  const addTournamentTeam = () => {
    if (!newTeamName.trim()) return;
    setTournamentTeams([...tournamentTeams, newTeamName]);
    setNewTeamName('');
  };

  const addTournamentGame = () => {
    const newGame: TournamentGame = {
      id: `game_${Date.now()}`,
      team1: tournamentTeams[0] || 'Team A',
      team2: tournamentTeams[1] || 'Team B',
      score1: 0,
      score2: 0,
      date: newDate,
      time: '10:00 AM',
      isCompleted: false
    };
    setTournamentGames([...tournamentGames, newGame]);
  };

  const updateGameScore = (gameId: string, teamIdx: 1|2, val: string) => {
    setTournamentGames(tournamentGames.map(g => {
      if (g.id !== gameId) return g;
      const score = parseInt(val) || 0;
      const updated = { ...g, [teamIdx === 1 ? 'score1' : 'score2']: score };
      
      if (updated.isCompleted) {
        if (updated.score1 > updated.score2) updated.winnerId = updated.team1;
        else if (updated.score2 > updated.score1) updated.winnerId = updated.team2;
        else updated.winnerId = undefined;
      }
      return updated;
    }));
  };

  const toggleGameStatus = (gameId: string) => {
    setTournamentGames(tournamentGames.map(g => {
      if (g.id !== gameId) return g;
      const nextStatus = !g.isCompleted;
      const updated = { ...g, isCompleted: nextStatus };
      if (nextStatus) {
        if (updated.score1 > updated.score2) updated.winnerId = updated.team1;
        else if (updated.score2 > updated.score1) updated.winnerId = updated.team2;
      } else {
        updated.winnerId = undefined;
      }
      return updated;
    }));
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Schedule & Tournaments</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Official Squad coordination Hub</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button size="sm" className="flex-1 sm:flex-none rounded-full h-11 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg" onClick={() => { setIsTournamentMode(false); setIsCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Match</Button>
            <Button size="sm" variant="secondary" className="flex-1 sm:flex-none rounded-full bg-black text-white h-11 px-6 font-black uppercase text-[10px] tracking-widest relative overflow-hidden" onClick={() => canPlanTournaments ? (setIsTournamentMode(true), setIsCreateOpen(true)) : purchasePro()}>
              <Trophy className="h-4 w-4 mr-2 text-primary" /> Tournament Add-on
              {!canPlanTournaments && <div className="absolute top-0 right-0 bg-primary h-full w-1.5 flex flex-col items-center justify-center"><Lock className="h-2.5 w-2.5 text-white" /></div>}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-5xl rounded-[2.5rem] overflow-hidden p-0 max-h-[90vh] flex flex-col border-none shadow-2xl">
          <DialogTitle className="sr-only">Event Builder</DialogTitle>
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 h-full min-h-[600px]">
              <div className="lg:col-span-5 p-8 lg:border-r space-y-6 bg-primary/5">
                <DialogHeader>
                  <h2 className="text-3xl font-black tracking-tight">{editingEvent ? "Update" : "Launch"} {isTournamentMode ? "Tournament" : "Match"}</h2>
                  <p className="font-black text-primary uppercase tracking-widest text-[10px]">Strategic Coordination Hub</p>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Event Title</Label>
                    <Input placeholder="e.g. Regional Championship" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="h-12 rounded-xl font-black border-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                      <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-12 rounded-xl font-black border-2" />
                    </div>
                    {isTournamentMode ? (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                        <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="h-12 rounded-xl font-black border-2" />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Time</Label>
                        <Input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="h-12 rounded-xl font-black border-2" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                    <Input placeholder="Stadium or Field Name" value={newLocation} onChange={e => setNewLocation(e.target.value)} className="h-12 rounded-xl font-bold border-2" />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 p-8 space-y-6 bg-background flex flex-col justify-between">
                {isTournamentMode ? (
                  <Tabs defaultValue="teams" className="flex-1">
                    <TabsList className="bg-muted/50 h-11 p-1 mb-6">
                      <TabsTrigger value="teams" className="font-black text-[10px] uppercase px-6">Participants</TabsTrigger>
                      <TabsTrigger value="games" className="font-black text-[10px] uppercase px-6">Game Ledger</TabsTrigger>
                    </TabsList>

                    <TabsContent value="teams" className="space-y-6 mt-0">
                      <div className="flex gap-2">
                        <Input placeholder="Team Name..." value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="h-12 rounded-xl font-bold" />
                        <Button onClick={addTournamentTeam} className="h-12 px-6 rounded-xl font-black uppercase">Add</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {tournamentTeams.map((t, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border">
                            <span className="font-black text-xs uppercase truncate pr-2">{t}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setTournamentTeams(tournamentTeams.filter((_, idx) => idx !== i))}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="games" className="space-y-6 mt-0">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tournament Games</Label>
                        <Button variant="outline" size="sm" onClick={addTournamentGame} className="font-black text-[10px] uppercase">+ New Matchup</Button>
                      </div>
                      <ScrollArea className="h-[300px] pr-4">
                        <div className="space-y-4">
                          {tournamentGames.map((game) => (
                            <div key={game.id} className="p-4 bg-muted/20 rounded-2xl border-2 space-y-4 group relative">
                              <div className="flex justify-between items-center gap-4">
                                <Select value={game.team1} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team1: v} : g))}>
                                  <SelectTrigger className="h-10 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                                  <SelectContent>{tournamentTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                                <div className="flex items-center gap-2">
                                  <Input type="number" value={game.score1} onChange={e => updateGameScore(game.id, 1, e.target.value)} className="w-16 h-10 text-center font-black" />
                                  <span className="opacity-20 font-black">VS</span>
                                  <Input type="number" value={game.score2} onChange={e => updateGameScore(game.id, 2, e.target.value)} className="w-16 h-10 text-center font-black" />
                                </div>
                                <Select value={game.team2} onValueChange={(v) => setTournamentGames(tournamentGames.map(g => g.id === game.id ? {...g, team2: v} : g))}>
                                  <SelectTrigger className="h-10 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                                  <SelectContent>{tournamentTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                              </div>
                              <div className="flex justify-between items-center border-t border-muted pt-3">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase">
                                  <Clock className="h-3 w-3" /> {game.time}
                                </div>
                                <div className="flex items-center gap-3">
                                  <Label className="text-[9px] font-black uppercase opacity-60">Completed?</Label>
                                  <Checkbox checked={game.isCompleted} onCheckedChange={() => toggleGameStatus(game.id)} />
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6 bg-white shadow-sm border rounded-full text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setTournamentGames(tournamentGames.filter(g => g.id !== game.id))}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="space-y-6">
                    <div className="p-8 border-2 border-dashed rounded-[2rem] text-center space-y-4 opacity-60">
                      <Zap className="h-10 w-10 text-primary mx-auto" />
                      <p className="font-bold text-sm">Standard Match Logic selected.</p>
                    </div>
                  </div>
                )}
                
                <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all mt-6" onClick={handleCreateEvent}>
                  {editingEvent ? "Update" : "Publish"} Event Hub
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {events.map((event) => (
          <EventDetailDialog key={event.id} event={event} updateRSVP={updateRSVP} formatTime={formatTime} isAdmin={isAdmin} promoteToRoster={promoteToRoster} onEdit={handleEdit} onDelete={(id) => { if(confirm("Delete?")) deleteEvent(id); }} hasAttendance={true} purchasePro={purchasePro}>
            <Card className="hover:border-primary/30 transition-all duration-500 cursor-pointer group rounded-3xl border-none shadow-md ring-1 ring-black/5 overflow-hidden">
              <div className="flex items-stretch h-32">
                <div className="w-24 bg-primary/5 flex flex-col items-center justify-center border-r-2 shrink-0">
                  <span className="text-[10px] font-black uppercase text-primary mb-1">{format(new Date(event.date), 'MMM')}</span>
                  <span className="text-4xl font-black text-primary tracking-tighter">{format(new Date(event.date), 'dd')}</span>
                </div>
                <div className="flex-1 p-6 flex flex-col justify-center min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex gap-2 mb-1.5">
                        {event.isTournament && <Badge className="bg-black text-white text-[8px] font-black uppercase h-4 px-2">Elite Tournament</Badge>}
                        <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-2">{event.startTime}</Badge>
                      </div>
                      <h3 className="text-xl font-black tracking-tight leading-none truncate">{event.title}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1 flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> {event.location}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-primary opacity-20 group-hover:opacity-100 transition-all group-hover:translate-x-1 mt-2" />
                  </div>
                </div>
              </div>
            </Card>
          </EventDetailDialog>
        ))}
      </div>
    </div>
  );
}
