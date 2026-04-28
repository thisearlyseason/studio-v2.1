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
  Lock as LockIcon,
  AlertCircle,
  FileText,
  Copy,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, updateDoc, limit, or } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { generateIntelligentLeagueSchedule } from '@/lib/intelligent-scheduler';
import { addSquadBranding, addSquadFooter } from '@/lib/pdf-utils';
import { Calendar } from '@/components/ui/calendar';
import { format, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { jsPDF } from 'jspdf';
import { useTeam, League, TournamentGame, Field, Facility, LeagueArchiveWaiver } from '@/components/providers/team-provider';
import { Select, SelectContent, SelectItem,  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SquadIdentity } from '@/components/SquadIdentity';

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
  const { db, updateLeagueSchedule, hasFeature, isSchoolMode } = useTeam();
  const leagueLabel = isSchoolMode ? 'Program' : 'League';
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
    blackoutDates: [] as Date[],
    blackoutDaysOfWeek: league.blackoutDaysOfWeek || [] as number[]
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
      .map(([id, t]) => ({ id, name: t.teamName, logoUrl: t.teamLogoUrl }));
  }, [league?.teams]);

  const totalRegisteredTeams = useMemo(() => {
    if (!league?.teams) return 0;
    return Object.keys(league.teams).length;
  }, [league?.teams]);

  const pendingTeamsCount = useMemo(() => {
    if (!league?.teams) return 0;
    return Object.values(league.teams).filter(t => t.status === 'pending').length;
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

    if (league.requiredSquads && leagueTeams.length < league.requiredSquads) {
      const confirmProceed = window.confirm(`${leagueLabel} requires ${league.requiredSquads} squads, but only ${leagueTeams.length} are enrolled. The generated schedule will be incomplete. Proceed anyway?`);
      if (!confirmProceed) return;
    }
    setIsProcessing(true);
    try {
      const { games: schedule, report } = generateIntelligentLeagueSchedule({
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
        blackoutDates: config.blackoutDates.map(d => d.toISOString()),
        blackoutDaysOfWeek: config.blackoutDaysOfWeek
      });
      
      if (report.warnings.length > 0) {
        toast({ title: 'Schedule Warnings', description: report.warnings[0] });
      }
      
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

  const toggleSkipDay = (dayId: number) => {
    setConfig(p => ({
      ...p,
      blackoutDaysOfWeek: p.blackoutDaysOfWeek.includes(dayId) ? p.blackoutDaysOfWeek.filter(d => d !== dayId) : [...p.blackoutDaysOfWeek, dayId],
      // Ensure it's not also in playDays
      playDays: p.playDays.filter(d => d !== dayId)
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
      <DialogContent hideClose className="max-w-[98vw] lg:max-w-[1600px] rounded-[3rem] p-0 border border-white/10 shadow-2xl overflow-hidden bg-[#050505] text-white h-[95vh] flex flex-col">
        <DialogTitle className="sr-only">Season Architect</DialogTitle>
        <DialogClose className="absolute right-6 top-6 z-50 h-10 w-10 rounded-full border border-white/20 bg-white/5 hover:bg-white/15 transition-all flex items-center justify-center backdrop-blur-sm">
          <X className="h-5 w-5 text-white" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-primary w-full shrink-0" />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Left Navigation Matrix */}
          <div className="w-[320px] bg-[#0a0a0a] border-r border-white/5 p-10 flex flex-col hidden lg:flex relative">
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
            <div className="relative z-10 flex items-center gap-4 mb-20">
              <div className="border border-white/20 p-3 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white"><Settings className="h-5 w-5" /></div>
              <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Season<br/>Architect</h2>
              </div>
            </div>
            
            <div className="relative z-10 space-y-8 flex-1">
              <div className="relative pl-8 transition-all duration-300 cursor-pointer opacity-100">
                <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Configuration</h4>
                <h3 className="text-sm font-black uppercase tracking-tight mb-1">Timeline & Matrix</h3>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Deployment Parameters</p>
              </div>
            </div>
            
            <div className="mt-auto border-t border-white/10 pt-8 relative z-10">
               <div className="flex items-center gap-2 text-emerald-500 font-black text-[9px] uppercase tracking-[0.2em]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Studio Engine Online</div>
            </div>
          </div>

          {/* Right Content Execution Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="absolute top-10 right-10 opacity-5 pointer-events-none w-64 h-64"><CalendarDays className="w-full h-full" /></div>
            
            <ScrollArea className="flex-1 px-8 lg:px-16 pt-16 pb-32">
              <div className="max-w-6xl mx-auto space-y-12">
                <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                  <div>
                    <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Precision Engine</Badge>
                    <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">Season Architect</h3>
                    <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Precision {leagueLabel} Deployment Engine</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                    <div className="lg:col-span-7 space-y-12">
                      <section className="space-y-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Timeline & Availability</h3>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Season Start</Label>
                            <Input type="date" value={config.startDate} onChange={e => setConfig({...config, startDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-white px-6 shadow-inner" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Season End</Label>
                            <Input type="date" value={config.endDate} onChange={e => setConfig({...config, endDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-white px-6 shadow-inner" />
                          </div>
                        </div>
                        
                        <div className="space-y-4 pt-4">
                          <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Active Play Days</Label>
                          <div className="flex flex-wrap gap-3">
                            {DAYS_OF_WEEK.map(day => (
                              <button 
                                key={day.id} 
                                onClick={() => toggleDay(day.id)} 
                                disabled={config.blackoutDaysOfWeek.includes(day.id)}
                                className={cn(
                                  "h-12 px-6 rounded-xl font-black text-[10px] uppercase border transition-all", 
                                  config.playDays.includes(day.id) ? "bg-primary text-white border-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]" : "bg-white/5 text-white/60 border-white/10 hover:border-white/30",
                                  config.blackoutDaysOfWeek.includes(day.id) && "opacity-20 cursor-not-allowed border-dashed"
                                )}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Do Not Schedule Days (Recurring)</Label>
                            <Badge className="bg-primary/20 text-primary border border-primary/30 text-[8px] font-black uppercase py-0 px-2 h-5">Priority</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {DAYS_OF_WEEK.map(day => (
                              <button 
                                key={day.id} 
                                onClick={() => toggleSkipDay(day.id)} 
                                className={cn(
                                  "h-12 px-6 rounded-xl font-black text-[10px] uppercase border transition-all", 
                                  config.blackoutDaysOfWeek.includes(day.id) ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                                )}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </section>

                      <section className="space-y-6 pt-8 border-t border-white/10">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Execution Parameters</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Daily Start</Label>
                            <Input type="time" value={config.startTime} onChange={e => setConfig({...config, startTime: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-4 shadow-inner" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Daily End</Label>
                            <Input type="time" value={config.endTime} onChange={e => setConfig({...config, endTime: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-4 shadow-inner" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Break (Min)</Label>
                            <Input type="number" value={config.breakLength} onChange={e => setConfig({...config, breakLength: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-6 shadow-inner" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Match Length</Label>
                            <Input type="number" value={config.gameLength} onChange={e => setConfig({...config, gameLength: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-6 shadow-inner" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Games/Team</Label>
                            <Input type="number" value={config.gamesPerTeam} onChange={e => setConfig({...config, gamesPerTeam: e.target.value})} className="h-14 rounded-xl bg-white/15 border-primary/50 font-black text-primary px-6 shadow-[inset_0_2px_10px_rgba(var(--primary),0.1)]" />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-white/60 ml-1">Double Headers</Label>
                            <Select value={config.doubleHeaderOption} onValueChange={(v: any) => setConfig({...config, doubleHeaderOption: v})}>
                              <SelectTrigger className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white px-4 shadow-inner">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl bg-[#111] border-white/10 text-white">
                                <SelectItem value="none" className="font-bold focus:bg-white/10 focus:text-white">None</SelectItem>
                                <SelectItem value="sameTeam" className="font-bold focus:bg-white/10 focus:text-white">Same Opponent (Swap)</SelectItem>
                                <SelectItem value="differentTeams" className="font-bold focus:bg-white/10 focus:text-white">Different Opponents</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-6 pt-8 border-t border-white/10">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Venue Allocation</h3>
                        <ScrollArea className="h-64 border border-white/10 rounded-[2.5rem] bg-white/5 p-6 shadow-inner">
                          {facilities?.length ? facilities.map(f => (
                            <div key={f.id} className="space-y-4 mb-8 last:mb-0">
                              <div className="flex items-center gap-3 px-2">
                                <Building className="h-4 w-4 text-primary" />
                                <span className="text-xs font-black uppercase text-white">{f.name}</span>
                              </div>
                              <FacilityFieldLoader facilityId={f.id} selectedFields={config.selectedFields} onToggleField={toggleField} />
                            </div>
                          )) : (
                            <div className="py-12 text-center opacity-30 italic text-xs uppercase font-black text-white">No organization facilities found.</div>
                          )}
                        </ScrollArea>
                      </section>
                    </div>

                    <aside className="lg:col-span-5 space-y-8">
                      <div className="bg-white/5 border border-white/10 text-white rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
                        <CalendarDays className="absolute -right-4 -bottom-4 h-24 w-24 opacity-5 -rotate-12" />
                        <div className="relative z-10 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/20 p-2 rounded-xl border border-primary/30"><CalendarIcon className="h-4 w-4 text-primary" /></div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Blackout Calendar</p>
                          </div>
                          <p className="text-[10px] font-medium text-white/40 leading-relaxed italic">Select dates where no {leagueLabel.toLowerCase()} matches should be scheduled.</p>
                          <div className="bg-white rounded-2xl p-2 text-black flex justify-center shadow-2xl">
                            <Calendar 
                              mode="multiple" 
                              selected={config.blackoutDates} 
                              onSelect={(dates) => setConfig({...config, blackoutDates: dates || []})} 
                              className="mx-auto"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/20 space-y-4">
                        <div className="flex items-center gap-2 text-primary"><Info className="h-4 w-4" /><h4 className="text-[10px] font-black uppercase tracking-widest">Enrollment Status</h4></div>
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-white/60 uppercase">{totalRegisteredTeams} squads detected in system.</p>
                          <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-wider">{leagueTeams.length} Enrolled</span>
                             </div>
                             {pendingTeamsCount > 0 && (
                               <div className="flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-wider">{pendingTeamsCount} Pending Approval</span>
                               </div>
                             )}
                          </div>

                          {leagueTeams.length < 2 && (
                            <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 flex items-start gap-3 mt-4">
                              <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[9px] font-black uppercase text-red-500 leading-tight">Deployment Blocked</p>
                                <p className="text-[10px] font-bold text-red-400 leading-tight mt-1">Minimum 2 accepted squads required to generate a season schedule. Review pending registrations to proceed.</p>
                              </div>
                            </div>
                          )}

                          {league.requiredSquads && leagueTeams.length >= 2 && leagueTeams.length < league.requiredSquads && (
                            <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 flex items-start gap-3 mt-4">
                              <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[9px] font-black uppercase text-amber-500 leading-tight">Incomplete Deployment Warning</p>
                                <p className="text-[10px] font-bold text-amber-400 leading-tight mt-1">{leagueLabel} target is {league.requiredSquads} squads. Proceeding with {leagueTeams.length} will result in an undersized season.</p>
                              </div>
                            </div>
                          )}
                          {league.requiredSquads && leagueTeams.length >= league.requiredSquads && (
                            <div className="bg-green-500/10 p-4 rounded-2xl border border-green-500/20 flex items-start gap-3">
                              <ShieldCheck className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-[9px] font-black uppercase text-green-500 leading-tight">Minimum Target Met</p>
                                <p className="text-[10px] font-bold text-green-400 leading-tight mt-1">Enrollment threshold ({league.requiredSquads}) satisfied for full deployment.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              </div>
            </ScrollArea>
            
            <div className="p-8 border-t border-white/10 bg-[#070707] flex justify-end items-center shrink-0">
              <Button 
                className="h-16 px-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-sm tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all flex items-center" 
                onClick={handleGenerate} 
                disabled={isProcessing || !hasFeature?.('league_generation')}
              >
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Sparkles className="h-6 w-6 mr-3" />}
                {!hasFeature?.('league_generation') ? 'Upgrade to Generate' : 'Deploy Seasonal Pipeline'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeagueOverview({ league, schedule, onOpenManualGame }: { league: League, schedule: TournamentGame[], onOpenManualGame?: () => void }) {
  const { isStaff, submitLeagueMatchScore, activeTeam } = useTeam();
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [scoreForm, setScoreForm] = useState({ s1: '', s2: '' });

  // Logo map: activeTeam is the authoritative source (live Firestore doc merge).
  // teamsRaw/teamMemberships docs do NOT contain teamLogoUrl — only activeTeamDoc does.
  // Layer: activeTeam first → league.teams overrides (for external enrolled teams).
  // Also index by teamName so logo lookup works when game.team1Id doesn't match.
  const teamLogoMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Primary: the current user's active team — always fresh from Firestore
    if (activeTeam?.id && activeTeam?.teamLogoUrl) {
      map[activeTeam.id] = activeTeam.teamLogoUrl;
    }
    // Secondary: logos stored in the league document itself (set at enrollment/propagation time)
    if (league?.teams) {
      Object.entries(league.teams).forEach(([id, t]) => {
        if ((t as any).teamLogoUrl) {
          map[id] = (t as any).teamLogoUrl;
          map[(t as any).teamName] = (t as any).teamLogoUrl;
        }
      });
    }
    return map;
  }, [league?.teams, activeTeam?.id, activeTeam?.teamLogoUrl]);

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
    addSquadBranding(doc, `${league.name} SCHEDULE`, "OFFICIAL COMPETITIVE FIXTURES LOG");
    
    doc.setTextColor(0, 0, 0); 
    doc.setFontSize(14); 
    doc.setFont("helvetica", "bold");
    doc.text(`Total Fixtures: ${schedule.length}`, 20, 70);
    
    doc.setFillColor(245, 245, 245); 
    doc.rect(20, 80, pageWidth - 40, 10, 'F');
    
    doc.setTextColor(100, 100, 100); 
    doc.setFontSize(8); 
    doc.text("DATE", 25, 86.5); 
    doc.text("MATCHUP", 60, 86.5); 
    doc.text("LOCATION", 140, 86.5); 
    doc.text("TIME", pageWidth - 25, 86.5, { align: 'right' });
    
    let y = 100; 
    doc.setTextColor(30, 30, 30); 
    doc.setFontSize(9);
    
    schedule.forEach(g => {
      if (y > 260) { 
        addSquadFooter(doc, undefined, league.name);
        doc.addPage(); 
        addSquadBranding(doc, `${league.name} SCHEDULE`, "OFFICIAL COMPETITIVE FIXTURES LOG");
        y = 70; 
      }
      doc.setFont("helvetica", "bold"); doc.text(format(new Date(g.date), 'MMMM d, yyyy'), 25, y);
      doc.text(`${g.team1.toUpperCase()} vs ${g.team2.toUpperCase()}`, 60, y);
      doc.setFont("helvetica", "normal"); doc.text(g.location || 'TBD', 140, y);
      doc.setFont("helvetica", "bold"); doc.text(g.time, pageWidth - 25, y, { align: 'right' });
      doc.setDrawColor(245, 245, 245); doc.line(25, y + 4, pageWidth - 25, y+4); y += 12;
    });
    
    addSquadFooter(doc, undefined, league.name);
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
            <Button variant="default" className="flex-1 sm:flex-none h-11 rounded-xl font-black uppercase text-[10px] shadow-lg shadow-primary/20 hover:scale-105 transition-all" onClick={onOpenManualGame}>
              <Plus className="h-4 w-4 mr-2" /> Generate Match
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
              {/* ── PREMIUM FIXTURE CARD GRID ── */}
              <div className="divide-y divide-muted/40">
                {filteredSchedule.map(game => {
                  const logo1 = teamLogoMap[game.team1Id || ''];
                  const logo2 = teamLogoMap[game.team2Id || ''];
                  return (
                    <div
                      key={game.id}
                      className="group px-6 py-5 flex items-center gap-4 hover:bg-muted/5 transition-colors"
                    >
                      {/* Date/Time */}
                      <div className="w-[100px] shrink-0 text-left">
                        <p className="font-black text-[11px] uppercase tracking-tight leading-none">{format(new Date(game.date), 'MMM d, yyyy')}</p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{game.time}</p>
                        {getDoubleHeaderLabel(game) && <Badge className="bg-primary/10 text-primary border-none text-[7px] h-4 font-black mt-1">DH</Badge>}
                      </div>

                      {/* Fixture face-off */}
                      <div className="flex-1 flex items-center justify-center gap-3">
                        {/* Home team */}
                        <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                          <p className="font-black text-sm uppercase truncate text-primary">{game.team1}</p>
                          {logo1 ? (
                            <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden border border-muted/20 shadow-md bg-white p-1">
                              <img src={logo1} alt={game.team1} className="w-full h-full object-contain" />
                            </div>
                          ) : null}
                        </div>

                        {/* Score / VS */}
                        <div className="shrink-0 w-20 flex items-center justify-center">
                          {game.isCompleted ? (
                            <div className={cn("px-3 py-1.5 rounded-lg border-2 text-center", game.isDisputed ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-black text-white border-black")}>
                              <span className="font-black text-sm tabular-nums">{game.score1} – {game.score2}</span>
                            </div>
                          ) : (
                            <span className="font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">VS</span>
                          )}
                        </div>

                        {/* Away team */}
                        <div className="flex-1 flex items-center justify-start gap-3 min-w-0">
                          {logo2 ? (
                            <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden border border-muted/20 shadow-md bg-white p-1">
                              <img src={logo2} alt={game.team2} className="w-full h-full object-contain" />
                            </div>
                          ) : null}
                          <p className="font-black text-sm uppercase truncate">{game.team2}</p>
                        </div>
                      </div>

                      {/* Location + Edit */}
                      <div className="w-[120px] shrink-0 text-right flex flex-col items-end gap-1.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase truncate">{game.location || 'TBD'}</p>
                        {isStaff && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100" onClick={() => { setEditingGame(game); setScoreForm({ s1: (game.score1 ?? 0).toString(), s2: (game.score2 ?? 0).toString() }); }}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredSchedule.length === 0 && (
                  <div className="px-8 py-12 text-center text-muted-foreground text-sm font-bold uppercase tracking-widest">
                    No matches found for current filters.
                  </div>
                )}
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
                {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}` : format(dateRange.from, 'MMMM d, yyyy')) : 'Select Date Range'}
              </h4>
              <Badge variant="outline" className="font-black text-[10px]">{filteredSchedule.length} MATCHES</Badge>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {filteredSchedule.map(game => {
                const logo1 = teamLogoMap[game.team1Id || ''];
                const logo2 = teamLogoMap[game.team2Id || ''];
                return (
                  <Card
                    key={game.id}
                    className="rounded-[2rem] border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5 hover:shadow-xl hover:ring-primary/20 transition-all cursor-pointer group"
                    onClick={() => isStaff && setEditingGame(game)}
                  >
                    {/* Meta strip */}
                    <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-muted/30">
                      <p className="font-black text-[10px] uppercase tracking-widest text-muted-foreground">{format(new Date(game.date), 'MMM d, yyyy')} · {game.time}</p>
                      <p className="font-bold text-[10px] uppercase text-muted-foreground truncate max-w-[120px]">{game.location || 'Venue TBD'}</p>
                    </div>

                    {/* Face-off */}
                    <div className="flex items-stretch">
                      {/* Home */}
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 px-4">
                        {logo1 ? (
                          <div className="h-20 w-20 rounded-2xl overflow-hidden border border-muted/20 shadow-lg bg-white p-1.5">
                            <img src={logo1} alt={game.team1} className="w-full h-full object-contain" />
                          </div>
                        ) : null}
                        <p className="font-black text-xs uppercase tracking-tight text-center text-primary leading-tight max-w-[100px]">{game.team1}</p>
                      </div>

                      {/* VS / Score */}
                      <div className="flex flex-col items-center justify-center px-4 py-4 shrink-0">
                        {game.isCompleted ? (
                          <div className={cn("px-4 py-2 rounded-xl border-2 text-center", game.isDisputed ? "bg-red-50 border-red-200 text-red-600 animate-pulse" : "bg-black text-white border-black")}>
                            <span className="font-black text-xl tabular-nums">{game.score1} – {game.score2}</span>
                            {game.isDisputed && <p className="text-[7px] font-black uppercase mt-0.5 opacity-70">Disputed</p>}
                          </div>
                        ) : (
                          <span className="font-black text-[10px] uppercase tracking-[0.25em] text-muted-foreground/40">VS</span>
                        )}
                        {getDoubleHeaderLabel(game) && (
                          <Badge className="bg-primary/10 text-primary border-none text-[7px] h-4 font-black mt-2">DH</Badge>
                        )}
                      </div>

                      {/* Away */}
                      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6 px-4">
                        {logo2 ? (
                          <div className="h-20 w-20 rounded-2xl overflow-hidden border border-muted/20 shadow-lg bg-white p-1.5">
                            <img src={logo2} alt={game.team2} className="w-full h-full object-contain" />
                          </div>
                        ) : null}
                        <p className="font-black text-xs uppercase tracking-tight text-center leading-tight max-w-[100px]">{game.team2}</p>
                      </div>
                    </div>

                    {/* Footer */}
                    {game.isCompleted && (
                      <div className="px-6 py-3 border-t border-muted/30 flex items-center justify-between">
                        <span className="text-[8px] font-black uppercase text-muted-foreground/40">{game.reportedBy ? `Reported by ${game.reportedBy}` : 'Completed'}</span>
                        <Badge className="bg-black text-white border-none text-[8px] h-5 font-black">FINAL</Badge>
                      </div>
                    )}
                  </Card>
                );
              })}
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
        <DialogContent hideClose className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-8">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/5 p-3 rounded-xl text-primary"><Activity className="h-5 w-5" /></div>
                <DialogTitle className="text-2xl font-black uppercase">Result Verification</DialogTitle>
              </div>
              <DialogDescription className="font-bold text-[10px] uppercase text-primary mt-1">
                {editingGame?.team1} vs {editingGame?.team2}
                {editingGame?.isDisputed && (
                  <div className="mt-4 p-4 rounded-xl bg-red-50 border-2 border-red-100 text-red-600">
                    <p className="text-[8px] font-black uppercase flex items-center gap-2 mb-1"><AlertCircle className="h-3 w-3" /> Reported Issue:</p>
                    <p className="text-xs font-medium italic lowercase leading-tight">{editingGame.disputeNotes || "Unofficial score entry disputed by squad representative."}</p>
                    {editingGame.reportedBy && <p className="text-[7px] font-black uppercase opacity-60 mt-3 pt-3 border-t border-red-100">Originally Posted By: {editingGame.reportedBy}</p>}
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase opacity-60 ml-1">Home Score</Label>
                <Input type="number" value={scoreForm.s1} onChange={e => setScoreForm({...scoreForm, s1: e.target.value})} className="h-20 text-center text-4xl font-black rounded-[1.5rem] border-2 focus:ring-primary focus:border-primary transition-all" placeholder="0" />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase opacity-60 ml-1">Guest Score</Label>
                <Input type="number" value={scoreForm.s2} onChange={e => setScoreForm({...scoreForm, s2: e.target.value})} className="h-20 text-center text-4xl font-black rounded-[1.5rem] border-2 focus:ring-primary focus:border-primary transition-all" placeholder="0" />
              </div>
            </div>
            <div className="flex gap-4">
              <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-xs" onClick={() => setEditingGame(null)}>Cancel</Button>
              <Button className="flex-[2] h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={handleUpdateScore}>Commit Result</Button>
            </div>
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
      .map(([id, t]) => ({ 
        id, 
        name: t.teamName, 
        status: t.status as string
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
      <DialogContent hideClose className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden bg-white text-foreground shadow-2xl border-none">
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
                  <SelectContent className="rounded-xl bg-white border-2 border-muted shadow-2xl z-[100]">
                    {leagueTeams.length === 0 ? (
                      <div className="p-4 text-[10px] font-bold uppercase text-muted-foreground text-center">No squads found</div>
                    ) : (
                      leagueTeams.map(t => (
                        <SelectItem key={t.id} value={t.id} className="font-bold uppercase text-[10px] py-3 border-b last:border-0 border-muted/30">
                          <div className="flex items-center justify-between w-full gap-8">
                            <span>{t.name}</span>
                            <span className={cn(
                              "text-[8px] px-2 py-0.5 rounded-full border",
                              t.status === 'accepted' || t.status === 'assigned' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            )}>
                              {t.status}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Guest Squad</Label>
                <Select value={form.team2Id} onValueChange={(v) => setForm({...form, team2Id: v})}>
                  <SelectTrigger className="h-12 border-2 rounded-xl font-bold bg-white text-foreground">
                    <SelectValue placeholder="Select Guest" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl bg-white border-2 border-muted shadow-2xl z-[100]">
                    {leagueTeams.length === 0 ? (
                      <div className="p-4 text-[10px] font-bold uppercase text-muted-foreground text-center">No squads found</div>
                    ) : (
                      leagueTeams.map(t => (
                        <SelectItem key={t.id} value={t.id} className="font-bold uppercase text-[10px] py-3 border-b last:border-0 border-muted/30">
                          <div className="flex items-center justify-between w-full gap-8">
                            <span>{t.name}</span>
                            <span className={cn(
                              "text-[8px] px-2 py-0.5 rounded-full border",
                              t.status === 'accepted' || t.status === 'assigned' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            )}>
                              {t.status}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase">Match Date</Label>
                <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="h-12 border-2 font-black bg-white px-4 [&::-webkit-calendar-picker-indicator]:p-1" />
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

          <div className="flex gap-4 pt-4">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-[2] h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 disabled:opacity-50" onClick={handleSubmit} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Append Fixture"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeaguesPageContent({ embedded = false }: { embedded?: boolean }) {
  const { 
    activeTeam, createLeague, isStaff, isPro, purchasePro, 
    teams, removeTeamFromLeague, updateLeagueTeamDetails,
    isPrimaryClubAuthority, updateLeaguePin, isSchoolMode
  } = useTeam();
  const db = useFirestore();
  const { user: authUser, isAuthResolved } = useUser();
  const router = useRouter();
  
  const leagueLabel = isSchoolMode ? 'Program' : 'League';
  const leaguesLabel = isSchoolMode ? 'Programs' : 'Leagues';

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isManualGameOpen, setIsManualGameOpen] = useState(false);


  const [leagueName, setLeagueName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'portals' | 'teams' | 'players' | 'compliance' | 'schedule'>('teams');
  const [mounted, setMounted] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);

  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editTeamForm, setEditTeamForm] = useState({ 
    teamName: '', 
    coachName: '', 
    coachEmail: '',
    coachPhone: '',
    origin: '',
    organizerNotes: '',
    inviteCode: '',
    division: '',
    wins: 0,
    losses: 0,
    ties: 0,
    points: 0
  });

  const [isEditLeagueOpen, setIsEditLeagueOpen] = useState(false);
  const [editLeagueForm, setEditLeagueForm] = useState({
    name: '', sport: '', description: '', startDate: '', endDate: '', ages: '', 
    contactEmail: '', contactPhone: '', registrationCost: '', twitter: '', instagram: '', paymentInstructions: '',
    slug: '', requiredSquads: '', blackoutDaysOfWeek: [] as number[], divisions: [] as string[]
  });
  const [duplicateTitle, setDuplicateTitle] = useState('');
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [duplicatingLeague, setDuplicatingLeague] = useState<League | null>(null);

  const leaguesQuery = useMemoFirebase(() => {
    if (!isAuthResolved || !db || !authUser?.uid) return null;
    
    // For staff members, show both leagues they created OR leagues where their active team is a member
    if (isStaff) {
      const conditions = [where('creatorId', '==', authUser.uid)];
      if (activeTeam?.id) {
        conditions.push(where('memberTeamIds', 'array-contains', activeTeam.id));
      }
      return query(
        collection(db, 'leagues'),
        or(...conditions),
        limit(50)
      );
    }

    // For regular users, leagues where their active team is a member
    if (activeTeam?.id) {
      return query(
        collection(db, 'leagues'), 
        where('memberTeamIds', 'array-contains', activeTeam.id),
        limit(20)
      );
    }
    
    return null;
  }, [isAuthResolved, db, authUser?.uid, activeTeam?.id, isStaff]);

  const { data: allLeagues, isLoading: isLeaguesLoading } = useCollection<League>(leaguesQuery);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');

  const leagues = useMemo(() => {
    if (!allLeagues) return [];
    return allLeagues.filter(l => showArchived ? l.isArchived : !l.isArchived);
  }, [allLeagues, showArchived]);

  const activeLeague = useMemo(() => leagues.find(l => l.id === selectedLeagueId), [leagues, selectedLeagueId]);

  // Logo resolution map: activeTeam is the authoritative source.
  // teamMembership docs lack teamLogoUrl — only activeTeamDoc (merged into activeTeam) is live.
  const teamLogoMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Primary: live Firestore team doc for the current user's team
    if (activeTeam?.id && activeTeam?.teamLogoUrl) {
      map[activeTeam.id] = activeTeam.teamLogoUrl;
    }
    // Secondary: logos enrolled/propagated into the league document
    if (activeLeague?.teams) {
      Object.entries(activeLeague.teams).forEach(([id, t]) => {
        if ((t as any).teamLogoUrl) map[id] = (t as any).teamLogoUrl;
      });
    }
    return map;
  }, [activeLeague, activeTeam?.id, activeTeam?.teamLogoUrl]);

  const waiversQuery = useMemoFirebase(() => {
    if (!db || !activeLeague?.id) return null;
    return collection(db, 'leagues', activeLeague.id, 'archived_waivers');
  }, [db, activeLeague?.id]);
  const { data: waiversData } = useCollection<LeagueArchiveWaiver>(waiversQuery);
  const waivers = useMemo(() => waiversData || [], [waiversData]);

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
    toast({ title: val ? "Portal Access Activated" : "Portal Access Deactivated" });
  };

  const sortedStandings = useMemo(() => {
    if (!activeLeague || !activeLeague.teams) return [];
    return Object.entries(activeLeague.teams)
      .map(([id, stats]) => {
        // Use teamLogoMap which merges both league-stored and club-known logos
        const teamLogoUrl = teamLogoMap[id] || (stats as any).teamLogoUrl;
        return { id, ...stats, teamLogoUrl };
      })
      .filter(team => !selectedDivision || team.division === selectedDivision)
      .sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [activeLeague, selectedDivision, teamLogoMap]);

  const exportStandings = useCallback(() => {
    if (!activeLeague || sortedStandings.length === 0) return;
    const doc = new jsPDF();
    addSquadBranding(doc, "OFFICIAL STANDINGS", `${activeLeague.name.toUpperCase()} COMPETITIVE HUB`);
    
    const pageWidth = doc.internal.pageSize.getWidth();
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

  const exportPersonnelLog = useCallback(() => {
    if (!activeLeague?.individualRecruits) return;
    const recruits = Object.entries(activeLeague.individualRecruits);
    if (recruits.length === 0) return;
    const doc = new jsPDF();
    addSquadBranding(doc, "INSTITUTIONAL PERSONNEL LOG", "PERSONNEL & PORTAL PIPELINE");
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.text(`Participating Members: ${recruits.length}`, 20, 70);
    doc.setFillColor(245, 245, 245); doc.rect(20, 80, pageWidth - 40, 10, 'F');
    doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.text("NAME", 25, 86.5); doc.text("EMAIL", 85, 86.5); doc.text("STATUS", 150, 86.5); doc.text("VERIFIED", pageWidth - 25, 86.5, { align: 'right' });
    let y = 100; doc.setTextColor(30, 30, 30); doc.setFontSize(9);
    recruits.forEach(([id, p]) => {
      doc.setFont("helvetica", "bold"); doc.text(p.name.toUpperCase(), 25, y); doc.setFont("helvetica", "normal"); doc.text(p.email, 85, y); doc.text(p.status.toUpperCase(), 150, y); doc.text(p.signedAt ? 'YES' : 'NO', pageWidth - 25, y, { align: 'right' });
      doc.line(25, y + 4, pageWidth - 25, y + 4); y += 12;
    });
    doc.save(`PERSONNEL_LOG_${activeLeague.id.slice(-8)}.pdf`);
  }, [activeLeague]);

  const exportWaiver = useCallback((waiver: LeagueArchiveWaiver) => {
    const doc = new jsPDF();
    addSquadBranding(doc, "WAIVER & AGREEMENT", "OFFICIAL COMPETITIVE RECORD");
    
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(`DOCUMENT ID: ${waiver.id}`, 20, 55);
    doc.setFont("helvetica", "normal"); doc.text(`SIGNED AT: ${format(new Date(waiver.signedAt), 'MMMM d, yyyy @ h:mm a')}`, 20, 62);
    doc.text(`TYPE: ${waiver.type.toUpperCase()}`, 20, 69);
    
    doc.setDrawColor(230, 230, 230); doc.line(20, 75, pageWidth - 20, 75);
    
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("PARTICIPANT DETAILS", 20, 85);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    
    let y = 95;
    Object.entries(waiver.answers).forEach(([key, value]) => {
      if (key === 'manual_enrollment' || key === 'signature_date' || key === 'waiver_signed_text') return;
      
      const cleanKey = key.replace(/_/g, ' ').toUpperCase();
      let cleanValue = value;
      if (typeof value === 'object' && value !== null) {
        cleanValue = JSON.stringify(value);
      } else if (value === true) cleanValue = 'YES';
      else if (value === false) cleanValue = 'NO';
      
      doc.setFont("helvetica", "bold"); doc.text(`${cleanKey}:`, 20, y);
      doc.setFont("helvetica", "normal"); 
      const splitValue = doc.splitTextToSize(String(cleanValue), pageWidth - 85);
      doc.text(splitValue, 65, y);
      
      y += (splitValue.length * 5) + 3;
      if (y > 270) { 
        doc.addPage(); 
        addSquadBranding(doc, "WAIVER & AGREEMENT", "OFFICIAL COMPETITIVE RECORD");
        y = 60; 
      }
    });
    
    y = Math.min(y + 15, 275);
    doc.setDrawColor(0, 0, 0); doc.line(20, y, 100, y);
    doc.setFontSize(8); doc.text("AUTHORIZED DIGITAL SIGNATURE", 20, y + 5);
    doc.setFontSize(14); doc.setFont("times", "italic"); doc.text(waiver.signer, 25, y - 5);
    
    doc.save(`WAIVER_${waiver.title.replace(/\s+/g, '_')}_${waiver.id.slice(-6)}.pdf`);
  }, []);

  const exportAllWaivers = useCallback(() => {
    if (!activeLeague || waivers.length === 0) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    waivers.forEach((waiver, index) => {
      if (index > 0) doc.addPage();
      addSquadBranding(doc, "WAIVER ARCHIVE", waiver.title.toUpperCase());
      
      doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(`DOCUMENT ID: ${waiver.id}`, 20, 55);
      doc.setFont("helvetica", "normal"); doc.text(`SIGNED AT: ${format(new Date(waiver.signedAt), 'MMMM d, yyyy @ h:mm a')}`, 20, 62);
      doc.text(`TYPE: ${waiver.type.toUpperCase()}`, 20, 69);
      
      doc.setDrawColor(230, 230, 230); doc.line(20, 75, pageWidth - 20, 75);
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("PARTICIPANT DETAILS", 20, 85);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      
      let y = 95;
      Object.entries(waiver.answers).forEach(([key, value]) => {
        if (key === 'manual_enrollment' || key === 'signature_date' || key === 'waiver_signed_text') return;
        const cleanKey = key.replace(/_/g, ' ').toUpperCase();
        let cleanValue = value;
        if (typeof value === 'object' && value !== null) cleanValue = JSON.stringify(value);
        else if (value === true) cleanValue = 'YES';
        else if (value === false) cleanValue = 'NO';
        
        doc.setFont("helvetica", "bold"); doc.text(`${cleanKey}:`, 20, y);
        doc.setFont("helvetica", "normal"); 
        const splitValue = doc.splitTextToSize(String(cleanValue), pageWidth - 85);
        doc.text(splitValue, 65, y);
        y += (splitValue.length * 5) + 3;
        if (y > 270) { 
          doc.addPage(); 
          addSquadBranding(doc, "WAIVER ARCHIVE", waiver.title.toUpperCase());
          y = 60; 
        }
      });
      
      y = Math.min(y + 15, 275);
      doc.setDrawColor(0, 0, 0); doc.line(20, y, 100, y);
      doc.setFontSize(8); doc.text("AUTHORIZED DIGITAL SIGNATURE", 20, y + 5);
      doc.setFontSize(14); doc.setFont("times", "italic"); doc.text(waiver.signer, 25, y - 5);
    });
    
    doc.save(`${activeLeague.name.replace(/\s+/g, '_')}_WAIVER_ARCHIVE.pdf`);
  }, [activeLeague, waivers]);

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
      paymentInstructions: activeLeague.paymentInstructions || '',
      slug: activeLeague.slug || '',
      requiredSquads: activeLeague.requiredSquads?.toString() || '',
      blackoutDaysOfWeek: activeLeague.blackoutDaysOfWeek || [],
      divisions: activeLeague.divisions || []
    });
    setIsEditLeagueOpen(true);
  };

  const handleArchiveLeague = async () => {
    if (!activeLeague) return;
    if (!window.confirm(`Are you sure you want to archive ${activeLeague.name}? It will be removed from active dashboards but remain in the Historical Archives.`)) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'leagues', activeLeague.id), { isArchived: true });
      setSelectedLeagueId(null);
      setIsEditLeagueOpen(false);
      toast({ title: "Hub Archived", description: "League moved to historical storage." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnarchiveLeague = async (leagueId: string) => {
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'leagues', leagueId), { isArchived: false });
      toast({ title: "Hub Restored", description: "League returned to active operations." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddDivision = () => {
    if (!newDivisionName.trim()) return;
    const current = editLeagueForm.divisions || [];
    if (current.includes(newDivisionName.trim())) {
      toast({ title: "Duplicate Division", variant: "destructive" });
      return;
    }
    setEditLeagueForm({
      ...editLeagueForm,
      divisions: [...current, newDivisionName.trim()]
    });
    setNewDivisionName('');
  };

  const handleRemoveDivision = (name: string) => {
    setEditLeagueForm({
      ...editLeagueForm,
      divisions: (editLeagueForm.divisions || []).filter(d => d !== name)
    });
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
        },
        slug: editLeagueForm.slug,
        requiredSquads: editLeagueForm.requiredSquads ? parseInt(editLeagueForm.requiredSquads) : null,
        blackoutDaysOfWeek: editLeagueForm.blackoutDaysOfWeek
      });
      setIsEditLeagueOpen(false);
    } finally { setIsProcessing(false); }
  };

  const handleDuplicateLeague = async () => {
    if (!duplicatingLeague || !duplicateTitle.trim() || !db || !authUser?.uid) {
      toast({ title: "Inaccessible Auth State", description: "Authorization required for institutional replication.", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const newLeagueRef = doc(collection(db, 'leagues'));
      
      // Explicitly pick only the framework fields to avoid carrying over runtime state or large collections
      const newLeagueData = {
        name: duplicateTitle.trim(),
        sport: duplicatingLeague.sport || '',
        description: duplicatingLeague.description || '',
        startDate: duplicatingLeague.startDate || '',
        endDate: duplicatingLeague.endDate || '',
        ages: duplicatingLeague.ages || '',
        contactEmail: duplicatingLeague.contactEmail || '',
        contactPhone: duplicatingLeague.contactPhone || '',
        registrationCost: duplicatingLeague.registrationCost || '',
        paymentInstructions: duplicatingLeague.paymentInstructions || '',
        socialLinks: duplicatingLeague.socialLinks || {},
        slug: `${newLeagueRef.id.slice(-6)}-clone`,
        requiredSquads: duplicatingLeague.requiredSquads || null,
        blackoutDaysOfWeek: duplicatingLeague.blackoutDaysOfWeek || [],
        divisions: duplicatingLeague.divisions || [],
        
        // Reset operational fields
        id: newLeagueRef.id,
        creatorId: authUser.uid,
        createdAt: new Date().toISOString(),
        isArchived: false,
        is_active: false,
        teams: {},
        individualRecruits: {},
        schedule: [],
        memberTeamIds: [],
        memberIndivIds: []
      };
      
      const { setDoc, getDoc } = await import('firebase/firestore');
      await setDoc(newLeagueRef, newLeagueData);

      // Duplicate Registration Configs
      const configs = ['player_config', 'team_config', 'waiver_config'];
      for (const configId of configs) {
        const sourceRef = doc(db, 'leagues', duplicatingLeague.id, 'registration_config', configId);
        const sourceCfg = await getDoc(sourceRef);
        if (sourceCfg.exists()) {
          const cfgData = sourceCfg.data();
          // Reset any per-league overrides if necessary
          await setDoc(doc(db, 'leagues', newLeagueRef.id, 'registration_config', configId), cfgData);
        }
      }

      setIsDuplicateOpen(false);
      setDuplicateTitle('');
      setDuplicatingLeague(null);
      toast({ title: "Hub Replicated", description: "Institutional framework cloned. Redirecting to new environment..." });
      
      // Force a query refresh by briefly toggling a state or just letting useCollection handle it
      // Actually, we could select it right away
      setSelectedLeagueId(newLeagueRef.id);
      
    } catch (e: any) {
      console.error("[Leagues] Duplication failed:", e);
      toast({ title: "Replication Failed", description: e.message, variant: 'destructive' });
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
      toast({ title: `${leagueLabel} Established` });
    } finally { setIsProcessing(false); }
  };

  const handleEditTeam = (team: any) => {
    setEditingTeam(team);
    setEditTeamForm({
      teamName: team.teamName,
      coachName: team.coachName || '',
      coachEmail: team.coachEmail || '',
      coachPhone: team.coachPhone || '',
      origin: team.origin || '',
      organizerNotes: team.organizerNotes || '',
      inviteCode: team.inviteCode || team.teamCode || team.code || '',
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      points: team.points || 0,
      division: team.division || ''
    });
  };

  const handleSaveTeamUpdate = async () => {
    if (!activeLeague || !editingTeam) return;
    setIsProcessing(true);
    try {
      console.log("[Leagues] Updating team:", editingTeam.id, editTeamForm);
      await updateLeagueTeamDetails(activeLeague.id, editingTeam.id, editTeamForm);
      setEditingTeam(null);
      toast({ title: "Standings Synchronized", description: "The squad metadata has been updated successfully." });
    } catch (e: any) {
      console.error("[Leagues] Error updating team:", e);
      toast({ title: "Update Failed", description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
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
      {!embedded ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Master Hub</Badge>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">{leaguesLabel}</h1>
          </div>
          <div className="flex gap-2">
            {leagues.some(l => l.isArchived) || showArchived ? (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)} className="h-14 px-6 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                 <Clock className="h-4 w-4" />
                 {showArchived ? 'View Active Hubs' : 'View Archived Hubs'}
              </Button>
            ) : null}
            {!activeLeague && isPrimaryClubAuthority && (
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-5 w-5 mr-2" /> Launch {leagueLabel} Architect
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          {leagues.some(l => l.isArchived) || showArchived ? (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)} className="h-11 px-5 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
               <Clock className="h-4 w-4" />
               {showArchived ? 'Active Hubs' : 'Archived Hubs'}
            </Button>
          ) : null}
          {!activeLeague && isPrimaryClubAuthority && (
            <Button className="h-11 px-6 rounded-2xl font-black shadow-xl shadow-primary/20 text-xs" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Launch {leagueLabel} Architect
            </Button>
          )}
        </div>
      )}

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
                    <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
                       <div className="flex gap-1.5 overflow-hidden w-full sm:w-auto justify-center sm:justify-start">
                         <div className="h-8 w-8 rounded-lg bg-muted/20 flex items-center justify-center shrink-0"><Users className="h-4 w-4 opacity-40" /></div>
                         <div className="h-8 w-8 rounded-lg bg-muted/20 flex items-center justify-center shrink-0"><Zap className="h-4 w-4 opacity-40" /></div>
                       </div>
                       <div className="flex gap-2 w-full sm:w-auto">
                         {isStaff && league.creatorId === authUser?.uid && (
                           <Button 
                             variant="outline" 
                             size="sm" 
                             className="h-9 px-4 rounded-xl border-2 font-black uppercase text-[9px] tracking-widest hover:bg-black hover:text-white transition-all flex-1 sm:flex-none"
                             onClick={(e) => {
                               e.stopPropagation();
                               setDuplicatingLeague(league);
                               setDuplicateTitle(`${league.name} (Clone)`);
                               setIsDuplicateOpen(true);
                             }}
                           >
                             <Copy className="h-3.5 w-3.5 mr-2" /> Clone
                           </Button>
                         )}
                         {league.isArchived ? (
                           <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleUnarchiveLeague(league.id); }} className="h-9 rounded-xl text-[9px] font-black uppercase hover:bg-green-600 hover:text-white transition-all text-green-600 border border-green-600/20 px-4 flex-1 sm:flex-none">Restore Hub</Button>
                         ) : (
                           <Button variant="ghost" size="sm" className="h-9 rounded-xl text-[9px] font-black uppercase group-hover:bg-primary group-hover:text-white transition-all px-4 flex-1 sm:flex-none border-2 border-transparent group-hover:border-primary">Select Hub</Button>
                         )}
                       </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card 
                className="rounded-[3rem] border-2 border-dashed border-muted bg-transparent flex flex-col items-center justify-center p-12 group hover:border-primary/40 transition-all cursor-pointer"
                onClick={() => setIsCreateOpen(true)}
              >
                <Plus className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-all mb-4" />
                <p className="text-xs font-black uppercase text-muted-foreground group-hover:text-primary">New {leagueLabel} Hub</p>
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
                      navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.slug || activeLeague.id}?protocol=team_config`);
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
                    className="rounded-xl h-12 px-6 font-black uppercase text-xs shadow-xl flex items-center gap-2 hover:text-black transition-all"
                    onClick={() => router.push(`/leagues/registration/${activeLeague.id}`)}
                  >
                    <FileText className="h-4 w-4" />
                    Portal Architect
                  </Button>
                </div>
              )}
            </div>
          </Card>


            <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4">
              <div className="flex flex-col gap-4 w-full">
                <div className="bg-muted/50 p-1.5 rounded-2xl border-2 inline-flex shadow-inner overflow-x-auto max-w-full no-scrollbar">
                  <Button variant={activeTab === 'teams' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all shrink-0" onClick={() => setActiveTab('teams')}>Teams</Button>
                  <Button variant={activeTab === 'schedule' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all shrink-0" onClick={() => setActiveTab('schedule')}>Schedule</Button>
                  {isStaff && <Button variant={activeTab === 'players' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all shrink-0" onClick={() => setActiveTab('players')}>Players</Button>}
                  {isStaff && <Button variant={activeTab === 'portals' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all shrink-0" onClick={() => setActiveTab('portals')}>Portals</Button>}
                  {isStaff && <Button variant={activeTab === 'compliance' ? 'default' : 'ghost'} className="rounded-xl font-black text-[10px] uppercase px-8 transition-all shrink-0" onClick={() => setActiveTab('compliance')}>Compliance</Button>}
                </div>
                
                {activeTab === 'teams' && activeLeague.divisions && activeLeague.divisions.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                    <Button 
                      variant={!selectedDivision ? 'secondary' : 'ghost'} 
                      size="sm" 
                      onClick={() => setSelectedDivision(null)}
                      className="h-8 rounded-xl font-black text-[9px] uppercase px-4 shrink-0 transition-all"
                    >
                      All Tiers
                    </Button>
                    {activeLeague.divisions.map((d: string) => (
                      <Button 
                        key={d}
                        variant={selectedDivision === d ? 'secondary' : 'ghost'} 
                        size="sm" 
                        onClick={() => setSelectedDivision(d)}
                        className="h-8 rounded-xl font-black text-[9px] uppercase px-4 shrink-0 transition-all"
                      >
                        {d} Division
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              {activeTab === 'teams' && (
                <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-xl border-2 font-black uppercase text-[10px]" onClick={exportStandings}>
                  <Download className="h-4 w-4 mr-2" /> Download Standings
                </Button>
              )}
              {activeTab === 'players' && (
                <Button variant="outline" className="flex-1 sm:flex-none h-11 rounded-xl border-2 font-black uppercase text-[10px]" onClick={exportPersonnelLog}>
                  <Download className="h-4 w-4 mr-2" /> Download Personnel Log
                </Button>
              )}
            </div>
          </div>

          <Tabs value={activeTab} className="mt-0">
            <TabsContent value="teams" className="mt-0 animate-in fade-in duration-500">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Squad Rank</th><th className="px-4 py-5 text-center">Portal Code</th><th className="px-4 py-5 text-center">Record</th><th className="px-4 py-5 text-center">PTS</th><th className="px-4 py-5 text-center">Compliance</th><th className="px-10 py-5 text-right text-primary">Actions</th></tr></thead>
                      <tbody className="divide-y divide-muted/50">{sortedStandings.map((team, idx) => (
                        <tr key={team.id} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-10 py-6">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black text-muted-foreground/40 w-6">{idx + 1}</span>
                              <SquadIdentity 
                                teamId={team.id} 
                                teamName={team.teamName} 
                                logoUrl={(team as any).teamLogoUrl}
                                logoClassName="h-10 w-10 rounded-xl shadow-sm border-2"
                                showNameWithLogo
                                horizontal
                                textClassName="font-black text-sm uppercase truncate text-foreground"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  {team.division && <Badge className="bg-primary/5 text-primary border-none text-[7px] font-black uppercase px-2 h-4">{team.division}</Badge>}
                                </div>
                                <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-60">{team.coachName || 'Staff Managed'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center">
                            {(team.inviteCode || team.teamCode || team.code) ? (
                              <Badge variant="outline" className="border-primary/20 text-primary font-black text-[9px] h-6 px-3">{team.inviteCode || team.teamCode || team.code}</Badge>
                            ) : (
                              <span className="text-[10px] font-bold text-muted-foreground/30">—</span>
                            )}
                          </td>
                          <td className="px-4 py-6 text-center font-bold text-sm">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-green-600">{team.wins}</span>
                              <span className="opacity-20">/</span>
                              <span className="text-red-600">{team.losses}</span>
                              <span className="opacity-20">/</span>
                              <span className="text-muted-foreground/60">{team.ties || 0}</span>
                            </div>
                          </td>
                          <td className="px-4 py-6 text-center font-black text-primary">{team.points}</td>
                          <td className="px-4 py-6 text-center">
                            {team.signedAt ? (
                              <div className="space-y-0.5 text-center">
                                <Badge className="bg-green-100 text-green-700 border-none font-black text-[7px] h-4">SIGNED</Badge>
                                <p className="text-[6px] font-bold text-muted-foreground uppercase">{format(new Date(team.signedAt), 'MMM d, p')}</p>
                              </div>
                            ) : (
                              <Badge variant="outline" className={cn("text-[7px] font-black uppercase border-dashed", (team.manual || team.id.startsWith('manual_')) ? "text-amber-600 border-amber-200 bg-amber-50" : "opacity-30")}>
                                {(team.manual || team.id.startsWith('manual_')) ? "WAIVER PENDING" : "PENDING"}
                              </Badge>
                            )}
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
            <TabsContent value="schedule" className="mt-0 animate-in fade-in duration-500"><LeagueOverview league={activeLeague} schedule={activeLeague.schedule || []} onOpenManualGame={() => setIsManualGameOpen(true)} /></TabsContent>
            <TabsContent value="players" className="mt-0 animate-in fade-in duration-500">
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Personnel Hub</h3></div>
                  <Link href={`/leagues/registration/${activeLeague.id}?protocol=player_config`}>
                    <Button variant="outline" className="rounded-xl h-10 px-6 font-black uppercase text-[10px]">Open Athlete Pipeline</Button>
                  </Link>
                </div>
                <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Athlete Name</th><th className="px-4 py-5 text-center">Portal Code</th><th className="px-4 py-5 text-center">Status</th><th className="px-4 py-5 text-center">Compliance</th><th className="px-10 py-5 text-right">Contact</th></tr></thead>
                      <tbody className="divide-y divide-muted/50">
                        {Object.entries(activeLeague.individualRecruits || {}).map(([id, p]) => (
                          <tr key={id} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary"><UserPlus className="h-5 w-5" /></div>
                                <div>
                                  <span className="font-black text-sm uppercase truncate text-foreground">{p.name}</span>
                                  {p.teamName && <p className="text-[7px] font-bold text-muted-foreground uppercase">Affiliation: {p.teamName}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-6 text-center font-bold text-xs">
                              {(p.teamCode || p.inviteCode || p.code) ? (
                                <Badge variant="outline" className="border-primary/20 text-primary font-black text-[9px] h-6 px-3">{p.teamCode || p.inviteCode || p.code}</Badge>
                              ) : (
                                <span className="text-[10px] font-bold text-muted-foreground/30">—</span>
                              )}
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
                            <td className="px-10 py-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {p.signedAt && activeLeague && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => exportWaiver({ 
                                    id: id, 
                                    title: p.name, 
                                    signer: p.name, 
                                    signedAt: p.signedAt!, 
                                    waiverText: `Official ${leagueLabel} Participation Waiver`,
                                    registrationId: (activeLeague as any).id || selectedLeagueId || '',
                                    answers: { name: p.name, email: p.email, phone: p.phone, status: p.status, type: 'individual' }, 
                                    type: 'individual' 
                                  })}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                )}
                                <span className="font-bold text-[10px] text-muted-foreground uppercase">{p.email}</span>
                              </div>
                            </td>
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
            
            <TabsContent value="compliance" className="mt-0 animate-in fade-in duration-500">
               <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Compliance Archive</h3></div>
                  <Button variant="outline" onClick={exportAllWaivers} className="rounded-xl h-10 px-6 font-black uppercase text-[10px] flex items-center gap-2">
                    <Download className="h-3 w-3" /> Download Full Archive
                  </Button>
                </div>
                <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest border-b"><tr><th className="px-10 py-5">Document Title</th><th className="px-4 py-5">Type</th><th className="px-4 py-5">Signer</th><th className="px-4 py-5">Signed Date</th><th className="px-10 py-5 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-muted/50">
                        {waivers.map((waiver) => (
                          <tr key={waiver.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-10 py-6">
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary"><FileText className="h-5 w-5" /></div>
                                <span className="font-black text-sm uppercase truncate text-foreground">{waiver.title}</span>
                              </div>
                            </td>
                            <td className="px-4 py-6 text-[10px] font-black uppercase text-muted-foreground">{waiver.type}</td>
                            <td className="px-4 py-6 font-black text-xs uppercase">{waiver.signer}</td>
                            <td className="px-4 py-6 text-[10px] font-bold text-muted-foreground uppercase">{format(new Date(waiver.signedAt), 'MMM d, h:mm a')}</td>
                            <td className="px-10 py-6 text-right">
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary/10 text-primary" onClick={() => exportWaiver(waiver)}>
                                <Download className="h-5 w-5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {waivers.length === 0 && (
                      <div className="py-24 text-center opacity-20 italic font-black uppercase text-xs">No signed compliance documents archived yet.</div>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="portals" className="mt-0 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="rounded-[2.5rem] border-none shadow-xl bg-orange-600 text-white p-8 space-y-4 group transition-all">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-white text-orange-600 border-none font-black text-[8px] h-5 px-2">SQUAD ARCHITECT</Badge>
                  </div>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Team Registration</h4>
                  <p className="text-xs text-white/80 font-medium leading-relaxed italic">Public portal for new squads to join the roster.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.slug || activeLeague.id}?protocol=team_config`); toast({ title: "Portal Link Copied" }); }}>Copy Link <Share2 className="ml-2 h-3 w-3" /></Button>
                    <Button variant="outline" className="h-12 w-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => router.push(`/leagues/registration/${activeLeague.id}?protocol=team_config`)}><Settings className="h-4 w-4" /></Button>
                  </div>
                </Card>

                <Card className="rounded-[2.5rem] border-none shadow-xl bg-blue-600 text-white p-8 space-y-4 group transition-all">
                  <Badge className="bg-white text-blue-600 border-none font-black text-[8px] h-5 px-2">ATHLETE PIPELINE</Badge>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Athlete Pipeline</h4>
                  <p className="text-xs text-white/80 font-medium leading-relaxed italic">Public portal for athletes seeking squad placement.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.slug || activeLeague.id}?protocol=player_config`); toast({ title: "Portal Link Copied" }); }}>Copy Link <Share2 className="ml-2 h-3 w-3" /></Button>
                   <Button variant="outline" className="h-12 w-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => router.push(`/leagues/registration/${activeLeague.id}?protocol=player_config`)}><Settings className="h-4 w-4" /></Button>
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
                
                 <Card className="rounded-[2.5rem] border-none shadow-xl bg-purple-600 text-white p-8 space-y-4 group transition-all">
                  <Badge className="bg-white text-purple-600 border-none font-black text-[8px] h-5 px-2">COMPLIANCE HUB</Badge>
                  <h4 className="text-2xl font-black uppercase tracking-tight leading-none">Waiver Portal</h4>
                  <p className="text-xs text-white/80 font-medium leading-relaxed italic">Public portal for standalone liability and agreement signing.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/league/${activeLeague.slug || activeLeague.id}?protocol=waiver_config`); toast({ title: "Portal Link Copied" }); }}>Copy Link <Share2 className="ml-2 h-3 w-3" /></Button>
                    <Button variant="outline" className="h-12 w-12 rounded-xl bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => router.push(`/leagues/registration/${activeLeague.id}?protocol=waiver_config`)}><Settings className="h-4 w-4" /></Button>
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
                  <Button variant="outline" className="w-full h-12 rounded-xl bg-black/5 border-black/10 text-black hover:bg-black/10" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/leagues/scorekeeper/${activeLeague.slug || activeLeague.id}`); toast({ title: "Scorekeeper URL Copied" }); }}>Copy Entry Link <Share2 className="ml-2 h-3 w-3" /></Button>
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
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest max-sm:px-4 max-w-sm mx-auto leading-relaxed">Initialize your own {leagueLabel.toLowerCase()} architect to begin the competitive season.</p>
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
            <DialogHeader><DialogTitle className="text-3xl font-black uppercase">{leagueLabel} Architect</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase">{leagueLabel} Title</Label>
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
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2 col-span-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Name</Label>
                  <Input value={editTeamForm.teamName} onChange={e => setEditTeamForm({...editTeamForm, teamName: e.target.value})} className="h-12 rounded-xl border-2 font-bold focus:border-primary/20" />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Origin</Label>
                  <Input value={editTeamForm.origin} onChange={e => setEditTeamForm({...editTeamForm, origin: e.target.value})} className="h-12 rounded-xl border-2 font-bold" placeholder="e.g. Toronto, ON" />
                </div>
                <div className="space-y-2 col-span-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Portal Code</Label>
                  <Input value={editTeamForm.inviteCode || ''} onChange={e => setEditTeamForm({...editTeamForm, inviteCode: e.target.value.toUpperCase()})} className="h-12 rounded-xl border-2 font-black text-center tracking-widest" maxLength={6} placeholder="AUTO" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Primary Coach / Contact</Label>
                  <Input value={editTeamForm.coachName} onChange={e => setEditTeamForm({...editTeamForm, coachName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Email</Label>
                  <Input type="email" value={editTeamForm.coachEmail} onChange={e => setEditTeamForm({...editTeamForm, coachEmail: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Wins</Label>
                  <Input type="number" value={editTeamForm.wins} onChange={e => setEditTeamForm({...editTeamForm, wins: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-bold text-center" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Losses</Label>
                  <Input type="number" value={editTeamForm.losses} onChange={e => setEditTeamForm({...editTeamForm, losses: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-bold text-center" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Ties</Label>
                  <Input type="number" value={editTeamForm.ties} onChange={e => setEditTeamForm({...editTeamForm, ties: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-bold text-center" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Points</Label>
                  <Input type="number" value={editTeamForm.points} onChange={e => setEditTeamForm({...editTeamForm, points: parseInt(e.target.value) || 0})} className="h-12 rounded-xl border-2 font-black text-center text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Division Assignment</Label>
                <Select value={editTeamForm.division || 'none'} onValueChange={v => setEditTeamForm({...editTeamForm, division: v === 'none' ? '' : v})}>
                  <SelectTrigger className="h-12 rounded-xl border-2 font-black uppercase text-[10px]">
                    <SelectValue placeholder="--- UNASSIGNED ---" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none" className="font-bold uppercase text-[9px]">Unassigned / General</SelectItem>
                    {activeLeague?.divisions?.map((d: string) => (
                      <SelectItem key={d} value={d} className="font-bold uppercase text-[9px]">{d} Division</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contact Phone</Label>
                <Input value={editTeamForm.coachPhone} onChange={e => setEditTeamForm({...editTeamForm, coachPhone: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organizer Internal Notes</Label>
                <Textarea value={editTeamForm.organizerNotes} onChange={e => setEditTeamForm({...editTeamForm, organizerNotes: e.target.value})} className="rounded-xl border-2 font-medium min-h-[80px]" placeholder="Special notes about this squad..." />
              </div>
            </div>
            <DialogFooter>
              <Button 
                disabled={isProcessing}
                className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" 
                onClick={handleSaveTeamUpdate}
              >
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : 'Commit Changes'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditLeagueOpen} onOpenChange={setIsEditLeagueOpen}>
        <DialogContent hideClose className="max-w-[98vw] lg:max-w-[1600px] rounded-[3rem] p-0 border border-white/10 shadow-2xl overflow-hidden bg-[#050505] text-white h-[95vh] flex flex-col">
          <DialogTitle className="sr-only">{leagueLabel} Profile</DialogTitle>
          <DialogClose className="absolute right-6 top-6 z-50 h-10 w-10 rounded-full border border-white/20 bg-white/5 hover:bg-white/15 transition-all flex items-center justify-center backdrop-blur-sm">
            <X className="h-5 w-5 text-white" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-600 via-orange-500 to-primary w-full shrink-0" />
          
          <div className="flex flex-1 overflow-hidden">
            {/* Left Navigation Matrix */}
            <div className="w-[320px] bg-[#0a0a0a] border-r border-white/5 p-10 flex flex-col hidden lg:flex relative">
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
              <div className="relative z-10 flex items-center gap-4 mb-20">
                <div className="border border-white/20 p-3 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white"><Globe className="h-5 w-5" /></div>
                <div>
                   <h2 className="text-xl font-black uppercase tracking-tight">{leagueLabel}<br/>Profile</h2>
                </div>
              </div>
              
              <div className="relative z-10 space-y-8 flex-1">
                <div className="relative pl-8 transition-all duration-300 cursor-pointer opacity-100">
                  <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Configuration</h4>
                  <h3 className="text-sm font-black uppercase tracking-tight mb-1">Identity & Settings</h3>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">Define Foundational Parameters</p>
                </div>
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
                  <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                    <div>
                      <Badge className="bg-primary/20 text-primary border border-primary/30 uppercase font-black tracking-widest text-[8px] mb-4">Base Configuration</Badge>
                      <h3 className="text-4xl font-black uppercase tracking-tighter mb-2 text-white">{leagueLabel} Profile</h3>
                      <p className="text-sm font-bold opacity-40 uppercase tracking-widest">{activeLeague?.name} • Public Context</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Registration Slug</Label>
                        <Input value={editLeagueForm.slug} onChange={e => setEditLeagueForm({...editLeagueForm, slug: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-white placeholder:text-white/30 uppercase focus-visible:ring-primary px-6 shadow-inner" placeholder="my-premier-league" />
                        <p className="text-[8px] text-white/40 ml-2 font-bold italic">Custom URL: /register/league/{editLeagueForm.slug || 'id'}</p>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Required Squads</Label>
                        <Input type="number" value={editLeagueForm.requiredSquads} onChange={e => setEditLeagueForm({...editLeagueForm, requiredSquads: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-white focus-visible:ring-primary px-6 shadow-inner" placeholder="8" />
                        <p className="text-[8px] text-white/40 ml-2 font-bold italic">Triggers validation warnings in Season Architect.</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">{leagueLabel} Name</Label>
                        <Input value={editLeagueForm.name} onChange={e => setEditLeagueForm({...editLeagueForm, name: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-black text-white focus-visible:ring-primary px-6 shadow-inner" />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Type of Sport</Label>
                        <Input value={editLeagueForm.sport} onChange={e => setEditLeagueForm({...editLeagueForm, sport: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" />
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Description</Label>
                      <Textarea value={editLeagueForm.description} onChange={e => setEditLeagueForm({...editLeagueForm, description: e.target.value})} className="rounded-2xl bg-white/15 border-white/20 font-medium text-white focus-visible:ring-primary px-6 py-4 shadow-inner min-h-[100px]" placeholder={`Detailed description of the ${leagueLabel.toLowerCase()}...`} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                      <div className="space-y-3 col-span-2 md:col-span-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Start Date</Label>
                        <Input type="date" value={editLeagueForm.startDate} onChange={e => setEditLeagueForm({...editLeagueForm, startDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-4 shadow-inner" />
                      </div>
                      <div className="space-y-3 col-span-2 md:col-span-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">End Date</Label>
                        <Input type="date" value={editLeagueForm.endDate} onChange={e => setEditLeagueForm({...editLeagueForm, endDate: e.target.value})} style={{ colorScheme: 'dark' }} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-4 shadow-inner" />
                      </div>
                      <div className="space-y-3 col-span-2 md:col-span-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Ages / Divisions</Label>
                        <Input value={editLeagueForm.ages} onChange={e => setEditLeagueForm({...editLeagueForm, ages: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-4 shadow-inner" placeholder="e.g. U14 - U18" />
                      </div>
                      <div className="space-y-3 col-span-2 md:col-span-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Season Cost</Label>
                        <Input value={editLeagueForm.registrationCost} onChange={e => setEditLeagueForm({...editLeagueForm, registrationCost: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-4 shadow-inner" placeholder="$500/Team" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Offline Payment Instructions</Label>
                      <Textarea value={editLeagueForm.paymentInstructions} onChange={e => setEditLeagueForm({...editLeagueForm, paymentInstructions: e.target.value})} className="rounded-2xl bg-white/15 border-white/20 font-medium text-white focus-visible:ring-primary px-6 py-4 shadow-inner min-h-[80px]" placeholder="E-transfer to accounts@league.com with your team name..." />
                      <p className="text-[10px] text-white/40 ml-2 font-bold">These instructions will be shown during registration. Online payments coming soon.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/10">
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Contact Email</Label>
                        <Input type="email" value={editLeagueForm.contactEmail} onChange={e => setEditLeagueForm({...editLeagueForm, contactEmail: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" placeholder="hq@league.com" />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Contact Phone</Label>
                        <Input type="tel" value={editLeagueForm.contactPhone} onChange={e => setEditLeagueForm({...editLeagueForm, contactPhone: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" placeholder="(555) 123-4567" />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Twitter (X) Link</Label>
                        <Input type="url" value={editLeagueForm.twitter} onChange={e => setEditLeagueForm({...editLeagueForm, twitter: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" placeholder="https://x.com/yourleague" />
                      </div>
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-2">Instagram Link</Label>
                        <Input type="url" value={editLeagueForm.instagram} onChange={e => setEditLeagueForm({...editLeagueForm, instagram: e.target.value})} className="h-14 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner" placeholder="https://instagram.com/yourleague" />
                      </div>
                    </div>

                    <div className="space-y-5 pt-8 border-t border-white/10 font-black">
                      <div>
                        <Label className="text-[10px] font-black uppercase tracking-widest text-primary ml-2">Division Architect</Label>
                        <p className="text-[10px] font-medium text-white/40 italic leading-relaxed px-2">Define competitive tiers (e.g. Gold, Silver, U12) to partition squads and participants.</p>
                      </div>
                      
                      <div className="flex gap-4">
                        <Input 
                          placeholder="New Division Title..." 
                          value={newDivisionName} 
                          onChange={e => setNewDivisionName(e.target.value)} 
                          className="h-14 flex-1 rounded-xl bg-white/15 border-white/20 font-bold text-white focus-visible:ring-primary px-6 shadow-inner"
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDivision())}
                        />
                        <Button type="button" onClick={handleAddDivision} variant="outline" className="h-14 px-8 rounded-xl font-black uppercase text-[10px] border-white/20 text-white hover:bg-white/10 hover:text-white">Add</Button>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2">
                        {(editLeagueForm.divisions || []).map((div, i) => (
                          <Badge key={i} className="bg-white/10 text-white border-white/20 px-4 py-2 rounded-xl font-black text-[10px] uppercase flex items-center gap-2">
                            {div}
                            <button onClick={() => handleRemoveDivision(div)} className="text-white/40 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {(editLeagueForm.divisions || []).length === 0 && (
                          <div className="py-8 w-full border-2 border-dashed border-white/10 rounded-2xl text-center">
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest italic">No divisions defined. Single-tier hub active.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-12 border-t border-white/10 space-y-6">
                      <div className="flex items-center justify-between">
                         <div className="space-y-1">
                           <h4 className="text-xl font-black uppercase tracking-tight text-red-500">Danger Zone</h4>
                           <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Historical Operations & Decommissioning</p>
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 flex flex-col justify-between gap-6">
                           <div className="space-y-2">
                             <p className="text-[10px] font-black uppercase tracking-widest text-white">Archive League Hub</p>
                             <p className="text-[10px] font-medium text-white/40 leading-relaxed italic">Move this league to the historical archives. It will stay in your database but hidden from active squads.</p>
                           </div>
                           <Button variant="outline" className="h-12 border-white/20 text-red-400 hover:bg-red-500/10 hover:text-red-400 font-black uppercase text-[10px]" onClick={handleArchiveLeague}>
                             Archive Environment
                           </Button>
                        </div>

                        <div className="p-6 rounded-[2rem] bg-red-500/5 border border-red-500/20 flex flex-col justify-between gap-6">
                           <div className="space-y-2">
                             <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Decommission Entire Season</p>
                             <p className="text-[10px] font-medium text-red-500/60 leading-relaxed italic">Warning: This will purge all active matches and standings. Registration data and waivers will remain archived.</p>
                           </div>
                           <Button variant="destructive" className="h-12 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[10px]" onClick={async () => {
                             if (!activeLeague) return;
                             if (!window.confirm(`CRITICAL: You are about to purge all matches and standings for ${activeLeague.name}. This action cannot be reversed. Continue?`)) return;
                             setIsProcessing(true);
                             try {
                               await updateDoc(doc(db, 'leagues', activeLeague.id), { schedule: [], teams: {} }); 
                               setIsEditLeagueOpen(false);
                               toast({ title: "Season Purged", description: "Operational environment reset." });
                             } finally { setIsProcessing(false); }
                           }}>
                             Authorize Purge
                           </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
              
              <div className="p-8 border-t border-white/10 bg-[#070707] flex justify-end items-center shrink-0">
                <Button 
                  disabled={isProcessing} 
                  className="h-16 px-14 rounded-2xl bg-white text-black hover:bg-white/90 font-black uppercase text-sm tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all flex items-center" 
                  onClick={handleSaveLeague}
                >
                  {isProcessing ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : `Commit ${leagueLabel} Profile`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md p-0 overflow-hidden bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/5 p-3 rounded-2xl text-primary"><Copy className="h-6 w-6" /></div>
                <DialogTitle className="text-3xl font-black uppercase">Replicate Hub</DialogTitle>
              </div>
              <DialogDescription className="font-bold text-[10px] uppercase tracking-widest text-primary">Clone operational framework and pipeline</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase">New Hub Title</Label>
              <Input 
                placeholder="e.g. State Varsity Premier - Season 2" 
                value={duplicateTitle} 
                onChange={e => setDuplicateTitle(e.target.value)} 
                className="h-14 rounded-2xl border-2 font-black" 
                autoFocus
              />
              <p className="text-[9px] font-medium text-muted-foreground italic leading-relaxed">
                This will clone all divisions, age groups, costs, and registration portals. 
                Rosters and match history will be reset.
              </p>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleDuplicateLeague} disabled={isProcessing || !duplicateTitle.trim()}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Replicated Hub"}
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

export default function LeaguesPage() {
  return <LeaguesPageContent />;
}
