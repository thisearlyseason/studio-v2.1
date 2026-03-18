"use client";

import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft, 
  Mail, 
  Search, 
  Clock, 
  CheckCircle2, 
  Zap, 
  Lock,
  Loader2,
  Table as TableIcon,
  MessageSquare,
  Users,
  Settings,
  Globe,
  Info,
  ClipboardList,
  ArrowUpRight,
  TrendingUp,
  Activity,
  BarChart2,
  CalendarDays,
  Sparkles,
  MapPin,
  ExternalLink,
  ChevronDown,
  Building,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  X,
  ChevronRight,
  Hash,
  Copy,
  Link as LinkIcon,
  Trash2,
  DollarSign,
  CreditCard,
  History,
  AlertCircle,
  Phone,
  Map,
  Edit3,
  ShieldCheck,
  PenTool
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { generateLeagueSchedule } from '@/lib/scheduler-utils';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { useTeam, League, TournamentGame, Member, Facility, Field, TeamDocument, LeagueInvite } from '@/components/providers/team-provider';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

function SeasonSchedulerDialog({ league, isOpen, onOpenChange }: { league: League, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { user: authUser } = useUser();
  const { db, updateLeagueSchedule } = useTeam();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [config, setConfig] = useState({
    startDate: '',
    endDate: '',
    startTime: '18:00',
    endTime: '22:00',
    gameLength: '60',
    breakLength: '15',
    playDays: [1, 3] as number[],
    gamesPerTeam: '10',
    doubleHeaders: false,
    selectedVenues: [] as string[],
    selectedFields: [] as string[],
    blackoutDates: [] as Date[]
  });

  const facilitiesQuery = useMemoFirebase(() => {
    if (!db || !authUser?.uid) return null;
    return query(collection(db, 'facilities'), where('clubId', '==', authUser.uid));
  }, [db, authUser?.uid]);

  const { data: facilities } = useCollection<Facility>(facilitiesQuery);

  const handleGenerate = async () => {
    if (!config.startDate || !config.selectedFields.length || !Object.keys(league.teams || {}).length) {
      toast({ title: "Configuration Required", description: "Set dates, teams and fields.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const schedule = generateLeagueSchedule({
        teams: Object.keys(league.teams),
        fields: config.selectedFields,
        startDate: config.startDate,
        endDate: config.endDate || undefined,
        startTime: config.startTime,
        endTime: config.endTime,
        gameLength: parseInt(config.gameLength),
        breakLength: parseInt(config.breakLength),
        playDays: config.playDays,
        gamesPerTeam: parseInt(config.gamesPerTeam),
        doubleHeaders: config.doubleHeaders,
        blackoutDates: config.blackoutDates.map(d => d.toISOString())
      });
      await updateLeagueSchedule(league.id, schedule);
      onOpenChange(false);
      toast({ title: "Season Deployed", description: `${schedule.length} matches distributed.` });
    } catch (e) {
      toast({ title: "Generation Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVenue = (vid: string) => {
    setConfig(p => ({
      ...p,
      selectedVenues: p.selectedVenues.includes(vid) ? p.selectedVenues.filter(v => v !== vid) : [...p.selectedVenues, vid]
    }));
  };

  const toggleDay = (dayId: number) => {
    setConfig(p => ({
      ...p,
      playDays: p.playDays.includes(dayId) ? p.playDays.filter(d => d !== dayId) : [...p.playDays, dayId]
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
        <DialogTitle className="sr-only">Season Architect Protocol</DialogTitle>
        <DialogDescription className="sr-only">Configure multi-day league schedule distribution</DialogDescription>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Season Architect</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-2">Institutional Scheduling Engine</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7 space-y-10">
              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Parameters</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Season Start</Label><Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} className="h-12 border-2 rounded-xl text-foreground" /></div>
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Season End</Label><Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} className="h-12 border-2 rounded-xl text-foreground" /></div>
                </div>
                
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Schedule Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleDay(day.id)}
                        className={cn(
                          "h-10 px-4 rounded-xl font-black text-[10px] uppercase transition-all border-2",
                          config.playDays.includes(day.id) ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "bg-white border-muted-foreground/10 text-muted-foreground hover:border-primary/20"
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Games/Team</Label><Input type="number" value={config.gamesPerTeam} onChange={e => setConfig({...config, gamesPerTeam: e.target.value})} className="h-12 border-2 rounded-xl text-foreground" /></div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Double Headers</Label>
                    <div className="flex items-center gap-3 h-12">
                      <button type="button" onClick={() => setConfig({...config, doubleHeaders: !config.doubleHeaders})} className={cn("h-7 w-12 rounded-full transition-all relative", config.doubleHeaders ? "bg-primary" : "bg-muted")}>
                        <div className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all", config.doubleHeaders ? "left-6" : "left-1")} />
                      </button>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Alt Home/Away</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Resource Allocation</h3>
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Select Active Venues</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {facilities?.map(f => (
                      <div key={f.id} className={cn("p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between", config.selectedVenues.includes(f.id) ? "border-primary bg-primary/5 shadow-sm" : "border-muted/50 hover:border-muted")} onClick={() => toggleVenue(f.id)}>
                        <div className="flex items-center gap-3">
                          <Building className={cn("h-4 w-4", config.selectedVenues.includes(f.id) ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-xs font-black uppercase text-foreground">{f.name}</span>
                        </div>
                        {config.selectedVenues.includes(f.id) && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <aside className="lg:col-span-5 space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Blackout Dates</h3>
              <div className="bg-white border-2 rounded-[2rem] p-4 shadow-inner flex flex-col items-center text-foreground">
                <Calendar 
                  mode="multiple"
                  selected={config.blackoutDates}
                  onSelect={(dates) => setConfig({...config, blackoutDates: dates || []})}
                  className="rounded-xl border-none"
                />
              </div>
            </aside>
          </div>

          <DialogFooter className="pt-10">
            <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" onClick={handleGenerate} disabled={isProcessing || !config.startDate}>
              {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6 mr-3" />}
              Deploy Seasonal Pipeline
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeagueOverview({ league, schedule }: { league: League, schedule: TournamentGame[] }) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const gamesOnSelectedDate = useMemo(() => {
    return (schedule || []).filter(g => format(new Date(g.date), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'));
  }, [schedule, selectedDate]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight text-foreground">League Command Overview</h3>
        </div>
        <div className="bg-muted/50 p-1 rounded-xl border flex items-center shadow-inner">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase"><List className="h-3.5 w-3.5 mr-2" /> List</Button>
          <Button variant={viewMode === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('calendar')} className="h-8 px-4 rounded-lg font-black text-[10px] uppercase"><CalendarDaysIcon className="h-3.5 w-3.5 mr-2" /> Calendar</Button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                  <tr>
                    <th className="px-8 py-5">Date/Time</th>
                    <th className="px-4 py-5">Matchup</th>
                    <th className="px-4 py-5">Venue</th>
                    <th className="px-8 py-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(schedule || []).map(game => (
                    <tr key={game.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-8 py-6">
                        <p className="font-black text-xs uppercase text-foreground">{game.date}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{game.time}</p>
                      </td>
                      <td className="px-4 py-6">
                        <div className="flex items-center gap-3 text-foreground">
                          <span className="font-black text-xs uppercase truncate max-w-[100px]">{game.team1}</span>
                          <span className="opacity-20 text-[10px] font-black">VS</span>
                          <span className="font-black text-xs uppercase truncate max-w-[100px]">{game.team2}</span>
                        </div>
                      </td>
                      <td className="px-4 py-6">
                        <p className="text-[10px] font-black uppercase text-primary flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {game.location || 'League Venue'}</p>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <Badge variant={game.isCompleted ? 'default' : 'outline'} className="font-black text-[8px] uppercase">{game.isCompleted ? 'Final' : 'Scheduled'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <Card className="lg:col-span-5 rounded-[2.5rem] border-none shadow-xl bg-white p-6 flex flex-col items-center text-foreground">
            <Calendar 
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="rounded-xl"
            />
          </Card>
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{format(selectedDate, 'EEEE, MMMM do')}</h4>
              <Badge className="bg-primary text-white h-5 text-[8px] uppercase px-2"> {gamesOnSelectedDate.length} MATCHES </Badge>
            </div>
            <div className="space-y-3">
              {gamesOnSelectedDate.map(game => (
                <Card key={game.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-5 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/5 flex flex-col items-center justify-center shrink-0 border border-primary/10">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="text-[8px] font-black text-primary uppercase">{game.time}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-sm uppercase truncate text-foreground">{game.team1} vs {game.team2}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 mt-1"><MapPin className="h-3 w-3" /> {game.location}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-20" />
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeagueFinances({ league }: { league: League }) {
  const { addLeaguePayment, updateLeagueGlobalFees } = useTeam();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isFeesOpen, setIsFeesOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', type: 'Registration', memo: '' });
  const [feesForm, setFeesForm] = useState({ registration: league.globalFees?.registration?.toString() || '0' });

  const handleAddPayment = async () => {
    if (!selectedTeamId || !paymentForm.amount) return;
    await addLeaguePayment(league.id, selectedTeamId, {
      amount: parseFloat(paymentForm.amount),
      type: paymentForm.type,
      memo: paymentForm.memo,
      date: new Date().toISOString()
    });
    setIsPaymentOpen(false);
    setPaymentForm({ amount: '', type: 'Registration', memo: '' });
  };

  const handleUpdateFees = async () => {
    await updateLeagueGlobalFees(league.id, { registration: parseFloat(feesForm.registration) });
    setIsFeesOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Institutional Finance</h3>
        </div>
        <Button onClick={() => setIsFeesOpen(true)} variant="outline" className="rounded-xl h-10 border-2 font-black uppercase text-[10px] text-foreground"><Settings className="h-4 w-4 mr-2" /> Fee Structure</Button>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
              <tr>
                <th className="px-8 py-5">Squad</th>
                <th className="px-4 py-5">Total Fees</th>
                <th className="px-4 py-5">Paid</th>
                <th className="px-4 py-5">Balance</th>
                <th className="px-4 py-5">Status</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Object.entries(league.teams).map(([id, team]) => {
                const fin = league.finances?.[id] || { totalOwed: league.globalFees?.registration || 0, totalPaid: 0, status: 'unpaid', payments: [] };
                const balance = fin.totalOwed - fin.totalPaid;
                
                return (
                  <tr key={id} className="hover:bg-muted/5 transition-colors">
                    <td className="px-8 py-6">
                      <p className="font-black text-sm uppercase text-foreground">{team.teamName}</p>
                    </td>
                    <td className="px-4 py-6 font-bold text-sm text-foreground">${fin.totalOwed.toLocaleString()}</td>
                    <td className="px-4 py-6 font-bold text-sm text-green-600">${fin.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-6 font-black text-sm text-primary">${balance.toLocaleString()}</td>
                    <td className="px-4 py-6">
                      <Badge className={cn(
                        "font-black text-[8px] uppercase border-none",
                        fin.status === 'paid' ? "bg-green-100 text-green-700" : fin.status === 'partial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                      )}>{fin.status}</Badge>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Button size="sm" variant="ghost" className="rounded-xl h-9 px-4 font-black uppercase text-[10px] border text-foreground" onClick={() => { setSelectedTeamId(id); setIsPaymentOpen(true); }}>Log Payment</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl p-8 bg-white text-foreground">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase">Log Squad Payment</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update institutional fiscal ledger</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Amount ($)</Label>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="h-12 text-lg font-black text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Fee Type</Label>
              <Input value={paymentForm.type} onChange={e => setPaymentForm({...paymentForm, type: e.target.value})} className="h-12 font-bold text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Memo / Details</Label>
              <Textarea value={paymentForm.memo} onChange={e => setPaymentForm({...paymentForm, memo: e.target.value})} className="h-20 text-foreground" />
            </div>
          </div>
          <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddPayment}>Post to Ledger</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFeesOpen} onOpenChange={setIsFeesOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl p-8 bg-white text-foreground">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase">League Fee Architect</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Configure global registration costs</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Base Registration Fee ($)</Label>
              <Input type="number" value={feesForm.registration} onChange={e => setFeesForm({...feesForm, registration: e.target.value})} className="h-12 text-lg font-black text-foreground" />
            </div>
          </div>
          <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateFees}>Synchronize Fees</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SquadDirectory({ league }: { league: League }) {
  const { updateLeagueTeamDetails } = useTeam();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ origin: '', coachName: '', coachEmail: '', coachPhone: '', organizerNotes: '' });

  const teams = Object.entries(league.teams).map(([id, data]) => ({ id, ...data }));

  const handleUpdate = async () => {
    if (!selectedTeamId) return;
    await updateLeagueTeamDetails(league.id, selectedTeamId, editForm);
    setIsEditOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 px-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Squad Directory</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map(team => (
          <Card key={team.id} className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden group transition-all hover:shadow-2xl">
            <CardHeader className="p-8 pb-4">
              <div className="flex justify-between items-start mb-4">
                <Avatar className="h-16 w-16 rounded-2xl border-2 border-background shadow-md">
                  <AvatarImage src={team.teamLogoUrl} />
                  <AvatarFallback className="font-black text-xl">{team.teamName[0]}</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => { setSelectedTeamId(team.id); setEditForm({ origin: team.origin || '', coachName: team.coachName || '', coachEmail: team.coachEmail || '', coachPhone: team.coachPhone || '', organizerNotes: team.organizerNotes || '' }); setIsEditOpen(true); }}><Edit3 className="h-5 w-5" /></Button>
              </div>
              <CardTitle className="text-2xl font-black uppercase tracking-tight text-foreground">{team.teamName}</CardTitle>
              <p className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2 mt-1"><MapPin className="h-3 w-3" /> {team.origin || 'Origin Undefined'}</p>
            </CardHeader>
            <CardContent className="p-8 pt-4 space-y-6">
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3 text-xs font-bold text-foreground"><Users className="h-4 w-4 text-muted-foreground" /> <span>Coach: {team.coachName || 'Unassigned'}</span></div>
                <div className="flex items-center gap-3 text-xs font-bold text-foreground"><Mail className="h-4 w-4 text-muted-foreground" /> <span className="truncate">{team.coachEmail || 'No Email'}</span></div>
                <div className="flex items-center gap-3 text-xs font-bold text-foreground"><Phone className="h-4 w-4 text-muted-foreground" /> <span>{team.coachPhone || 'No Phone'}</span></div>
              </div>
              {team.organizerNotes && (
                <div className="bg-primary/5 p-4 rounded-2xl border-2 border-dashed border-primary/20">
                  <p className="text-[10px] font-black uppercase text-primary mb-1">Organizer Notes</p>
                  <p className="text-[10px] font-medium italic text-muted-foreground leading-relaxed line-clamp-3">"{team.organizerNotes}"</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[3rem] p-8 max-w-2xl overflow-y-auto max-h-[90vh] bg-white text-foreground">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase">Squad Metadata</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update coach and location data</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Origin Location</Label><Input value={editForm.origin} onChange={e => setEditForm({...editForm, origin: e.target.value})} className="h-12 border-2 text-foreground" /></div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Coach Name</Label><Input value={editForm.coachName} onChange={e => setEditForm({...editForm, coachName: e.target.value})} className="h-12 border-2 text-foreground" /></div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Coach Email</Label><Input value={editForm.coachEmail} onChange={e => setEditForm({...editForm, coachEmail: e.target.value})} className="h-12 border-2 text-foreground" /></div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Coach Phone</Label><Input value={editForm.coachPhone} onChange={e => setEditForm({...editForm, coachPhone: e.target.value})} className="h-12 border-2 text-foreground" /></div>
            <div className="space-y-2 col-span-full"><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Organizer Notes</Label><Textarea value={editForm.organizerNotes} onChange={e => setEditForm({...editForm, organizerNotes: e.target.value})} className="h-32 border-2 text-foreground" /></div>
          </div>
          <DialogFooter><Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdate}>Synchronize Records</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LeaguesPage() {
  const { user: authUser, isAuthResolved } = useUser();
  const { 
    activeTeam, createLeague, inviteTeamToLeague, manuallyAddTeamToLeague, 
    isStaff, isPro, deleteLeagueInvite, purchasePro
  } = useTeam();
  const db = useFirestore();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTeamName, setInviteTeamName] = useState('');
  const [inviteMethod, setInviteMethod] = useState<'manual' | 'digital' | 'code' | 'portal'>('digital');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');

  const leaguesQuery = useMemoFirebase(() => (isAuthResolved && activeTeam?.id && db) ? query(collection(db, 'leagues'), where('memberTeamIds', 'array-contains', activeTeam.id)) : null, [isAuthResolved, activeTeam?.id, db]);
  const { data: rawLeagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const leagues = rawLeagues || [];
  const activeLeague = leagues[0] || null;

  const invitesQuery = useMemoFirebase(() => (db && activeLeague) ? query(collection(db, 'leagues', 'global', 'invites'), where('leagueId', '==', activeLeague.id), orderBy('createdAt', 'desc')) : null, [db, activeLeague]);
  const { data: invites } = useCollection<LeagueInvite>(invitesQuery);

  const sortedStandings = useMemo(() => {
    if (!activeLeague || !activeLeague.teams) return [];
    return Object.entries(activeLeague.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague]);

  const handleCreateLeague = async () => {
    if (!leagueName.trim()) return;
    setIsProcessing(true);
    try {
      await createLeague(leagueName);
      setIsCreateOpen(false); setLeagueName('');
      toast({ title: "League Established" });
    } finally { setIsProcessing(false); }
  };

  const copyToClipboard = (text: string, successMsg: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast({ title: successMsg });
      }).catch((err) => {
        console.warn('Clipboard access denied:', err);
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          toast({ title: successMsg });
        } catch (copyErr) {
          console.error('Fallback copy failed:', copyErr);
        }
        document.body.removeChild(textArea);
      });
    }
  };

  const handleRecruitmentAction = async () => {
    if (!activeLeague) return;
    setIsProcessing(true);
    try {
      if (inviteMethod === 'manual') {
        if (!inviteTeamName.trim()) throw new Error("Team name required");
        await manuallyAddTeamToLeague(activeLeague.id, inviteTeamName, inviteEmail);
        toast({ title: "Squad Enrolled", description: `${inviteTeamName} added to standings.` });
      } else if (inviteMethod === 'digital') {
        if (!inviteEmail.trim()) throw new Error("Email required");
        await inviteTeamToLeague(activeLeague.id, activeLeague.name, inviteEmail.toLowerCase(), inviteTeamName);
        toast({ title: "Invite Dispatched", description: `Invitation sent to ${inviteEmail}.` });
      }
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteTeamName('');
    } catch (e: any) {
      toast({ title: "Action Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLeaguesLoading) return (
    <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-700">
      <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl mb-6">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
      <div className="space-y-2">
        <p className="text-xl font-black uppercase tracking-tight text-foreground">Syncing Standings Hub</p>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Institutional Data Verification</p>
      </div>
    </div>
  );

  const isOrganizer = activeLeague?.creatorId === authUser?.uid;

  return (
    <div className="space-y-10 pb-20 text-foreground">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1"><Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Competitive Ledger</Badge><h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none text-foreground">Leagues</h1></div>
        {!activeLeague && isStaff && (
          <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl hover:bg-primary hover:text-white transition-all" onClick={() => setIsCreateOpen(true)}><Plus className="h-5 w-5 mr-2" /> Start New League</Button>
        )}
      </div>

      {activeLeague ? (
        <div className="space-y-8 animate-in fade-in duration-700">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-black text-white relative group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700"><ShieldCheck className="h-48 w-48" /></div>
            <CardContent className="p-10 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                  <div className="bg-primary p-5 rounded-[1.5rem] shadow-xl shadow-primary/20"><Trophy className="h-10 w-10 text-white" /></div>
                  <div>
                    <div className="flex items-center gap-2 mb-2"><Badge className="bg-primary text-white border-none h-5 text-[8px] uppercase font-black px-3">Premier Hub</Badge></div>
                    <h2 className="text-4xl font-black tracking-tight leading-none uppercase">{activeLeague.name}</h2>
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-2">{activeLeague.sport || 'Multi-Sport'} • {Object.keys(activeLeague.teams || {}).length} Squads Enrolled</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {isStaff && isOrganizer && (
                    <>
                      <Button 
                        onClick={() => isPro ? setIsSeasonOpen(true) : purchasePro()} 
                        className={cn(
                          "h-12 px-8 rounded-xl font-black text-xs uppercase transition-all flex items-center border-2",
                          isPro ? "bg-white text-black border-black hover:bg-primary hover:text-white hover:border-primary" : "bg-white/50 text-muted-foreground/50 border-muted"
                        )}
                      >
                        {!isPro && <Lock className="h-3 w-3 mr-2 text-red-600" />}
                        <CalendarDays className="h-4 w-4 mr-2" /> Season Architect
                      </Button>
                      
                      <Button 
                        onClick={() => isPro ? router.push(`/leagues/registration/${activeLeague.id}`) : purchasePro()}
                        className={cn(
                          "h-12 px-8 rounded-xl font-black text-xs uppercase transition-all flex items-center border-2",
                          isPro ? "bg-white text-black border-black hover:bg-primary hover:text-white hover:border-primary" : "bg-white/50 text-muted-foreground/50 border-muted"
                        )}
                      >
                        {!isPro && <Lock className="h-3 w-3 mr-2 text-red-600" />}
                        <ClipboardList className="h-4 w-4 mr-2" /> 
                        <span>Registration Hub</span>
                      </Button>

                      <Button 
                        className="h-12 px-8 rounded-xl font-black text-xs uppercase bg-white text-black border-2 border-black shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all" 
                        onClick={() => setIsInviteOpen(true)}
                      >
                        <UserPlus className="h-4 w-4 mr-2" /> Recruit Teams
                      </Button>
                    </>
                  )}
                  <Button asChild variant="ghost" className="h-12 px-6 rounded-xl font-black text-xs uppercase text-white/60 hover:text-white"><Link href={`/leagues/spectator/${activeLeague.id}`} target="_blank"><ExternalLink className="h-4 w-4 mr-2" /> Public Portal</Link></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex w-full md:w-auto overflow-x-auto">
            <Button variant={activeTab === 'standings' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('standings')}>Standings</Button>
            {isOrganizer && (
              <>
                <Button variant={activeTab === 'command' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('command')}>Schedule Hub</Button>
                <Button variant={activeTab === 'finances' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('finances')}>Fiscal Ledger</Button>
                <Button variant={activeTab === 'directory' ? 'default' : 'ghost'} className="rounded-xl flex-1 md:flex-none font-black text-[10px] uppercase px-8" onClick={() => setActiveTab('directory')}>Squad Directory</Button>
              </>
            )}
          </div>

          <Tabs value={activeTab} className="mt-0">
            <TabsContent value="standings" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between px-2"><div className="flex items-center gap-2"><TableIcon className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">League Standings</h3></div></div>
                  <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-8 py-5">Squad</th><th className="px-4 py-5 text-center">W</th><th className="px-4 py-5 text-center">L</th><th className="px-4 py-5 text-center">T</th><th className="px-8 py-5 text-right text-primary">PTS</th></tr></thead>
                          <tbody className="divide-y">{sortedStandings.map((team, idx) => (<tr key={team.id} className={cn("hover:bg-primary/5 transition-colors group", team.id === activeTeam?.id && "bg-primary/5")}><td className="px-8 py-6"><div className="flex items-center gap-4"><span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span><div className="flex items-center gap-3"><Avatar className="h-10 w-10 rounded-xl border shadow-inner shrink-0"><AvatarImage src={team.teamLogoUrl} className="object-cover" /><AvatarFallback className="font-black text-xs text-foreground">{team.teamName?.[0] || 'T'}</AvatarFallback></Avatar><div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="font-black text-sm uppercase tracking-tight group-hover:text-primary transition-colors truncate text-foreground">{team.teamName}</span></div></div></div></div></td><td className="px-4 py-6 text-center font-bold text-sm text-foreground">{team.wins}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td><td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td><td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td></tr>))}</tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <aside className="space-y-6">
                  <div className="flex items-center gap-2 px-2"><CalendarDays className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">My Squad Itinerary</h3></div>
                  <div className="space-y-3">
                    {(activeLeague.schedule || []).filter(g => !g.isCompleted && (g.team1 === activeTeam?.name || g.team2 === activeTeam?.name)).slice(0, 5).map((game) => (
                      <Card key={game.id} className="rounded-2xl border-none shadow-md ring-1 ring-black/5 p-4 bg-white group">
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-center"><span className="text-[10px] font-black text-primary uppercase tracking-widest">{game.time}</span><span className="text-[10px] font-bold text-muted-foreground">{game.date}</span></div>
                          <div className="flex items-center justify-center gap-4 text-foreground"><span className="font-black text-xs uppercase truncate max-w-[80px]">{game.team1}</span><span className="opacity-20 text-[10px] font-black">VS</span><span className="font-black text-xs uppercase truncate max-w-[80px] text-right">{game.team2}</span></div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </aside>
              </div>
            </TabsContent>
            
            <TabsContent value="command" className="mt-0">
              <LeagueOverview league={activeLeague} schedule={activeLeague.schedule || []} />
            </TabsContent>

            <TabsContent value="finances" className="mt-0">
              <LeagueFinances league={activeLeague} />
            </TabsContent>

            <TabsContent value="directory" className="mt-0">
              <SquadDirectory league={activeLeague} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-24 bg-muted/10 border-2 border-dashed rounded-[3rem] space-y-6"><div className="bg-white w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl relative"><Shield className="h-10 w-10 text-primary opacity-20" /><Trophy className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-bounce" /></div><div className="space-y-2"><h3 className="text-2xl font-black uppercase tracking-tight text-foreground">Competitive Desert</h3><p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto">Your squad hasn't joined a league yet. Start your own or accept a challenge to enter the standings.</p></div></div>
      )}

      {/* CREATE LEAGUE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-0 overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">League Architect Protocol</DialogTitle>
          <DialogDescription className="sr-only">Initialize a new competitive league hub</DialogDescription>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">League Architect</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Initialize Competitive Infrastructure</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">League Name</Label>
                <Input placeholder="e.g. State Varsity Premier" value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-14 rounded-2xl border-2 font-black text-lg focus:border-primary/20 transition-all shadow-inner text-foreground" />
              </div>
              <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 flex items-start gap-4">
                <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                  As the architect, you will control schedules, standings, and institutional recruitment for every enrolled squad.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-0.98 transition-all border-none" onClick={handleCreateLeague} disabled={isProcessing || !leagueName.trim()}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Competitive Hub"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* RECRUITMENT DIALOG */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-2xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Recruitment Pipeline Protocol</DialogTitle>
          <DialogDescription className="sr-only">Enroll participating teams via multiple channels</DialogDescription>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Recruit Teams</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Multi-Channel Enrollment Suite</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Enrollment Protocol</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'digital', label: 'Email Invite', icon: Mail },
                      { id: 'manual', label: 'Manual Entry', icon: Edit3 },
                      { id: 'code', label: 'Invite Code', icon: Hash },
                      { id: 'portal', label: 'Public Portal', icon: Globe }
                    ].map(method => (
                      <button 
                        key={method.id} 
                        onClick={() => setInviteMethod(method.id as any)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-xl border-2 transition-all font-black text-[10px] uppercase",
                          inviteMethod === method.id ? "bg-primary border-primary text-white shadow-lg" : "bg-muted/30 border-transparent text-muted-foreground hover:border-primary hover:text-white hover:border-primary"
                        )}
                      >
                        <method.icon className="h-4 w-4" />
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6 animate-in slide-in-from-right-4">
                {inviteMethod === 'digital' && (
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Coach Email</Label><Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="coach@example.com" className="h-12 border-2 text-foreground" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Squad Name (Optional)</Label><Input value={inviteTeamName} onChange={e => setInviteTeamName(e.target.value)} placeholder="e.g. Metro Elite" className="h-12 border-2 text-foreground" /></div>
                    <Button className="w-full h-14 rounded-xl font-black uppercase text-xs shadow-lg hover:bg-primary hover:text-white transition-all border-none" onClick={handleRecruitmentAction} disabled={isProcessing || !inviteEmail.trim()}>{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dispatch Digital Invite"}</Button>
                  </div>
                )}
                {inviteMethod === 'manual' && (
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Squad Name</Label><Input value={inviteTeamName} onChange={e => setInviteTeamName(e.target.value)} placeholder="e.g. City Tigers" className="h-12 border-2 text-foreground" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase text-foreground">Coach Contact (Opt)</Label><Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="coach@email.com" className="h-12 border-2 text-foreground" /></div>
                    <Button className="w-full h-14 rounded-xl font-black uppercase text-xs shadow-lg hover:bg-primary hover:text-white transition-all border-none" onClick={handleRecruitmentAction} disabled={isProcessing || !inviteTeamName.trim()}>{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize Manual Entry"}</Button>
                  </div>
                )}
                {inviteMethod === 'code' && (
                  <div className="space-y-6 text-center py-4">
                    <div className="p-8 bg-muted/20 rounded-[2.5rem] border-2 border-dashed border-muted-foreground/20 group cursor-pointer active:scale-95 transition-all" onClick={() => copyToClipboard(activeLeague?.inviteCode || '', "Invite Code Copied")}>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Tactical Join Code</p>
                      <div className="flex items-center justify-center gap-4">
                        <span className="text-5xl font-black tracking-widest text-primary">{activeLeague?.inviteCode}</span>
                        <Copy className="h-6 w-6 text-muted-foreground opacity-20" />
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase italic leading-relaxed">Share this code with team organizers for direct standings enrollment.</p>
                  </div>
                )}
                {inviteMethod === 'portal' && (
                  <div className="space-y-6 text-center py-4">
                    <div className="p-8 bg-muted/20 rounded-[2.5rem] border-2 border-dashed border-muted-foreground/20 group cursor-pointer active:scale-95 transition-all" onClick={() => copyToClipboard(`${window.location.origin}/register/league/${activeLeague?.id}`, "Portal Link Copied")}>
                      <Globe className="h-10 w-10 text-primary mx-auto mb-4 opacity-40" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Public Portal Access</p>
                      <div className="flex items-center justify-center gap-3 bg-white p-3 rounded-xl shadow-sm border truncate">
                        <span className="text-[10px] font-bold truncate text-foreground">/register/league/{activeLeague?.id}</span>
                        <LinkIcon className="h-4 w-4 text-primary shrink-0" />
                      </div>
                    </div>
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[10px] border-2 hover:bg-primary hover:text-white hover:border-primary transition-all text-foreground" onClick={() => copyToClipboard(`${window.location.origin}/register/league/${activeLeague?.id}`, "Portal Link Copied")}>Copy Recruitment URL</Button>
                  </div>
                )}
              </div>
            </div>

            {invites && invites.length > 0 && (
              <div className="pt-10 border-t space-y-6">
                <div className="flex items-center gap-3">
                  <History className="h-5 w-5 text-primary" />
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Pending Diplomatic Status</h4>
                </div>
                <div className="space-y-3">
                  {invites.map(inv => (
                    <div key={inv.id} className="p-4 bg-muted/20 rounded-2xl border flex items-center justify-between group transition-all hover:bg-white hover:shadow-sm">
                      <div className="min-w-0">
                        <p className="font-black text-sm uppercase truncate tracking-tight text-foreground">{inv.teamName || inv.invitedEmail}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">{inv.invitedEmail}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={cn(
                          "font-black text-[8px] uppercase border-none",
                          inv.status === 'accepted' ? "bg-green-100 text-green-700" : inv.status === 'declined' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                        )}>{inv.status}</Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteLeagueInvite(inv.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SeasonSchedulerDialog league={activeLeague!} isOpen={isSeasonOpen} onOpenChange={setIsSeasonOpen} />
    </div>
  );
}
