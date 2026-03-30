"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ChevronRight,
  ArrowRight,
  Loader2,
  CalendarDays,
  Zap,
  Target,
  List,
  ShieldAlert,
  Edit3,
  ExternalLink,
  Users,
  FileSignature,
  Info,
  X,
  Download,
  Share2,
  Sparkles,
  Settings,
  Building,
  CheckCircle2,
  Save,
  Trash2,
  Signature,
  FileText,
  Play,
  Database,
  UserPlus,
  AlertCircle,
  Wallet
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame, Member, Facility, Field, TeamDocument, League, RegistrationEntry } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc, getDocs, collectionGroup } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, isPast, isSameDay, eachDayOfInterval } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { generateTournamentSchedule, DailyWindow, TeamIdentity } from '@/lib/scheduler-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import html2canvas from 'html2canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TournamentBracket from '@/components/TournamentBracket';

interface TournamentTeam extends TeamIdentity {
  coach?: string;
  email?: string;
  source?: 'manual' | 'league' | 'pipeline';
  rosterLimit?: number;
}

function calculateTournamentStandings(teams: TournamentTeam[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team.name] = { name: team.name, wins: 0, losses: 0, ties: 0, points: 0, netScore: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    standings[t1].netScore += (game.score1 - game.score2);
    standings[t2].netScore += (game.score2 - game.score1);

    if (game.score1 > game.score2) { 
      standings[t1].wins += 1; standings[t1].points += 3; 
      standings[t2].losses += 1; 
    }
    else if (game.score2 > game.score1) { 
      standings[t2].wins += 1; standings[t2].points += 3; 
      standings[t1].losses += 1; 
    }
    else { 
      standings[t1].ties += 1; standings[t1].points += 1;
      standings[t2].ties += 1; standings[t2].points += 1;
    }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.netScore - a.netScore || b.wins - a.wins);
}

function FacilityFieldLoader({ facilityId, selectedFields, onToggleField }: { facilityId: string, selectedFields: string[], onToggleField: (name: string) => void }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => db ? query(collection(db, 'facilities', facilityId, 'fields'), orderBy('name', 'asc')) : null, [db, facilityId]);
  const { data: fields } = useCollection<Field>(q);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-6">
      {fields?.map(field => {
        const fieldIdentifier = `${facilityId}:${field.name}`;
        const isSelected = selectedFields.includes(fieldIdentifier);
        return (
          <div 
            key={field.id} 
            className={cn(
              "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group",
              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-muted-foreground/20"
            )}
            onClick={() => onToggleField(fieldIdentifier)}
          >
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{field.name}</span>
            {isSelected ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted group-hover:border-muted-foreground/30" />}
          </div>
        );
      })}
    </div>
  );
}

function TournamentDeploymentWizard({ isOpen, onOpenChange, onComplete }: { isOpen: boolean, onOpenChange: (o: boolean) => void, onComplete: () => void }) {
  const { user: authUser } = useUser();
  const db = useFirestore();
  const { addEvent, activeTeam } = useTeam();

  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const [form, setForm] = useState({
    title: '',
    startDate: '',
    endDate: '',
    location: '',
    description: '',
    tournamentType: 'round_robin' as 'round_robin' | 'single_elimination' | 'double_elimination',
    gameLength: '60',
    breakLength: '15',
    gamesPerTeam: '3',
    doubleHeaderOption: 'none' as 'none' | 'sameTeam' | 'differentTeams',
    dailyWindows: [] as DailyWindow[],
    selectedFields: [] as string[],
    manualVenue: '',
    waiverId: 'default_tournament',
    registration_cost: '0',
    teams: [] as TournamentTeam[]
  });

  // --- External Data Fetching ---
  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const docsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return collection(db, 'teams', activeTeam.id, 'documents');
  }, [db, activeTeam?.id]);
  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const leaguesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'leagues'), where('creatorId', '==', authUser.uid));
  }, [db, authUser?.uid]);
  const { data: leagues } = useCollection<League>(leaguesQuery);

  const pipelineEntriesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collectionGroup(db, 'registrationEntries'), where('status', 'in', ['accepted', 'assigned']));
  }, [db, authUser?.uid]);
  const { data: pipelineEntries } = useCollection<RegistrationEntry>(pipelineEntriesQuery);

  const initDailyWindows = () => {
    if (!form.startDate || !form.endDate) return;
    
    // Validate format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate)) return;

    try {
      const [sy, sm, sd] = form.startDate.split('-').map(Number);
      const [ey, em, ed] = form.endDate.split('-').map(Number);
      
      const startD = new Date(sy, sm - 1, sd, 12, 0, 0);
      const endD = new Date(ey, em - 1, ed, 12, 0, 0);
      
      if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return;

      const days = eachDayOfInterval({ start: startD, end: endD });
      setForm(p => ({
        ...p,
        dailyWindows: days.map(d => ({
          date: format(d, 'yyyy-MM-dd'),
          startTime: '08:00',
          endTime: '20:00'
        }))
      }));
    } catch (e) {
      console.error("Failed to init daily windows:", e);
    }
  };

  const handleNext = () => {
    if (step === 1) initDailyWindows();
    setStep(step + 1);
  };

  const importLeagueTeams = (leagueId: string) => {
    const league = leagues?.find(l => l.id === leagueId);
    if (!league?.teams) return;
    const teamsToImport = Object.entries(league.teams).map(([id, t]) => ({
      id: `l_${id}`,
      name: t.teamName,
      coach: t.coachName || 'League Coach',
      email: t.coachEmail || '',
      source: 'league' as const
    }));
    setForm(p => ({ ...p, teams: [...p.teams, ...teamsToImport] }));
    toast({ title: "Teams Imported", description: `Added ${teamsToImport.length} squads from ${league.name}.` });
  };

  const importPipelineEntries = () => {
    if (!pipelineEntries) return;
    const teamsToImport = pipelineEntries.filter(e => e.protocol_id === 'team_config').map(e => ({
      id: `p_${e.id}`,
      name: e.answers.teamName || e.answers.name,
      coach: e.answers.name || 'Pipeline Coach',
      email: e.answers.email || '',
      source: 'pipeline' as const
    }));
    setForm(p => ({ ...p, teams: [...p.teams, ...teamsToImport] }));
    toast({ title: "Pipelines Imported", description: `Added ${teamsToImport.length} verified applicants.` });
  };

  const handleDeploy = async () => {
    if (!form.title || form.teams.length < 2) return;
    setIsProcessing(true);
    
    const [sy, sm, sd] = form.startDate.split('-').map(Number);
    const [ey, em, ed] = form.endDate.split('-').map(Number);
    const startD = new Date(sy, sm - 1, sd, 12, 0, 0);
    const endD = new Date(ey, em - 1, ed, 12, 0, 0);

    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
      toast({ title: "Timeline Corrupted", description: "Deployment failed due to invalid dates. Please re-verify the series schedule.", variant: "destructive" });
      setIsProcessing(false);
      return;
    }

    const schedule = generateTournamentSchedule({
      teams: form.teams,
      fields: form.selectedFields.length > 0 ? form.selectedFields : [form.manualVenue || form.location],
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.dailyWindows[0]?.startTime || '08:00',
      endTime: form.dailyWindows[0]?.endTime || '20:00',
      gameLength: parseInt(form.gameLength),
      breakLength: parseInt(form.breakLength),
      dailyWindows: form.dailyWindows,
      doubleHeaderOption: form.doubleHeaderOption,
      gamesPerTeam: parseInt(form.gamesPerTeam)
    });

    const success = await addEvent({
      title: form.title,
      date: startD.toISOString(),
      endDate: endD.toISOString(),
      startTime: form.dailyWindows[0]?.startTime || '08:00',
      location: form.location,
      description: form.description,
      eventType: 'tournament',
      isTournament: true,
      tournamentTeamsData: form.teams,
      tournamentTeams: form.teams.map(t => t.name),
      tournamentGames: schedule,
      waiverId: form.waiverId,
      registration_cost: form.registration_cost,
      teamWaiverText: documents?.find(d => d.id === form.waiverId)?.content || 'Standard Tournament Agreement.'
    });

    if (success) {
      onOpenChange(false);
      onComplete();
      toast({ title: "Series Deployed", description: `Itinerary established with ${schedule.length} matches.` });
    }
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3.5rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Elite Series Architect</DialogTitle>
        <div className="h-2 bg-primary w-full shrink-0" />
        
        <div className="p-8 lg:p-12 flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary shadow-inner">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Series Architect</h2>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Institutional Deployment Wizard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={cn("h-2 rounded-full transition-all duration-500", step === s ? "w-12 bg-primary" : "w-2 bg-muted")} />
              ))}
            </div>
          </header>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-10 pb-10">
              {step === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Identity & Timeline</h3>
                    <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Series Headline</Label>
                        <Input placeholder="e.g. 2024 Winter Invitational" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-xl shadow-inner" />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Launch Date</Label>
                          <Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Finale Date</Label>
                          <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Primary Hub Venue</Label>
                          <Input placeholder="Stadium or City..." value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Series Entry Fee ($)</Label>
                          <Input type="number" value={form.registration_cost} onChange={e => setForm({...form, registration_cost: e.target.value})} className="h-12 border-2 rounded-xl font-black text-primary shadow-inner" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Games/Team (Min)</Label>
                          <Input type="number" value={form.gamesPerTeam} onChange={e => setForm({...form, gamesPerTeam: e.target.value})} className="h-12 border-2 rounded-xl font-black text-primary" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Initial Double Header Mode</Label>
                        <Select value={form.doubleHeaderOption} onValueChange={(v: any) => setForm({...form, doubleHeaderOption: v})}>
                          <SelectTrigger className="h-12 border-2 rounded-xl font-bold bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="none" className="font-bold">None (1 Game/Day)</SelectItem>
                            <SelectItem value="sameTeam" className="font-bold">Same Opponent (Swap)</SelectItem>
                            <SelectItem value="differentTeams" className="font-bold">Different Opponents</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <section className="space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Squad Roster Enrollment</h3>
                      <div className="flex flex-wrap gap-2">
                        {leagues?.map(l => (
                          <Button key={l.id} variant="outline" size="sm" className="text-[8px] font-black uppercase h-8 border-primary/20 hover:bg-primary/5" onClick={() => importLeagueTeams(l.id)}>
                            <Database className="h-3 w-3 mr-1" /> From {l.name}
                          </Button>
                        ))}
                        <Button variant="outline" size="sm" className="text-[8px] font-black uppercase h-8 border-primary/20 hover:bg-primary/5" onClick={importPipelineEntries}>
                          <UserPlus className="h-3 w-3 mr-1" /> From Pipelines
                        </Button>
                        <Button variant="ghost" size="sm" className="text-[8px] font-black uppercase h-8" onClick={() => setForm({...form, teams: [...form.teams, { id: `m_${Date.now()}`, name: '', coach: '', email: '', source: 'manual' }]})}>
                          <Plus className="h-3 w-3 mr-1" /> Add Line
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {form.teams.map((team, idx) => (
                        <div key={team.id} className="grid grid-cols-12 gap-3 items-end bg-muted/20 p-4 rounded-2xl border">
                          <div className="col-span-1 text-[10px] font-black opacity-20 pb-3">{idx + 1}</div>
                          <div className="col-span-4 space-y-1.5"><Label className="text-[8px] font-black uppercase opacity-40 ml-1">Squad Name</Label><Input value={team.name} onChange={e => { const n = [...form.teams]; n[idx].name = e.target.value; setForm({...form, teams: n}); }} className="h-10 rounded-xl bg-white font-bold" /></div>
                          <div className="col-span-3 space-y-1.5"><Label className="text-[8px] font-black uppercase opacity-40 ml-1">Coach</Label><Input value={team.coach} onChange={e => { const n = [...form.teams]; n[idx].coach = e.target.value; setForm({...form, teams: n}); }} className="h-10 rounded-xl bg-white font-bold" /></div>
                          <div className="col-span-3 space-y-1.5"><Label className="text-[8px] font-black uppercase opacity-40 ml-1">Email</Label><Input value={team.email} onChange={e => { const n = [...form.teams]; n[idx].email = e.target.value; setForm({...form, teams: n}); }} className="h-10 rounded-xl bg-white font-bold" /></div>
                          <div className="col-span-1 flex justify-end pb-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setForm({...form, teams: form.teams.filter(t => t.id !== team.id)})}><X className="h-4 w-4" /></Button></div>
                        </div>
                      ))}
                      {form.teams.length === 0 && (
                        <div className="p-12 text-center border-2 border-dashed rounded-[2.5rem] bg-muted/10 opacity-40">
                          <Users className="h-10 w-10 mx-auto mb-4" />
                          <p className="text-xs font-black uppercase">No squads enrolled. Import or add manually.</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Daily Coordination Windows</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {form.dailyWindows.map((win, idx) => {
                        let dateLabel = "Invalid Date";
                        try {
                          const dateObj = new Date(win.date + 'T12:00:00');
                          if (!isNaN(dateObj.getTime())) {
                            dateLabel = format(dateObj, 'EEEE, MMM d');
                          }
                        } catch (e) {
                          console.error("Date formatting error in wizard:", e);
                        }
                        
                        return (
                          <div key={win.date} className="bg-muted/20 p-6 rounded-3xl flex items-center justify-between border">
                            <p className="text-sm font-black uppercase tracking-widest min-w-[150px]">{dateLabel}</p>
                            <div className="flex items-center gap-6">
                              <div className="space-y-1"><Label className="text-[8px] font-black uppercase opacity-40">Start</Label><Input type="time" value={win.startTime} onChange={e => { const n = [...form.dailyWindows]; n[idx].startTime = e.target.value; setForm({...form, dailyWindows: n}); }} className="h-10 bg-white font-bold" /></div>
                              <div className="space-y-1"><Label className="text-[8px] font-black uppercase opacity-40">End</Label><Input type="time" value={win.endTime} onChange={e => { const n = [...form.dailyWindows]; n[idx].endTime = e.target.value; setForm({...form, dailyWindows: n}); }} className="h-10 bg-white font-bold" /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-6 pt-6 border-t">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Resource Mapping</h3>
                    <div className="space-y-8">
                      {facilities?.length ? facilities.map(f => (
                        <div key={f.id} className="space-y-4">
                          <div className="flex items-center gap-3 px-2">
                            <Building className="h-5 w-5 text-primary" />
                            <span className="text-sm font-black uppercase">{f.name}</span>
                          </div>
                          <FacilityFieldLoader 
                            facilityId={f.id} 
                            selectedFields={form.selectedFields} 
                            onToggleField={(fieldIdentifier) => {
                              setForm(p => ({ 
                                ...p, 
                                selectedFields: p.selectedFields.includes(fieldIdentifier) 
                                  ? p.selectedFields.filter(sf => sf !== fieldIdentifier) 
                                  : [...p.selectedFields, fieldIdentifier] 
                              }));
                            }} 
                          />
                        </div>
                      )) : (
                        <div className="py-12 text-center border-2 border-dashed rounded-[2.5rem] bg-muted/10 opacity-40">
                          <Info className="h-10 w-10 mx-auto mb-4" />
                          <p className="text-xs font-black uppercase">No saved facilities found.</p>
                        </div>
                      )}
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Manual Venue Override</Label><Input placeholder="External Venue Name..." value={form.manualVenue} onChange={e => setForm({...form, manualVenue: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    </div>
                  </section>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Deployment Authorization</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Competition Protocol</Label>
                          <select 
                            value={form.tournamentType} 
                            onChange={(e) => setForm({...form, tournamentType: e.target.value as any})}
                            className="w-full h-14 rounded-2xl border-2 font-black px-4 bg-white"
                          >
                            <option value="round_robin">Round Robin (Pool Play)</option>
                            <option value="single_elimination">Single Elimination</option>
                            <option value="double_elimination">Double Elimination</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Double Header Strategy</Label>
                          <Select value={form.doubleHeaderOption} onValueChange={(v: any) => setForm({...form, doubleHeaderOption: v})}>
                            <SelectTrigger className="w-full h-14 rounded-2xl border-2 font-black px-4 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="none" className="font-bold">None</SelectItem>
                              <SelectItem value="sameTeam" className="font-bold">Same Opponent</SelectItem>
                              <SelectItem value="differentTeams" className="font-bold">Different Opponents</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Compliance Waiver</Label>
                          <select 
                            value={form.waiverId} 
                            onChange={(e) => setForm({...form, waiverId: e.target.value})}
                            className="w-full h-14 rounded-2xl border-2 font-black px-4 bg-white"
                          >
                            {documents?.map(doc => (
                              <option key={doc.id} value={doc.id}>{doc.title}</option>
                            ))}
                            {(!documents || documents.length === 0) && (
                              <option value="default_tournament">Standard Tournament Waiver</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="bg-black text-white p-8 rounded-[2.5rem] space-y-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-1000"><Zap className="h-32 w-32" /></div>
                        <div className="relative z-10 space-y-4">
                          <Badge className="bg-primary text-white border-none font-black text-[10px] h-6 px-3">Summary</Badge>
                          <div className="space-y-3 font-bold text-sm uppercase tracking-widest text-white/60">
                            <div className="flex justify-between border-b border-white/5 pb-2"><span>Squads</span><span className="text-primary">{form.teams.length}</span></div>
                            <div className="flex justify-between border-b border-white/5 pb-2"><span>Timeline</span><span>{form.startDate} &rarr; {form.endDate}</span></div>
                            <div className="flex justify-between border-b border-white/5 pb-2"><span>Resources</span><span className="text-primary">{form.selectedFields.length || 'Manual'} Fields</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </ScrollArea>

          <footer className="pt-8 border-t flex gap-4 shrink-0">
            {step > 1 && <Button variant="outline" className="h-16 px-10 rounded-2xl border-2 font-black uppercase text-xs" onClick={() => setStep(step - 1)}>Modify Step {step - 1}</Button>}
            {step < 4 ? (
              <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleNext} disabled={step === 1 && (!form.title || !form.startDate || !form.endDate)}>
                Continue Architecture <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-0.98 transition-all" onClick={handleDeploy} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Sparkles className="h-6 w-6 mr-3" />}
                Deploy Full Itinerary
              </Button>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { isStaff, activeTeam, db } = useTeam();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('itinerary');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: event.title || '',
    eventType: event.eventType || '',
    description: event.description || '',
    startDate: event.date || '',
    endDate: event.endDate || '',
    ages: event.ages || '',
    contactEmail: event.contactEmail || '',
    contactPhone: event.contactPhone || '',
    registrationCost: event.registrationCost || '',
    twitter: event.socialLinks?.twitter || '',
    instagram: event.socialLinks?.instagram || '',
    paymentInstructions: event.paymentInstructions || ''
  });

  const handleSaveTournament = async () => {
    if (!db || !activeTeam) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
        title: editForm.title,
        eventType: editForm.eventType,
        description: editForm.description,
        date: editForm.startDate,
        endDate: editForm.endDate,
        ages: editForm.ages,
        contactEmail: editForm.contactEmail,
        contactPhone: editForm.contactPhone,
        registrationCost: editForm.registrationCost,
        paymentInstructions: editForm.paymentInstructions,
        socialLinks: {
          twitter: editForm.twitter,
          instagram: editForm.instagram
        }
      });
      setIsEditOpen(false);
      toast({ title: "Tournament Profile Updated" });
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeamsData || [], event.tournamentGames || []), [event]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="relative overflow-hidden bg-black rounded-[3.5rem] p-10 lg:p-14 text-white shadow-2xl border border-white/5 group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50 group-hover:opacity-70 transition-opacity" />
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Championship Image Overlay */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-20 pointer-events-none group-hover:scale-105 transition-transform duration-1000 hidden lg:block">
           <img 
             src="/Users/tylerans/.gemini/antigravity/brain/9ff20e19-8bfd-407d-8ca1-e2b0b73705b9/championship_trophy_premium_png_1774896013640.png" 
             alt="Championship Trophy" 
             className="w-full h-full object-cover grayscale brightness-50"
           />
        </div>

        <div className="relative z-10 space-y-8 max-w-4xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onBack} 
                className="rounded-full h-14 w-14 border-2 border-white/20 hover:bg-white/10 shrink-0 text-white hover:scale-105 transition-all"
              >
                <ChevronLeft className="h-7 w-7" />
              </Button>
              <div className="space-y-1">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-4 shadow-lg tracking-widest">
                  Series Hub 2024
                </Badge>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter leading-none mt-1">
                  {event.title}
                </h1>
              </div>
            </div>
            {isStaff && (
              <div className="flex flex-wrap gap-3 justify-end self-end md:self-center">
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${baseUrl}/register/tournament/${activeTeam?.id}/${event.id}?protocol=team_config`);
                    toast({ title: "Public Link Copied", description: "Registration gateway ready for distribution." });
                  }} 
                  variant="outline" 
                  className="h-14 px-6 rounded-2xl border-2 border-white/20 font-black transition-all bg-white/5 hover:bg-white/10 group"
                >
                  <Share2 className="h-5 w-5 mr-3 group-hover:rotate-12 transition-transform" /> Share Portal
                </Button>
                <Button 
                  onClick={() => setIsEditOpen(true)} 
                  variant="outline" 
                  size="icon" 
                  className="h-14 w-14 rounded-2xl border-2 border-white/20 font-black transition-all bg-white/5 hover:bg-white/10"
                >
                  <Settings className="h-6 w-6" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-8 pt-8 border-t border-white/10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Enrolled Squads</p>
              <p className="text-3xl font-black">{(event.tournamentTeamsData || []).length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Match Count</p>
              <p className="text-3xl font-black">{(event.tournamentGames || []).length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Compliance</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-black">
                  {Math.round(((event.tournamentTeamsData || []).filter(t => event.teamAgreements?.[t.name]).length / Math.max(1, (event.tournamentTeamsData || []).length)) * 100)}%
                </p>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Timeline</p>
              <p className="text-lg font-bold leading-tight">
                {format(new Date(event.date), 'MMM d')} - {format(new Date(event.endDate || event.date), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-white rounded-[4rem] border-2 shadow-2xl overflow-hidden flex flex-col relative">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
            <div className="bg-muted/30 p-8 border-b">
              <TabsList className="bg-white/50 h-auto p-2 rounded-[1.75rem] border-2 w-full flex-wrap gap-1 shadow-inner">
                <TabsTrigger value="itinerary" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none h-auto">Matches</TabsTrigger>
                <TabsTrigger value="squads" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all shadow-none h-auto">Teams</TabsTrigger>
                <TabsTrigger value="standings" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all shadow-none h-auto">Standings</TabsTrigger>
                <TabsTrigger value="bracket" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all shadow-none h-auto">Brackets</TabsTrigger>
                <TabsTrigger value="compliance" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none h-auto">Compliance</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-muted-foreground data-[state=active]:text-white transition-all shadow-none h-auto">Portals</TabsTrigger>
                <TabsTrigger value="protocol" className="rounded-2xl font-black text-xs uppercase px-8 py-3.5 flex-1 data-[state=active]:bg-orange-600 data-[state=active]:text-white transition-all shadow-none h-auto">Architecture</TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 p-8 lg:p-14">
              <TabsContent value="itinerary" className="mt-0 space-y-8 focus-visible:outline-none">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><CalendarIcon className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Competition Itinerary</h3>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Synchronized Match Schedule</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-black uppercase py-1 px-4 border-2">{(event.tournamentGames || []).length} Verified Matches</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {event.tournamentGames?.map((game) => (
                    <Card key={game.id} className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white overflow-hidden p-8 space-y-6 transition-all hover:shadow-2xl hover:ring-primary/20 group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary border-none text-[9px] font-black uppercase px-3 h-6">{game.time}</Badge>
                            {game.isCompleted && <Badge className="bg-black text-white border-none text-[8px] font-black uppercase px-2 h-6">FINAL</Badge>}
                          </div>
                          {game.round && <Badge className="bg-muted text-foreground border-none text-[8px] font-black uppercase px-3 h-6">{game.round}</Badge>}
                        </div>
                        
                      <div className="grid grid-cols-7 items-center gap-1 text-center">
                        <div className="col-span-3 min-w-0 space-y-2">
                          <div className="w-12 h-12 rounded-[1rem] bg-primary/5 mx-auto flex items-center justify-center font-black text-lg text-primary shadow-inner group-hover:scale-110 transition-transform">{game.team1[0]}</div>
                          <p className="font-black text-xs uppercase truncate leading-tight h-4">{game.team1}</p>
                          <p className={cn("text-4xl font-black tracking-tighter", game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-foreground opacity-20")}>{game.score1}</p>
                        </div>
                        <div className="col-span-1 pt-8 opacity-10 font-black text-[11px]">VS</div>
                        <div className="col-span-3 min-w-0 space-y-2">
                          <div className="w-12 h-12 rounded-[1rem] bg-primary/5 mx-auto flex items-center justify-center font-black text-lg text-primary shadow-inner group-hover:scale-110 transition-transform">{game.team2[0]}</div>
                          <p className="font-black text-xs uppercase truncate leading-tight h-4">{game.team2}</p>
                          <p className={cn("text-4xl font-black tracking-tighter", game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-foreground opacity-20")}>{game.score2}</p>
                        </div>
                      </div>
                      
                      {game.isDisputed && (
                        <div className="bg-red-50 p-3 rounded-2xl border-2 border-red-100 flex items-center gap-3 animate-pulse">
                          <ShieldAlert className="h-4 w-4 text-red-600" />
                          <span className="text-[10px] font-black text-red-600 uppercase">Active Conflict Reported</span>
                        </div>
                      )}

                      {game.location && (
                        <div className="pt-4 border-t border-black/5">
                          <p className="text-[10px] font-black text-muted-foreground uppercase text-center flex items-center justify-center gap-2 group-hover:text-primary transition-colors">
                            <MapPin className="h-3 w-3 opacity-40" /> {game.location}
                          </p>
                        </div>
                      )}
                    </Card>
                  ))}
                  {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                    <div className="col-span-full py-24 text-center bg-muted/10 rounded-[3rem] border-2 border-dashed border-muted/50 opacity-40">
                      <div className="bg-white w-20 h-20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-xl mb-6"><Clock className="h-10 w-10 text-primary opacity-20" /></div>
                      <p className="text-xl font-black uppercase tracking-tight">Timeline Pending</p>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mt-2">Initialize the competition architect to establish matches.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="squads" className="mt-0 space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Verified Squad Roster</h3>
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase">{(event.tournamentTeamsData || []).length} Enrolled</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {(event.tournamentTeamsData || []).map((team) => {
                    const agreement = event.teamAgreements?.[team.name];
                    return (
                      <Card key={team.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-6 transition-all hover:ring-2 hover:ring-primary/20 hover:shadow-2xl group">
                        <div className="flex justify-between items-start">
                          <div className="h-16 w-16 rounded-[1.25rem] bg-primary/5 flex items-center justify-center text-primary font-black text-2xl shadow-inner group-hover:scale-110 transition-transform">
                            {team.name[0]}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge className={cn(
                              "border-none font-black text-[7px] px-2 h-5 tracking-widest",
                              agreement ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {agreement ? 'COMPLIANT' : 'PENDING WAIVER'}
                            </Badge>
                            {team.experience && (
                              <Badge variant="outline" className="text-[7px] font-black uppercase text-primary border-primary/20 bg-primary/5 h-5 px-2 tracking-widest">
                                {team.experience}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xl font-black uppercase tracking-tighter leading-none group-hover:text-primary transition-colors">{team.name}</h4>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-2 flex items-center gap-1.5 leading-none">
                              <MapPin className="h-3 w-3 opacity-40 shrink-0" /> {team.source || 'Regional Origin'}
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-2 pt-4 border-t border-black/5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-xl bg-muted/30 flex items-center justify-center"><Info className="h-4 w-4 opacity-40" /></div>
                              <div className="min-w-0">
                                <p className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter leading-none mb-1">Architecture Representative</p>
                                <p className="text-[11px] font-black uppercase truncate">{team.coach || 'Institutional Lead'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="pt-4 flex items-center justify-between border-t border-dashed border-black/10">
                           <div className="flex -space-x-2">
                              {[1,2,3].map(i => (
                                <div key={i} className="h-7 w-7 rounded-full border-2 border-white bg-slate-100 text-[8px] flex items-center justify-center font-black text-slate-400 italic">
                                  {i === 3 ? <Plus className="h-2 w-2" /> : '?'}
                                </div>
                              ))}
                           </div>
                           <Button variant="ghost" className="h-8 px-3 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-muted group/btn">
                             View Squad <ChevronRight className="ml-1 h-3 w-3 group-hover/btn:translate-x-0.5 transition-transform" />
                           </Button>
                        </div>
                      </Card>
                    );
                  })}
                  {(event.tournamentTeamsData || []).length === 0 && (
                    <div className="col-span-full py-20 text-center bg-muted/10 rounded-3xl border-2 border-dashed opacity-40">
                      <Users className="h-10 w-10 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">No squads enrolled yet.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="standings" className="mt-0 space-y-8 focus-visible:outline-none">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Trophy className="h-5 w-5" /></div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Leaderboard Dynamics</h3>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Live Point Distribution</p>
                    </div>
                  </div>
                  <Badge className="bg-black text-white border-none text-[9px] font-black uppercase h-7 px-4 shadow-lg">Verified Standings</Badge>
                </div>
                <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/30 border-b-2">
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rank</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Organization</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">GP</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">W</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">L</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">T</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">DIFF</th>
                          <th className="px-10 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-primary text-center">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {standings.map((team, idx) => {
                          const gp = team.wins + team.losses + team.ties;
                          return (
                            <tr key={team.name} className="group hover:bg-primary/[0.02] transition-colors">
                              <td className="px-10 py-6">
                                <span className={cn(
                                  "h-10 w-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm transition-transform group-hover:scale-110",
                                  idx === 0 ? "bg-amber-400 text-white shadow-amber-400/20" : 
                                  idx === 1 ? "bg-slate-300 text-white shadow-slate-300/20" :
                                  idx === 2 ? "bg-stone-400 text-white shadow-stone-400/20" : "bg-muted/50 text-muted-foreground"
                                )}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-10 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-[10px] font-black text-primary">{team.name[0]}</div>
                                  <span className="font-black uppercase text-sm tracking-tight">{team.name}</span>
                                </div>
                              </td>
                              <td className="px-10 py-6 text-center font-bold text-xs opacity-40">{gp}</td>
                              <td className="px-10 py-6 text-center font-black text-sm text-green-600">{team.wins}</td>
                              <td className="px-10 py-6 text-center font-black text-sm text-red-600">{team.losses}</td>
                              <td className="px-10 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td>
                              <td className="px-10 py-6 text-center font-black text-sm">{team.netScore > 0 ? `+${team.netScore}` : team.netScore}</td>
                              <td className="px-10 py-6 text-center bg-primary/[0.03]">
                                <Badge className="bg-primary text-white border-none font-black text-xs h-9 px-6 rounded-xl shadow-xl shadow-primary/20">{team.points}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                        {standings.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-10 py-32 text-center">
                              <div className="opacity-20 flex flex-col items-center">
                                <Trophy className="h-12 w-12 mb-4" />
                                <p className="text-xs font-black uppercase tracking-widest">No match history recorded.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </TabsContent>
              <TabsContent value="bracket" className="mt-0">
                <TournamentBracket games={event.tournamentGames || []} />
              </TabsContent>
              <TabsContent value="portals" className="mt-0 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white p-8 space-y-4 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/${event.teamId}/waiver/${event.id}`); toast({ title: "Waiver URL Copied" }); }}>
                    <Badge className="bg-white text-primary border-none font-black text-[8px] h-5 px-2">COMPLIANCE</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Public Waiver Link</h4>
                    <p className="text-xs text-white/80 font-medium leading-relaxed italic">Direct portal for squad representatives to verify rosters and sign agreements.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20">Copy Portal URL <Share2 className="ml-2 h-3 w-3" /></Button>
                  </Card>
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-orange-600 text-white p-8 space-y-4 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/register/tournament/${event.teamId}/${event.id}?protocol=team_config`); toast({ title: "Registration URL Copied" }); }}>
                    <Badge className="bg-white text-orange-600 border-none font-black text-[8px] h-5 px-2">PIPELINE</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Registration Portal</h4>
                    <p className="text-xs text-white/80 font-medium leading-relaxed italic">Public enrollment for squads to automatically apply and join the tournament roster.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20">Copy Portal URL <Share2 className="ml-2 h-3 w-3" /></Button>
                  </Card>
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 space-y-4 group cursor-pointer active:scale-95 transition-all" onClick={() => window.open(`${baseUrl}/tournaments/spectator/${event.teamId}/${event.id}`, '_blank')}>
                    <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">LIVE</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Spectator Hub</h4>
                    <p className="text-xs text-white/60 font-medium leading-relaxed italic">Real-time bracket tracking and standings access for fans and players.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20">Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                  </Card>
                  <Card className="rounded-[2.5rem] border-none shadow-xl bg-muted/10 p-8 space-y-4 group cursor-pointer active:scale-95 transition-all" onClick={() => { navigator.clipboard.writeText(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}`); toast({ title: "Scorekeeper URL Copied" }); }}>
                    <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">OPERATIONS</Badge>
                    <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Scorekeeper Hub</h4>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">Institutional result entry portal for field generals and officials to post scores.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl bg-muted/20 border-black/10 text-black hover:bg-muted/30">Copy Portal URL <Share2 className="ml-2 h-3 w-3" /></Button>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="protocol" className="mt-0">
                  <div className="flex flex-col items-center justify-center p-12 lg:p-20 text-center space-y-8 bg-muted/5 rounded-[3rem] border-2 border-dashed border-muted">
                    <div className="bg-orange-100 p-8 rounded-[2.5rem] text-orange-600 shadow-inner">
                      <Target className="h-16 w-16" />
                    </div>
                    <div className="space-y-3 max-w-md">
                      <h3 className="text-3xl font-black uppercase tracking-tight">Protocol Architect</h3>
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed italic">Design custom recruitment forms, establish enrollment fees, and manage the automated squad pipeline for this series.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                      <div className="bg-white p-6 rounded-3xl border-2 space-y-2 text-left">
                         <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px]"><Wallet className="h-3 w-3" /> Fee Management</div>
                         <p className="text-[11px] font-medium opacity-60">Control institutional series entry costs and payment guidance.</p>
                      </div>
                      <div className="bg-white p-6 rounded-3xl border-2 space-y-2 text-left">
                         <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px]"><Users className="h-3 w-3" /> Form Design</div>
                         <p className="text-[11px] font-medium opacity-60">Define required data points and digital signature mandates.</p>
                      </div>
                    </div>
                    <Button className="h-16 px-12 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black uppercase text-sm shadow-xl shadow-orange-600/20 group" onClick={() => router.push(`/manage-tournaments/registration/${event.teamId}/${event.id}`)}>
                      Enter Architect <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
              </TabsContent>
              <TabsContent value="compliance" className="mt-0 space-y-10 focus-visible:outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 flex flex-col justify-between group">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase text-white/40 tracking-widest">Execution Rate</p>
                        <h4 className="text-4xl font-black">{Math.round(((event.tournamentTeamsData || []).filter(t => event.teamAgreements?.[t.name]).length / Math.max(1, (event.tournamentTeamsData || []).length)) * 100)}%</h4>
                      </div>
                      <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed mt-4 italic">Total institutional compliance across all rostered squads.</p>
                    </Card>
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white p-8 flex flex-col justify-between">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase text-white/40 tracking-widest">Pending Signatures</p>
                        <h4 className="text-4xl font-black">{(event.tournamentTeamsData || []).length - (Object.keys(event.teamAgreements || {}).length)}</h4>
                      </div>
                      <div className="flex items-center gap-2 mt-4 text-[10px] font-black uppercase">
                        <Clock className="h-4 w-4" /> Action Required
                      </div>
                    </Card>
                    <Card className="rounded-[2.5rem] border-none shadow-xl bg-muted/10 p-8 flex flex-col justify-between border-2 border-dashed border-black/5">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Digital Ledger</p>
                        <h4 className="text-2xl font-black uppercase tracking-tighter">Verified Protocol</h4>
                      </div>
                      <Button variant="outline" className="w-full h-12 rounded-xl bg-white border-black/10 font-black uppercase text-[10px] shadow-sm">Review Master Waiver</Button>
                    </Card>
                  </div>

                  <section className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-black/5 flex items-center justify-center"><FileSignature className="h-5 w-5" /></div>
                        <div>
                          <h3 className="text-xl font-black uppercase tracking-tight">Institutional Ledger</h3>
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Waiver Execution Tracking</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {(event.tournamentTeamsData || []).map(t => { 
                        const agreement = event.teamAgreements?.[t.name]; 
                        return (
                          <Card key={t.id} className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 p-6 bg-white flex items-center justify-between transition-all hover:ring-primary/20 group">
                            <div className="flex items-center gap-6">
                              <div className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all shadow-inner group-hover:scale-105", 
                                agreement ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground/30"
                              )}>
                                {agreement ? <CheckCircle2 className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <span className="font-black text-lg uppercase truncate block tracking-tight">{t.name}</span>
                                <div className="flex items-center gap-3">
                                  {t.coach && <Badge variant="outline" className="text-[8px] font-black uppercase h-5 px-2 border-black/10">COACH: {t.coach}</Badge>}
                                  {agreement && <Badge className="bg-green-100 text-green-700 border-none text-[8px] font-black uppercase h-5 px-2">EXECUTED</Badge>}
                                </div>
                              </div>
                            </div>
                            {agreement ? (
                              <div className="text-right space-y-1">
                                <p className="text-[10px] font-black uppercase text-green-600">Verified by {agreement.captainName}</p>
                                <div className="flex items-center justify-end gap-2 text-[8px] text-muted-foreground font-bold uppercase">
                                  <CalendarIcon className="h-3 w-3" /> {format(new Date(agreement.signedAt), 'MMM d, h:mm a')}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-2">
                                <Badge variant="outline" className="text-[10px] font-black uppercase h-8 px-4 border-dashed border-muted-foreground/30 text-muted-foreground">Pending Execution</Badge>
                                <p className="text-[8px] font-bold text-muted-foreground/40 uppercase">Awaiting Signature</p>
                              </div>
                            )}
                          </Card>
                        ); 
                      })}
                    </div>
                  </section>

                  {event.tournamentGames?.some(g => g.isDisputed) && (
                    <section className="space-y-8 pt-10 border-t-2 border-dashed">
                      <div className="flex items-center gap-4 px-2">
                        <div className="h-12 w-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shadow-lg shadow-red-600/10"><ShieldAlert className="h-6 w-6" /></div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tighter text-red-600">Conflict Resolution Hub</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-600/40">Active Institutional Disputes</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-6">
                        {event.tournamentGames.filter(g => g.isDisputed).map(game => (
                          <Card key={game.id} className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-2 ring-red-100 group transition-all hover:ring-red-500/20">
                            <div className="bg-red-600 text-white px-8 py-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <AlertCircle className="h-4 w-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Conflict Narrative: {game.team1} vs {game.team2}</span>
                              </div>
                              <Button variant="ghost" className="h-8 px-4 rounded-xl hover:bg-white/10 text-white uppercase text-[9px] font-black border border-white/20">Resolve Protocol</Button>
                            </div>
                            <div className="p-8 space-y-6">
                              <div className="bg-red-50/50 p-6 rounded-[2rem] border border-red-100 flex gap-5">
                                <div className="bg-white p-3 rounded-2xl h-fit border border-red-100"><Info className="h-5 w-5 text-red-600" /></div>
                                <div className="space-y-2">
                                  <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Dispute Testimony</p>
                                  <p className="text-sm font-bold leading-relaxed italic text-red-950">"{game.disputeNotes || 'Reporting official did not provide additional narrative context.'}"</p>
                                </div>
                              </div>
                              <div className="flex justify-end gap-4">
                                <Button variant="outline" className="h-12 rounded-xl text-[10px] font-black uppercase border-black px-6" onClick={() => window.open(`${baseUrl}/tournaments/scorekeeper/${event.teamId}/${event.id}/${game.id}`, '_blank')}>Review Scoped Result</Button>
                                <Button className="h-12 rounded-xl text-[10px] font-black uppercase bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-600/20 px-8">Execute Final Decision</Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </section>
                  )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[3rem] p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground max-h-[90vh] overflow-y-auto w-11/12 mx-auto sm:w-full">
          <div className="h-3 bg-black w-full" />
          <div className="p-8 lg:p-12 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Series Profile</DialogTitle>
              <DialogDescription className="font-bold text-[10px] uppercase tracking-widest mt-2">{event.title} • Public Context</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Series Name</Label>
                   <Input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="h-12 rounded-xl border-2 font-black" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Type of Event</Label>
                   <Input value={editForm.eventType} onChange={e => setEditForm({...editForm, eventType: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
               </div>
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Description</Label>
                 <Textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="rounded-2xl border-2 font-medium min-h-[100px]" placeholder="Detailed description of the series..." />
               </div>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                   <Input type="date" value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                   <Input type="date" value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Ages / Divisions</Label>
                   <Input value={editForm.ages} onChange={e => setEditForm({...editForm, ages: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="e.g. U14 - U18" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Entry Fee</Label>
                   <Input value={editForm.registrationCost} onChange={e => setEditForm({...editForm, registrationCost: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="$500/Team" />
                 </div>
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Offline Payment Instructions</Label>
                  <Textarea value={editForm.paymentInstructions} onChange={e => setEditForm({...editForm, paymentInstructions: e.target.value})} className="rounded-2xl border-2 font-medium min-h-[80px]" placeholder="E-transfer to accounts@series.com with your team name..." />
                  <p className="text-[10px] text-muted-foreground ml-1 font-bold">These instructions will be shown during registration. Online payments coming soon.</p>
                </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Contact Email</Label>
                   <Input type="email" value={editForm.contactEmail} onChange={e => setEditForm({...editForm, contactEmail: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="hq@series.com" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Contact Phone</Label>
                   <Input type="tel" value={editForm.contactPhone} onChange={e => setEditForm({...editForm, contactPhone: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="(555) 123-4567" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-sky-600">Twitter (X) Link</Label>
                   <Input type="url" value={editForm.twitter} onChange={e => setEditForm({...editForm, twitter: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="https://x.com/yourseries" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-pink-600">Instagram Link</Label>
                   <Input type="url" value={editForm.instagram} onChange={e => setEditForm({...editForm, instagram: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="https://instagram.com/yourseries" />
                 </div>
               </div>
            </div>
            <DialogFooter className="pt-6">
              <Button disabled={isProcessing} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSaveTournament}>
                 {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Commit Series Profile'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function ManageTournamentsPage() {
  const { activeTeamEvents, isStaff, isPro } = useTeam();

  if (!isStaff) return <AccessRestricted type="role" title="Series Architect Locked" description="Tournament orchestration and bracket management are reserved for League Coordinators." />;
  if (!isPro) return <AccessRestricted type="tier" />;

  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const tournaments = useMemo(() => 
    (activeTeamEvents || []).filter(e => e.isTournament), 
    [activeTeamEvents]
  );

  if (selectedTournament) {
    return <TournamentDetailView event={selectedTournament} onBack={() => setSelectedTournament(null)} />;
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 shadow-sm">Elite Hub</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Championships</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Institutional Tournament Management</p>
        </div>
        {isStaff && (
          <Button onClick={() => setIsWizardOpen(true)} className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
            <Plus className="h-5 w-5 mr-2" /> Launch Series
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {tournaments.map((tourney) => (
          <Card 
            key={tourney.id} 
            className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white flex flex-col group transition-all hover:shadow-2xl hover:ring-2 hover:ring-primary/10 cursor-pointer"
            onClick={() => setSelectedTournament(tourney)}
          >
            <div className="h-2 bg-black w-full" />
            <CardContent className="p-8 lg:p-10 space-y-8 flex-1">
              <div className="flex justify-between items-start">
                <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
                  <Trophy className="h-10 w-10" />
                </div>
                <Badge variant="secondary" className="bg-black text-white border-none font-black text-[10px] h-7 px-4 shadow-lg uppercase">
                  {isPast(new Date(tourney.endDate || tourney.date)) ? 'ARCHIVED' : 'ACTIVE'}
                </Badge>
              </div>
              <div>
                <h3 className="text-3xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors uppercase">{tourney.title}</h3>
                <div className="flex items-center gap-2 mt-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <CalendarDays className="h-3 w-3 text-primary" />
                  <span>{format(new Date(tourney.date), 'MMM d')} - {format(new Date(tourney.endDate || tourney.date), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="px-8 lg:p-10 pt-0">
              <Button className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest bg-muted/20 text-foreground group-hover:bg-primary group-hover:text-white transition-all shadow-none">
                Command Hub <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {tournaments.length === 0 && (
          <div className="col-span-full py-32 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
            <div className="bg-white w-20 h-20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-xl mb-6"><Trophy className="h-10 w-10 text-primary opacity-20" /></div>
            <p className="text-xl font-black uppercase tracking-tight">No Active Series</p>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2 max-w-sm mx-auto">Deploy your first championship block using the wizard above.</p>
          </div>
        )}
      </div>

      <TournamentDeploymentWizard isOpen={isWizardOpen} onOpenChange={setIsWizardOpen} onComplete={() => {}} />
    </div>
  );
}
