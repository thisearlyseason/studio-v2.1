
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, getDocs, orderBy, query, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
  ChevronRight,
  Camera
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
  const { user } = useUser();
  
  const [isEvalOpen, setIsEvalOpen] = useState(false);
  const [newEval, setNewEval] = useState({ athleticism: 5, skillLevel: 5, gameIQ: 5, leadership: 5 });

  const playerRef = useMemoFirebase(() => playerId ? doc(db, 'players', playerId as string) : null, [db, playerId]);
  const profileRef = useMemoFirebase(() => playerId ? doc(db, 'players', playerId as string, 'recruitingProfile', 'profile') : null, [db, playerId]);
  const metricsRef = useMemoFirebase(() => playerId ? doc(db, 'players', playerId as string, 'recruitingProfile', 'metrics') : null, [db, playerId]);
  const statsRef = useMemoFirebase(() => playerId ? collection(db, 'players', playerId as string, 'stats') : null, [db, playerId]);
  const evalsQuery = useMemoFirebase(() => playerId ? query(collection(db, 'players', playerId as string, 'evaluations'), orderBy('createdAt', 'desc')) : null, [db, playerId]);
  const videosQuery = useMemoFirebase(() => playerId ? query(collection(db, 'players', playerId as string, 'videos'), orderBy('createdAt', 'desc')) : null, [db, playerId]);

  const { data: player, isLoading: playerLoading } = useDoc(playerRef);
  const { data: profile, isLoading: profileLoading } = useDoc(profileRef);
  const { data: metrics, isLoading: metricsLoading } = useDoc(metricsRef);
  const { data: statsData, isLoading: statsLoading } = useCollection(statsRef);
  const { data: evalsData, isLoading: evalsLoading } = useCollection(evalsQuery);
  const { data: videosData, isLoading: videosLoading } = useCollection(videosQuery);

  const stats = statsData || [];
  const evals = evalsData || [];
  const videos = videosData || [];

  const [selectedPublicVideo, setSelectedPublicVideo] = useState<any>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  const isOwner = user && player && (user.uid === player.userId || user.uid === player.id);

  // Failsafe state to break out of loading if Firestore hangs
  const [loadingFailsafe, setLoadingFailsafe] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingFailsafe(true);
    }, 8000); // 8 second timeout
    return () => clearTimeout(timer);
  }, []);

  // ONLY block core UI on player loading. Sub-sections can lazy land.
  // Combine with failsafe.
  const isEssentiallyLoaded = !playerLoading || loadingFailsafe;
  const loading = !isEssentiallyLoaded || (!player && !loadingFailsafe);

  const averageEval = useMemo(() => {
    if (evals.length === 0) return null;
    const totals = evals.reduce((acc: any, curr: any) => {
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

  const playerName = useMemo(() => {
    if (loading) return "";
    
    // Check profile first as it's the primary source for the portal
    const profileName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : null;
    if (profileName) return profileName;
    if (profile?.fullName) return profile.fullName;
    
    // Then check player object
    const playerFull = player ? [player.firstName, player.lastName].filter(Boolean).join(' ') : null;
    if (playerFull) return playerFull;
    if (player?.name) return player.name;
    if (player?.displayName) return player.displayName;
    if (player?.fullName) return player.fullName;
    
    // If still nothing, use the playerId as a fallback so scouts know who it is
    if (playerId) return `Athlete ${playerId.toString().slice(-4).toUpperCase()}`;
    if (player) return "Institutional Athlete";
    
    return 'Playmaker Prospect'; // Less generic fallback
  }, [player, profile, loading, playerId]);

  useEffect(() => {
    if (playerName) {
      document.title = `${playerName} | Institutional Scout Portal`;
    } else {
      document.title = 'Elite Prospect | Institutional Scout Portal';
    }
  }, [playerName]);

  const handleAddEval = async () => {
    if (!user || (!playerId)) return;
    try {
      await addDoc(collection(db, 'players', playerId as string, 'evaluations'), {
        ...newEval,
        authorId: user.uid,
        authorName: user.displayName || user.email || 'Verified Organizer / Scout',
        createdAt: serverTimestamp()
      });
      setIsEvalOpen(false);
      setNewEval({ athleticism: 5, skillLevel: 5, gameIQ: 5, leadership: 5 });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePhoto = async (index: number) => {
    if (!isOwner || !profileRef) return;
    const newPhotos = [...(profile.photos || [])];
    newPhotos.splice(index, 1);
    const { updateDoc } = await import('firebase/firestore');
    await updateDoc(profileRef, { photos: newPhotos });
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!isOwner || !playerId) return;
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'players', playerId as string, 'videos', videoId));
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/10">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Authenticating Scout Access...</p>
    </div>
  );

  // Only block if explicitly disabled — undefined means not yet set (treat as enabled)
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

  const activeSport = profile?.typeOfSport || 'Baseball';
  const customStats = metrics?.customStats || [];

  const getSportFields = () => {
    switch (activeSport) {
      case 'Baseball': return [
        { key: 'sixtyYardDash', label: '60yd Dash (s)' }, { key: 'exitVelo', label: 'Exit Velo (mph)' },
        { key: 'throwingVelo', label: 'Throw Velo (mph)' }, { key: 'popTime', label: 'Pop Time (s)' },
        { key: 'pitchVelo', label: 'Pitch Velo (mph)' }, { key: 'infieldVelo', label: 'Infield Velo' },
        { key: 'batSpeed', label: 'Bat Speed (mph)' }, { key: 'launchAngle', label: 'Launch Angle (°)' },
        { key: 'sprintHome', label: 'Home to 1st (s)' }, { key: 'verticalJump', label: 'Vertical Jump (in)' }
      ];
      case 'Slowpitch': return [
        { key: 'exitVelo', label: 'Exit Velo (mph)' }, { key: 'batSpeed', label: 'Bat Speed (mph)' },
        { key: 'sixtyYardDash', label: '60yd Dash (s)' }, { key: 'throwingVelo', label: 'Throw Velo (mph)' },
        { key: 'launchAngle', label: 'Launch Angle (°)' }, { key: 'sprintHome', label: 'Home to 1st (s)' },
        { key: 'fieldingRange', label: 'Fielding Range' }, { key: 'armStrength', label: 'Arm Strength' },
        { key: 'verticalJump', label: 'Vertical Jump (in)' }, { key: 'reactionTime', label: 'Reaction (ms)' }
      ];
      case 'Football': return [
        { key: 'fortyYardDash', label: '40yd Dash (s)' }, { key: 'verticalJump', label: 'Vertical Jump (in)' },
        { key: 'benchPress', label: 'Bench Press (reps)' }, { key: 'broadJump', label: 'Broad Jump (in)' },
        { key: 'threeConeDrill', label: '3-Cone Drill (s)' }, { key: 'twentyYardShuttle', label: '20yd Shuttle (s)' },
        { key: 'squat', label: 'Squat (lbs)' }, { key: 'powerClean', label: 'Power Clean (lbs)' },
        { key: 'throwingVelo', label: 'Throw Velo (mph)' }, { key: 'wingspan', label: 'Wingspan (in)' }
      ];
      case 'Soccer': return [
        { key: 'shuttleRun', label: 'Shuttle Run (s)' }, { key: 'beepTest', label: 'Beep Test Level' },
        { key: 'verticalJump', label: 'Vertical Jump (in)' }, { key: 'fortyYardDash', label: '40yd Dash (s)' },
        { key: 'sprintSpeed', label: 'Sprint Speed (mph)' }, { key: 'vo2Max', label: 'VO2 Max' },
        { key: 'passingAcc', label: 'Passing Acc (%)' }, { key: 'shotPower', label: 'Shot Power (mph)' },
        { key: 'dribbleSpeed', label: 'Dribble Speed' }, { key: 'reactionTime', label: 'Reaction (ms)' }
      ];
      case 'Tennis': return [
        { key: 'serveVelo', label: 'Serve Velo (mph)' }, { key: 'forehandVelo', label: 'Forehand (mph)' },
        { key: 'backhandVelo', label: 'Backhand (mph)' }, { key: 'footworkDrill', label: 'Footwork (s)' },
        { key: 'reactionTime', label: 'Reaction (ms)' }, { key: 'sprintSpeed', label: 'Sprint Speed (mph)' },
        { key: 'agility', label: 'Agility Rating' }, { key: 'firstServePerc', label: '1st Serve %' },
        { key: 'rallyConsist', label: 'Rally Consist.' }, { key: 'verticalJump', label: 'Vertical Jump (in)' }
      ];
      case 'Pickleball': return [
        { key: 'serveVelo', label: 'Serve Velo (mph)' }, { key: 'forehandVelo', label: 'Forehand (mph)' },
        { key: 'footworkDrill', label: 'Footwork (s)' }, { key: 'reactionTime', label: 'Reaction (ms)' },
        { key: 'dinkAccuracy', label: 'Dink Acc (%)' }, { key: 'driveSpeed', label: 'Drive Speed (mph)' },
        { key: 'agility', label: 'Agility Rating' }, { key: 'sprintSpeed', label: 'Sprint Speed (mph)' },
        { key: 'verticalJump', label: 'Vertical Jump (in)' }, { key: 'handSpeed', label: 'Hand Speed' }
      ];
      case 'Golf': return [
        { key: 'clubSpeed', label: 'Club Speed (mph)' }, { key: 'ballSpeed', label: 'Ball Speed (mph)' },
        { key: 'smashFactor', label: 'Smash Factor' }, { key: 'spinRate', label: 'Spin Rate (rpm)' },
        { key: 'carryDistance', label: 'Carry Dist (yds)' }, { key: 'launchAngle', label: 'Launch Angle (°)' },
        { key: 'attackAngle', label: 'Attack Angle (°)' }, { key: 'clubPath', label: 'Club Path (°)' },
        { key: 'faceAngle', label: 'Face Angle (°)' }, { key: 'dynamicLoft', label: 'Dynamic Loft (°)' }
      ];
      case 'Custom':
      default: return [
        { key: 'agility', label: 'Agility (1-10)' }, { key: 'strength', label: 'Strength (1-10)' },
        { key: 'sprint', label: 'Sprint (s)' }, { key: 'verticalJump', label: 'Vertical Jump (in)' },
        { key: 'reactionTime', label: 'Reaction (ms)' }, { key: 'endurance', label: 'Endurance (1-10)' },
        { key: 'flexibility', label: 'Flexibility (1-10)' }, { key: 'explosiveness', label: 'Explosiveness' },
        { key: 'coordination', label: 'Coordination' }, { key: 'balance', label: 'Balance (1-10)' }
      ];
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24 text-white">
      {/* NAV */}
      <nav className="border-b border-white/5 bg-black/80 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center px-6 md:px-12 justify-between">
        <div className="flex items-center gap-6">
          <BrandLogo variant="dark-background" className="h-8 w-32" />
          <div className="hidden md:flex items-center gap-2 text-zinc-500 font-black text-[10px] uppercase tracking-widest">
            <span className="h-1 w-1 rounded-full bg-zinc-800" />
            {playerName}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-primary/20 text-primary border border-primary/30 font-black text-[8px] tracking-widest uppercase h-6 px-3">{activeSport.toUpperCase()} · SCOUT PORTAL</Badge>
          <Badge className="bg-white text-black border-none font-black text-[8px] tracking-widest uppercase h-6 px-3 shadow-lg">VERIFIED PROSPECT</Badge>
        </div>
      </nav>

      <main className="container mx-auto px-4 md:px-12 py-12 max-w-7xl space-y-12">
        {/* HERO */}
        <section className="relative overflow-hidden rounded-[3rem] shadow-2xl" style={{background: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #0d0d0d 100%)'}}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none"><Zap className="h-96 w-96" /></div>
          {/* Sport accent bar */}
          <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
          <div className="flex flex-col lg:flex-row items-center gap-12 p-10 lg:p-16 relative z-10">
            <div className="relative shrink-0">
              <div className="h-48 w-48 lg:h-64 lg:w-64 rounded-[3rem] border-2 border-white/10 shadow-2xl overflow-hidden bg-white/5 flex items-center justify-center ring-1 ring-primary/20">
                {profile?.photoURL || player?.photoURL ? <img src={profile?.photoURL || player?.photoURL} className="w-full h-full object-cover" alt={playerName} /> : <User className="h-24 w-24 opacity-10" />}
              </div>
              <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-primary text-white border-none font-black text-[10px] h-8 px-6 shadow-xl shadow-primary/30 whitespace-nowrap">CLASS OF {profile?.graduationYear || '20XX'}</Badge>
            </div>
            
            <div className="flex-1 text-center lg:text-left space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/80 mb-3">Institutional Recruiting Pack</p>
                <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-none uppercase text-white">{playerName}</h1>
                <p className="text-primary font-black uppercase tracking-[0.2em] text-lg mt-2">
                  {profile?.primaryPosition || player.position} {profile?.secondaryPosition ? ` / ${profile.secondaryPosition}` : ''} • #{profile?.jerseyNumber || player.jersey || '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Height', val: profile?.height || '--' },
                  { label: 'Weight', val: profile?.weight ? `${profile.weight} lbs` : '--' },
                  { label: 'GPA', val: profile?.academicGPA || '--', accent: true },
                  { label: 'School', val: player.school || 'Unlisted' },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 rounded-2xl p-4 border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{item.label}</p>
                    <p className={`text-lg font-black truncate ${item.accent ? 'text-primary' : 'text-white'}`}>{item.val}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2">
                <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">{profile?.teamName || player.clubName || 'Elite Academy'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-4">
                <Button className="rounded-xl h-12 px-8 font-black uppercase text-[10px] bg-primary text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"><Download className="h-4 w-4 mr-2" /> Download Pack</Button>
                <Button variant="outline" className="rounded-xl h-12 px-8 font-black uppercase text-[10px] border-white/20 bg-white/5 hover:bg-white/10 text-white"><Share2 className="h-4 w-4 mr-2" /> Copy Link</Button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-12">

            {profile?.photos && profile.photos.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Camera className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Scouting Gallery</h2></div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  {profile.photos.map((url: string, i: number) => (
                    <div key={i} className="aspect-square rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl ring-1 ring-black/5 group relative">
                      <img src={url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt="Scouting" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                         <Button variant="secondary" size="icon" className="h-12 w-12 rounded-2xl shadow-2xl bg-white text-black hover:bg-zinc-100" onClick={(e) => {
                            e.stopPropagation();
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `scouting_photo_${i}.jpg`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                         }}>
                           <Download className="h-6 w-6" />
                         </Button>
                         {isOwner && (
                           <Button variant="destructive" size="icon" className="h-12 w-12 rounded-2xl shadow-2xl" onClick={() => handleDeletePhoto(i)}>
                             <Trash2 className="h-6 w-6" />
                           </Button>
                         )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Video className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Highlight Reels</h2></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {videos.length > 0 ? videos.map((v: any, i) => (
                  <Card key={i} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-black group cursor-pointer relative" onClick={() => setSelectedPublicVideo(v)}>
                    <div className="aspect-video relative">
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all"><Play className="h-12 w-12 text-white fill-current shadow-2xl" /></div>
                      <Badge className="absolute top-4 left-4 bg-primary text-white border-none font-black text-[8px] h-6 px-3">{v.type.toUpperCase()}</Badge>
                      <div className="absolute top-4 right-4 flex gap-2">
                        <Button 
                           variant="outline" 
                           size="icon" 
                           className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-xl bg-white/90 border-none hover:bg-white"
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             const a = document.createElement('a');
                             a.href = v.url;
                             a.download = `${v.title}.mp4`;
                             document.body.appendChild(a);
                             a.click();
                             document.body.removeChild(a);
                           }}
                         >
                            <Download className="h-4 w-4 text-primary" />
                         </Button>
                        {isOwner && (
                           <Button 
                             variant="destructive" 
                             size="icon" 
                             className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-xl"
                             onClick={(e) => { e.stopPropagation(); handleDeleteVideo(v.id); }}
                           >
                              <Trash2 className="h-4 w-4" />
                           </Button>
                        )}
                      </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-8 gap-x-12 text-center sm:text-left">
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">School / Institutional Body</p><p className="text-sm font-black uppercase">{profile?.school || player.school || 'TBD'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Hometown</p><p className="text-sm font-black uppercase">{profile?.hometown || 'TBD'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Institutional Major</p><p className="text-sm font-black uppercase">{profile?.intendedMajor || 'Undecided'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Dominant Hand</p><p className="text-sm font-black uppercase">{profile?.dominantHand || 'Right'}</p></div>
                  <div className="space-y-1"><p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Class of</p><p className="text-sm font-black uppercase">{profile?.graduationYear || '20XX'}</p></div>
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
                  <div className="py-12 text-center opacity-20"><Target className="h-10 w-10 mx-auto mb-2" /><p className="text-[9px] font-black uppercase">Pending Official Review (Awaiting Scouts)</p></div>
                )}
                
                {user ? (
                  <Button variant="outline" className="w-full mt-4 rounded-xl border-dashed border-2 hover:bg-black hover:text-white transition-colors h-14 font-black uppercase text-[10px]" onClick={() => setIsEvalOpen(true)}>
                    <Target className="h-4 w-4 mr-2" /> Submit Authorized Evaluation
                  </Button>
                ) : (
                  <Button disabled variant="outline" className="w-full mt-4 rounded-xl border-dashed border-2 opacity-50 h-14 font-black uppercase text-[10px]">
                    <Lock className="h-4 w-4 mr-2" /> Log In (Scout/Organizer) to Evaluate
                  </Button>
                )}

                {profile?.institutionalPulse && (
                  <div className="pt-6 border-t border-black/5 space-y-3">
                    <p className="text-[8px] font-black uppercase text-primary tracking-widest">Institutional Narrative</p>
                    <p className="text-xs font-medium italic text-foreground/70 leading-relaxed">"{profile.institutionalPulse}"</p>
                  </div>
                )}
              </Card>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-3 px-2"><div className="bg-primary/10 p-2 rounded-xl text-primary"><Zap className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Athletic Metrics ({activeSport})</h2></div>
              <div className="grid grid-cols-2 gap-4">
                {getSportFields().map(f => (
                  <Card key={f.key} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 text-center space-y-1">
                    <p className="text-[8px] font-black uppercase opacity-40">{f.label}</p>
                    <p className="text-xl font-black text-primary">{metrics?.[f.key] || '--'}</p>
                  </Card>
                ))}
                {customStats.map((cs: any, i: number) => (
                  <Card key={`cs-${i}`} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 text-center space-y-1">
                    <p className="text-[8px] font-black uppercase opacity-40">{cs.label || 'Custom'}</p>
                    <p className="text-xl font-black text-primary">{cs.value || '--'}</p>
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

      <Dialog open={isEvalOpen} onOpenChange={setIsEvalOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-md p-8 border-none shadow-2xl bg-white text-black">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Post Evaluation</DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest font-black opacity-50">Authorized Scout / Organizer Review</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {[
              { key: 'athleticism', label: 'Athleticism' },
              { key: 'skillLevel', label: 'Skill Level' },
              { key: 'gameIQ', label: 'Game IQ' },
              { key: 'leadership', label: 'Leadership' }
            ].map(m => (
              <div key={m.key} className="space-y-3">
                <div className="flex justify-between items-center"><Label className="text-[10px] font-black uppercase">{m.label}</Label><span className="font-black text-primary text-sm">{(newEval as any)[m.key]} / 10</span></div>
                <Slider min={1} max={10} step={1} value={[(newEval as any)[m.key]]} onValueChange={(val) => setNewEval({...newEval, [m.key]: val[0]})} />
              </div>
            ))}
          </div>
          <DialogFooter className="mt-8">
            <Button variant="ghost" className="rounded-xl font-black uppercase text-[10px] h-12 px-6" onClick={() => setIsEvalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEval} className="rounded-xl px-8 font-black uppercase text-[10px] bg-primary text-white h-12 shadow-xl shadow-primary/20">Submit Appraisal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPublicVideo} onOpenChange={() => setSelectedPublicVideo(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-4xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          <DialogTitle className="sr-only">Public Video Viewer</DialogTitle>
          {selectedPublicVideo && (
            <div className="flex flex-col">
              <div className="bg-black aspect-video relative flex items-center justify-center shadow-inner">
                {selectedPublicVideo.url ? (() => {
                    let srcUrl = selectedPublicVideo.url;
                    const ytMatch = srcUrl.match(/(?:v=|\/|embed\/|youtu.be\/)([^&?#/]{11})/);
                    
                    if (ytMatch) {
                      const videoId = ytMatch[1];
                      srcUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                      if (selectedPublicVideo.startAt) {
                        srcUrl += `&start=${Math.floor(selectedPublicVideo.startAt)}`;
                        if (selectedPublicVideo.endAt) srcUrl += `&end=${Math.floor(selectedPublicVideo.endAt)}`;
                      }
                      return <iframe src={srcUrl} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen" allowFullScreen />;
                    }

                    return (
                      <video 
                        src={selectedPublicVideo.url.split('#')[0]} 
                        className="absolute inset-0 w-full h-full object-contain" 
                        controls 
                        autoPlay 
                        onLoadedMetadata={(e) => {
                           if (selectedPublicVideo.segments && selectedPublicVideo.segments.length > 0) {
                               setCurrentSegmentIndex(0);
                               e.currentTarget.currentTime = selectedPublicVideo.segments[0].start;
                           } else if (selectedPublicVideo.startAt) {
                               e.currentTarget.currentTime = selectedPublicVideo.startAt;
                           }
                        }}
                        onTimeUpdate={(e) => {
                           const v = e.currentTarget;
                           if (selectedPublicVideo.segments && selectedPublicVideo.segments.length > 0) {
                               const seg = selectedPublicVideo.segments[currentSegmentIndex];
                               if (v.currentTime >= seg.end) {
                                   if (currentSegmentIndex < selectedPublicVideo.segments.length - 1) {
                                       setCurrentSegmentIndex(currentSegmentIndex + 1);
                                       v.currentTime = selectedPublicVideo.segments[currentSegmentIndex + 1].start;
                                       v.play();
                                   } else { v.pause(); }
                               }
                           } else if (selectedPublicVideo.endAt && v.currentTime >= selectedPublicVideo.endAt) {
                               v.pause();
                           }
                        }}
                      />
                    );
                })() : <div className="text-white/20 uppercase font-black text-xs tracking-widest">Resource Offline</div>}
              </div>
              <div className="p-8 space-y-2 border-t">
                <div className="flex items-center justify-between">
                  <Badge className="bg-primary text-white border-none font-black text-[8px] h-6 px-3">{selectedPublicVideo.type.toUpperCase()}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedPublicVideo(null)} className="rounded-full h-8 w-8"><Zap className="h-4 w-4" /></Button>
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">{selectedPublicVideo.title}</h3>
                {selectedPublicVideo.segments && (
                   <p className="text-[10px] font-black uppercase text-primary tracking-widest">Multi-Segment Highlight Reel Sequence</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
