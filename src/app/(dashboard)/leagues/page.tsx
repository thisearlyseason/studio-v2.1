
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Trophy, 
  UserPlus, 
  Plus, 
  Search, 
  Clock, 
  CheckCircle2, 
  Zap, 
  Loader2,
  Activity,
  MapPin,
  ChevronRight,
  Edit3,
  Building,
  ShieldCheck,
  Sparkles,
  Calendar as CalendarIcon,
  CalendarDays,
  Trash2,
  Info,
  ArrowRight,
  Settings,
  Timer,
  Globe,
  LayoutGrid,
  ExternalLink
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generateLeagueSchedule } from '@/lib/scheduler-utils';
import { Calendar } from '@/components/ui/calendar';
import { format, isSameDay } from 'date-fns';
import { useTeam, League, TournamentGame, Field, Facility } from '@/components/providers/team-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

function FacilityFieldLoader({ facilityId, selectedFields, onToggleField }: { facilityId: string, selectedFields: string[], onToggleField: (name: string) => void }) {
  const db = useFirestore();
  const q = useMemoFirebase(() => db ? query(collection(db, 'facilities', facilityId, 'fields'), orderBy('name', 'asc')) : null, [db, facilityId]);
  const { data: fields } = useCollection<Field>(q);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
      {fields?.map(field => (
        <div 
          key={field.id} 
          className={cn(
            "p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group",
            selectedFields.includes(`${field.name}`) ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-muted-foreground/20"
          )}
          onClick={() => onToggleField(`${field.name}`)}
        >
          <span className="text-[10px] font-black uppercase tracking-widest truncate">{field.name}</span>
          {selectedFields.includes(`${field.name}`) ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted group-hover:border-muted-foreground/30" />}
        </div>
      ))}
    </div>
  );
}

function SeasonSchedulerDialog({ league, isOpen, onOpenChange }: { league: League, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { user: authUser } = useUser();
  const { db, updateLeagueSchedule } = useTeam();
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(Date.now() + 90 * 86400000), 'yyyy-MM-dd'),
    startTime: '18:00',
    endTime: '22:00',
    gameLength: '60',
    breakLength: '15',
    playDays: [1, 3] as number[],
    gamesPerTeam: '10',
    doubleHeaderOption: 'none' as 'none' | 'sameTeam' | 'differentTeams',
    selectedFields: [] as string[],
    blackoutDates: [] as Date[]
  });

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);

  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const leagueTeams = useMemo(() => {
    if (!league?.teams) return [];
    return Object.entries(league.teams)
      .filter(([_, t]) => t.status === 'accepted')
      .map(([id, t]) => ({ id, name: t.teamName }));
  }, [league?.teams]);

  const handleGenerate = async () => {
    if (!config.startDate || !config.selectedFields.length || leagueTeams.length < 2) {
      toast({ 
        title: "Config Required", 
        description: leagueTeams.length < 2 ? "Minimum 2 accepted squads required." : "Define timeline and select fields.", 
        variant: "destructive" 
      });
      return;
    }
    setIsProcessing(true);
    try {
      const schedule = generateLeagueSchedule({
        teams: leagueTeams,
        fields: config.selectedFields,
        startDate: config.startDate,
        endDate: config.endDate || undefined,
        startTime: config.startTime,
        endTime: config.endTime,
        gameLength: parseInt(config.gameLength),
        breakLength: parseInt(config.breakLength),
        playDays: config.playDays,
        gamesPerTeam: parseInt(config.gamesPerTeam),
        doubleHeaderOption: config.doubleHeaderOption,
        blackoutDates: config.blackoutDates.map(d => d.toISOString())
      });
      
      if (schedule.length === 0) {
        toast({ title: "Distribution Failure", description: "Could not satisfy scheduling constraints.", variant: "destructive" });
        return;
      }

      await updateLeagueSchedule(league.id, schedule);
      onOpenChange(false);
      toast({ title: "Season Deployed", description: `Synchronized ${schedule.length} matches to squad calendars.` });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleDay = (dayId: number) => {
    setConfig(p => ({
      ...p,
      playDays: p.playDays.includes(dayId) ? p.playDays.filter(d => d !== dayId) : [...p.playDays, dayId]
    }));
  };

  const toggleField = (fieldName: string) => {
    setConfig(p => ({
      ...p,
      selectedFields: p.selectedFields.includes(fieldName) ? p.selectedFields.filter(f => f !== fieldName) : [...p.selectedFields, fieldName]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground text-black">
        <DialogTitle className="sr-only">Season Architect</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2 text-black">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Settings className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Season Architect</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Precision League Deployment Engine</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 text-black">
            <div className="lg:col-span-7 space-y-10">
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Availability</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Season Start</Label>
                    <Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} className="h-12 border-2 font-black" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Season End</Label>
                    <Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} className="h-12 border-2 font-black" />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase ml-1">Active Play Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button 
                        key={day.id} 
                        onClick={() => toggleDay(day.id)} 
                        className={cn(
                          "h-10 px-4 rounded-xl font-black text-[10px] uppercase border-2 transition-all", 
                          config.playDays.includes(day.id) ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-white text-muted-foreground hover:border-primary/20"
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Execution Parameters</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Daily Start</Label>
                    <Input type="time" value={config.startTime} onChange={e => setConfig({...config, startTime: e.target.value})} className="h-12 border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Daily End</Label>
                    <Input type="time" value={config.endTime} onChange={e => setConfig({...config, endTime: e.target.value})} className="h-12 border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Break (Min)</Label>
                    <Input type="number" value={config.breakLength} onChange={e => setConfig({...config, breakLength: e.target.value})} className="h-12 border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Match Length</Label>
                    <Input type="number" value={config.gameLength} onChange={e => setConfig({...config, gameLength: e.target.value})} className="h-12 border-2 font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Games/Team</Label>
                    <Input type="number" value={config.gamesPerTeam} onChange={e => setConfig({...config, gamesPerTeam: e.target.value})} className="h-12 border-2 font-black text-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase ml-1">Double Headers</Label>
                    <Select value={config.doubleHeaderOption} onValueChange={(v: any) => setConfig({...config, doubleHeaderOption: v})}>
                      <SelectTrigger className="h-12 border-2 rounded-xl font-bold bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="none" className="font-bold">None</SelectItem>
                        <SelectItem value="sameTeam" className="font-bold">Same Opponent (Swap)</SelectItem>
                        <SelectItem value="differentTeams" className="font-bold">Different Opponents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Venue Allocation</h3>
                <ScrollArea className="h-64 border-2 rounded-[2.5rem] bg-muted/5 p-6 shadow-inner text-foreground">
                  {facilities?.length ? facilities.map(f => (
                    <div key={f.id} className="space-y-4 mb-8 last:mb-0">
                      <div className="flex items-center gap-3 px-2">
                        <Building className="h-4 w-4 text-primary" />
                        <span className="text-xs font-black uppercase">{f.name}</span>
                      </div>
                      <FacilityFieldLoader facilityId={f.id} selectedFields={config.selectedFields} onToggleField={toggleField} />
                    </div>
                  )) : (
                    <div className="py-12 text-center opacity-30 italic text-xs uppercase font-black">No organization facilities found.</div>
                  )}
                </ScrollArea>
              </section>
            </div>

            <aside className="lg:col-span-5 space-y-8">
              <div className="bg-black text-white rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
                <CalendarDays className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12" />
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-xl"><CalendarIcon className="h-4 w-4 text-white" /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Blackout Calendar</p>
                  </div>
                  <p className="text-[10px] font-medium text-white/60 leading-relaxed italic">Select dates where no league matches should be scheduled.</p>
                  <div className="bg-white rounded-2xl p-2 text-black [&_button:hover]:text-black">
                    <Calendar 
                      mode="multiple" 
                      selected={config.blackoutDates} 
                      onSelect={(dates) => setConfig({...config, blackoutDates: dates || []})} 
                      className="text-black"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 p-6 rounded-3xl border-2 border-dashed border-primary/20 space-y-4">
                <div className="flex items-center gap-2 text-primary"><Info className="h-4 w-4" /><h4 className="text-[10px] font-black uppercase tracking-widest">Enrollment Status</h4></div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase">{leagueTeams.length} squads detected in active roster.</p>
              </div>
            </aside>
          </div>

          <DialogFooter className="pt-6 border-t">
            <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-0.98 transition-all" onClick={handleGenerate} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Sparkles className="h-6 w-6 mr-3" />}
              Deploy Seasonal Pipeline
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeagueOverview({ league, schedule }: { league: League, schedule: TournamentGame[] }) {
  const { isStaff, submitLeagueMatchScore } = useTeam();
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [scoreForm, setScoreForm] = useState({ s1: '', s2: '' });

  const gamesByDay = useMemo(() => {
    const map: Record<string, TournamentGame[]> = {};
    (schedule || []).forEach(g => {
      const d = g.date;
      if (!map[d]) map[d] = [];
      map[d].push(g);
    });
    return map;
  }, [schedule]);

  const gameDays = useMemo(() => Object.keys(gamesByDay).map(d => new Date(d + 'T12:00:00')), [gamesByDay]);
  const gamesOnSelectedDate = useMemo(() => gamesByDay[format(selectedDate, 'yyyy-MM-dd')] || [], [gamesByDay, selectedDate]);

  const handleUpdateScore = async () => {
    if (!editingGame || !scoreForm.s1 || !scoreForm.s2) return;
    await submitLeagueMatchScore(league.id, editingGame.id, true, parseInt(scoreForm.s1), parseInt(scoreForm.s2));
    setEditingGame(null);
    toast({ title: "Result Persisted" });
  };

  const getDoubleHeaderLabel = (game: TournamentGame) => {
    const gamesOnDay = gamesByDay[game.date] || [];
    const t1Games = gamesOnDay.filter(g => g.team1 === game.team1 || g.team2 === game.team1);
    const t2Games = gamesOnDay.filter(g => g.team1 === game.team2 || g.team2 === game.team2);
    if (t1Games.length > 1 || t2Games.length > 1) return "DOUBLE HEADER";
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Match Command</h3></div>
        <div className="bg-muted/50 p-1.5 rounded-2xl border-2 flex items-center shadow-inner">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-9 px-6 rounded-xl font-black text-[10px] uppercase">Ledger</Button>
          <Button variant={viewMode === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('calendar')} className="h-9 px-6 rounded-xl font-black text-[10px] uppercase">Calendar</Button>
        </div>
      </div>
      
      {viewMode === 'list' ? (
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
          <CardContent className="p-0 text-foreground">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b">
                  <tr>
                    <th className="px-8 py-5">Date/Time</th>
                    <th className="px-4 py-5">Location</th>
                    <th className="px-4 py-5">Matchup (HOME VS GUEST)</th>
                    <th className="px-8 py-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/50">
                  {schedule.map(game => (
                    <tr key={game.id} className="hover:bg-muted/5 transition-colors group">
                      <td className="px-8 py-6">
                        <p className="font-black text-xs uppercase">{game.date}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold text-muted-foreground">{game.time}</p>
                          {getDoubleHeaderLabel(game) && <Badge className="bg-primary/10 text-primary border-none text-[7px] h-4 font-black">DOUBLE HEADER</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-6 font-bold text-xs uppercase text-muted-foreground">{game.location || 'TBD'}</td>
                      <td className="px-4 py-6">
                        <div className="flex items-center gap-4">
                          <span className="font-black text-xs uppercase truncate max-w-[120px] text-primary">{game.team1}</span>
                          {game.isCompleted ? (
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg">
                              <span className="font-black text-xs">{game.score1} - {game.score2}</span>
                            </div>
                          ) : <span className="opacity-20 text-[10px] font-black">VS</span>}
                          <span className="font-black text-xs uppercase truncate max-w-[120px]">{game.team2}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        {isStaff && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100" onClick={() => { setEditingGame(game); setScoreForm({ s1: game.score1.toString(), s2: game.score2.toString() }); }}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          <div className="w-full flex justify-center">
            <Calendar 
              mode="single" 
              selected={selectedDate} 
              onSelect={(d) => d && setSelectedDate(d)}
              modifiers={{ hasGame: gameDays }}
              modifiersClassNames={{
                hasGame: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:bg-primary after:rounded-full after:z-20",
              }}
              className="w-full max-w-4xl text-black [&_button:hover]:text-black"
            />
          </div>
          
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xl font-black uppercase tracking-tight">{format(selectedDate, 'EEEE, MMMM do')}</h4>
              <Badge variant="outline" className="font-black text-[10px]">{gamesOnSelectedDate.length} MATCHES</Badge>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {gamesOnSelectedDate.map(game => (
                <Card key={game.id} className="rounded-[2rem] border-none shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between bg-white text-foreground group hover:ring-2 hover:ring-primary/20 transition-all" onClick={() => isStaff && setEditingGame(game)}>
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 flex flex-col items-center justify-center border shrink-0">
                      <Clock className="h-5 w-5 text-primary mb-1" />
                      <span className="text-[10px] font-black uppercase text-primary">{game.time}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-black text-lg uppercase truncate text-foreground"><span className="text-primary">{game.team1}</span> vs {game.team2}</p>
                        {getDoubleHeaderLabel(game) && <Badge className="bg-primary text-white border-none text-[8px] h-5 font-black uppercase">Double Header</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> {game.location || 'Venue TBD'}</p>
                        {game.isCompleted && <Badge className="bg-black text-white border-none font-black text-[8px] h-5">FINAL: {game.score1}-{game.score2}</Badge>}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-6 w-6 text-primary opacity-20 group-hover:opacity-100 transition-all hidden md:block" />
                </Card>
              ))}
              {gamesOnSelectedDate.length === 0 && (
                <div className="py-24 text-center opacity-20 italic font-black uppercase text-sm border-2 border-dashed rounded-[3rem] bg-muted/10">
                  No matches scheduled for this window.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <Dialog open={!!editingGame} onOpenChange={(o) => !o && setEditingGame(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase">Result Verification</DialogTitle>
              <DialogDescription className="font-bold text-[10px] uppercase text-primary">{editingGame?.team1} vs {editingGame?.team2}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label className="text-[8px] font-black uppercase opacity-40 ml-1">HOME: {editingGame?.team1}</Label>
                <Input type="number" value={score1} onChange={e => setScore1(e.target.value)} className="h-16 text-center text-3xl font-black rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[8px] font-black uppercase opacity-40 ml-1">GUEST: {editingGame?.team2}</Label>
                <Input type="number" value={score2} onChange={e => setScore2(e.target.value)} className="h-16 text-center text-3xl font-black rounded-2xl" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateScore}>Commit Result</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LeaguesPage() {
  const { activeTeam, createLeague, isStaff, isPro, purchasePro, teams, removeTeamFromLeague, updateLeagueTeamDetails } = useTeam();
  const db = useFirestore();
  const { user: authUser, isAuthResolved } = useUser();
  const router = useRouter();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');
  const [mounted, setMounted] = useState(false);

  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editTeamForm, setEditTeamForm] = useState({ teamName: '', coachName: '', coachEmail: '' });

  useEffect(() => { setMounted(true); }, []);

  const leaguesQuery = useMemoFirebase(() => {
    if (!isAuthResolved || !activeTeam?.id || !db || !authUser?.uid) return null;
    return query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains', activeTeam.id));
  }, [isAuthResolved, activeTeam?.id, db, authUser?.uid]);

  const { data: leagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const activeLeague = useMemo(() => (leagues || [])[0] || null, [leagues]);

  const sortedStandings = useMemo(() => {
    if (!activeLeague || !activeLeague.teams) return [];
    return Object.entries(activeLeague.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague]);

  const showLoading = !mounted || isLeaguesLoading || !activeTeam;

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) return;
    setIsProcessing(true);
    try {
      await createLeague(leagueName);
      setIsCreateOpen(false); setLeagueName('');
      toast({ title: "League Established" });
    } finally { setIsProcessing(false); }
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setEditTeamForm({
      teamName: team.teamName,
      coachName: team.coachName || '',
      coachEmail: team.coachEmail || ''
    });
  };

  const handleSaveTeamUpdate = async () => {
    if (!activeLeague || !editingTeam) return;
    await updateLeagueTeamDetails(activeLeague.id, editingTeam.id, editTeamForm);
    setEditingTeam(null);
    toast({ title: "Standings Synchronized" });
  };

  if (showLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-700">
        <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl mb-6"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
        <p className="text-xl font-black uppercase tracking-tight text-foreground">Synchronizing Hub...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 text-foreground">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Master Hub</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Leagues</h1>
        </div>
        {!activeLeague && isStaff && (
          <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-5 w-5 mr-2" /> Launch League Architect
          </Button>
        )}
      </div>

      {activeLeague ? (
        <div className="space-y-8 animate-in fade-in duration-700">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white p-10 relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><ShieldCheck className="h-48 w-48" /></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl"><Trophy className="h-10 w-10 text-white" /></div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tight leading-none">{activeLeague.name}</h2>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport} • {Object.keys(activeLeague.teams || {}).length} Participating Squads</p>
                </div>
              </div>
              {isStaff && activeLeague.creatorId === authUser?.uid && (
                <div className="flex gap-2">
                  <Button onClick={() => isPro ? setIsSeasonOpen(true) : purchasePro()} variant="outline" className="rounded-xl h-12 px-6 border-white/20 bg-white/5 text-white hover:bg-white hover:text-black transition-all">Season Architect</Button>
                  <Link href={`/leagues/registration/${activeLeague.id}`}>
                    <Button className="rounded-xl h-12 px-6 font-black uppercase text-xs shadow-xl">Recruit Pool</Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="rounded-[2rem] border-none shadow-md bg-muted/20 p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="bg-white p-3 rounded-2xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all"><ExternalLink className="h-5 w-5" /></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Spectator Portal</p><p className="font-black text-sm uppercase">Live Standings Hub</p></div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl font-black uppercase text-[9px]" onClick={() => window.open(`/leagues/spectator/${activeLeague.id}`, '_blank')}>Public View</Button>
            </Card>
            <Card className="rounded-[2rem] border-none shadow-md bg-muted/20 p-6 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="bg-white p-3 rounded-2xl shadow-sm text-primary group-hover:bg-primary group-hover:text-white transition-all"><ShieldAlert className="h-5 w-5" /></div>
                <div><p className="text-[10px] font-black uppercase tracking-widest opacity-60">Scorekeeper Portal</p><p className="font-black text-sm uppercase">Direct Result Entry</p></div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl font-black uppercase text-[9px]" onClick={() => window.open(`/leagues/scorekeeper/${activeLeague.id}`, '_blank')}>Result Entry</Button>
            </Card>
          </div>

          <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex shadow-inner">
            <Button variant={activeTab === 'standings' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all" onClick={() => setActiveTab('standings')}>Standings</Button>
            {isStaff && <Button variant={activeTab === 'command' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all" onClick={() => setActiveTab('command')}>Match Command</Button>}
          </div>

          <Tabs value={activeTab} className="mt-0">
            <TabsContent value="standings" className="mt-0 animate-in fade-in duration-500">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Squad Rank</th><th className="px-4 py-5 text-center">Wins</th><th className="px-4 py-5 text-center">Losses</th><th className="px-10 py-5 text-right text-primary">Actions & PTS</th></tr></thead>
                    <tbody className="divide-y divide-muted/50">{sortedStandings.map((team, idx) => (
                      <tr key={team.id} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black text-muted-foreground/40 w-6">{idx + 1}</span>
                            <div>
                              <div className="font-black text-sm uppercase truncate text-foreground">{team.teamName}</div>
                              <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-60">{team.coachName || 'Staff Managed'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-center font-bold text-sm">{team.wins}</td>
                        <td className="px-4 py-6 text-center font-bold text-sm">{team.losses}</td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex items-center justify-end gap-4">
                            {isStaff && activeLeague.creatorId === authUser?.uid && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => handleEditTeam(team)}>
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => removeTeamFromLeague(activeLeague.id, team.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            <span className="font-black text-lg text-primary w-12">{team.points}</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="command" className="mt-0 animate-in fade-in duration-500"><LeagueOverview league={activeLeague} schedule={activeLeague.schedule || []} /></TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6 text-foreground">
          <div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl"><Shield className="h-10 w-10 text-primary opacity-20" /></div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase">No Competitive Enrollment</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto leading-relaxed">Initialize your own league architect to begin the competitive season.</p>
          </div>
          {isStaff && (
            <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="rounded-full px-10 h-12 border-2 font-black uppercase text-xs">Initialize Hub</Button>
          )}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md p-0 overflow-hidden bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase">League Architect</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase">League Title</Label>
              <Input placeholder="e.g. State Varsity Premier" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-14 rounded-2xl border-2 font-black" />
            </div>
            <DialogFooter><Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleCreateLeague} disabled={isProcessing}>{isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Hub"}</Button></DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTeam} onOpenChange={(o) => !o && setEditingTeam(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md p-0 overflow-hidden bg-white text-foreground">
          <div className="h-2 bg-black w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/5 p-3 rounded-2xl text-primary"><ShieldCheck className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight leading-none">Sync Squad Info</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] mt-1">Standings Metadata Sync</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Standings Team Name</Label>
                <Input value={editTeamForm.teamName} onChange={e => setEditTeamForm({...editTeamForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold focus:border-primary/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Primary Coach</Label>
                <Input value={editTeamForm.coachName} onChange={e => setEditTeamForm({...editTeamForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label>
                <Input type="email" value={editTeamForm.coachEmail} onChange={e => setEditTeamForm({...editTeamForm, coachEmail: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSaveTeamUpdate}>Commit Standings Update</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {activeLeague && <SeasonSchedulerDialog league={activeLeague} isOpen={isSeasonOpen} onOpenChange={setIsSeasonOpen} />}
    </div>
  );
}
