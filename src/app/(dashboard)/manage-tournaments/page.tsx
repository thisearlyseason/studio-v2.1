
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
  UserPlus
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

interface TournamentTeam extends TeamIdentity {
  coach?: string;
  email?: string;
  source?: 'manual' | 'league' | 'pipeline';
}

function calculateTournamentStandings(teams: TournamentTeam[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team.name] = { name: team.name, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function BracketVisualizer({ games }: { games: TournamentGame[] }) {
  const bracketRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!bracketRef.current) return;
    const canvas = await html2canvas(bracketRef.current, { backgroundColor: '#000' });
    const link = document.createElement('a');
    link.download = 'tournament_bracket.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="rounded-xl font-black text-[10px] uppercase border-black text-black hover:bg-black hover:text-white" onClick={handleDownload}>
          <Download className="h-3 w-3 mr-2" /> Export Bracket
        </Button>
      </div>
      <div ref={bracketRef} className="p-12 bg-black rounded-[3rem] border-2 border-primary/20 overflow-x-auto min-h-[600px] flex items-center justify-center text-white shadow-2xl relative">
        <div className="absolute inset-0 bg-primary/5 opacity-50" />
        <div className="flex gap-16 items-center relative z-10">
          <div className="flex flex-col gap-12">
            <p className="text-[10px] font-black uppercase text-center text-primary/40 mb-2 tracking-[0.2em]">Pool Stage</p>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-56 h-20 bg-white/5 rounded-2xl border-2 border-white/10 flex flex-col justify-center px-5 shadow-lg group hover:border-primary/40 transition-all">
                <div className="flex justify-between items-center mb-2"><div className="h-2 w-24 bg-white/20 rounded-full group-hover:bg-primary/20" /><div className="h-2 w-4 bg-white/10 rounded-full" /></div>
                <div className="flex justify-between items-center"><div className="h-2 w-16 bg-white/10 rounded-full" /><div className="h-2 w-4 bg-white/10 rounded-full" /></div>
              </div>
            ))}
          </div>
          <ArrowRight className="h-8 w-8 text-primary opacity-20" />
          <div className="flex flex-col gap-32">
            <p className="text-[10px] font-black uppercase text-center text-primary/40 mb-2 tracking-[0.2em]">Semi Finals</p>
            {[1, 2].map(i => (
              <div key={i} className="w-60 h-24 bg-primary/5 rounded-[2rem] border-2 border-primary/20 flex flex-col justify-center px-6 shadow-xl relative group hover:ring-2 hover:ring-primary/20 transition-all">
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-full" />
                <div className="flex justify-between items-center mb-3"><span className="text-xs font-black uppercase text-white/40 group-hover:text-white/60 transition-colors">TBD</span><span className="text-xs font-bold text-primary">0</span></div>
                <div className="flex justify-between items-center"><span className="text-xs font-black uppercase text-white/40 group-hover:text-white/60 transition-colors">TBD</span><span className="text-xs font-bold text-primary">0</span></div>
              </div>
            ))}
          </div>
          <ArrowRight className="h-10 w-10 text-primary opacity-40 animate-pulse" />
          <div className="flex flex-col">
            <p className="text-[10px] font-black uppercase text-center text-primary mb-6 tracking-widest">Championship Final</p>
            <div className="w-72 h-40 bg-white text-black rounded-[2.5rem] border-4 border-primary flex flex-col justify-center items-center gap-4 shadow-2xl relative group overflow-hidden">
              <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-5 transition-opacity" />
              <Trophy className="absolute -top-8 h-16 w-16 text-amber-500 animate-bounce" />
              <div className="text-center pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Finalist Matchup</p>
                <div className="flex items-center gap-4">
                  <span className="font-black text-xl uppercase opacity-20 tracking-tighter">TBD</span>
                  <span className="font-black text-sm opacity-10">VS</span>
                  <span className="font-black text-xl uppercase opacity-20 tracking-tighter">TBD</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
    dailyWindows: [] as DailyWindow[],
    selectedFields: [] as string[],
    manualVenue: '',
    waiverId: 'default_tournament',
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
    const days = eachDayOfInterval({ start: new Date(form.startDate), end: new Date(form.endDate) });
    setForm(p => ({
      ...p,
      dailyWindows: days.map(d => ({
        date: format(d, 'yyyy-MM-dd'),
        startTime: '08:00',
        endTime: '20:00'
      }))
    }));
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
      tournamentType: form.tournamentType,
      gamesPerTeam: parseInt(form.gamesPerTeam)
    });

    const success = await addEvent({
      title: form.title,
      date: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      startTime: form.dailyWindows[0]?.startTime || '08:00',
      location: form.location,
      description: form.description,
      eventType: 'tournament',
      isTournament: true,
      tournamentTeamsData: form.teams,
      tournamentTeams: form.teams.map(t => t.name),
      tournamentGames: schedule,
      waiverId: form.waiverId,
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
                          <Label className="text-[10px] font-black uppercase ml-1">Games/Team (Min)</Label>
                          <Input type="number" value={form.gamesPerTeam} onChange={e => setForm({...form, gamesPerTeam: e.target.value})} className="h-12 border-2 rounded-xl font-black text-primary" />
                        </div>
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
                      {form.dailyWindows.map((win, idx) => (
                        <div key={win.date} className="bg-muted/20 p-6 rounded-3xl flex items-center justify-between border">
                          <p className="text-sm font-black uppercase tracking-widest min-w-[150px]">{format(new Date(win.date), 'EEEE, MMM d')}</p>
                          <div className="flex items-center gap-6">
                            <div className="space-y-1"><Label className="text-[8px] font-black uppercase opacity-40">Start</Label><Input type="time" value={win.startTime} onChange={e => { const n = [...form.dailyWindows]; n[idx].startTime = e.target.value; setForm({...form, dailyWindows: n}); }} className="h-10 bg-white font-bold" /></div>
                            <div className="space-y-1"><Label className="text-[8px] font-black uppercase opacity-40">End</Label><Input type="time" value={win.endTime} onChange={e => { const n = [...form.dailyWindows]; n[idx].endTime = e.target.value; setForm({...form, dailyWindows: n}); }} className="h-10 bg-white font-bold" /></div>
                          </div>
                        </div>
                      ))}
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
                          <Select value={form.tournamentType} onValueChange={(v: any) => setForm({...form, tournamentType: v})}>
                            <SelectTrigger className="h-14 rounded-2xl border-2 font-black"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="round_robin" className="font-bold">Round Robin (Pool Play)</SelectItem>
                              <SelectItem value="single_elimination" className="font-bold">Single Elimination</SelectItem>
                              <SelectItem value="double_elimination" className="font-bold">Double Elimination</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase ml-1">Compliance Waiver</Label>
                          <Select value={form.waiverId} onValueChange={(v) => setForm({...form, waiverId: v})}>
                            <SelectTrigger className="h-14 rounded-2xl border-2 font-black"><SelectValue placeholder="Select Institutional Protocol..." /></SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {documents?.map(doc => (
                                <SelectItem key={doc.id} value={doc.id} className="font-bold">{doc.title}</SelectItem>
                              ))}
                              {(!documents || documents.length === 0) && (
                                <SelectItem value="default_tournament" className="font-bold">Standard Tournament Waiver</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
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
              <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleNext} disabled={step === 1 && !form.title}>
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
  const [activeTab, setActiveTab] = useState('itinerary');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeamsData || [], event.tournamentGames || []), [event]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-3 shadow-lg">Live Series</Badge>
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight mt-1">{event.title}</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-1/3 flex flex-col text-white bg-black rounded-[3rem] p-8 lg:p-10 space-y-8">
          <div className="space-y-4"><p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Brief</p><p className="text-sm font-medium text-white/80 leading-relaxed italic">"{event.description || 'Championship itinerary established.'}"</p></div>
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leaderboard</h4>
            <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
              {standings.length > 0 ? standings.map((team) => (
                <div className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0" key={team.name}>
                  <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                  <Badge className="bg-primary text-white border-none font-black text-[9px] px-2 h-5">{team.points} PTS</Badge>
                </div>
              )) : <div className="p-8 text-center opacity-20 text-[10px] font-black uppercase">No standing data.</div>}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 bg-white rounded-[3rem] border-2 shadow-sm overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1 shadow-inner">
                <TabsTrigger value="itinerary" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Matches</TabsTrigger>
                <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Bracket</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Portals</TabsTrigger>
                <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Compliance</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 p-8 lg:p-10">
              <TabsContent value="itinerary" className="mt-0 space-y-4">
                {event.tournamentGames?.map((game) => (
                  <Card key={game.id} className="rounded-2xl border shadow-sm p-6 flex items-center justify-between group bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-muted/30 flex flex-col items-center justify-center shrink-0 border"><Clock className="h-4 w-4 text-primary" /><span className="text-[8px] font-black uppercase">{game.time}</span></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-4 justify-center">
                          <span className="font-black text-sm uppercase truncate text-right flex-1">{game.team1}</span>
                          <span className={cn("text-xl font-black", game.score1 > game.score2 ? "text-primary" : "text-foreground")}>{game.score1}</span>
                          <span className="opacity-20 text-[10px] font-black">VS</span>
                          <span className={cn("text-xl font-black", game.score2 > game.score1 ? "text-primary" : "text-foreground")}>{game.score2}</span>
                          <span className="font-black text-sm uppercase truncate flex-1">{game.team2}</span>
                        </div>
                        <div className="text-center mt-2">
                          <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{game.location}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {(!event.tournamentGames || event.tournamentGames.length === 0) && <div className="text-center py-20 opacity-30"><Clock className="h-12 w-12 mx-auto mb-4" /><p className="text-sm font-black uppercase">No matches scheduled.</p></div>}
              </TabsContent>
              <TabsContent value="bracket" className="mt-0"><BracketVisualizer games={event.tournamentGames || []} /></TabsContent>
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
                    <p className="text-xs text-white/60 font-medium leading-relaxed italic">Real-time bracket tracking and standsings access for fans and players.</p>
                    <Button variant="outline" className="w-full h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20">Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="compliance" className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><FileSignature className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase tracking-tight">Signature Ledger</h3></div></div>
                  <div className="grid grid-cols-1 gap-3">{(event.tournamentTeamsData || []).map(t => { const agreement = event.teamAgreements?.[t.name]; return (<Card key={t.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white flex items-center justify-between transition-all hover:ring-primary/20"><div className="flex items-center gap-4"><div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-colors", agreement ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground/30")}>{agreement ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</div><div className="min-w-0"><span className="font-black text-sm uppercase truncate block">{t.name}</span>{t.coach && <span className="text-[8px] font-bold text-muted-foreground uppercase">Coach: {t.coach}</span>}</div></div>{agreement ? (<div className="text-right"><p className="text-[8px] font-black uppercase text-green-600">Verified by {agreement.captainName}</p><p className="text-[7px] text-muted-foreground uppercase">{format(new Date(agreement.signedAt), 'MMM d, h:mm a')}</p></div>) : (<Badge variant="outline" className="text-[7px] font-black uppercase border-muted-foreground/20 text-muted-foreground">Pending Execution</Badge>)}</Card>); })}</div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function ManageTournamentsPage() {
  const { activeTeamEvents, isStaff } = useTeam();
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
