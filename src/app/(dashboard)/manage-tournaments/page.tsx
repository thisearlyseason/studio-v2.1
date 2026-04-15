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
      gamesPerTeam: parseInt(form.gamesPerTeam),
      tournamentType: form.tournamentType
    });

    // Sanitize to remove 'undefined' fields which crash Firestore silently via 'Unsupported field value: undefined'
    const cleanSchedule = JSON.parse(JSON.stringify(schedule));

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
      tournamentGames: cleanSchedule,
      waiverIds: form.waiverIds,
      registration_cost: form.registration_cost
    });
    if (success) { 
      onOpenChange(false); 
      onComplete(); 
      toast({ title: "SYS_DEPLOY", description: "Elite series architecture successfully calibrated." }); 
    }
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl rounded-[3rem] p-0 border border-white/10 shadow-2xl overflow-hidden bg-[#050505] text-white h-[92vh] flex flex-col">
        <DialogTitle className="sr-only">Elite Series Architect</DialogTitle>
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-primary w-full shrink-0" />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Matrix */}
          <div className="w-[320px] bg-[#0a0a0a] border-r border-white/5 p-10 flex flex-col hidden lg:flex relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative z-10 flex items-center gap-4 mb-20">
              <div className="border border-white/20 p-3 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white"><Database className="h-5 w-5" /></div>
              <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">System<br/>Architect</h2>
              </div>
            </div>
            
            <div className="relative z-10 space-y-8 flex-1">
               {[
                 {num: 1, title: 'Strategic Initialization', desc: 'Identify Identity & Venue Constraints'},
                 {num: 2, title: 'Squad Procurement', desc: 'Lock Rosters & Registration'},
                 {num: 3, title: 'Field Matrix & Chrono', desc: 'Format Constraints & Timeslots'},
                 {num: 4, title: 'Pre-Flight Audit', desc: 'Verify Operational Telemetry'},
               ].map((s) => (
                 <div key={s.num} className={cn(
                   "relative pl-8 transition-all duration-300",
                   step === s.num ? "opacity-100" : "opacity-30"
                 )}>
                   <div className={cn(
                     "absolute left-0 top-1 bottom-1 w-[2px]",
                     step === s.num ? "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" : "bg-white/10"
                   )} />
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Phase {s.num}</h4>
                   <h3 className="text-sm font-black uppercase tracking-tight mb-1">{s.title}</h3>
                   <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{s.desc}</p>
                 </div>
               ))}
            </div>
            
            <div className="mt-auto border-t border-white/10 pt-8 relative z-10">
               <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase tracking-[0.2em]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Studio Engine Online</div>
            </div>
          </div>

          {/* Right Content Execution Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-10 right-10 opacity-5 pointer-events-none w-64 h-64"><Trophy className="w-full h-full" /></div>
            
            <ScrollArea className="flex-1 px-8 lg:px-16 pt-16 pb-32">
              <div className="max-w-3xl mx-auto space-y-12">
                {step === 1 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 1: Base Configuration</Badge>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Identity & Operations</h3>
                      <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Define the foundational parameters of this elite deployment.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Official Series Designation</Label>
                        <Input placeholder="e.g. 2024 CHAMPIONSHIP INVITATIONAL" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-16 rounded-2xl bg-white/5 border-white/10 font-black text-2xl text-white placeholder:text-white/20 uppercase focus-visible:ring-primary focus-visible:border-primary px-6 transition-all" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Commencement Date</Label>
                          <Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/5 border-white/10 font-bold text-white uppercase focus-visible:ring-primary px-6" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Conclusion Date</Label>
                          <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/5 border-white/10 font-bold text-white uppercase focus-visible:ring-primary px-6" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Central Hub/Venue</Label>
                          <Input placeholder="Stadium Name" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-14 rounded-xl bg-white/5 border-white/10 font-bold text-white focus-visible:ring-primary px-6" />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Registration Toll ($)</Label>
                          <Input type="number" min="0" value={form.registration_cost} onChange={e => setForm({...form, registration_cost: e.target.value})} className="h-14 rounded-xl bg-white/5 border-white/10 font-black text-xl text-primary focus-visible:ring-primary px-6" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {step === 2 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/5 pb-8 mb-8 gap-6">
                      <div className="flex-1">
                        <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 2: Roster Matrix</Badge>
                        <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Squad Initialization</h3>
                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Target and lock competitor slots for the series schedule.</p>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-end">
                         {leagues && leagues.length > 0 && (
                           <Select onValueChange={importLeagueTeams}>
                             <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 w-[180px] font-black uppercase text-[9px] tracking-widest">
                               <SelectValue placeholder="Import League" />
                             </SelectTrigger>
                             <SelectContent className="bg-[#0a0a0a] border-white/10 text-white font-black uppercase text-[9px]">
                               {leagues.map(l => (
                                 <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         )}
                         <Button className="bg-white text-black hover:bg-white/80 h-10 font-black uppercase tracking-widest text-[9px]" onClick={importPipelineEntries}>Sync Pipelines</Button>
                         <Button className="bg-white text-black hover:bg-white/80 h-10 font-black uppercase tracking-widest text-[9px]" onClick={() => setForm({...form, teams: [...form.teams, {id:`m_${Date.now()}`, name:'', coach:'', email:'', source:'manual'}]})}>Add Direct Asset</Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {form.teams.map((t, i) => (
                        <div key={t.id} className="grid grid-cols-12 gap-4 bg-white/5 p-5 rounded-[2rem] border border-white/5 items-center hover:bg-white/10 transition-colors group">
                          <div className="col-span-1 text-[10px] font-black opacity-20">T{i+1}</div>
                          <div className="col-span-5">
                            <Input value={t.name} onChange={e => {const n=[...form.teams]; n[i].name=e.target.value; setForm({...form, teams:n});}} placeholder="Squad Designation" className="h-12 bg-black/40 border-black font-black uppercase rounded-xl text-white" />
                          </div>
                          <div className="col-span-4">
                            <Input value={t.coach} onChange={e => {const n=[...form.teams]; n[i].coach=e.target.value; setForm({...form, teams:n});}} placeholder="Operator / Coach" className="h-12 bg-black/40 border-black font-bold text-sm rounded-xl text-white" />
                          </div>
                          <div className="col-span-2 flex justify-end">
                             <Button variant="ghost" size="icon" onClick={() => setForm({...form, teams: form.teams.filter(x => x.id !== t.id)})} className="h-12 w-12 rounded-xl text-white/20 hover:text-red-500 hover:bg-red-500/10"><X className="h-5 w-5" /></Button>
                          </div>
                        </div>
                      ))}
                      {form.teams.length === 0 && (
                        <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[3rem]">
                           <UserPlus className="h-10 w-10 mx-auto text-white/20 mb-4" />
                           <p className="text-white/40 font-black uppercase tracking-widest text-xs">No active squads engaged in the matrix.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {step === 3 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Phase 3: Logistics Engine</Badge>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Format & Chrono Sync</h3>
                      <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Define the algorithmic constraints for generating match structures.</p>
                    </div>

                    <div className="bg-white/5 p-8 rounded-[3rem] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Tournament Architecture</Label>
                          <Select value={form.tournamentType} onValueChange={(v: any) => {
                            let newGamesPerTeam = form.gamesPerTeam;
                            if (v === 'single_elimination') newGamesPerTeam = '1';
                            if (v === 'double_elimination') newGamesPerTeam = '2';
                            if (v === 'round_robin' || v === 'pool_play_knockout') newGamesPerTeam = Math.max(1, form.teams.length).toString();
                            setForm({...form, tournamentType: v, gamesPerTeam: newGamesPerTeam});
                          }}>
                            <SelectTrigger className="h-16 rounded-2xl bg-[#0a0a0a] border-white/10 font-black uppercase tracking-tight text-white px-6 focus:ring-primary focus:border-primary">
                              <SelectValue placeholder="Select Format" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0a] border border-white/10 text-white font-black uppercase tracking-tight">
                              <SelectItem value="round_robin" className="focus:bg-primary focus:text-white">Round Robin (Total Points)</SelectItem>
                              <SelectItem value="pool_play_knockout" className="focus:bg-primary focus:text-white">Pool Play & Playoffs</SelectItem>
                              <SelectItem value="single_elimination" className="focus:bg-primary focus:text-white">Single Elimination Matrix</SelectItem>
                              <SelectItem value="double_elimination" className="focus:bg-primary focus:text-white">Double Elimination Topology</SelectItem>
                            </SelectContent>
                          </Select>
                       </div>
                       
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Match Duration (Min)</Label>
                          <Input type="number" value={form.gameLength} onChange={e => setForm({...form, gameLength: e.target.value})} className="h-16 rounded-2xl bg-[#0a0a0a] border-white/10 font-black text-2xl text-white px-6 focus-visible:ring-primary" />
                       </div>
                       
                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Rest / Turnaround Matrix (Min)</Label>
                          <Input type="number" value={form.breakLength} onChange={e => setForm({...form, breakLength: e.target.value})} className="h-16 rounded-2xl bg-[#0a0a0a] border-white/10 font-black text-2xl text-white px-6 focus-visible:ring-primary" />
                       </div>

                       <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-2 flex items-center gap-2"><Lock className="h-3 w-3" /> Min Games Per Squad</Label>
                          <Input type="number" value={form.gamesPerTeam} onChange={e => setForm({...form, gamesPerTeam: e.target.value})} className="h-16 rounded-2xl bg-[#0a0a0a] border-primary/30 font-black text-2xl text-primary px-6 focus-visible:ring-primary shadow-inner" />
                       </div>
                    </div>

                    <div className="pt-8 border-t border-white/10 space-y-6">
                       <h3 className="text-xl font-black uppercase tracking-tighter text-white">Daily Operational Windows</h3>
                       <div className="grid gap-4">
                         {form.dailyWindows.map((win, i) => (
                           <div key={win.date} className="bg-[#0a0a0a] p-6 rounded-3xl flex items-center justify-between border border-white/5">
                             <div className="flex items-center gap-4">
                               <CalendarIcon className="h-5 w-5 text-white/30" />
                               <span className="font-black uppercase tracking-widest text-sm text-white">{format(new Date(win.date), 'EEEE, MMM do')}</span>
                             </div>
                             <div className="flex items-center gap-4">
                               <Input type="time" value={win.startTime} onChange={e => {const n=[...form.dailyWindows]; n[i].startTime=e.target.value; setForm({...form, dailyWindows:n});}} style={{ colorScheme: 'dark' }} className="h-12 w-32 bg-white/5 border-white/10 font-bold text-white" />
                               <ArrowRight className="h-4 w-4 text-white/20" />
                               <Input type="time" value={win.endTime} onChange={e => {const n=[...form.dailyWindows]; n[i].endTime=e.target.value; setForm({...form, dailyWindows:n});}} style={{ colorScheme: 'dark' }} className="h-12 w-32 bg-white/5 border-white/10 font-bold text-white" />
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-full bg-primary/20 text-primary flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(var(--primary),0.3)]">
                         <Database className="h-12 w-12" />
                      </div>
                      <Badge className="bg-primary text-white border-none uppercase font-black tracking-widest text-[10px] px-6 h-8 mb-6">System Lock Achieved</Badge>
                      <h3 className="text-5xl lg:text-7xl font-black uppercase tracking-tighter mb-4 text-white leading-none">Execute<br/>Deployment</h3>
                      <p className="text-sm font-bold opacity-60 uppercase tracking-widest max-w-md mx-auto">Schedules are dynamically calculated via our algorithmic constraints engine. Proceeding initiates telemetry rendering.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-[#0a0a0a] p-8 rounded-[3rem] border border-white/5 text-center flex flex-col items-center justify-center">
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2">Engaged Squads</span>
                         <span className="text-5xl font-black text-white">{form.teams.length}</span>
                       </div>
                       <div className="bg-[#0a0a0a] p-8 rounded-[3rem] border border-white/5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                         <div className="absolute inset-0 bg-primary/5" />
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2 relative z-10">Algorithmic Match Load</span>
                         <span className="text-5xl font-black text-white relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">±{Math.max(1, form.teams.length * (parseInt(form.gamesPerTeam)/2))}</span>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-8 border-t border-white/10 bg-[#070707] flex justify-between items-center shrink-0">
               {step > 1 ? (
                 <Button variant="ghost" onClick={() => setStep(step - 1)} className="h-16 px-10 rounded-2xl font-black uppercase text-xs tracking-widest text-white/50 hover:text-white hover:bg-white/5">
                   <ChevronLeft className="h-4 w-4 mr-2" /> Rollback
                 </Button>
               ) : <div />}
               
               <Button onClick={step === 4 ? handleDeploy : handleNext} disabled={isProcessing} className="h-16 px-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-sm tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all flex items-center">
                 {isProcessing ? (
                   <><Loader2 className="mr-3 h-5 w-5 animate-spin" /> SYNCHRONIZING</>
                 ) : step === 4 ? (
                   <><Target className="mr-3 h-5 w-5 text-red-600" /> INITIALIZE TOURNAMENT</>
                 ) : (
                   <>Proceed to Phase {step + 1} <ArrowRight className="ml-3 h-5 w-5" /></>
                 )}
               </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TournamentEditDialog({ event, isOpen, onOpenChange }: { event: TeamEvent, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { activeTeam, db } = useTeam();
  const [formData, setFormData] = useState({ 
    title: event.title, 
    date: event.date ? event.date.split('w')[0].substring(0, 10) : '', // Safety parse
    endDate: event.endDate ? event.endDate.split('w')[0].substring(0, 10) : '', 
    location: event.location || '', 
    registration_cost: event.registration_cost || '0' 
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: event.title,
        date: event.date ? new Date(event.date).toISOString().split('T')[0] : '',
        endDate: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : '',
        location: event.location || '',
        registration_cost: event.registration_cost || '0'
      });
    }
  }, [event, isOpen]);

  const handleSave = async () => {
     if(!db || !activeTeam) return;
     setIsSaving(true);
     try {
       await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), {
         title: formData.title,
         date: formData.date ? new Date(formData.date + 'T12:00:00').toISOString() : event.date,
         endDate: formData.endDate ? new Date(formData.endDate + 'T12:00:00').toISOString() : event.endDate,
         location: formData.location,
         registration_cost: formData.registration_cost
       });
       onOpenChange(false);
       toast({ title: "Series Configuration Updated" });
     } catch(e) {
       console.error(e);
       toast({ title: "Error tracking update", variant: "destructive" });
     }
     setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] p-8 border-none shadow-2xl bg-white">
        <DialogHeader className="mb-6">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">Edit Series config</DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-widest font-black opacity-50">Modify the identity and timeline of this deployment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Series Headline</Label><Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="h-14 font-black rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Launch Date</Label><Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="h-12 font-bold rounded-xl" /></div>
             <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Finale Date</Label><Input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="h-12 font-bold rounded-xl" /></div>
          </div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Base Location Hub</Label><Input value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="h-12 font-bold rounded-xl" /></div>
          <div className="space-y-2"><Label className="text-[10px] font-black uppercase">Registration Toll ($)</Label><Input type="number" value={formData.registration_cost} onChange={e => setFormData({...formData, registration_cost: e.target.value})} className="h-12 font-bold rounded-xl" /></div>
        </div>
        <DialogFooter className="mt-8">
           <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-black uppercase">Cancel</Button>
           <Button onClick={handleSave} disabled={isSaving} className="rounded-xl px-8 font-black shadow-xl uppercase">{isSaving ? 'Synching...' : 'Commit Protocol'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { isStaff, activeTeam, db } = useTeam();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('itinerary');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<TournamentGame | null>(null);
  const [celebrationWinner, setCelebrationWinner] = useState<string | null>(null);
  
  const handleGameClick = (game: TournamentGame) => {
    if (!isStaff || game.team1.includes('TBD') || game.team2.includes('TBD')) return;
    setSelectedGame(game);
    setScoreDialogOpen(true);
  };

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

  const injectBracketSlots = async () => {
    if (!db || !activeTeam || !event.tournamentGames) return;
    const hasSemis = event.tournamentGames.some(g => g.round === 'Semi-Finals');
    if (hasSemis) {
      toast({ title: "Architecture Current", description: "Bracket slots already exist for this series." });
      return;
    }

    const updatedGames = [...event.tournamentGames];
    const semi1Id = `s1_${Date.now()}`;
    const semi2Id = `s2_${Date.now()}`;
    const finalId = `f1_${Date.now()}`;
    const lastDate = event.tournamentGames[event.tournamentGames.length - 1]?.date || event.date;

    updatedGames.push({ 
      id: semi1Id, team1: 'TBD (Seed 1)', team2: 'TBD (Seed 4)', 
      team1Id: 'tbd', team2Id: 'tbd', 
      score1: 0, score2: 0,
      round: 'Semi-Finals', stage: 'Main',
      date: lastDate, time: 'TBA', location: 'TBD',
      isCompleted: false, updatedAt: new Date().toISOString(),
      winnerTo: finalId, winnerToSlot: 'team1' 
    });
    updatedGames.push({ 
      id: semi2Id, team1: 'TBD (Seed 2)', team2: 'TBD (Seed 3)', 
      team1Id: 'tbd', team2Id: 'tbd', 
      score1: 0, score2: 0,
      round: 'Semi-Finals', stage: 'Main',
      date: lastDate, time: 'TBA', location: 'TBD',
      isCompleted: false, updatedAt: new Date().toISOString(),
      winnerTo: finalId, winnerToSlot: 'team2' 
    });
    updatedGames.push({ 
      id: finalId, team1: 'TBD (Semi 1 Winner)', team2: 'TBD (Semi 2 Winner)', 
      team1Id: 'tbd', team2Id: 'tbd', 
      score1: 0, score2: 0,
      round: 'Championship', stage: 'Main',
      date: lastDate, time: 'TBA', location: 'TBD',
      isCompleted: false, updatedAt: new Date().toISOString() 
    });

    await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), { tournamentGames: updatedGames });
    toast({ title: "Architecture Refactored", description: "New bracket slots injected into series itinerary." });
  };

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="bg-black rounded-[3.5rem] p-12 text-white relative overflow-hidden shadow-2xl border border-white/5">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none"><Zap className="h-48 w-48 text-primary" /></div>
        <div className="relative z-10 space-y-8">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
             <div className="flex items-center gap-6 text-left">
               <Button variant="ghost" size="icon" onClick={onBack} className="h-14 w-14 rounded-full border-2 border-white/10 text-white hover:bg-white/10 shrink-0"><ChevronLeft className="h-7 w-7" /></Button>
               <div>
                 <Badge className="bg-primary text-white border-none font-black text-[10px] uppercase tracking-widest mb-1">Elite Series Platform</Badge>
                 <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter max-w-[800px] leading-tight">{event.title}</h1>
               </div>
             </div>
             {isStaff && (
               <Button onClick={() => setIsEditModalOpen(true)} className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] backdrop-blur-sm self-start shrink-0">
                 <Edit3 className="h-4 w-4 mr-2" /> Modify Series
               </Button>
             )}
           </div>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pt-8 border-t border-white/10">
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Squads</p><p className="text-3xl font-black">{(event.tournamentTeamsData || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Matches</p><p className="text-3xl font-black">{(event.tournamentGames || []).length}</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Completion</p><p className="text-3xl font-black">{Math.round(((event.tournamentGames || []).filter(g => g.isCompleted).length / Math.max(1, (event.tournamentGames || []).length)) * 100)}%</p></div>
              <div className="space-y-1"><p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Timeline</p><p className="text-xl font-bold uppercase">{format(new Date(event.date), 'MMM d')} - {format(new Date(event.endDate || event.date), 'MMM d, yyyy')}</p></div>
           </div>
        </div>
      </div>
      
      <TournamentEditDialog event={event} isOpen={isEditModalOpen} onOpenChange={setIsEditModalOpen} />

      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="sm:max-w-[440px] bg-white rounded-[3rem] p-10 border-2 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tighter">Match Result</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Secure Node Submission</DialogDescription>
          </DialogHeader>
          
          {selectedGame && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!db || !activeTeam || !event.tournamentGames) return;
              
              const formData = new FormData(e.currentTarget);
              const score1 = parseInt(formData.get('score1') as string, 10);
              const score2 = parseInt(formData.get('score2') as string, 10);
              
              const pGames = [...event.tournamentGames];
              const t1Adv = score1 > score2 ? selectedGame.team1 : selectedGame.team2;
              const t1AdvId = score1 > score2 ? selectedGame.team1Id : selectedGame.team2Id;

              try {
                const t1Adv = score1 > score2 ? selectedGame.team1 : selectedGame.team2;
                const t1AdvId = score1 > score2 ? selectedGame.team1Id : selectedGame.team2Id;
                const t1Los = score1 > score2 ? selectedGame.team2 : selectedGame.team1;
                const t1LosId = score1 > score2 ? selectedGame.team2Id : selectedGame.team1Id;

                const updatedGames = pGames.map(g => {
                   if (g.id === selectedGame.id) {
                      return { ...g, score1, score2, isCompleted: true, updatedAt: new Date().toISOString() };
                   }
                   // Flow winner
                   if (g.id === selectedGame.winnerTo) {
                      if (selectedGame.winnerToSlot === 'team1') return { ...g, team1: t1Adv, team1Id: t1AdvId || 'tbd' };
                      if (selectedGame.winnerToSlot === 'team2') return { ...g, team2: t1Adv, team2Id: t1AdvId || 'tbd' };
                   }
                   // Flow loser (dropout)
                   if (g.id === selectedGame.loserTo) {
                      if (selectedGame.loserToSlot === 'team1') return { ...g, team1: t1Los, team1Id: t1LosId || 'tbd' };
                      if (selectedGame.loserToSlot === 'team2') return { ...g, team2: t1Los, team2Id: t1LosId || 'tbd' };
                   }
                   return g;
                });
                
                await updateDoc(doc(db, 'teams', activeTeam.id, 'events', event.id), { tournamentGames: updatedGames });
                
                // Only trigger for the ultimate championship match
                const rLower = (selectedGame.round || '').toLowerCase();
                const isUltimateFinal = rLower === 'championship' || rLower === 'grand final';
                if (isUltimateFinal) {
                    setCelebrationWinner(t1Adv);
                }

                toast({ title: "Score Synchronized", description: "Match progression pushed to bracket architecture." });
              } catch (err) {
                console.error(err);
                toast({ title: "Sync Failed", variant: "destructive" });
              } finally {
                setScoreDialogOpen(false);
              }
            }} className="space-y-8 pt-4">
              <div className="flex items-center gap-6 justify-between">
                 <div className="space-y-3 flex-1 flex flex-col">
                   <Label className="text-[11px] font-black uppercase tracking-widest text-center truncate max-w-[140px] px-2">{selectedGame.team1}</Label>
                   <Input name="score1" type="number" defaultValue={selectedGame.score1 || 0} required className="h-20 text-4xl font-black text-center rounded-[2rem] bg-muted/10 border-2" />
                 </div>
                 <div className="text-xl font-black opacity-10 pt-8 italic tracking-tighter">VS</div>
                 <div className="space-y-3 flex-1 flex flex-col">
                   <Label className="text-[11px] font-black uppercase tracking-widest text-center truncate max-w-[140px] px-2">{selectedGame.team2}</Label>
                   <Input name="score2" type="number" defaultValue={selectedGame.score2 || 0} required className="h-20 text-4xl font-black text-center rounded-[2rem] bg-muted/10 border-2" />
                 </div>
              </div>
              <DialogFooter className="gap-3 sm:gap-0">
                 <Button type="button" variant="outline" onClick={() => setScoreDialogOpen(false)} className="rounded-full h-14 px-8 border-2 font-black uppercase tracking-widest text-[10px]">Cancel</Button>
                 <Button type="submit" className="rounded-full h-14 px-10 font-black uppercase tracking-widest text-[10px] bg-primary text-white">Commit Score</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!celebrationWinner} onOpenChange={() => setCelebrationWinner(null)}>
        <DialogContent className="sm:max-w-md bg-black border-none rounded-[4rem] p-12 overflow-hidden">
          <DialogTitle className="sr-only">Championship Celebration</DialogTitle>
          <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-transparent opacity-50" />
          <div className="relative z-10 text-center space-y-8 py-10">
             <div className="flex justify-center">
                <div className="relative">
                   <div className="absolute inset-0 bg-primary blur-[80px] opacity-40 animate-pulse" />
                   <div className="relative bg-gradient-to-br from-yellow-400 to-amber-600 p-8 rounded-[3rem] shadow-[0_0_50px_rgba(245,158,11,0.5)]">
                      <Trophy className="h-28 w-28 text-white animate-bounce" />
                   </div>
                </div>
             </div>
             <div className="space-y-4">
                <Badge className="bg-primary text-white font-black px-6 h-8 uppercase tracking-[0.3em] text-[10px]">Series Champion Declared</Badge>
                <h2 className="text-6xl font-black text-white uppercase tracking-tighter italic leading-none">{celebrationWinner}</h2>
                <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Victory Achieved in Elite Tournament Architecture</p>
             </div>
             <Button onClick={() => setCelebrationWinner(null)} className="w-full h-16 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-white/90">Dismiss Celebration</Button>
          </div>
        </DialogContent>
      </Dialog>

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
                      <Button variant="ghost" onClick={injectBracketSlots} className="w-full text-orange-600 font-black uppercase text-[9px] tracking-widest hover:bg-orange-50">
                        Incorporate Missing Bracket Architecture &rarr;
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

                <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-dashed border-slate-200 space-y-8">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="bg-black text-white p-3 rounded-2xl"><FileSignature className="h-6 w-6" /></div>
                        <div>
                           <h3 className="text-2xl font-black uppercase tracking-tight">Registration Architect</h3>
                           <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Custom Intake Forms & Documentation</p>
                        </div>
                     </div>
                     <Button 
                       onClick={() => router.push(`/manage-tournaments/registration/${activeTeam?.id}/${event.id}`)} 
                       className="h-14 px-8 rounded-2xl bg-black text-white font-black uppercase shadow-xl hover:bg-black/80"
                     >
                       Launch Form Builder <ExternalLink className="ml-2 h-4 w-4" />
                     </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="squads" className="mt-0 space-y-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {event.tournamentTeamsData?.map((team: any, idx: number) => (
                       <Card key={idx} className="rounded-[2.5rem] p-8 border-none shadow-xl flex items-center justify-between bg-white group hover:shadow-2xl transition-all">
                          <div className="flex items-center gap-4">
                             <div className="h-12 w-12 rounded-full bg-black text-white flex items-center justify-center font-black text-xs uppercase shadow-inner">
                               T{idx+1}
                             </div>
                             <div>
                               <h4 className="font-black text-lg uppercase truncate max-w-[150px]">{team.name}</h4>
                               {team.coach && <p className="text-[10px] font-bold text-muted-foreground uppercase">{team.coach}</p>}
                             </div>
                          </div>
                          <div><Badge className="bg-black/5 text-black hover:bg-black hover:text-white uppercase font-black tracking-widest text-[8px]">Squad</Badge></div>
                       </Card>
                    ))}
                 </div>
                 {(!event.tournamentTeamsData || event.tournamentTeamsData.length === 0) && (
                    <div className="py-32 text-center opacity-40 font-black uppercase tracking-widest">No active squads are assigned to this series.</div>
                 )}
              </TabsContent>

              <TabsContent value="compliance" className="mt-0 space-y-8">
                 <Card className="rounded-[3rem] p-12 border-2 border-dashed bg-muted/5 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="bg-primary/10 p-6 rounded-full text-primary"><ShieldAlert className="h-12 w-12" /></div>
                    <div className="space-y-2">
                       <h3 className="text-2xl font-black uppercase tracking-tighter">Compliance Auditing</h3>
                       <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest max-w-md">No critical waiver or medical clearance blockages detected for registered squads in this series.</p>
                    </div>
                    <Button variant="outline" className="h-12 px-8 rounded-full font-black uppercase text-[10px] border-2">Generate Liability Report</Button>
                 </Card>
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
               <TournamentBracket 
                 games={event.tournamentGames || []} 
                 onGameClick={handleGameClick} 
                 tournamentName={event.title}
               />
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
    return query(collection(db, 'teams', activeTeam.id, 'events'), where('isTournament', '==', true));
  }, [db, activeTeam?.id]);
  const { data: rawEvents, loading } = useCollection<TeamEvent>(eventsQuery);
  const events = useMemo(() => rawEvents?.slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [rawEvents]);

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
