"use client";

import React, { useMemo } from 'react';
import { useTeam, TeamEvent, Member, TeamFile } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  ShieldCheck, 
  CalendarDays, 
  Users, 
  Zap, 
  ArrowUpRight, 
  Plus, 
  UserPlus, 
  ClipboardCheck, 
  HandHelping, 
  PiggyBank, 
  Activity,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  FileText,
  Building,
  ArrowRight,
  MapPin
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format, isFuture, isToday, isSameDay } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit, where, collectionGroup } from 'firebase/firestore';

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

export default function UniversalAccountDashboard() {
  const { 
    user, activeTeam, teams, householdEvents, 
    myChildren, householdBalance, isStaff, isParent, 
    isPro, purchasePro, hasFeature 
  } = useTeam();
  const router = useRouter();
  const db = useFirestore();

  // 1. Calculate Aggregate Win %
  const gamesQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'games'), limit(20));
  }, [db, activeTeam?.id]);
  const { data: games } = useCollection(gamesQuery);
  
  const winRate = useMemo(() => {
    if (!games || games.length === 0) return 0;
    const wins = games.filter((g: any) => g.result === 'Win').length;
    return Math.round((wins / games.length) * 100);
  }, [games]);

  // 2. Aggregate Pending Waivers
  const docsQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return collection(db, 'teams', activeTeam.id, 'documents');
  }, [db, activeTeam?.id]);
  const { data: documents } = useCollection(docsQuery);
  const pendingWaiversCount = useMemo(() => {
    if (!documents) return 0;
    return documents.length > 0 ? documents.length : 0;
  }, [documents]);

  // 3. Community Opportunities (Volunteers/Fundraisers)
  const volQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'volunteers'), limit(5));
  }, [db, activeTeam?.id]);
  const { data: volunteers } = useCollection(volQuery);

  const fundQuery = useMemoFirebase(() => {
    if (!db || !activeTeam?.id) return null;
    return query(collection(db, 'teams', activeTeam.id, 'fundraising'), limit(5));
  }, [db, activeTeam?.id]);
  const { data: fundraisers } = useCollection(fundQuery);

  const upcomingItinerary = useMemo(() => {
    if (!householdEvents) return [];
    return householdEvents.filter(e => isFuture(new Date(e.endDate || e.date)) || isToday(new Date(e.endDate || e.date))).slice(0, 3);
  }, [householdEvents]);

  if (!user) return null;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Master Intelligence</Badge>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none">Command Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Status: Operational • {user.role?.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.push('/teams/new')} variant="outline" className="rounded-xl h-12 border-2 font-black uppercase text-[10px] tracking-widest">
            <Plus className="h-4 w-4 mr-2" /> New Squad
          </Button>
          <Button onClick={() => router.push('/teams/join')} className="rounded-xl h-12 px-6 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
            <UserPlus className="h-4 w-4 mr-2" /> Recruitment Hub
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <TrendingUp className="h-24 w-24" />
          </div>
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Victory Ratio</p>
            <div className="flex items-baseline gap-1">
              <p className="text-5xl font-black">{winRate}%</p>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Season trajectory</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <ClipboardCheck className="h-24 w-24" />
          </div>
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Compliance</p>
            <div className="flex items-baseline gap-1">
              <p className="text-5xl font-black">{pendingWaiversCount}</p>
              <span className="text-sm font-black text-primary uppercase">Pending</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Verified Vault</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-xl bg-white ring-1 ring-black/5 overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-5 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <Zap className="h-24 w-24 text-primary" />
          </div>
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Community</p>
            <div className="flex items-baseline gap-1">
              <p className="text-5xl font-black text-primary">{(volunteers?.length || 0) + (fundraisers?.length || 0)}</p>
              <span className="text-sm font-black text-foreground uppercase">Ops</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">Active Engagement</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-none shadow-xl bg-muted/20 overflow-hidden relative group">
          <CardContent className="p-8 space-y-2 relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Household</p>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl font-black text-foreground">${householdBalance.toLocaleString()}</p>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground opacity-40">Consolidated Balance</p>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[8px] font-black uppercase border mt-2" onClick={() => router.push('/family')}>Audit Detail</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-black uppercase tracking-tight">Mission Itinerary</h3>
              </div>
              <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest" onClick={() => router.push('/calendar')}>
                Master Calendar <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {upcomingItinerary.length > 0 ? upcomingItinerary.map((event) => (
                <Card key={event.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all group overflow-hidden bg-white cursor-pointer" onClick={() => router.push('/calendar')}>
                  <CardContent className="p-0">
                    <div className="flex items-stretch h-24">
                      <div className="w-20 bg-muted/30 flex flex-col items-center justify-center border-r shrink-0">
                        <span className="text-[8px] font-black uppercase opacity-40">{format(new Date(event.date), 'MMM')}</span>
                        <span className="text-2xl font-black">{format(new Date(event.date), 'dd')}</span>
                      </div>
                      <div className="flex-1 p-5 flex flex-col justify-center min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <Badge className="bg-primary/10 text-primary border-none text-[7px] uppercase font-black px-1.5 h-4">{event.eventType}</Badge>
                          <span className="text-[10px] font-bold text-muted-foreground">{event.startTime}</span>
                        </div>
                        <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors">{event.title}</h4>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[9px] font-medium text-muted-foreground uppercase flex items-center gap-1"><MapPin className="h-2 w-2" /> {event.location}</p>
                          <p className="text-[8px] font-black text-primary uppercase">{formatDateRange(event.date, event.endDate)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <div className="text-center py-12 bg-muted/10 rounded-3xl border-2 border-dashed opacity-40">
                  <p className="text-xs font-black uppercase tracking-widest">No active deployments</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <HandHelping className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-black uppercase tracking-tight">Community Intelligence</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden group">
                <CardHeader className="bg-primary/5 p-6 border-b flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest">Open Volunteer Ops</CardTitle>
                  <HandHelping className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {volunteers?.slice(0, 2).map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase truncate">{v.title}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">{format(new Date(v.date), 'MMM d')}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-[8px] font-black uppercase border rounded-lg" onClick={() => router.push('/volunteers')}>Claim</Button>
                    </div>
                  ))}
                  <Button variant="link" className="w-full text-[10px] font-black uppercase tracking-widest text-primary h-auto p-0" onClick={() => router.push('/volunteers')}>View Support Hub</Button>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden group">
                <CardHeader className="bg-amber-500/5 p-6 border-b flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-600">Active Fundraising</CardTitle>
                  <PiggyBank className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {fundraisers?.slice(0, 2).map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase truncate">{f.title}</p>
                        <p className="text-[8px] font-black text-amber-600 uppercase">${f.currentAmount.toLocaleString()} of ${f.goalAmount.toLocaleString()}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-3 text-[8px] font-black uppercase border rounded-lg" onClick={() => router.push('/fundraising')}>Join</Button>
                    </div>
                  ))}
                  <Button variant="link" className="w-full text-[10px] font-black uppercase tracking-widest text-amber-600 h-auto p-0" onClick={() => router.push('/fundraising')}>View Capital Hub</Button>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <Card className="rounded-[2rem] border-none shadow-2xl bg-black text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <ShieldCheck className="h-32 w-32" />
            </div>
            <CardHeader className="p-8 pb-4 relative z-10">
              <Badge className="bg-primary text-white border-none font-black text-[8px] uppercase tracking-widest px-3 h-5 w-fit">Recruitment</Badge>
              <CardTitle className="text-2xl font-black uppercase tracking-tight pt-2">Join a League</CardTitle>
              <CardDescription className="text-white/40 font-bold uppercase text-[9px] tracking-widest">Automated Enrollment</CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0 relative z-10 space-y-6">
              <p className="text-xs font-medium text-white/60 leading-relaxed italic">
                Use a coordinate league code provided by your organization manager to instantly enroll your household into competitive standings.
              </p>
              <Button onClick={() => router.push('/teams/join')} className="w-full h-12 rounded-xl bg-white text-black hover:bg-white/90 font-black uppercase text-[10px] tracking-widest shadow-xl">
                Open Portal <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-xl ring-1 ring-black/5 overflow-hidden bg-white group">
            <CardHeader className="bg-muted/30 p-6 border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <CardTitle className="text-[10px] font-black uppercase tracking-widest">Roster Compliance</CardTitle>
              </div>
              <Badge variant="outline" className="border-primary/20 text-primary font-black text-[8px] px-2 h-5">{pendingWaiversCount} PENDING</Badge>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
                Ensure all teammates have signed their liability and media release waivers before match day.
              </p>
              <Button onClick={() => router.push('/files')} variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[10px] tracking-widest border-2">
                Audit Ledger
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
