"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  Edit3,
  Building,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Calendar as CalendarIcon,
  CalendarDays,
  Trash2,
  Info,
  ArrowRight,
  Download,
  Settings,
  Timer,
  Globe,
  LayoutGrid,
  ExternalLink,
  Users,
  Share2,
  Lock as LockIcon
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generateLeagueSchedule } from '@/lib/scheduler-utils';
import { Calendar } from '@/components/ui/calendar';
import { format, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { jsPDF } from 'jspdf';
import { useTeam, League, TournamentGame, Field, Facility } from '@/components/providers/team-provider';
import { Select, SelectContent, SelectItem,  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

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
      .filter(([_, t]) => t.status === 'accepted' || t.status === 'assigned')
      .map(([id, t]) => ({ id, name: t.teamName }));
  }, [league?.teams]);

  const handleGenerate = async () => {
    if (!config.startDate || !config.selectedFields.length || leagueTeams.length < 2) {
      toast({ 
        title: "Config Required", 
        description: leagueTeams.length < 2 ? "Minimum 2 enrolled squads required." : "Define timeline and select fields.", 
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
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
        <DialogTitle className="sr-only">Season Architect</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Settings className="h-6 w-6" /></div>
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight">Season Architect</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Precision League Deployment Engine</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
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
                <ScrollArea className="h-64 border-2 rounded-[2.5rem] bg-muted/5 p-6 shadow-inner">
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
                  <div className="bg-white rounded-2xl p-2 text-black">
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [teamFilter, setTeamFilter] = useState<string>('all');
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

  const allTeams = useMemo(() => {
    const teams = new Set<string>();
    (schedule || []).forEach(g => { teams.add(g.team1); teams.add(g.team2); });
    return Array.from(teams).sort();
  }, [schedule]);

  const filteredSchedule = useMemo(() => {
    return (schedule || []).filter(g => {
      if (teamFilter !== 'all' && g.team1 !== teamFilter && g.team2 !== teamFilter) return false;
      if (dateRange?.from) {
        const gameDate = new Date(g.date + 'T12:00:00');
        if (gameDate < startOfDay(dateRange.from)) return false;
        if (dateRange.to && gameDate > endOfDay(dateRange.to)) return false;
      }
      return true;
    });
  }, [schedule, teamFilter, dateRange]);

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

  const exportSchedule = useCallback(() => {
    if (!schedule || schedule.length === 0) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 0, 0); doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont("helvetica", "bold"); doc.text(`${league.name.toUpperCase()} SCHEDULE`, 20, 30);
    doc.setFontSize(9); doc.text("OFFICIAL COMPETITIVE FIXTURES LOG", 20, 38);
    doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.text(`Total Fixtures: ${schedule.length}`, 20, 70);
    doc.setFillColor(245, 245, 245); doc.rect(20, 80, pageWidth - 40, 10, 'F');
    doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.text("DATE", 25, 86.5); doc.text("MATCHUP", 60, 86.5); doc.text("LOCATION", 140, 86.5); doc.text("TIME", pageWidth - 25, 86.5, { align: 'right' });
    let y = 100; doc.setTextColor(30,30,30); doc.setFontSize(9);
    schedule.forEach(g => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold"); doc.text(g.date, 25, y);
      doc.text(`${g.team1.toUpperCase()} vs ${g.team2.toUpperCase()}`, 60, y);
      doc.setFont("helvetica", "normal"); doc.text(g.location || 'TBD', 140, y);
      doc.setFont("helvetica", "bold"); doc.text(g.time, pageWidth - 25, y, { align: 'right' });
      doc.setDrawColor(245, 245, 245); doc.line(25, y + 4, pageWidth - 25, y+4); y += 12;
    });
    doc.save(`SCHEDULE_${league.name.replace(/\s+/g, '_')}.pdf`);
    toast({ title: "Fixtures Ledger Exported" });
  }, [league, schedule]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Match Command</h3></div>
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-11 rounded-xl border-2 font-black uppercase text-[10px] text-foreground">
              <SelectValue placeholder="View as team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Full Schedule</SelectItem>
              {allTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-xl border-2 font-black uppercase text-[10px] text-foreground" onClick={exportSchedule}>
            <Download className="h-4 w-4 mr-2" /> Download Schedule
          </Button>
          {isStaff && (
            <Button variant="default" className="flex-1 sm:flex-none h-11 rounded-xl font-black uppercase text-[10px]" onClick={() => (window as any).openManualGame?.()}>
              <Plus className="h-4 w-4 mr-2" /> Manual Entry
            </Button>
          )}
          <div className="bg-muted/50 p-1.5 rounded-2xl border-2 flex items-center shadow-inner mt-2 sm:mt-0 w-full sm:w-auto overflow-x-auto">
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="flex-1 h-9 px-6 rounded-xl font-black text-[10px] uppercase">Ledger</Button>
            <Button variant={viewMode === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('calendar')} className="flex-1 h-9 px-6 rounded-xl font-black text-[10px] uppercase">Calendar</Button>
          </div>
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
                    {filteredSchedule.map(game => (
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
                    {filteredSchedule.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-12 text-center text-muted-foreground text-sm font-bold uppercase tracking-widest">
                          No matches found for current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
      ) : (
        <div className="space-y-10">
          <div className="w-full flex justify-center">
            <Calendar 
              mode="range" 
              selected={dateRange} 
              onSelect={setDateRange}
              showOutsideDays={false}
              modifiers={{ hasGame: gameDays }}
              modifiersClassNames={{
                hasGame: "after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:bg-primary after:rounded-full after:z-20",
              }}
              className="w-full max-w-4xl text-black"
            />
          </div>
          
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xl font-black uppercase tracking-tight">
                {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'MMM do')} - ${format(dateRange.to, 'MMM do')}` : format(dateRange.from, 'EEEE, MMMM do')) : 'Select Date Range'}
              </h4>
              <Badge variant="outline" className="font-black text-[10px]">{filteredSchedule.length} MATCHES</Badge>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {filteredSchedule.map(game => (
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
              {filteredSchedule.length === 0 && (
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
                <Input type="number" value={scoreForm.s1} onChange={e => setScoreForm({...scoreForm, s1: e.target.value})} className="h-16 text-center text-3xl font-black rounded-2xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[8px] font-black uppercase opacity-40 ml-1">GUEST: {editingGame?.team2}</Label>
                <Input type="number" value={scoreForm.s2} onChange={e => setScoreForm({...scoreForm, s2: e.target.value})} className="h-16 text-center text-3xl font-black rounded-2xl" />
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

function ManualGameDialog({ league, isOpen, onOpenChange }: { league: League, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { addLeagueGame } = useTeam();
  const [isProcessing, setIsProcessing] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '18:00',
    location: '',
    team1Id: '',
    team2Id: ''
  });

  const leagueTeams = useMemo(() => {
    if (!league?.teams) return [];
    return Object.entries(league.teams)
      .filter(([_, t]) => t.status === 'accepted' || t.status === 'assigned')
      .map(([id, t]) => ({ id, name: t.teamName }));
  }, [league?.teams]);

  const handleSubmit = async () => {
    if (!form.team1Id || !form.team2Id || form.team1Id === form.team2Id) {
      toast({ title: "Invalid Matchup", description: "Select two different squads.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const t1 = leagueTeams.find(t => t.id === form.team1Id);
      const t2 = leagueTeams.find(t => t.id === form.team2Id);
      
      await addLeagueGame(league.id, {
        ...form,
        team1: t1?.name,
        team2: t2?.name,
      });
      onOpenChange(false);
      toast({ title: "Match Appended", description: "Manual entry successfully synced." });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden bg-white text-foreground shadow-2xl border-none">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-primary/5 p-3 rounded-xl text-primary"><Plus className="h-5 w-5" /></div>
              <DialogTitle className="text-2xl font-black uppercase">Manual Match Entry</DialogTitle>
            </div>
            <DialogDescription className="font-bold text-[10px] uppercase tracking-widest mt-1">Append custom fixture to season schedule</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Home Squad</Label>
                <Select value={form.team1Id} onValueChange={(v) => setForm({...form, team1Id: v})}>
                  <SelectTrigger className="h-12 border-2 rounded-xl font-bold bg-white text-foreground">
                    <SelectValue placeholder="Select Home" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {leagueTeams.map(t => <SelectItem key={t.id} value={t.id} className="font-bold uppercase text-[10px]">{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Guest Squad</Label>
                <Select value={form.team2Id} onValueChange={(v) => setForm({...form, team2Id: v})}>
                  <SelectTrigger className="h-12 border-2 rounded-xl font-bold bg-white text-foreground">
                    <SelectValue placeholder="Select Guest" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {leagueTeams.map(t => <SelectItem key={t.id} value={t.id} className="font-bold uppercase text-[10px]">{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Match Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="h-12 border-2 font-black bg-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Start Time</Label>
                <Input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="h-12 border-2 font-bold bg-white" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Location / Court</Label>
              <Input placeholder="e.g. Field 1 or South Gym" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 font-bold bg-white" />
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSubmit} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Append Fixture"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaguesPage() {
  const { 
    activeTeam, createLeague, isStaff, isPro, purchasePro, 
    teams, removeTeamFromLeague, updateLeagueTeamDetails,
    isClubManager, updateLeaguePin
  } = useTeam();
  const db = useFirestore();
  const { user: authUser, isAuthResolved } = useUser();
  const router = useRouter();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isManualGameOpen, setIsManualGameOpen] = useState(false);

  // Expose it to LeagueOverview via window for simplicity in this shared file
  useEffect(() => {
    (window as any).openManualGame = () => setIsManualGameOpen(true);
    return () => { delete (window as any).openManualGame; };
  }, []);
  const [leagueName, setLeagueName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');
  const [mounted, setMounted] = useState(false);

  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editTeamForm, setEditTeamForm] = useState({ teamName: '', coachName: '', coachEmail: '' });

  const [isFinancesOpen, setIsFinancesOpen] = useState(false);
  const [isEditLeagueOpen, setIsEditLeagueOpen] = useState(false);
  const [editLeagueForm, setEditLeagueForm] = useState({
    name: '', sport: '', description: '', startDate: '', endDate: '', ages: '', 
    contactEmail: '', contactPhone: '', registrationCost: '', twitter: '', instagram: '', paymentInstructions: ''
  });

  const leaguesQuery = useMemoFirebase(() => {
    if (!isAuthResolved || !db || !authUser?.uid) return null;
    
    // For regular users, leagues where their active team is a member
    if (activeTeam?.id) {
      return query(
        collection(db, 'leagues'), 
        where('memberTeamIds', 'array-contains', activeTeam.id),
        limit(20)
      );
    }
    
    // For managers without a selected team, leagues they created
    if (isStaff) {
      return query(
        collection(db, 'leagues'),
        where('creatorId', '==', authUser.uid),
        limit(20)
      );
    }
    
    return null;
  }, [isAuthResolved, activeTeam?.id, db, authUser?.uid, isStaff]);

  const { data: leagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  
  const activeLeague = useMemo(() => {
    if (selectedLeagueId) return (leagues || []).find(l => l.id === selectedLeagueId) || null;
    return (leagues || [])[0] || null;
  }, [leagues, selectedLeagueId]);

  const [leaguePin, setLeaguePin] = useState(activeLeague?.scorekeeperPin || '');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (activeLeague) setLeaguePin(activeLeague.scorekeeperPin || '');
  }, [selectedLeagueId, activeLeague?.scorekeeperPin]);

  const handleSavePin = async () => {
    if (!activeLeague) return;
    await updateLeaguePin(activeLeague.id, leaguePin);
    toast({ title: "Operations Key Updated" });
  };

  const handleToggleActive = async (val: boolean) => {
    if (!activeLeague) return;
    await updateDoc(doc(db, 'leagues', activeLeague.id), { is_active: val });
    toast({ title: val ? "Recruitment Portal Activated" : "Recruitment Portal Deactivated" });
  };

  const sortedStandings = useMemo(() => {
    if (!activeLeague || !activeLeague.teams) return [];
    return Object.entries(activeLeague.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague]);

  const exportStandings = useCallback(() => {
    if (!activeLeague || sortedStandings.length === 0) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 0, 0); doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont("helvetica", "bold"); doc.text("OFFICIAL STANDINGS", 20, 30);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(`${activeLeague.name.toUpperCase()} COMPETITIVE HUB`, 20, 38);
    doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("COMPETITIVE LOG: " + activeLeague.id.slice(-8), 20, 70);
    doc.setFillColor(245, 245, 245); doc.rect(20, 80, pageWidth - 40, 10, 'F');
    doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.text("RANK", 25, 86.5); doc.text("SQUAD", 45, 86.5); doc.text("WINS", 110, 86.5); doc.text("LOSSES", 135, 86.5); doc.text("POINTS", pageWidth - 30, 86.5, { align: 'right' });
    let y = 100; doc.setTextColor(30, 30, 30); doc.setFontSize(10);
    sortedStandings.forEach((t, i) => {
      doc.text(`${i + 1}`, 25, y); doc.setFont("helvetica", "bold"); doc.text(t.teamName.toUpperCase(), 45, y); doc.setFont("helvetica", "normal"); doc.text(`${t.wins}`, 110, y); doc.text(`${t.losses}`, 135, y); doc.setFont("helvetica", "bold"); doc.text(`${t.points}`, pageWidth - 30, y, { align: 'right' });
      doc.setDrawColor(245, 245, 245); doc.line(25, y + 4, pageWidth - 25, y + 4); y += 12;
    });
    doc.save(`STANDINGS_${activeLeague.name.replace(/\s+/g, '_')}.pdf`);
  }, [activeLeague, sortedStandings]);

  const exportRecruitPool = useCallback(() => {
    if (!activeLeague?.individualRecruits) return;
    const recruits = Object.entries(activeLeague.individualRecruits);
    if (recruits.length === 0) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(30,30,30); doc.rect(0, 0, pageWidth, 50, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont("helvetica", "bold"); doc.text("INSTITUTIONAL PERSONNEL LOG", 20, 30);
    doc.setFontSize(9); doc.text("PERSONNEL & RECRUITMENT PIPELINE", 20, 38);
    doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.text(`Participating Recruits: ${recruits.length}`, 20, 70);
    doc.setFillColor(245, 245, 245); doc.rect(20, 80, pageWidth - 40, 10, 'F');
    doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.text("NAME", 25, 86.5); doc.text("EMAIL", 85, 86.5); doc.text("STATUS", 150, 86.5); doc.text("VERIFIED", pageWidth - 25, 86.5, { align: 'right' });
    let y = 100; doc.setTextColor(30, 30, 30); doc.setFontSize(9);
    recruits.forEach(([id, p]) => {
      doc.setFont("helvetica", "bold"); doc.text(p.name.toUpperCase(), 25, y); doc.setFont("helvetica", "normal"); doc.text(p.email, 85, y); doc.text(p.status.toUpperCase(), 150, y); doc.text(p.signedAt ? 'YES' : 'NO', pageWidth - 25, y, { align: 'right' });
      doc.line(25, y + 4, pageWidth - 25, y + 4); y += 12;
    });
    doc.save(`RECRUIT_POOL_${activeLeague.id.slice(-8)}.pdf`);
  }, [activeLeague]);

  const showLoading = !mounted || isLeaguesLoading || (!activeTeam && !isStaff);

  const handleEditLeague = () => {
    if (!activeLeague) return;
    setEditLeagueForm({
      name: activeLeague.name || '',
      sport: activeLeague.sport || '',
      description: activeLeague.description || '',
      startDate: activeLeague.startDate || '',
      endDate: activeLeague.endDate || '',
      ages: activeLeague.ages || '',
      contactEmail: activeLeague.contactEmail || '',
      contactPhone: activeLeague.contactPhone || '',
      registrationCost: activeLeague.registrationCost || '',
      twitter: activeLeague.socialLinks?.twitter || '',
      instagram: activeLeague.socialLinks?.instagram || '',
      paymentInstructions: activeLeague.paymentInstructions || ''
    });
    setIsEditLeagueOpen(true);
  };

  const handleSaveLeague = async () => {
    if (!activeLeague || !db) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'leagues', activeLeague.id), {
        name: editLeagueForm.name,
        sport: editLeagueForm.sport,
        description: editLeagueForm.description,
        startDate: editLeagueForm.startDate,
        endDate: editLeagueForm.endDate,
        ages: editLeagueForm.ages,
        contactEmail: editLeagueForm.contactEmail,
        contactPhone: editLeagueForm.contactPhone,
        registrationCost: editLeagueForm.registrationCost,
        paymentInstructions: editLeagueForm.paymentInstructions,
        socialLinks: {
          twitter: editLeagueForm.twitter,
          instagram: editLeagueForm.instagram
        }
      });
      setIsEditLeagueOpen(false);
      toast({ title: "League Profile Updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

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

      {leagues && leagues.length > 0 && (
        <div className="flex flex-col gap-8">
          {!selectedLeagueId && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
              {leagues.map((league) => (
                <Card 
                  key={league.id} 
                  className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white flex flex-col group transition-all hover:shadow-2xl hover:ring-2 hover:ring-primary/10 cursor-pointer"
                  onClick={() => setSelectedLeagueId(league.id)}
                >
                  <div className="h-2 bg-black w-full" />
                  <CardContent className="p-8 lg:p-10 space-y-8 flex-1">
                    <div className="flex justify-between items-start">
                      <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
                        <Trophy className="h-10 w-10" />
                      </div>
                      <Badge variant="secondary" className="bg-black text-white border-none font-black text-[10px] h-7 px-4 shadow-lg uppercase">
                        {league.sport}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-3xl font-black uppercase tracking-tight group-hover:text-primary transition-colors">{league.name}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                        {Object.keys(league.teams || {}).length} squads • Hub ID: {league.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <div className="pt-4 border-t flex justify-between items-center">
                      <div className="flex gap-2">
                         <div className="h-8 w-8 rounded-lg bg-muted/20 flex items-center justify-center"><Users className="h-4 w-4 opacity-40" /></div>
                         <div className="h-8 w-8 rounded-lg bg-muted/20 flex items-center justify-center"><Zap className="h-4 w-4 opacity-40" /></div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 rounded-lg text-[9px] font-black uppercase group-hover:bg-primary group-hover:text-white transition-all">Select Hub</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card 
                className="rounded-[3rem] border-2 border-dashed border-muted bg-transparent flex flex-col items-center justify-center p-12 group hover:border-primary/40 transition-all cursor-pointer"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-all mb-4" />
                <p className="text-xs font-black uppercase text-muted-foreground group-hover:text-primary">New League Hub</p>
              </Card>
            </div>
          )}
        </div>
      )}

      {selectedLeagueId && activeLeague ? (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedLeagueId(null)} className="rounded-full h-12 w-12 border-2 hover:bg-muted shrink-0 text-black border-black"><ChevronLeft className="h-6 w-6" /></Button>
            <div className="bg-primary/5 px-4 py-2 rounded-xl text-primary font-black uppercase text-[10px] tracking-widest border border-primary/10">Active Context: {activeLeague.name}</div>
          </div>
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white p-10 relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><ShieldCheck className="h-48 w-48" /></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl"><Trophy className="h-10 w-10 text-white" /></div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-4xl font-black uppercase tracking-tight leading-none">{activeLeague.name}</h2>
                    <Badge variant="outline" className="border-white/20 text-white font-black text-[8px] h-5 px-2">ACTIVE HUB</Badge>
                  </div>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport} • {Object.keys(activeLeague.teams || {}).length} Participating Squads</p>
                </div>
              </div>
              {isStaff && activeLeague.creatorId === authUser?.uid && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button 
                    onClick={() => {
                      if (!isPro) { purchasePro(); return; }
                      navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.id}?protocol=team_config`);
                      toast({ title: "Public Link Copied", description: "The registration portal link is ready to share." });
                    }} 
                    variant="ghost" 
                    size="icon" 
                    className="h-12 w-12 rounded-xl border-white/20 border hover:bg-white/10 text-white transition-all"
                  >
                    {!isPro ? <LockIcon className="h-5 w-5 opacity-40" /> : <Share2 className="h-5 w-5" />}
                  </Button>
                  <Button onClick={handleEditLeague} variant="ghost" size="icon" className="h-12 w-12 rounded-xl border-white/20 border hover:bg-white/10 text-white transition-all"><Settings className="h-5 w-5" /></Button>
                  <Button onClick={() => isPro ? setIsSeasonOpen(true) : purchasePro()} variant="outline" className="rounded-xl h-12 px-6 border-white/20 bg-white/5 text-white hover:bg-white hover:text-black transition-all flex items-center gap-2">
                    {!isPro && <LockIcon className="h-3 w-3" />}
                    Season Architect
                  </Button>
                  <Button 
                    variant="default" 
                    className="rounded-xl h-12 px-6 font-black uppercase text-xs shadow-xl flex items-center gap-2"
                    onClick={() => isPro ? router.push(`/leagues/registration/${activeLeague.id}`) : purchasePro()}
                  >
                    {!isPro && <LockIcon className="h-3 w-3" />}
                    Recruit Pool
                  </Button>
                </div>
              )}
            </div>
          </Card>


          <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4">
            <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex shadow-inner">
              <Button variant={activeTab === 'standings' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all" onClick={() => setActiveTab('standings')}>Standings</Button>
              {isStaff && <Button variant={activeTab === 'command' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all" onClick={() => setActiveTab('command')}>Match Command</Button>}
              {isStaff && <Button variant={activeTab === 'portals' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all flex items-center gap-2" onClick={() => isPro ? setActiveTab('portals') : purchasePro()}>{!isPro && <LockIcon className="h-3 w-3" />} Portals</Button>}
              {isStaff && <Button variant={activeTab === 'personnel' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all flex items-center gap-2" onClick={() => isPro ? setActiveTab('personnel') : purchasePro()}>{!isPro && <LockIcon className="h-3 w-3" />} Personnel (Recruiter)</Button>}
            </div>
            <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              {activeTab === 'standings' && (
                <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-xl border-2 font-black uppercase text-[10px]" onClick={exportStandings}>
                  <Download className="h-4 w-4 mr-2" /> Download Standings
                </Button>
              )}
              {activeTab === 'personnel' && (
                <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-xl border-2 font-black uppercase text-[10px]" onClick={exportRecruitPool}>
                  <Download className="h-4 w-4 mr-2" /> Download Personnel Log
                </Button>
              )}
            </div>
          </div>

          <Tabs value={activeTab} className="mt-0">
            <TabsContent value="standings" className="mt-0 animate-in fade-in duration-500">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Squad Rank</th><th className="px-4 py-5 text-center">Wins</th><th className="px-4 py-5 text-center">Losses</th><th className="px-4 py-5 text-center">Waiver</th><th className="px-10 py-5 text-right text-primary">Actions & PTS</th></tr></thead>
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
                          <td className="px-4 py-6 text-center">
                            {team.signedAt ? (
                              <div className="space-y-0.5">
                                <Badge className="bg-green-100 text-green-700 border-none font-black text-[7px] h-4">SIGNED</Badge>
                                <p className="text-[6px] font-bold text-muted-foreground uppercase">{format(new Date(team.signedAt), 'MMM d, p')}</p>
                              </div>
                            ) : <Badge variant="outline" className="text-[7px] font-black opacity-30 uppercase">PENDING</Badge>}
                          </td>
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
            <TabsContent value="personnel" className="mt-0 animate-in fade-in duration-500">
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Personnel Pool</h3></div>
                  <Link href={`/leagues/registration/${activeLeague.id}`}>
                    <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px]">Open Recruiting Center</Button>
                  </Link>
                </div>
                <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Athlete Name</th><th className="px-4 py-5 text-center">Status</th><th className="px-4 py-5 text-center">Waiver</th><th className="px-10 py-5 text-right">Contact</th></tr></thead>
                      <tbody className="divide-y divide-muted/50">
                        {Object.entries(activeLeague.individualRecruits || {}).map(([id, p]) => (
                          <tr key={id} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary"><UserPlus className="h-5 w-5" /></div>
                                <span className="font-black text-sm uppercase truncate text-foreground">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-6 text-center">
                              <Badge className={cn("border-none font-black text-[8px] uppercase px-3 h-6", p.status === 'pending' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>{p.status}</Badge>
                            </td>
                            <td className="px-4 py-6 text-center">
                              {p.signedAt ? (
                                <div className="space-y-0.5">
                                  <Badge className="bg-black/5 text-black border-none font-black text-[7px] h-4">SIGNED</Badge>
                                  <p className="text-[6px] font-bold text-muted-foreground uppercase">{format(new Date(p.signedAt), 'MMM d, p')}</p>
                                </div>
                              ) : <span className="text-[8px] font-bold text-muted-foreground uppercase opacity-40 italic">Pending</span>}
                            </td>
                            <td className="px-10 py-6 text-right font-bold text-[10px] text-muted-foreground uppercase">{p.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!activeLeague.individualRecruits || Object.keys(activeLeague.individualRecruits).length === 0) && (
                      <div className="py-24 text-center opacity-20 italic font-black uppercase text-xs">No active personnel applicants detected.</div>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="portals" className="mt-0 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] border-none shadow-xl bg-orange-600 text-white p-8 space-y-4 group transition-all">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-white text-orange-600 border-none font-black text-[8px] h-5 px-2">PIPELINE</Badge>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase opacity-60">Portal Live</span>
                      <Switch 
                        checked={activeLeague.is_active !== false} 
                        onCheckedChange={handleToggleActive}
                        className="data-[state=checked]:bg-white data-[state=unchecked]:bg-white/20 select-none"
                      />
                    </div>
                  </div>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Registration Portal</h4>
                  <p className="text-xs text-white/80 font-medium leading-relaxed italic">Public recruitment for squads to join the roster.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.id}?protocol=team_config`); toast({ title: "Portal Link Copied" }); }}>Copy Link <Share2 className="ml-2 h-3 w-3" /></Button>
                    <Button variant="outline" className="h-12 w-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => router.push(`/leagues/registration/${activeLeague.id}`)}><Edit3 className="h-4 w-4" /></Button>
                  </div>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 space-y-4 group transition-all">
                  <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">SECURITY</Badge>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Operations Key</h4>
                  <p className="text-xs text-white/60 font-medium leading-relaxed italic">Required for public scorekeepers to post official results.</p>
                  <div className="flex items-center gap-2">
                    <Input 
                      placeholder="NO PIN SET" 
                      value={leaguePin} 
                      onChange={e => setLeaguePin(e.target.value)}
                      className="h-12 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/20 font-black text-center tracking-[0.2em]"
                    />
                    <Button variant="default" className="h-12 px-6 rounded-xl font-black uppercase text-[10px]" onClick={handleSavePin}>SAVE</Button>
                  </div>
                </Card>
                
                <Card className="rounded-[2.5rem] border-none shadow-xl bg-muted/5 p-8 space-y-4 group transition-all border-2 border-dashed border-black/5">
                  <Badge className="bg-black text-white border-none font-black text-[8px] h-5 px-2">PUBLIC VIEW</Badge>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none text-black">Spectator Hub</h4>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">Real-time standings access for fans and players.</p>
                  <Button variant="outline" className="w-full h-12 rounded-xl bg-black/5 border-black/10 text-black hover:bg-black/10" onClick={() => window.open(`/leagues/spectator/${activeLeague.id}`, '_blank')}>Open Live View <ExternalLink className="ml-2 h-3 w-3" /></Button>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-muted/5 p-8 space-y-4 group transition-all border-2 border-dashed border-black/5">
                  <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-2">OPERATIONS</Badge>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none text-black">Scorekeeper Hub</h4>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">Result entry portal for field generals to post scores.</p>
                  <Button variant="outline" className="w-full h-12 rounded-xl bg-black/5 border-black/10 text-black hover:bg-black/10" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/leagues/scorekeeper/${activeLeague.id}`); toast({ title: "Scorekeeper URL Copied" }); }}>Copy Entry Link <Share2 className="ml-2 h-3 w-3" /></Button>
                </Card>
              </div>
            </TabsContent>
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

      <Dialog open={isEditLeagueOpen} onOpenChange={setIsEditLeagueOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[3rem] p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground max-h-[90vh] overflow-y-auto w-11/12 mx-auto sm:w-full">
          <div className="h-3 bg-black w-full" />
          <div className="p-8 lg:p-12 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">League Profile</DialogTitle>
              <DialogDescription className="font-bold text-[10px] uppercase tracking-widest mt-2">{activeLeague?.name} • Public Context</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">League Name</Label>
                   <Input value={editLeagueForm.name} onChange={e => setEditLeagueForm({...editLeagueForm, name: e.target.value})} className="h-12 rounded-xl border-2 font-black" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Type of Sport</Label>
                   <Input value={editLeagueForm.sport} onChange={e => setEditLeagueForm({...editLeagueForm, sport: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
               </div>
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Description</Label>
                 <Textarea value={editLeagueForm.description} onChange={e => setEditLeagueForm({...editLeagueForm, description: e.target.value})} className="rounded-2xl border-2 font-medium min-h-[100px]" placeholder="Detailed description of the league..." />
               </div>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                   <Input type="date" value={editLeagueForm.startDate} onChange={e => setEditLeagueForm({...editLeagueForm, startDate: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                   <Input type="date" value={editLeagueForm.endDate} onChange={e => setEditLeagueForm({...editLeagueForm, endDate: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Ages / Divisions</Label>
                   <Input value={editLeagueForm.ages} onChange={e => setEditLeagueForm({...editLeagueForm, ages: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="e.g. U14 - U18" />
                 </div>
                 <div className="space-y-2 col-span-2 md:col-span-1">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Season Cost</Label>
                   <Input value={editLeagueForm.registrationCost} onChange={e => setEditLeagueForm({...editLeagueForm, registrationCost: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="$500/Team" />
                 </div>
               </div>
               <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Offline Payment Instructions</Label>
                 <Textarea value={editLeagueForm.paymentInstructions} onChange={e => setEditLeagueForm({...editLeagueForm, paymentInstructions: e.target.value})} className="rounded-2xl border-2 font-medium min-h-[80px]" placeholder="E-transfer to accounts@league.com with your team name..." />
                 <p className="text-[10px] text-muted-foreground ml-1 font-bold">These instructions will be shown during registration. Online payments coming soon.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Contact Email</Label>
                   <Input type="email" value={editLeagueForm.contactEmail} onChange={e => setEditLeagueForm({...editLeagueForm, contactEmail: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="hq@league.com" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Contact Phone</Label>
                   <Input type="tel" value={editLeagueForm.contactPhone} onChange={e => setEditLeagueForm({...editLeagueForm, contactPhone: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="(555) 123-4567" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-sky-600">Twitter (X) Link</Label>
                   <Input type="url" value={editLeagueForm.twitter} onChange={e => setEditLeagueForm({...editLeagueForm, twitter: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="https://x.com/yourleague" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-pink-600">Instagram Link</Label>
                   <Input type="url" value={editLeagueForm.instagram} onChange={e => setEditLeagueForm({...editLeagueForm, instagram: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="https://instagram.com/yourleague" />
                 </div>
               </div>
            </div>
            <DialogFooter className="pt-6">
              <Button disabled={isProcessing} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleSaveLeague}>
                {isProcessing ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Commit League Profile'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {activeLeague && <SeasonSchedulerDialog league={activeLeague} isOpen={isSeasonOpen} onOpenChange={setIsSeasonOpen} />}
      {activeLeague && <ManualGameDialog league={activeLeague} isOpen={isManualGameOpen} onOpenChange={setIsManualGameOpen} />}
    </div>
  );
}
