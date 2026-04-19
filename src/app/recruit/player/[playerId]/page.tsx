
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
  ChevronLeft,
  Trash2,
  Camera,
  X,
  Plus,
  RotateCcw,
  ExternalLink,
  ShieldAlert
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
  
  const [isEvalOpen, setIsEvalOpen] = useState(false); // kept for TS — not used on public page
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
  const [isYtPlaying, setIsYtPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [manualSeekTime, setManualSeekTime] = useState<number | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const isOwner = user && player && (user.uid === player.userId || user.uid === player.id);

  // Failsafe state to break out of loading if Firestore hangs
  const [loadingFailsafe, setLoadingFailsafe] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingFailsafe(true);
    }, 8000); // 8 second timeout
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setIsYtPlaying(false);
    setCurrentSegmentIndex(0);
    setManualSeekTime(null);
  }, [selectedPublicVideo]);

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

  const allPhotos = useMemo(() => {
    const manualPhotos = (profile?.photos || []).map((url: string) => ({ url, type: 'Archival' }));
    const tacticalPhotos = (videosData || []).filter((v: any) => v.type === 'photo').map((v: any) => ({ url: v.url, type: 'Tactical' }));
    return [...manualPhotos, ...tacticalPhotos];
  }, [profile?.photos, videosData]);

  useEffect(() => {
    if (playerName) {
      document.title = `${playerName} | Institutional Scout Portal`;
    } else {
      document.title = 'Elite Prospect | Institutional Scout Portal';
    }
  }, [playerName]);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const handleTacticalDownload = async (v: any) => {
    if (isDownloading) return;
    
    // If no specific start/end AND not marked as a clip, just download normally
    if (!v.isTacticalClip && (v.startAt === undefined || v.endAt === undefined)) {
      const a = document.createElement('a');
      a.href = v.url;
      a.download = `${v.title}.mp4`;
      a.click();
      return;
    }

    setIsDownloading(v.id);
    
    try {
      const video = document.createElement('video');
      // Only set anonymous if not a blob, and prepare for potential failure
      if (!v.url.startsWith('blob:')) {
        video.crossOrigin = "anonymous";
      }
      video.src = v.url;
      video.muted = true;
      video.playsInline = true;

      // Timeout for loading metadata - if it takes too long, CORS is likely blocking it
      const loadTimeout = setTimeout(() => {
        console.warn("Capture timeout - likely CORS issue. Falling back to original file.");
        downloadOriginal();
      }, 4000);

      const downloadOriginal = () => {
        clearTimeout(loadTimeout);
        const a = document.createElement('a');
        a.href = v.url;
        a.target = "_blank"; // Open in new tab as fallback
        a.download = `${v.title}.mp4`;
        a.click();
        setIsDownloading(null);
      };

      video.onloadedmetadata = () => {
        clearTimeout(loadTimeout);
        video.currentTime = v.startAt;
      };

      video.onseeked = () => {
        try {
          const stream = (video as any).captureStream();
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
          const chunks: Blob[] = [];

          mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${v.title}_tactical.webm`;
            a.click();
            URL.revokeObjectURL(url);
            setIsDownloading(null);
          };

          const duration = (v.endAt - v.startAt) * 1000;
          mediaRecorder.start();
          video.play();
          
          setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
              video.pause();
            }
          }, duration + 500);
        } catch (e) {
          console.error("MediaRecorder failed:", e);
          downloadOriginal();
        }
      };
      
      video.onerror = () => {
        downloadOriginal();
      };

    } catch (err) {
      console.error(err);
      setIsDownloading(null);
    }
  };

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

            {allPhotos.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                  <div className="bg-primary/10 p-2 rounded-xl text-primary"><Camera className="h-5 w-5" /></div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Tactical Scouting Gallery</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {allPhotos.map((p: any, i: number) => (
                    <div key={i} className="aspect-square rounded-[3rem] overflow-hidden border-2 border-white/10 shadow-2xl ring-1 ring-white/5 group relative cursor-pointer bg-zinc-900" onClick={() => setSelectedPhotoUrl(p.url)}>
                      <img src={p.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000 opacity-90 group-hover:opacity-100" alt="Tactical Capture" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-8">
                         <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{p.type} Imagery {i + 1}</span>
                            <div className="flex gap-3">
                               {!profile?.downloadsDisabled && (
                                <Button variant="secondary" size="icon" className="h-10 w-10 rounded-xl shadow-2xl bg-white text-black hover:bg-zinc-100" onClick={(e) => {
                                   e.stopPropagation();
                                   const a = document.createElement('a');
                                   a.href = p.url;
                                   a.download = `tactical_photo_${i}.jpg`;
                                   a.click();
                                }}>
                                  <Download className="h-4 w-4" />
                                </Button>
                               )}
                               <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
                                  <Plus className="h-4 w-4 text-white" />
                               </div>
                            </div>
                         </div>
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
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" alt={v.title} />
                      ) : v.url.includes('youtube.com') || v.url.includes('youtu.be') ? (
                        <img 
                          src={`https://i.ytimg.com/vi/${v.url.match(/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]{11}).*/)?.[1]}/hqdefault.jpg`} 
                          className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" 
                          alt={v.title} 
                        />
                      ) : (
                        <video src={v.url + "#t=0.5"} className="absolute inset-0 w-full h-full object-cover opacity-60" muted playsInline />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all"><Play className="h-12 w-12 text-white fill-current shadow-2xl" /></div>
                      <Badge className="absolute top-4 left-4 bg-primary text-white border-none font-black text-[8px] h-6 px-3">
                        {v.isTacticalClip ? 'TACTICAL CLIP' : v.type.toUpperCase()}
                      </Badge>
                      {v.isTacticalClip && <Zap className="absolute top-4 left-3 h-3 w-3 text-purple-600 fill-purple-600 z-10" />}
                      <div className="absolute top-4 right-4 flex gap-2">
                        {!profile?.downloadsDisabled && (
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className={cn(
                              "h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-xl bg-white/90 border-none hover:bg-white",
                              isDownloading === v.id && "opacity-100 bg-primary/20"
                            )}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleTacticalDownload(v);
                            }}
                            disabled={isDownloading === v.id}
                          >
                            {isDownloading === v.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Download className="h-4 w-4 text-primary" />}
                          </Button>
                        )}
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
                    <CardFooter className="bg-white p-5 flex-col items-start gap-1">
                      <div className="flex items-center justify-between w-full">
                        <span className="font-black text-xs uppercase truncate flex-1">{v.title}</span>
                        <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                      </div>
                      {v.description && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 w-full">{v.description}</p>
                      )}
                    </CardFooter>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-8 gap-x-12 text-center sm:text-left text-zinc-900">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">School / Institutional Body</p>
                    <p className="text-sm font-black uppercase">{profile?.school || metrics?.school || player?.school || 'TBD'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Hometown</p>
                    <p className="text-sm font-black uppercase">{profile?.hometown || player?.hometown || 'TBD'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Institutional Major</p>
                    <p className="text-sm font-black uppercase">{profile?.intendedMajor || 'Undecided'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Dominant Hand</p>
                    <p className="text-sm font-black uppercase">{profile?.dominantHand || player?.dominantHand || 'Right'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Class of</p>
                    <p className="text-sm font-black uppercase">{profile?.graduationYear || metrics?.graduationYear || player?.graduationYear || player?.gradYear || '20XX'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Verified GPA</p>
                    <p className="text-sm font-black uppercase text-primary">{profile?.academicGPA || metrics?.academicGPA || player?.gpa || '--'}</p>
                  </div>
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
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none scale-150"><Star className="h-32 w-32" /></div>
                
                {averageEval ? (
                  <div className="space-y-6 relative z-10">
                    <div className="flex justify-between items-end border-b pb-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mb-1">Institutional Pulse</p>
                        <p className="text-[8px] font-black uppercase text-muted-foreground opacity-60">Verified Coaching Staff Average</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-black text-primary leading-none">{averageEval.overall.toFixed(1)}</p>
                        <p className="text-[8px] font-black uppercase text-muted-foreground">Overall Grade</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        { label: 'Athleticism', val: averageEval.athleticism },
                        { label: 'Skill Level', val: averageEval.skillLevel },
                        { label: 'Game IQ', val: averageEval.gameIQ },
                        { label: 'Leadership', val: averageEval.leadership }
                      ].map(metric => (
                        <div key={metric.label} className="space-y-1.5">
                          <div className="flex justify-between text-[9px] font-bold uppercase tracking-tight">
                            <span className="text-zinc-600">{metric.label}</span>
                            <span className="text-primary">{metric.val.toFixed(1)}</span>
                          </div>
                          <Progress value={metric.val * 10} className="h-1.5 bg-zinc-100" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center relative z-10">
                    <div className="bg-zinc-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-zinc-100 rotate-3">
                      <Target className="h-8 w-8 text-zinc-200" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Archival Review Pending</p>
                    <p className="text-[8px] font-bold text-zinc-300 uppercase mt-1">Awaiting Authorized Staff Board</p>
                  </div>
                )}
                
                {/* Standard Lock Notice — ratings are now staff-input only */}
                <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-2xl px-5 py-4 relative z-10">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0 opacity-60" />
                  <p className="text-[9px] font-black uppercase text-primary/60 tracking-widest leading-relaxed">
                    Evaluations managed by verified Coaching Personnel
                  </p>
                </div>

                {profile?.institutionalPulse && (
                  <div className="pt-6 border-t border-black/5 space-y-4 relative z-10">
                    <div className="flex items-center gap-2">
                       <div className="h-px bg-primary/20 flex-1" />
                       <p className="text-[8px] font-black uppercase text-primary tracking-[0.3em]">Institutional Narrative</p>
                       <div className="h-px bg-primary/20 flex-1" />
                    </div>
                    <p className="text-sm font-medium italic text-foreground/70 leading-relaxed text-center px-2">"{profile.institutionalPulse}"</p>
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


      <Dialog open={!!selectedPublicVideo} onOpenChange={() => setSelectedPublicVideo(null)}>
        <DialogContent className="rounded-none sm:rounded-[3rem] w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[95vh] p-0 border-none shadow-2xl overflow-hidden bg-white flex flex-col">
          <DialogTitle className="sr-only">Public Video Viewer</DialogTitle>
          {selectedPublicVideo && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-black aspect-video shrink-0 relative flex items-center justify-center shadow-2xl z-20 sm:rounded-t-[3rem] overflow-hidden">
                {selectedPublicVideo.url ? (() => {
                    const srcUrl = selectedPublicVideo.url;
                    const isYouTube = srcUrl.includes('youtube.com') || srcUrl.includes('youtu.be');
                    const ytMatch = isYouTube ? srcUrl.match(/^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]{11}).*/) : null;
                    
                    if (isYouTube && ytMatch) {
                      const videoId = ytMatch[1];
                      let start = 0;
                      let end = 0;
                      
                      if (manualSeekTime !== null) {
                         start = Math.floor(manualSeekTime);
                      } else if (selectedPublicVideo.segments && selectedPublicVideo.segments.length > 0) {
                         const seg = selectedPublicVideo.segments[currentSegmentIndex];
                         start = Math.floor(seg.start);
                         end = Math.floor(seg.end);
                      } else if (selectedPublicVideo.startAt) {
                         start = Math.floor(selectedPublicVideo.startAt);
                         if (selectedPublicVideo.endAt) end = Math.floor(selectedPublicVideo.endAt);
                      }

                      const origin = typeof window !== 'undefined' ? window.location.origin : '';
                      const finalSrc = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&enablejsapi=1&origin=${origin}&start=${start}${end > 0 && manualSeekTime === null ? `&end=${end}` : ''}`;

                      // Manual Activation Toggle for YouTube to handle blocked embeds gracefully
                      if (!isYtPlaying) {
                        return (
                          <div 
                            className="absolute inset-0 bg-black flex flex-col items-center justify-center cursor-pointer group"
                            onClick={() => setIsYtPlaying(true)}
                          >
                            <img 
                              src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`} 
                              className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-all duration-700 blur-[2px] group-hover:blur-none"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                              }}
                              alt=""
                            />
                            <div className="relative z-20 flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500">
                              <div className="h-24 w-24 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/20 transition-all shadow-2xl">
                                <Play className="h-10 w-10 text-white fill-current translate-x-1" />
                              </div>
                              <div className="text-center space-y-1">
                                <p className="text-white font-black uppercase text-xs tracking-[0.3em] drop-shadow-lg">Activate Tactical Feed</p>
                                <p className="text-white/40 font-bold uppercase text-[8px] tracking-widest drop-shadow-lg">Cloud-Synchronized Broadcast</p>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                         <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
                           
                           <iframe 
                             key={`${selectedPublicVideo.id}_${currentSegmentIndex}_${manualSeekTime}`}
                             src={finalSrc} 
                             className="relative z-10 w-full h-full" 
                             allow="autoplay; fullscreen; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                             allowFullScreen 
                           />
                           {selectedPublicVideo.segments && selectedPublicVideo.segments.length > 1 && (
                             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 z-20">
                               <Button 
                                 size="icon" 
                                 variant="ghost" 
                                 className="h-8 w-8 text-white hover:bg-white/10 disabled:opacity-20"
                                 disabled={currentSegmentIndex === 0}
                                 onClick={() => setCurrentSegmentIndex(prev => prev - 1)}
                               >
                                 <ChevronLeft className="h-4 w-4" />
                               </Button>
                               <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                                 Segment {currentSegmentIndex + 1} of {selectedPublicVideo.segments.length}
                               </span>
                               <Button 
                                 size="icon" 
                                 variant="ghost" 
                                 className="h-8 w-8 text-white hover:bg-white/10 disabled:opacity-20"
                                 disabled={currentSegmentIndex === selectedPublicVideo.segments.length - 1}
                                 onClick={() => setCurrentSegmentIndex(prev => prev + 1)}
                                >
                                 <ChevronRight className="h-4 w-4" />
                               </Button>
                             </div>
                           )}
                         </div>
                      );
                    }

                    const cleanUrl = selectedPublicVideo.url.split('#')[0];
                    const fragment = selectedPublicVideo.startAt !== undefined && selectedPublicVideo.endAt !== undefined 
                      ? `#t=${selectedPublicVideo.startAt},${selectedPublicVideo.endAt}` 
                      : (selectedPublicVideo.segments?.length ? `#t=${selectedPublicVideo.segments[currentSegmentIndex].start},${selectedPublicVideo.segments[currentSegmentIndex].end}` : '');

                    const isTactical = !!selectedPublicVideo.isTacticalClip || selectedPublicVideo.startAt !== undefined;

                      return (
                        <video 
                          ref={videoRef}
                          src={cleanUrl + fragment} 
                          className="absolute inset-0 w-full h-full object-contain" 
                          controls={!isTactical}
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
                                       const next = currentSegmentIndex + 1;
                                       setCurrentSegmentIndex(next);
                                       v.currentTime = selectedPublicVideo.segments[next].start;
                                       v.play();
                                   } else {
                                       v.pause();
                                   }
                               }
                           } else if (selectedPublicVideo.endAt && v.currentTime >= selectedPublicVideo.endAt) {
                               v.pause();
                               v.currentTime = selectedPublicVideo.endAt;
                           }
                        }}
                      />
                    );
                })() : <div className="text-white/20 uppercase font-black text-xs tracking-widest">Resource Offline</div>}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-6 bg-zinc-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary text-white border-none font-black text-[8px] h-6 px-3">{selectedPublicVideo.type.toUpperCase()}</Badge>
                    {(selectedPublicVideo.url.includes('youtube.com') || selectedPublicVideo.url.includes('youtu.be')) && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 rounded-xl font-black uppercase text-[9px] gap-1.5 px-4 bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all active:scale-[0.98]"
                        onClick={() => window.open(selectedPublicVideo.url, '_blank')}
                      >
                        {/* Note: ExternalLink is imported at top */}
                        <ExternalLink className="h-3 w-3" /> Secure YouTube Access
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Replay button — resets the clip back to the start point */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-xl font-black uppercase text-[9px] gap-1.5 border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors"
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) {
                          const replayTime = selectedPublicVideo.segments?.length
                            ? selectedPublicVideo.segments[0].start
                            : (selectedPublicVideo.startAt ?? 0);
                          v.currentTime = replayTime;
                          setCurrentSegmentIndex(0);
                          v.play();
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3" /> Replay
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedPublicVideo(null)} className="rounded-full h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-2xl font-black uppercase tracking-tight leading-tight">{selectedPublicVideo.title}</h3>
                  {selectedPublicVideo.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedPublicVideo.description}</p>
                  )}
                  {selectedPublicVideo.segments && (
                    <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                      <p className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2">
                         <Zap className="h-3 w-3" /> Multi-Segment Scoped Highlight
                      </p>
                      <p className="text-[10px] font-bold text-primary/60 uppercase mt-1">This footage has been indexed into {selectedPublicVideo.segments.length} tactical markers.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={selectedPhotoUrl !== null} onOpenChange={(open) => !open && setSelectedPhotoUrl(null)}>
        <DialogContent className="max-w-5xl p-0 border-none bg-black/95 overflow-hidden rounded-[3rem] shadow-2xl">
            <DialogTitle className="sr-only">Tactical Imagery Viewer</DialogTitle>
            {selectedPhotoUrl && (
            <div className="relative group min-h-[500px] flex items-center justify-center bg-black">
              <img src={selectedPhotoUrl} className="w-full max-h-[90vh] object-contain shadow-2xl" alt="Strategic Capture" />
              
              <div className="absolute top-6 right-6 flex gap-4">
                 {!profile?.downloadsDisabled && (
                    <Button variant="secondary" size="icon" className="h-12 w-12 rounded-2xl bg-white text-black hover:bg-zinc-100 shadow-xl transition-all" onClick={() => {
                       const a = document.createElement('a');
                       a.href = selectedPhotoUrl;
                       a.download = `tactical_scouting_capture.jpg`;
                       a.click();
                    }}>
                       <Download className="h-5 w-5" />
                    </Button>
                 )}
                 <Button variant="ghost" size="icon" className="h-12 w-12 rounded-2xl text-white bg-white/10 backdrop-blur-md hover:bg-white/20 border border-white/10 shadow-xl" onClick={() => setSelectedPhotoUrl(null)}>
                    <X className="h-6 w-6" />
                 </Button>
              </div>

              {allPhotos.length > 1 && (
                <>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute left-6 top-1/2 -translate-y-1/2 h-14 w-14 rounded-2xl text-white bg-white/5 backdrop-blur-lg hover:bg-white/10 border border-white/5 shadow-2xl transition-all"
                    onClick={() => {
                      const currentIndex = allPhotos.findIndex(p => p.url === selectedPhotoUrl);
                      const nextIndex = (currentIndex - 1 + allPhotos.length) % allPhotos.length;
                      setSelectedPhotoUrl(allPhotos[nextIndex].url);
                    }}
                  >
                    <ChevronLeft className="h-10 w-10" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-6 top-1/2 -translate-y-1/2 h-14 w-14 rounded-2xl text-white bg-white/5 backdrop-blur-lg hover:bg-white/10 border border-white/5 shadow-2xl transition-all"
                    onClick={() => {
                      const currentIndex = allPhotos.findIndex(p => p.url === selectedPhotoUrl);
                      const nextIndex = (currentIndex + 1) % allPhotos.length;
                      setSelectedPhotoUrl(allPhotos[nextIndex].url);
                    }}
                  >
                    <ChevronRight className="h-10 w-10" />
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
