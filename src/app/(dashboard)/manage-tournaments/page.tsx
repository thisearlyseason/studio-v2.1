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
  Lock,
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
  Wallet,
  Share,
  ExternalLink as ExternalLinkIcon
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
import { format, isPast, isSameDay, eachDayOfInterval, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { DailyWindow, TeamIdentity } from '@/lib/scheduler-utils';
import { generateIntelligentTournamentSchedule } from '@/lib/intelligent-scheduler';
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
  const standings = (teams || []).reduce((acc, team) => {
    acc[team.name] = { name: team.name, wins: 0, losses: 0, ties: 0, points: 0, netScore: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  (games || []).forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    standings[t1].netScore += (game.score1 - (game.score2 || 0));
    standings[t2].netScore += (game.score2 - (game.score1 || 0));

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
  const { activeTeam, user, hasFeature } = useTeam();
  const db = useFirestore();
  const { addEvent } = useTeam();

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
    waiverIds: [] as string[],
    registration_cost: '0',
    teams: [] as TournamentTeam[]
  });

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', user.id));
  }, [db, user?.id]);
  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const docsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc'));
  }, [db, activeTeam?.id]);
  const { data: documents } = useCollection<TeamDocument>(docsQuery);

  const leaguesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collection(db, 'leagues'), where('creatorId', '==', user.id));
  }, [db, user?.id]);
  const { data: leagues } = useCollection<League>(leaguesQuery);

  const pipelineEntriesQuery = useMemoFirebase(() => {
    if (!db || !user?.id) return null;
    return query(collectionGroup(db, 'registrationEntries'), where('status', 'in', ['accepted', 'assigned']));
  }, [db, user?.id]);
  const { data: pipelineEntries } = useCollection<RegistrationEntry>(pipelineEntriesQuery);

  const initDailyWindows = () => {
    if (!form.startDate || !form.endDate) return;
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
    } catch (e) { console.error(e); }
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
    toast({ title: "Teams Imported" });
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
    toast({ title: "Pipelines Imported" });
  };

  const handleDeploy = async () => {
    if (!form.title || form.teams.length < 2) return;
    setIsProcessing(true);
    const { games: schedule, report } = generateIntelligentTournamentSchedule({
      teams: form.teams,
      fields: form.selectedFields.length > 0 ? form.selectedFields : [form.manualVenue || form.location],
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.dailyWindows[0]?.startTime || '08:00',
      endTime: form.dailyWindows[0]?.endTime || '20:00',
      gameLength: parseInt(form.gameLength),
      breakLength: parseInt(form.breakLength),
      dailyWindows: form.dailyWindows,
      gamesPerTeam: parseInt(form.gamesPerTeam)
    });
    const success = await addEvent({
      title: form.title,
      date: new Date(form.startDate + 'T12:00:00').toISOString(),
      endDate: new Date((form.endDate || form.startDate) + 'T12:00:00').toISOString(),
      location: form.location,
      description: form.description,
      eventType: 'tournament',
      isTournament: true,
      tournamentTeamsData: form.teams,
      tournamentTeams: form.teams.map(t => t.name),
      tournamentGames: schedule,
      waiverIds: form.waiverIds,
      registration_cost: form.registration_cost
    });
    if (success) { onOpenChange(false); onComplete(); toast({ title: "Series Deployed" }); }
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
              <div className="bg-primary/10 p-3 rounded-2xl text-primary shadow-inner"><Trophy className="h-6 w-6" /></div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Series Architect</h2>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Institutional Deployment Wizard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map(s => (<div key={s} className={cn("h-2 rounded-full transition-all duration-500", step === s ? "w-12 bg-primary" : "w-2 bg-muted")} />))}
            </div>
          </header>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-10 pb-10">
              {step === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Identity & Timeline</h3>
                    <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Series Headline</Label><Input placeholder="e.g. 2024 Winter Invitational" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-xl shadow-inner" /></div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Launch Date</Label><Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Finale Date</Label><Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Hub Venue</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Entry Fee ($)</Label><Input type="number" value={form.registration_cost} onChange={e => setForm({...form, registration_cost: e.target.value})} className="h-12 border-2 rounded-xl font-black text-primary shadow-inner" /></div>
                      </div>
                    </div>
                  </section>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <header className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Squad Enrollment</h3>
                    <div className="flex gap-2">
                       <Button variant="outline" size="sm" className="text-[8px] font-black" onClick={importPipelineEntries}>FROM PIPELINES</Button>
                       <Button variant="ghost" size="sm" className="text-[8px] font-black" onClick={() => setForm({...form, teams: [...form.teams, {id:`m_${Date.now()}`, name:'', coach:'', email:'', source:'manual'}]})}>ADD MANUAL</Button>
                    </div>
                  </header>
                  <div className="space-y-3">
                    {form.teams.map((t, i) => (
                      <div key={t.id} className="grid grid-cols-12 gap-3 bg-muted/10 p-4 rounded-2xl border items-center">
                        <div className="col-span-1 text-[10px] font-black opacity-20">{i+1}</div>
                        <div className="col-span-5"><Input value={t.name} onChange={e => {const n=[...form.teams]; n[i].name=e.target.value; setForm({...form, teams:n});}} placeholder="Team Name" className="h-10 rounded-xl" /></div>
                        <div className="col-span-5"><Input value={t.coach} onChange={e => {const n=[...form.teams]; n[i].coach=e.target.value; setForm({...form, teams:n});}} placeholder="Coach" className="h-10 rounded-xl" /></div>
                        <div className="col-span-1 flex justify-end"><Button variant="ghost" size="icon" onClick={() => setForm({...form, teams: form.teams.filter(x => x.id !== t.id)})} className="text-destructive"><X className="h-4 w-4" /></Button></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-8 animate-in slide-in-from-right-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Coordination Windows</h3>
                  {form.dailyWindows.map((win, i) => (
                    <div key={win.date} className="bg-muted/10 p-6 rounded-3xl flex items-center justify-between border">
                      <span className="font-black uppercase text-xs">{win.date}</span>
                      <div className="flex gap-4">
                        <Input type="time" value={win.startTime} onChange={e => {const n=[...form.dailyWindows]; n[i].startTime=e.target.value; setForm({...form, dailyWindows:n});}} />
                        <Input type="time" value={win.endTime} onChange={e => {const n=[...form.dailyWindows]; n[i].endTime=e.target.value; setForm({...form, dailyWindows:n});}} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-8 border-t">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4">Field Resource Activation</h3>
                    {facilities?.map(f => (
                      <FacilityFieldLoader key={f.id} facilityId={f.id} selectedFields={form.selectedFields} onToggleField={(id) => {
                        setForm(p => ({ ...p, selectedFields: p.selectedFields.includes(id) ? p.selectedFields.filter(x => x !== id) : [...p.selectedFields, id] }));
                      }} />
                    ))}
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="space-y-12 animate-in slide-in-from-right-4">
                  <div className="bg-black text-white p-10 rounded-[3rem] space-y-6 shadow-2xl">
                    <Badge className="bg-primary text-white font-black uppercase tracking-widest">Pre-Deployment Audit</Badge>
                    <div className="space-y-4 text-white/60 font-black uppercase text-[10px]">
                      <div className="flex justify-between border-b border-white/10 pb-2"><span>Squads</span><span className="text-primary">{form.teams.length}</span></div>
                      <div className="flex justify-between border-b border-white/10 pb-2"><span>Matches</span><span className="text-primary">{Math.max(1, form.teams.length * 2)} Est.</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <footer className="pt-8 border-t flex gap-4">
            {step > 1 && <Button variant="outline" className="h-16 px-10 rounded-2xl font-black uppercase" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl" onClick={step === 4 ? handleDeploy : handleNext}>
              {step === 4 ? 'Deploy Series' : 'Next Stage'} <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
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
  const gamesByDay = useMemo(() => {
    if (!event.tournamentGames) return {};
    const grouped = event.tournamentGames.reduce((acc: any, game: TournamentGame) => {
      const day = game.date;
      if (!acc[day]) acc[day] = [];
      acc[day].push(game);
      return acc;
    }, {});
    return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
  }, [event.tournamentGames]);
  
  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeamsData || [], event.tournamentGames || []), [event]);

  const seedBracketFromStandings = async () => {
    if (!db || !activeTeam || !event.tournamentGames) return;
    const top4 = standings.slice(0, 4);
    if (top4.length < 4) {
      toast({ title: "Insufficient Data", description: "Need 4 ranked squads to initiate semi-finals.", variant: "destructive" });
      return;
    }

    const updatedGames = [...event.tournamentGames];
    const s1Idx = updatedGames.findIndex(g => g.round === 'Semi-Finals' && g.team1.includes('Seed 1'));
    const s2Idx = updatedGames.findIndex(g => g.round === 'Semi-Finals' && g.team1.includes('Seed 2'));

    if (s1Idx === -1 || s2Idx === -1) {
      toast({ title: "Architectural Mismatch", description: "No eligible TBD semi-final slots found.", variant: "destructive" });
      return;
    }

    updatedGames[s1Idx] = { 
      ...updatedGames[s1Idx], 
      team1: top4[0].name, team1Id: (event.tournamentTeamsData?.find(t => t.name === top4[0].name) as any)?.id || 'tbd',
      team2: top4[3].name, team2Id: (event.tournamentTeamsData?.find(t => t.name === top4[3].name) as any)?.id || 'tbd'
    };
    updatedGames[s2Idx] = { 
      ...updatedGames[s2Idx], 
      team1: top4[1].name, team1Id: (event.tournamentTeamsData?.find(t => t.name === top4[1].name) as any)?.id || 'tbd',
      team2: top4[2].name, team2Id: (event.tournamentTeamsData?.find(t => t.name === top4[2].name) as any)?.id || 'tbd'
    };

    await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), { tournamentGames: updatedGames });
    toast({ title: "Bracket Initialized", description: "Seeds 1-4 have been deployed to semi-finals." });
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="bg-black rounded-[3.5rem] p-12 text-white relative overflow-hidden shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none"><Zap className="h-48 w-48 text-primary" /></div>
        <div className="relative z-10 space-y-8">
           <div className="flex items-center gap-6">
             <Button variant="ghost" size="icon" onClick={onBack} className="h-14 w-14 rounded-full border-2 border-white/10 text-white hover:bg-white/10"><ChevronLeft className="h-7 w-7" /></Button>
             <div>
               <Badge className="bg-primary text-white border-none font-black text-[10px] uppercase tracking-widest mb-1">Elite Series Platform</Badge>
               <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">{event.title}</h1>
             </div>
           </div>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pt-8 border-t border-white/10">
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Squads</p><p className="text-3xl font-black">{(event.tournamentTeamsData || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Matches</p><p className="text-3xl font-black">{(event.tournamentGames || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Completion</p><p className="text-3xl font-black">{Math.round(((event.tournamentGames || []).filter(g => g.isCompleted).length / Math.max(1, (event.tournamentGames || []).length)) * 100)}%</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Timeline</p><p className="text-xl font-bold uppercase">{format(new Date(event.date), 'MMM d')} - {format(new Date(event.endDate || event.date), 'MMM d, yyyy')}</p></div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[4rem] border-2 shadow-2xl overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
          <div className="bg-muted/30 p-8 border-b">
            <TabsList className="bg-white/50 h-auto p-2 rounded-[2rem] border-2 w-full flex-wrap gap-1 shadow-inner">
              <TabsTrigger value="itinerary" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Matches</TabsTrigger>
              <TabsTrigger value="squads" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Teams</TabsTrigger>
              <TabsTrigger value="standings" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Standings</TabsTrigger>
              <TabsTrigger value="bracket" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Brackets</TabsTrigger>
              <TabsTrigger value="compliance" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
              <TabsTrigger value="architecture" className="rounded-2xl font-black text-xs uppercase px-10 py-4 flex-1 data-[state=active]:bg-orange-600 data-[state=active]:text-white">Architecture</TabsTrigger>
            </TabsList>
          </div>
          <div className="p-8 lg:p-14">
             <TabsContent value="architecture" className="mt-0 space-y-10">
                <div className="bg-orange-50 p-10 rounded-[3rem] border-2 border-dashed border-orange-200 space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-500/10 p-3 rounded-2xl text-orange-600"><Zap className="h-6 w-6" /></div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight">Bracket Telemetry</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600/60">Automated Seeding & Progression</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-8 rounded-[2.5rem] border-none shadow-xl bg-white space-y-6">
                      <div className="space-y-2">
                        <Badge className="bg-orange-600 text-white font-black text-[8px]">PRO TOOL</Badge>
                        <h4 className="text-lg font-black uppercase italic">Seed from Standings</h4>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Automatically promote the current Top 4 squads into the Semi-Final bracket.</p>
                      </div>
                      <Button onClick={seedBracketFromStandings} className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black uppercase text-xs shadow-lg shadow-orange-600/20 transition-all active:scale-95">
                        Initialize Seeds 1-4 <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Card>

                    <Card className="p-8 rounded-[2.5rem] border-none shadow-xl bg-black text-white space-y-6">
                      <div className="space-y-1">
                        <Badge className="bg-primary text-white font-black text-[8px]">ACTIVE</Badge>
                        <h4 className="text-lg font-black uppercase italic">Winner Progression</h4>
                        <p className="text-xs text-white/40 font-medium uppercase tracking-tight">Matches are currently linked. Winners of Semi-Finals automatically advance to Championship.</p>
                      </div>
                      <div className="flex items-center gap-2 text-green-500 font-black text-[10px] uppercase tracking-widest">
                        <CheckCircle2 className="h-4 w-4" /> Synchronization Active
                      </div>
                    </Card>
                  </div>
                </div>
              </TabsContent>

             <TabsContent value="itinerary" className="mt-0 space-y-12">
               {Object.entries(gamesByDay).map(([date, dayGames]: [string, any]) => (
                 <div key={date} className="space-y-8">
                   <div className="flex items-center gap-4">
                     <div className="h-px flex-1 bg-muted" />
                     <Badge variant="outline" className="bg-white border-2 border-primary/10 px-6 h-10 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
                       {format(parseISO(date), 'EEEE, MMMM do')}
                     </Badge>
                     <div className="h-px flex-1 bg-muted" />
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                     {dayGames.map((game: any) => {
                       const isTBD = game.team1.toLowerCase().includes('tbd') || game.team2.toLowerCase().includes('tbd');
                       return (
                         <Card key={game.id} className={cn(
                           "rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 bg-white p-8 space-y-6 transition-all hover:shadow-2xl hover:ring-primary/20 group relative overflow-hidden",
                           isTBD && "bg-muted/5 ring-1 ring-dashed ring-black/20"
                         )}>
                           {isTBD && (
                             <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none -rotate-12">
                               <Clock className="h-16 w-16" />
                             </div>
                           )}
                           <div className="flex items-center justify-between">
                              <Badge className={cn("px-3 h-7 text-[9px] font-black uppercase tracking-widest", isTBD ? "bg-muted text-muted-foreground" : "bg-black text-white")}>
                                {game.time}
                              </Badge>
                              {game.round && <Badge variant="outline" className={cn("text-[9px] font-black uppercase", isTBD ? "border-dashed" : "border-2")}>{game.round}</Badge>}
                           </div>
                           <div className="grid grid-cols-7 items-center text-center relative z-10">
                              <div className="col-span-3 min-w-0">
                                <p className={cn("font-black text-[11px] uppercase opacity-40 mb-2 truncate", isTBD && game.team1.toLowerCase().includes('tbd') && "italic")}>{game.team1}</p>
                                <p className={cn("text-4xl font-black tracking-tighter", isTBD ? "opacity-20" : "")}>{game.score1}</p>
                              </div>
                              <div className="col-span-1 opacity-10 font-black text-xs pt-8 italic">VS</div>
                              <div className="col-span-3 min-w-0">
                                <p className={cn("font-black text-[11px] uppercase opacity-40 mb-2 truncate", isTBD && game.team2.toLowerCase().includes('tbd') && "italic")}>{game.team2}</p>
                                <p className={cn("text-4xl font-black tracking-tighter", isTBD ? "opacity-20" : "")}>{game.score2}</p>
                              </div>
                           </div>
                           {game.location && <div className="pt-4 border-t border-muted/50 flex items-center justify-center gap-2"><MapPin className="h-3 w-3 text-primary opacity-50" /><span className="text-[9px] font-black text-muted-foreground uppercase">{game.location}</span></div>}
                         </Card>
                       );
                     })}
                   </div>
                 </div>
               ))}
               {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                 <div className="py-32 text-center opacity-40 font-black uppercase tracking-widest">No match logistics established.</div>
               )}
             </TabsContent>
             <TabsContent value="bracket" className="mt-0">
               <TournamentBracket games={event.tournamentGames || []} />
             </TabsContent>
             <TabsContent value="standings" className="mt-0 space-y-8">
                <Card className="rounded-[2.5rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-muted/30 border-b text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                         <tr><th className="px-10 py-5">Squad Rank</th><th className="text-center">W</th><th className="text-center">L</th><th className="text-center">T</th><th className="text-center">PTS</th></tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                         {standings.map((t, idx) => (
                           <tr key={t.name} className="hover:bg-muted/10 transition-colors">
                              <td className="px-10 py-6"><div className="flex items-center gap-4"><span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black">{idx + 1}</span><span className="font-black uppercase text-sm">{t.name}</span></div></td>
                              <td className="text-center font-bold text-emerald-600">{t.wins}</td>
                              <td className="text-center font-bold text-red-600">{t.losses}</td>
                              <td className="text-center font-bold text-muted-foreground">{t.ties}</td>
                              <td className="text-center bg-primary/[0.03]"><Badge className="bg-primary text-white font-black px-4">{t.points}</Badge></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </Card>
             </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export default function ManageTournamentsPage() {
  const { activeTeam, db, user } = useTeam();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const eventsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'), where('isTournament', '==', true), orderBy('date', 'desc'));
  }, [db, activeTeam?.id]);
  const { data: events, loading } = useCollection<TeamEvent>(eventsQuery);

  const activeEvent = useMemo(() => events?.find(e => e.id === selectedEventId), [events, selectedEventId]);

  if (activeEvent) return <div className="p-8 lg:p-14"><TournamentDetailView event={activeEvent} onBack={() => setSelectedEventId(null)} /></div>;

  return (
    <div className="p-8 lg:p-14 space-y-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7 uppercase tracking-[0.2em] shadow-xl">Series Operations Hub</Badge>
          <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none italic">Manage Tournaments</h1>
          <p className="text-sm font-medium text-muted-foreground leading-relaxed italic max-w-2xl">Elite-level institutional Series Architect for managing multi-field tournaments, synchronized officiating, and live bracket telemetry.</p>
        </div>
        <Button onClick={() => setIsWizardOpen(true)} className="h-20 px-12 rounded-[2rem] bg-black hover:bg-black/90 text-white font-black uppercase text-lg shadow-2xl transition-all active:scale-95 shrink-0">
          Assemble Elite Series <Plus className="ml-3 h-6 w-6" />
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {events?.map(event => (
          <Card key={event.id} className="rounded-[3rem] border-none shadow-xl ring-1 ring-black/5 bg-white p-10 space-y-8 group hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden" onClick={() => setSelectedEventId(event.id)}>
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700 font-black italic text-8xl flex flex-col items-end pointer-events-none">
               <Trophy className="h-32 w-32" />
            </div>
            <div className="relative z-10 space-y-4">
              <Badge variant="outline" className="border-2 font-black text-[9px] uppercase tracking-widest bg-white">Tournament Series</Badge>
              <h3 className="text-3xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{event.title}</h3>
              <div className="flex flex-col gap-2 pt-4">
                <div className="flex items-center gap-3 text-muted-foreground"><CalendarDays className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">{format(new Date(event.date), 'MMMM do, yyyy')}</span></div>
                <div className="flex items-center gap-3 text-muted-foreground"><MapPin className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest truncate">{event.location}</span></div>
              </div>
            </div>
            <div className="relative z-10 grid grid-cols-2 gap-4 border-t border-muted/30 pt-8">
               <div className="space-y-1"><p className="text-[8px] font-black uppercase opacity-40">Squads</p><p className="text-xl font-black">{(event.tournamentTeamsData || []).length}</p></div>
               <div className="space-y-1"><p className="text-[8px] font-black uppercase opacity-40">Matches</p><p className="text-xl font-black">{(event.tournamentGames || []).length}</p></div>
            </div>
            <Button variant="ghost" className="w-full h-14 rounded-2xl border-2 font-black uppercase text-xs tracking-widest group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">Launch Operations Hub <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></Button>
          </Card>
        ))}
        {loading && [1, 2, 3].map(i => <div key={i} className="h-80 rounded-[3rem] bg-muted/20 animate-pulse border-2 border-dashed" />)}
        {events?.length === 0 && !loading && (
          <div className="col-span-full py-40 text-center border-4 border-dashed rounded-[5rem] bg-muted/5 flex flex-col items-center">
            <div className="bg-primary/10 p-10 rounded-[3rem] text-primary mb-8 shadow-inner animate-pulse"><Trophy className="h-20 w-20" /></div>
            <h2 className="text-4xl font-black uppercase tracking-tighter mb-4 italic">The Arena is Empty</h2>
            <p className="text-muted-foreground uppercase text-xs font-black tracking-widest mb-10 italic">No elite series deployed in the current sector.</p>
            <Button onClick={() => setIsWizardOpen(true)} className="h-16 px-12 rounded-2xl font-black uppercase shadow-xl">Deploy First Series</Button>
          </div>
        )}
      </div>

      <TournamentDeploymentWizard isOpen={isWizardOpen} onOpenChange={setIsWizardOpen} onComplete={() => setSelectedEventId(null)} />
    </div>
  );
}
