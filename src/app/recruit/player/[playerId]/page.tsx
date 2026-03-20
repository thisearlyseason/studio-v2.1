
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, collection, getDocs, orderBy, query, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  Target, 
  Zap, 
  Star, 
  MapPin, 
  Video, 
  Download, 
  Share2, 
  ArrowRight,
  GraduationCap,
  Award,
  BarChart2,
  Clock,
  Play,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Info,
  Loader2,
  ChevronRight
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

// CRITICAL BUILD FIX: Next.js 15 build safety for dynamic routes
export const dynamic = 'force-dynamic';

export default function PublicScoutPortalPage() {
  const { playerId } = useParams();
  const db = useFirestore();

  const [profile, setProfile] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [evals, setEvaluations] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadScoutData() {
      if (!playerId || !db) return;
      setLoading(true);
      try {
        const [playerSnap, pSnap, mSnap, sSnap, eSnap, vSnap] = await Promise.all([
          getDoc(doc(db, 'players', playerId as string)),
          getDoc(doc(db, 'players', playerId as string, 'recruitingProfile', 'profile')),
          getDoc(doc(db, 'players', playerId as string, 'recruitingProfile', 'metrics')),
          getDocs(query(collection(db, 'players', playerId as string, 'recruitingProfile', 'stats'))),
          getDocs(query(collection(db, 'players', playerId as string, 'evaluations'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'players', playerId as string, 'videos'), orderBy('createdAt', 'desc')))
        ]);

        if (playerSnap.exists()) setPlayer(playerSnap.data());
        if (pSnap.exists()) setProfile(pSnap.data());
        if (mSnap.exists()) setMetrics(mSnap.data());
        setStats(sSnap.docs.map(d => d.data()));
        setEvaluations(eSnap.docs.map(d => d.data()));
        setVideos(vSnap.docs.map(d => d.data()));
      } catch (e) {
        console.error("Scout Pack Load Failure:", e);
      } finally {
        setLoading(false);
      }
    }
    loadScoutData();
  }, [playerId, db]);

  const averageEval = useMemo(() => {
    if (evals.length === 0) return null;
    const totals = evals.reduce((acc, curr) => {
      acc.athleticism += curr.athleticism || 0;
      acc.skillLevel += curr.skillLevel || 0;
      acc.gameIQ += curr.gameIQ || 0;
      acc.leadership += curr.leadership || 0;
      return acc;
    }, { athleticism: 0, skillLevel: 0, gameIQ: 0, leadership: 0 });
    return {
      athleticism: totals.athleticism / evals.length,
      skillLevel: totals.skillLevel / evals.length,
      gameIQ: totals.gameIQ / evals.length,
      leadership: totals.leadership / evals.length,
      overall: (totals.athleticism + totals.skillLevel + totals.gameIQ + totals.leadership) / (evals.length * 4)
    };
  }, [evals]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/10">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Authenticating Scout Access...</p>
    </div>
  );

  if (!player || player.recruitingProfileEnabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10">
        <Card className="max-w-md w-full text-center p-12 rounded-[3rem] border-none shadow-2xl bg-white">
          <Lock className="h-16 w-16 text-primary mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Profile Locked</h2>
          <p className="text-muted-foreground font-medium mt-2">This athlete's institutional recruiting pack is currently private or inactive.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/5 pb-24">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center px-6 md:px-12 justify-between">
        <BrandLogo variant="light-background" className="h-8 w-32" />
        <Badge className="bg-primary text-white border-none font-black text-[8px] tracking-widest uppercase h-6 px-3 shadow-lg">Verified Prospect</Badge>
      </nav>

      <main className="container mx-auto px-4 md:px-12 py-12 max-w-7xl space-y-12">
        <section className="bg-black text-white rounded-[3rem] overflow-hidden shadow-2xl relative">
          <div className="absolute top-0 right-0 p-12 opacity-10 -rotate-12 pointer-events-none"><Zap className="h-64 w-64" /></div>
          <div className="flex flex-col lg:flex-row items-center gap-12 p-10 lg:p-16 relative z-10">
            <div className="relative group shrink-0">
              <div className="h-48 w-48 lg:h-64 lg:w-64 rounded-[3rem] border-4 border-white/10 shadow-2xl overflow-hidden bg-white/5 flex items-center justify-center">
                {player.photoURL ? <img src={player.photoURL} className="w-full h-full object-cover" alt="Athlete" /> : <User className="h-24 w-24 opacity-20" />}
              </div>
              <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-primary text-white border-none font-black text-[10px] h-8 px-6 shadow-xl whitespace-nowrap">CLASS OF {profile?.graduationYear || '20XX'}</Badge>
            </div>
            
            <div className="flex-1 text-center lg:text-left space-y-6">
              <div className="space-y-2">
                <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-none uppercase">{player.firstName} {player.lastName}</h1>
                <p className="text-primary font-black uppercase tracking-[0.3em] text-xl">{profile?.primaryPosition || player.position} • #{player.jersey || 'HQ'}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm font-bold uppercase tracking-widest">
                <div className="space-y-1"><p className="opacity-40 text-[8px]">Height</p><p className="text-lg font-black">{profile?.height || '--'}</p></div>
                <div className="space-y-1"><p className="opacity-40 text-[8px]">Weight</p><p className="text-lg font-black">{profile?.weight || '--'} lbs</p></div>
                <div className="space-y-1"><p className="opacity-40 text-[8px]">GPA</p><p className="text-lg font-black text-primary">{profile?.academicGPA || '--'}</p></div>
                <div className="space-y-1"><p className="opacity-40 text-[8px]">School</p><p className="text-lg font-black truncate max-w-[150px]">{player.school || 'Unlisted'}</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-4">
                <Button className="rounded-xl h-12 px-8 font-black uppercase text-[10px] bg-white text-black hover:bg-primary hover:text-white transition-all shadow-xl"><Download className="h-4 w-4 mr-2" /> Download Pack</Button>
                <Button variant="outline" className="rounded-xl h-12 px-8 font-black uppercase text-[10px] border-white/20 bg-white/5 hover:bg-white/10 text-white"><Share2 className="h-4 w-4 mr-2" /> Copy Link</Button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-12">
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Video className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Highlight Reels</h2></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {videos.length > 0 ? videos.map((v, i) => (
                  <Card key={i} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-black group cursor-pointer">
                    <div className="aspect-video relative">
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all"><Play className="h-12 w-12 text-white fill-current shadow-2xl" /></div>
                      <Badge className="absolute top-4 left-4 bg-primary text-white border-none font-black text-[8px] h-6 px-3">{v.type.toUpperCase()}</Badge>
                    </div>
                    <CardFooter className="bg-white p-6 justify-between"><span className="font-black text-xs uppercase">{v.title}</span><ChevronRight className="h-4 w-4 text-primary" /></CardFooter>
                  </Card>
                )) : (
                  <div className="col-span-full py-24 bg-white rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center text-center opacity-20"><Video className="h-12 w-12 mb-4" /><p className="text-sm font-black uppercase tracking-widest">Film Under Archival</p></div>
                )}
              </div>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Info className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Athlete Overview</h2></div>
              <Card className="rounded-[3rem] border-none shadow-xl bg-white p-10 space-y-8">
                <div className="bg-muted/20 p-8 rounded-[2rem] border-2 border-dashed relative">
                  <span className="absolute -top-3 left-6 bg-white px-2 text-[8px] font-black uppercase text-primary tracking-widest">Narrative Bio</span>
                  <p className="text-base font-medium italic leading-relaxed text-foreground/80">"{profile?.bio || "No tactical narrative established."}"</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Hometown</p><p className="text-sm font-black uppercase">{profile?.hometown || 'TBD'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Intended Major</p><p className="text-sm font-black uppercase">{profile?.intendedMajor || 'Undecided'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Dominant Hand</p><p className="text-sm font-black uppercase">{profile?.dominantHand || 'Right'}</p></div>
                </div>
              </Card>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><BarChart2 className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Seasonal Analytics</h2></div>
              <Card className="rounded-[3rem] border-none shadow-xl bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                      <tr><th className="px-8 py-5">Season</th><th className="px-4 py-5 text-center">GP</th><th className="px-4 py-5 text-center">PTS</th><th className="px-4 py-5 text-center">AST</th><th className="px-8 py-5 text-right">EFF</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {stats.map((s, i) => (
                        <tr key={i} className="hover:bg-primary/5 transition-colors">
                          <td className="px-8 py-6 font-black text-sm uppercase">{s.season}</td>
                          <td className="px-4 py-6 text-center font-bold">{s.gamesPlayed}</td>
                          <td className="px-4 py-6 text-center font-black text-primary">{s.points}</td>
                          <td className="px-4 py-6 text-center font-bold">{s.assists}</td>
                          <td className="px-8 py-6 text-right font-black text-sm">{Math.round((s.points + s.assists) / s.gamesPlayed)} AVG</td>
                        </tr>
                      ))}
                      {stats.length === 0 && <tr><td colSpan={5} className="py-12 text-center opacity-30 italic text-xs uppercase font-black">No seasonal records posted.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </div>

          <aside className="lg:col-span-4 space-y-12">
            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-black p-2 rounded-xl text-white shadow-lg"><Star className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Institutional Pulse</h2></div>
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-8">
                {averageEval ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-end"><p className="text-[10px] font-black uppercase text-muted-foreground opacity-40">Scout Average</p><p className="text-4xl font-black text-primary">{averageEval.overall.toFixed(1)}/10</p></div>
                    <div className="space-y-4">
                      {[
                        { label: 'Athleticism', val: averageEval.athleticism },
                        { label: 'Skill Level', val: averageEval.skillLevel },
                        { label: 'Game IQ', val: averageEval.gameIQ },
                        { label: 'Leadership', val: averageEval.leadership }
                      ].map(metric => (
                        <div key={metric.label} className="space-y-1.5">
                          <div className="flex justify-between text-[8px] font-black uppercase"><span>{metric.label}</span><span>{metric.val.toFixed(1)}</span></div>
                          <Progress value={metric.val * 10} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center opacity-20"><Target className="h-10 w-10 mx-auto mb-2" /><p className="text-[9px] font-black uppercase">Pending Official Review</p></div>
                )}
              </Card>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Zap className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Athletic Metrics</h2></div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: '40yd Dash', val: metrics?.fortyYardDash ? `${metrics.fortyYardDash}s` : '--' },
                  { label: 'Vertical', val: metrics?.verticalJump ? `${metrics.verticalJump}"` : '--' },
                  { label: 'Wingspan', val: metrics?.wingspan ? `${metrics.wingspan}"` : '--' },
                  { label: 'Bench', val: metrics?.benchPress ? `${metrics.benchPress} lbs` : '--' }
                ].map(m => (
                  <Card key={m.label} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 text-center space-y-1">
                    <p className="text-[8px] font-black uppercase opacity-40">{m.label}</p>
                    <p className="text-xl font-black text-primary">{m.val}</p>
                  </Card>
                ))}
              </div>
              {metrics?.verified && (
                <div className="bg-green-50 p-4 rounded-2xl border-2 border-dashed border-green-200 flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  <p className="text-[9px] font-black uppercase text-green-700">Metrics Verified by Command Staff</p>
                </div>
              )}
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Mail className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Contact Request</h2></div>
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white p-8 space-y-6 overflow-hidden relative">
                <div className="absolute inset-0 bg-primary opacity-5" />
                <div className="relative z-10 space-y-4">
                  <p className="text-xs font-medium text-white/60 leading-relaxed italic">Direct contact details are restricted to verified institutional scouts and professional agencies.</p>
                  <Button className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-primary hover:text-white transition-all">Request Credentials</Button>
                </div>
              </Card>
            </section>
          </aside>
        </div>
      </main>

      <footer className="text-center py-12 border-t opacity-30 space-y-2">
        <BrandLogo variant="light-background" className="h-6 w-24 mx-auto" />
        <p className="text-[8px] font-black uppercase tracking-[0.3em]">Institutional Recruiting Pipeline v1.0 • verified athletic portfolio</p>
      </footer>
    </div>
  );
}
