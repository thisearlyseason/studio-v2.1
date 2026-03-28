"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  ShieldCheck, 
  CalendarDays, 
  Users, 
  Zap, 
  Plus, 
  UserPlus, 
  ClipboardCheck, 
  HandHelping, 
  PiggyBank, 
  Activity,
  ChevronRight,
  TrendingUp,
  FileText,
  MapPin,
  ArrowRight,
  Star
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, isFuture, isToday, isSameDay, isSameMonth } from 'date-fns';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, limit } from 'firebase/firestore';
import { usePendingWaivers } from '@/hooks/use-pending-waivers';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function UniversalAccountDashboard() {
  const { 
    user, activeTeam, activeTeamEvents, 
    householdBalance, isYouth
  } = useTeam();
  const router = useRouter();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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

  const { pendingDocs } = usePendingWaivers();
  const pendingWaiversCount = pendingDocs.length;
  // Create a state to control the dialog so it doesn't get stuck if the user cancels
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  
  useEffect(() => {
    if (pendingWaiversCount > 0) {
      setShowWaiverModal(true);
    } else {
      setShowWaiverModal(false);
    }
  }, [pendingWaiversCount]);

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
    if (!activeTeamEvents || !Array.isArray(activeTeamEvents)) return [];
    const futureEvents = activeTeamEvents.filter(e => isFuture(new Date(e.date)) || isToday(new Date(e.date)));
    if (futureEvents.length > 0) return futureEvents.slice(0, 3);
    
    // Fallback to most recent events if no future events exist (useful for demo team)
    return [...activeTeamEvents].reverse().slice(0, 3);
  }, [activeTeamEvents]);

  if (!mounted || !user) return (
    <div className="flex flex-col items-center justify-center py-20 animate-pulse">
      <div className="h-12 w-12 bg-primary/10 rounded-full mb-4" />
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Synchronizing Dashboard...</p>
    </div>
  );

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3">Master Intelligence</Badge>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none text-foreground">Command Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Status: Operational • {user.role?.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isYouth && (
            <>
              <Button onClick={() => router.push('/teams/new')} variant="outline" className="rounded-xl h-12 border-2 font-black uppercase text-[10px] text-foreground">
                <Plus className="h-4 w-4 mr-2" /> New Squad
              </Button>
              <Button onClick={() => router.push('/teams/join')} className="rounded-xl h-12 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20">
                <UserPlus className="h-4 w-4 mr-2" /> Recruitment Hub
              </Button>
            </>
          )}
          {isYouth && (
            <Button onClick={() => router.push('/settings')} variant="outline" className="rounded-xl h-12 border-2 font-black uppercase text-[10px] text-foreground">
              <Activity className="h-4 w-4 mr-2" /> Athlete Profile
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] shadow-xl bg-primary text-white p-8 space-y-2 relative overflow-hidden group">
          <TrendingUp className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Victory Ratio</p>
          <p className="text-5xl font-black">{winRate}%</p>
        </Card>
        <Card className="rounded-[2.5rem] shadow-xl bg-black text-white p-8 space-y-2 relative overflow-hidden group">
          <ClipboardCheck className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Compliance</p>
          <div className="flex items-baseline gap-1"><p className="text-5xl font-black">{pendingWaiversCount}</p><span className="text-sm font-black text-primary uppercase">Pending</span></div>
        </Card>
        <Card className="rounded-[2.5rem] shadow-xl bg-white p-8 space-y-2 ring-1 ring-black/5 relative overflow-hidden group">
          <Zap className="absolute -right-4 -bottom-4 h-24 w-24 text-primary opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <p className="text-[10px] font-black uppercase text-muted-foreground">Community</p>
          <div className="flex items-baseline gap-1"><p className="text-5xl font-black text-primary">{(volunteers?.length || 0) + (fundraisers?.length || 0)}</p><span className="text-sm font-black text-foreground uppercase">Ops</span></div>
        </Card>
        {isYouth ? (
          <Card className="rounded-[2.5rem] shadow-xl bg-muted/20 p-8 space-y-2 relative overflow-hidden group">
            <Star className="absolute -right-4 -bottom-4 h-24 w-24 text-primary opacity-5 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
            <p className="text-[10px] font-black uppercase text-muted-foreground">Recruitment</p>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl font-black text-foreground">Active</p>
              <span className="text-[8px] font-black uppercase text-primary tracking-widest bg-primary/10 px-2 py-0.5 rounded-full ml-2">Visible</span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[8px] font-black uppercase border mt-2 text-foreground" onClick={() => router.push('/settings')}>Review Profile</Button>
          </Card>
        ) : (
          <Card className="rounded-[2.5rem] shadow-xl bg-muted/20 p-8 space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground">Household</p>
            <p className="text-3xl font-black text-foreground">${householdBalance.toLocaleString()}</p>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[8px] font-black uppercase border mt-2 text-foreground" onClick={() => router.push('/family')}>Audit Detail</Button>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Mission Itinerary</h3></div>
              <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-foreground" onClick={() => router.push('/calendar')}>Master Calendar <ChevronRight className="h-3 w-3 ml-1" /></Button>
            </div>
            {upcomingItinerary.length > 0 ? upcomingItinerary.map((event) => {
              const startD = new Date(event.date);
              const endD = event.endDate ? new Date(event.endDate) : startD;
              const isMultiDay = !isSameDay(startD, endD);

              return (
                <Card key={event.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all group overflow-hidden bg-white cursor-pointer" onClick={() => router.push('/calendar')}>
                  <div className="flex items-stretch h-24">
                    <div className={cn(
                      "w-20 bg-muted/30 flex flex-col items-center justify-center border-r shrink-0 transition-colors group-hover:bg-primary/5",
                      isMultiDay && "w-28"
                    )}>
                      {!isSameMonth(startD, endD) ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[8px] font-black uppercase opacity-40 text-foreground leading-none">{format(startD, 'MMM')} - {format(endD, 'MMM')}</span>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xl font-black text-foreground leading-none">{format(startD, 'dd')}</span>
                            <span className="text-xs font-black opacity-20">-</span>
                            <span className="text-xl font-black text-primary leading-none">{format(endD, 'dd')}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-[8px] font-black uppercase opacity-40 text-foreground">{format(startD, 'MMM')}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-2xl font-black text-foreground">{format(startD, 'dd')}</span>
                            {isMultiDay && (
                              <>
                                <span className="text-xs font-black opacity-20">-</span>
                                <span className="text-2xl font-black text-primary">{format(endD, 'dd')}</span>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex-1 p-5 flex flex-col justify-center min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <Badge className="bg-primary/10 text-primary border-none text-[7px] uppercase font-black px-1.5 h-4">{event.eventType}</Badge>
                        <span className="text-[10px] font-bold text-muted-foreground">{event.startTime}</span>
                      </div>
                      <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
                    </div>
                  </div>
                </Card>
              );
            }) : (
              <div className="text-center py-12 bg-muted/10 rounded-3xl border-2 border-dashed opacity-40"><p className="text-xs font-black uppercase tracking-widest text-foreground">No active deployments</p></div>
            )}
          </section>
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2"><HandHelping className="h-5 w-5 text-primary" /><h3 className="text-xl font-black uppercase text-foreground">Community Intelligence</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="rounded-[2rem] border-none shadow-md bg-white p-6 space-y-4">
                <p className="text-[10px] font-black uppercase text-foreground">Open Volunteer Ops</p>
                {volunteers && volunteers.length > 0 ? volunteers.slice(0, 2).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between gap-4">
                    <p className="text-xs font-black uppercase truncate text-foreground">{v.title}</p>
                    <Button size="sm" variant="ghost" className="h-7 text-[8px] font-black border uppercase" onClick={() => router.push('/volunteers')}>Claim</Button>
                  </div>
                )) : (
                  <div className="text-center py-4 bg-muted/10 rounded-xl border border-dashed"><p className="text-[10px] font-bold text-muted-foreground uppercase">No open ops</p></div>
                )}
              </Card>
              <Card className="rounded-[2rem] border-none shadow-md bg-white p-6 space-y-4">
                <p className="text-[10px] font-black uppercase text-foreground">Active Fundraising</p>
                {fundraisers && fundraisers.length > 0 ? fundraisers.slice(0, 2).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between gap-4">
                    <p className="text-xs font-black uppercase truncate text-foreground">{f.title}</p>
                    <Button size="sm" variant="ghost" className="h-7 text-[8px] font-black border uppercase" onClick={() => router.push('/fundraising')}>Join</Button>
                  </div>
                )) : (
                  <div className="text-center py-4 bg-muted/10 rounded-xl border border-dashed"><p className="text-[10px] font-bold text-muted-foreground uppercase">No active campaigns</p></div>
                )}
              </Card>
            </div>
          </section>
        </div>
        <aside className="space-y-8">
          <Card className="rounded-[2rem] bg-black text-white p-8 space-y-6 relative overflow-hidden group">
            <ShieldCheck className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 h-32 w-32 group-hover:scale-110 transition-transform duration-700" />
            <h3 className="text-2xl font-black uppercase tracking-tight">Join a League</h3>
            <p className="text-xs text-white/60 font-medium leading-relaxed italic">Enter a coordinate league code provided by your organization manager to instantly enroll your household into competitive standings.</p>
            <Button onClick={() => router.push('/teams/join')} className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] shadow-xl">Open Portal <ArrowRight className="ml-2 h-5 w-5" /></Button>
          </Card>
          <Card className="rounded-[2rem] shadow-xl bg-white p-6 space-y-4 ring-1 ring-black/5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><CardTitle className="text-[10px] font-black uppercase text-foreground">Roster Compliance</CardTitle></div><p className="text-[10px] font-medium text-muted-foreground leading-relaxed">Ensure all teammates have signed their liability and media release waivers before match day.</p><Button onClick={() => router.push('/files')} variant="outline" className="w-full h-10 rounded-xl font-black uppercase text-[10px] border-2">Audit Ledger</Button></Card>
        </aside>
      </div>

      <AlertDialog open={showWaiverModal} onOpenChange={setShowWaiverModal}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl p-8 max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto bg-red-100 p-4 rounded-full w-max mb-4">
              <ShieldCheck className="h-8 w-8 text-red-600" />
            </div>
            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight text-center">Action Required</AlertDialogTitle>
            <AlertDialogDescription className="text-center font-medium text-muted-foreground mt-2">
              You have <span className="font-black text-foreground">{pendingWaiversCount} unsigned institutional document(s)</span> requiring immediate attention.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex-col sm:flex-col gap-3">
            <AlertDialogAction asChild className="w-full h-14 rounded-xl text-sm font-black uppercase text-white tracking-widest bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all">
              <Button onClick={() => router.push('/files')}>Review & Sign Now</Button>
            </AlertDialogAction>
            <AlertDialogCancel className="w-full h-12 rounded-xl text-xs font-bold uppercase tracking-widest border-none hover:bg-muted transition-all">
              Remind Me Later
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
