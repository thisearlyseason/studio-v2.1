"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTeam, TeamDocument, Member, PlayerProfile, RecruitingProfile, AthleticMetrics, PlayerStat, PlayerEvaluation, RecruitingContact, PlayerVideo, VideoComment, TeamIncident } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { 
  Plus, 
  Trash2, 
  Target, 
  ChevronLeft, 
  ChevronRight, 
  Edit3, 
  Download, 
  Search, 
  Play, 
  Share2, 
  Clock, 
  Building, 
  CheckCircle2, 
  Settings, 
  Sparkles, 
  UserPlus, 
  Database,
  ArrowRight,
  ShieldCheck,
  FileText,
  Bookmark,
  Signature,
  Users,
  MessageSquare,
  AlertTriangle,
  PenTool, 
  FileSignature,
  Loader2,
  ShieldAlert,
  Info,
  Shield,
  Trophy,
  Video,
  ExternalLink,
  BarChart2,
  Star,
  ArrowUpRight,
  AlertCircle,
  Activity,
  History,
  ClipboardList,
  X,
  Save,
  Link as LinkIcon,
  Eye,
  Zap,
  Link2,
  Copy
} from 'lucide-react';
import { generateBrandedPDF } from '@/lib/pdf-utils';
import { collection, query, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';


import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FundraisingManager } from '@/components/coaches-corner/FundraisingManager';

const DEFAULT_PROTOCOLS = [
  { id: 'default_medical', title: 'Medical Clearance', type: 'waiver' },
  { id: 'default_travel', title: 'Travel Consent', type: 'waiver' },
  { id: 'default_parental', title: 'Parental Waiver', type: 'waiver' },
  { id: 'default_photography', title: 'Photography Release', type: 'waiver' },
  { id: 'default_tournament', title: 'Tournament Waiver', type: 'tournament_waiver' },
  { id: 'default_universal_hub', title: 'Universal Hub Release', type: 'waiver' }
];

function RecruitingProfileManager({ member }: { member: Member }) {
  const { 
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, 
    updateAthleticMetrics, getPlayerStats, addPlayerStat, deletePlayerStat,
    getEvaluations, addEvaluation, getRecruitingContact, updateRecruitingContact,
    getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo, toggleRecruitingProfile
  } = useTeam();
  const { user } = useTeam();

  const [profile, setProfile] = useState<Partial<RecruitingProfile>>({});
  const [metrics, setMetrics] = useState<Partial<AthleticMetrics>>({});
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [evals, setEvaluations] = useState<PlayerEvaluation[]>([]);
  const [contact, setContact] = useState<Partial<RecruitingContact>>({});
  const [videos, setVideos] = useState<PlayerVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddFilmOpen, setIsAddFilmOpen] = useState(false);
  const [filmTitle, setFilmTitle] = useState('');
  const [filmUrl, setFilmUrl] = useState('');
  const [filmType, setFilmType] = useState('Highlight');
  const [selectedVideo, setSelectedVideo] = useState<PlayerVideo | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentTimestamp, setCommentTimestamp] = useState('');

  const loadData = useCallback(async () => {
    if (!member.playerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, m, s, e, c, v] = await Promise.all([
        getRecruitingProfile(member.playerId),
        getAthleticMetrics(member.playerId),
        getPlayerStats(member.playerId),
        getEvaluations(member.playerId),
        getRecruitingContact(member.playerId),
        getPlayerVideos(member.playerId)
      ]);
      if (p) setProfile(p);
      if (m) setMetrics(m);
      setStats(s);
      setEvaluations(e);
      if (c) setContact(c);
      setVideos(v);
    } catch (error) {
      console.error("Error loading athlete pack:", error);
    } finally {
      setLoading(false);
    }
  }, [member.playerId, getRecruitingProfile, getAthleticMetrics, getPlayerStats, getEvaluations, getRecruitingContact, getPlayerVideos]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpdateProfile = async () => {
    if (!member.playerId) return;
    await updateRecruitingProfile(member.playerId, profile);
    await updateAthleticMetrics(member.playerId, metrics);
    await updateRecruitingContact(member.playerId, contact);
    // Sync the portal gate with the pipeline status:
    // "active" or "committed" => enable the public scout portal
    // "hidden" (or unset)     => disable it
    const isEnabled = profile.status === 'active' || profile.status === 'committed';
    await toggleRecruitingProfile(member.playerId, isEnabled);
    setIsEditing(false);
    toast({ title: "Recruiting Pack Synchronized" });
  };

  const handleAddFilm = async () => {
    if (!member.playerId || !filmUrl) return;
    await addPlayerVideo(member.playerId, { title: filmTitle || 'Untitled', url: filmUrl, type: filmType, comments: [] });
    setFilmTitle(''); setFilmUrl(''); setFilmType('Highlight');
    setIsAddFilmOpen(false);
    await loadData();
    toast({ title: "Film Archived", description: `${filmTitle || 'Clip'} added to highlight reel.` });
  };

  if (loading) return <div className="p-12 text-center animate-pulse"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /><p className="text-[10px] font-black uppercase mt-4">Opening Tactical Folder...</p></div>;

  if (!member.playerId) {
    return (
      <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center space-y-6 bg-muted/10 border-2 border-dashed rounded-[3rem] p-10">
        <ShieldAlert className="h-16 w-16 text-destructive opacity-40" />
        <div>
          <h3 className="text-xl font-black uppercase">Identity Link Missing</h3>
          <p className="text-xs font-bold uppercase tracking-widest mt-1 text-muted-foreground max-w-xs mx-auto">
            This member does not have a linked player profile. Ensure they joined via a valid recruitment link.
          </p>
        </div>
      </div>
    );
  }

  const activeSport = profile.typeOfSport || 'Baseball';
  const customStats = metrics.customStats || [];

  const onChangeMetric = (key: string, v: string) => setMetrics({ ...metrics, [key]: parseFloat(v) || 0 });
  const onChangeTextMetric = (key: string, v: string) => setMetrics({ ...metrics, [key]: v });
  
  const addCustomStat = () => setMetrics({...metrics, customStats: [...customStats, { label: '', value: '' }]});
  const updateCustomStat = (index: number, field: 'label' | 'value', val: string) => {
    const newStats = [...customStats];
    newStats[index][field] = val;
    setMetrics({...metrics, customStats: newStats});
  };
  const removeCustomStat = (index: number) => {
    const newStats = [...customStats];
    newStats.splice(index, 1);
    setMetrics({...metrics, customStats: newStats});
  };

  const getSportFields = () => {
    switch (activeSport) {
      case 'Baseball': return [
        { key: 'sixtyYardDash', label: '60yd Dash (s)', type: 'number' }, { key: 'exitVelo', label: 'Exit Velo (mph)', type: 'number' },
        { key: 'throwingVelo', label: 'Throw Velo (mph)', type: 'number' }, { key: 'popTime', label: 'Pop Time (s)', type: 'number' },
        { key: 'pitchVelo', label: 'Pitch Velo (mph)', type: 'number' }, { key: 'infieldVelo', label: 'Infield Velo', type: 'number' },
        { key: 'batSpeed', label: 'Bat Speed (mph)', type: 'number' }, { key: 'launchAngle', label: 'Launch Angle (°)', type: 'number' },
        { key: 'sprintHome', label: 'Home to 1st (s)', type: 'number' }, { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' }
      ];
      case 'Slowpitch': return [
        { key: 'exitVelo', label: 'Exit Velo (mph)', type: 'number' }, { key: 'batSpeed', label: 'Bat Speed (mph)', type: 'number' },
        { key: 'sixtyYardDash', label: '60yd Dash (s)', type: 'number' }, { key: 'throwingVelo', label: 'Throw Velo (mph)', type: 'number' },
        { key: 'launchAngle', label: 'Launch Angle (°)', type: 'number' }, { key: 'sprintHome', label: 'Home to 1st (s)', type: 'number' },
        { key: 'fieldingRange', label: 'Fielding Range', type: 'number' }, { key: 'armStrength', label: 'Arm Strength', type: 'number' },
        { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' }, { key: 'reactionTime', label: 'Reaction (ms)', type: 'number' }
      ];
      case 'Football': return [
        { key: 'fortyYardDash', label: '40yd Dash (s)', type: 'number' }, { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' },
        { key: 'benchPress', label: 'Bench Press (reps)', type: 'number' }, { key: 'broadJump', label: 'Broad Jump (in)', type: 'number' },
        { key: 'threeConeDrill', label: '3-Cone Drill (s)', type: 'number' }, { key: 'twentyYardShuttle', label: '20yd Shuttle (s)', type: 'number' },
        { key: 'squat', label: 'Squat (lbs)', type: 'number' }, { key: 'powerClean', label: 'Power Clean (lbs)', type: 'number' },
        { key: 'throwingVelo', label: 'Throw Velo (mph)', type: 'number' }, { key: 'wingspan', label: 'Wingspan (in)', type: 'number' }
      ];
      case 'Soccer': return [
        { key: 'shuttleRun', label: 'Shuttle Run (s)', type: 'number' }, { key: 'beepTest', label: 'Beep Test Level', type: 'number' },
        { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' }, { key: 'fortyYardDash', label: '40yd Dash (s)', type: 'number' },
        { key: 'sprintSpeed', label: 'Sprint Speed (mph)', type: 'number' }, { key: 'vo2Max', label: 'VO2 Max', type: 'number' },
        { key: 'passingAcc', label: 'Passing Acc (%)', type: 'number' }, { key: 'shotPower', label: 'Shot Power (mph)', type: 'number' },
        { key: 'dribbleSpeed', label: 'Dribble Speed', type: 'number' }, { key: 'reactionTime', label: 'Reaction (ms)', type: 'number' }
      ];
      case 'Tennis': return [
        { key: 'serveVelo', label: 'Serve Velo (mph)', type: 'number' }, { key: 'forehandVelo', label: 'Forehand (mph)', type: 'number' },
        { key: 'backhandVelo', label: 'Backhand (mph)', type: 'number' }, { key: 'footworkDrill', label: 'Footwork (s)', type: 'number' },
        { key: 'reactionTime', label: 'Reaction (ms)', type: 'number' }, { key: 'sprintSpeed', label: 'Sprint Speed (mph)', type: 'number' },
        { key: 'agility', label: 'Agility Rating', type: 'number' }, { key: 'firstServePerc', label: '1st Serve %', type: 'number' },
        { key: 'rallyConsist', label: 'Rally Consist.', type: 'number' }, { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' }
      ];
      case 'Pickleball': return [
        { key: 'serveVelo', label: 'Serve Velo (mph)', type: 'number' }, { key: 'forehandVelo', label: 'Forehand (mph)', type: 'number' },
        { key: 'footworkDrill', label: 'Footwork (s)', type: 'number' }, { key: 'reactionTime', label: 'Reaction (ms)', type: 'number' },
        { key: 'dinkAccuracy', label: 'Dink Acc (%)', type: 'number' }, { key: 'driveSpeed', label: 'Drive Speed (mph)', type: 'number' },
        { key: 'agility', label: 'Agility Rating', type: 'number' }, { key: 'sprintSpeed', label: 'Sprint Speed (mph)', type: 'number' },
        { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' }, { key: 'handSpeed', label: 'Hand Speed', type: 'number' }
      ];
      case 'Golf': return [
        { key: 'clubSpeed', label: 'Club Speed (mph)', type: 'number' }, { key: 'ballSpeed', label: 'Ball Speed (mph)', type: 'number' },
        { key: 'smashFactor', label: 'Smash Factor', type: 'number' }, { key: 'spinRate', label: 'Spin Rate (rpm)', type: 'number' },
        { key: 'carryDistance', label: 'Carry Dist (yds)', type: 'number' }, { key: 'launchAngle', label: 'Launch Angle (°)', type: 'number' },
        { key: 'attackAngle', label: 'Attack Angle (°)', type: 'number' }, { key: 'clubPath', label: 'Club Path (°)', type: 'number' },
        { key: 'faceAngle', label: 'Face Angle (°)', type: 'number' }, { key: 'dynamicLoft', label: 'Dynamic Loft (°)', type: 'number' }
      ];
      case 'Custom':
      default: return [
        { key: 'agility', label: 'Agility (1-10)', type: 'number' }, { key: 'strength', label: 'Strength (1-10)', type: 'number' },
        { key: 'sprint', label: 'Sprint (s)', type: 'number' }, { key: 'verticalJump', label: 'Vertical Jump (in)', type: 'number' },
        { key: 'reactionTime', label: 'Reaction (ms)', type: 'number' }, { key: 'endurance', label: 'Endurance (1-10)', type: 'number' },
        { key: 'flexibility', label: 'Flexibility (1-10)', type: 'number' }, { key: 'explosiveness', label: 'Explosiveness', type: 'number' },
        { key: 'coordination', label: 'Coordination', type: 'number' }, { key: 'balance', label: 'Balance (1-10)', type: 'number' }
      ];
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between border-b pb-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/10">
            <AvatarImage src={member.avatar} />
            <AvatarFallback className="font-black">{member.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight">{member.name}</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{member.position} • #{member.jersey}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl h-10 border-2 font-black uppercase text-[10px]" onClick={() => window.open(`/recruit/player/${member.playerId}`, '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" /> Scout Portal
          </Button>
          <Button className="rounded-xl h-10 px-6 font-black uppercase text-[10px]" onClick={() => setIsEditing(true)}><Edit3 className="h-4 w-4 mr-2" /> Edit Pack</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <section className="md:col-span-2 space-y-8">
          <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-muted/30 p-6 border-b"><CardTitle className="text-xs font-black uppercase tracking-widest">Athletic Pulse</CardTitle></CardHeader>
            <CardContent className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-muted/20 p-4 rounded-2xl text-center space-y-1">
                <p className="text-[8px] font-black uppercase opacity-40">GPA</p>
                <p className="text-xl font-black text-primary">{profile.academicGPA || '--'}</p>
              </div>
              {getSportFields().map(f => (
                <div key={f.key} className="bg-muted/20 p-4 rounded-2xl text-center space-y-1">
                  <p className="text-[8px] font-black uppercase opacity-40">{f.label}</p>
                  <p className="text-xl font-black text-primary">{metrics[f.key] || '--'}</p>
                </div>
              ))}
              {customStats.map((cs: any, i: number) => (
                <div key={`cs-${i}`} className="bg-muted/20 p-4 rounded-2xl text-center space-y-1">
                  <p className="text-[8px] font-black uppercase opacity-40">{cs.label || 'Custom'}</p>
                  <p className="text-xl font-black text-primary">{cs.value || '--'}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-muted/30 p-6 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-widest">Highlight Reel</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-[8px] font-black uppercase" onClick={() => setIsAddFilmOpen(true)}><Plus className="h-3 w-3 mr-1" /> Add Film</Button>
            </CardHeader>
            <CardContent className="p-6">
              {videos.length > 0 ? (
                <div className="space-y-3">
                  {videos.map(v => (
                    <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 cursor-pointer group" onClick={() => setSelectedVideo(v)}>
                      <div className="h-16 w-24 bg-black rounded-xl shrink-0 flex items-center justify-center relative overflow-hidden">
                        <Play className="h-6 w-6 text-white fill-current opacity-60" />
                        <Badge className="absolute top-1 left-1 bg-primary text-white border-none text-[6px] font-black uppercase px-1.5 h-4">{v.type}</Badge>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs uppercase truncate">{v.title}</p>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">{(v.comments?.length || 0)} coach mark{(v.comments?.length || 0) !== 1 ? 's' : ''}</p>
                      </div>
                      <MessageSquare className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center opacity-20"><Video className="h-10 w-10 mx-auto mb-2" /><p className="text-[10px] font-black uppercase">No film archived.</p></div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none"><Target className="h-24 w-24" /></div>
            <div className="relative z-10 space-y-4">
              <Badge className="bg-primary text-white border-none font-black text-[8px] h-5 px-3">PIPELINE STATUS</Badge>
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full shrink-0 ${
                  profile.status === 'active' ? 'bg-green-400 shadow-lg shadow-green-400/50' :
                  profile.status === 'committed' ? 'bg-primary shadow-lg shadow-primary/50' :
                  'bg-white/20'
                }`} />
                <h4 className="text-xl font-black uppercase">
                  {profile.status === 'active' ? 'Active Prospect' :
                   profile.status === 'committed' ? 'Committed' :
                   profile.status === 'hidden' ? 'Inactive / Private' : 'Not Set'}
                </h4>
              </div>
              <p className="text-[10px] font-bold text-white/40 leading-relaxed">
                {profile.status === 'hidden' ? 'Scout portal is private. Set to Active to enable.' : 'Scout portal is visible to verified recruiters.'}
              </p>
            </div>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white p-6 space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Bio</h4>
            <p className="text-xs font-medium text-muted-foreground leading-relaxed italic line-clamp-4">"{profile.bio || 'No strategic narrative established for this athlete.'}"</p>
          </Card>
        </aside>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="rounded-[3rem] sm:max-w-4xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogTitle className="sr-only">Recruiting Pack Architect</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Pack Architect</DialogTitle>
              <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest mt-1">Institutional Recruiting Portfolio Synchronization</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 text-foreground">
              <div className="space-y-8">
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Identity & Status</h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Type of Sport</Label>
                        <Select value={activeSport} onValueChange={(v: any) => setProfile({...profile, typeOfSport: v})}>
                          <SelectTrigger className="h-12 border-2 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="Baseball" className="font-bold">Baseball</SelectItem>
                            <SelectItem value="Slowpitch" className="font-bold">Slowpitch</SelectItem>
                            <SelectItem value="Soccer" className="font-bold">Soccer</SelectItem>
                            <SelectItem value="Football" className="font-bold">Football</SelectItem>
                            <SelectItem value="Tennis" className="font-bold">Tennis</SelectItem>
                            <SelectItem value="Pickleball" className="font-bold">Pickleball</SelectItem>
                            <SelectItem value="Golf" className="font-bold">Golf</SelectItem>
                            <SelectItem value="Custom" className="font-bold">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Pipeline Status</Label>
                        <Select value={profile.status ?? ''} onValueChange={(v: any) => setProfile({...profile, status: v})}>
                          <SelectTrigger className="h-12 border-2 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="active" className="font-bold">Active Prospect</SelectItem>
                            <SelectItem value="hidden" className="font-bold">Inactive/Private</SelectItem>
                            <SelectItem value="committed" className="font-bold">Committed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Height</Label><Input value={profile.height ?? ''} onChange={e => setProfile({...profile, height: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Weight (lbs)</Label><Input value={profile.weight ?? ''} onChange={e => setProfile({...profile, weight: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="flex items-center justify-between ml-1 mb-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Athletic Pulse ({activeSport})</h3>
                    <Button size="sm" variant="outline" className="h-6 text-[8px] font-black uppercase rounded-lg" onClick={addCustomStat}><Plus className="h-3 w-3 mr-1" /> Add Custom Stat</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {getSportFields().map(f => (
                      <div key={f.key} className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">{f.label}</Label>
                        <Input type={f.type} value={metrics[f.key] ?? ''} onChange={e => onChangeMetric(f.key, e.target.value)} className="h-12 border-2 rounded-xl font-bold" />
                      </div>
                    ))}
                  </div>
                  
                  {customStats.length > 0 && (
                    <div className="space-y-3 mt-4">
                      {customStats.map((cs: any, i: number) => (
                        <div key={`cs-${i}`} className="flex items-center gap-2">
                          <Input placeholder="Stat Name" value={cs.label} onChange={e => updateCustomStat(i, 'label', e.target.value)} className="h-10 border-2 rounded-xl font-bold flex-1" />
                          <Input placeholder="Value" value={cs.value} onChange={e => updateCustomStat(i, 'value', e.target.value)} className="h-10 border-2 rounded-xl font-bold flex-1" />
                          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-red-500 rounded-xl hover:bg-red-50" onClick={() => removeCustomStat(i)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-8">
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Narrative & Academics</h3>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Academic GPA</Label><Input type="number" step="0.01" value={profile.academicGPA ?? ''} onChange={e => setProfile({...profile, academicGPA: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase ml-1">Athletic Narrative</Label>
                      <Textarea value={profile.bio ?? ''} onChange={e => setProfile({...profile, bio: e.target.value})} className="min-h-[150px] border-2 rounded-2xl font-medium p-4 resize-none" placeholder="Recruiting summary..." />
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleUpdateProfile}>Commit Pack Synchronization</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ADD FILM DIALOG ── */}
      <Dialog open={isAddFilmOpen} onOpenChange={setIsAddFilmOpen}>
        <DialogContent className="rounded-[3rem] sm:max-w-lg p-0 border-none shadow-2xl overflow-hidden bg-white">
          <div className="bg-black text-white p-8 space-y-2">
            <DialogTitle className="font-black text-xl uppercase tracking-tight">Archive Film</DialogTitle>
            <DialogDescription className="text-white/40 text-[10px] font-black uppercase tracking-widest">Add a highlight clip to this athlete&apos;s reel.</DialogDescription>
          </div>
          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Clip Title</Label>
              <Input placeholder="e.g. Spring Showcase – Pitching" className="h-12 rounded-2xl border-2 font-bold" value={filmTitle} onChange={e => setFilmTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Video URL</Label>
              <Input placeholder="https://youtu.be/..." className="h-12 rounded-2xl border-2 font-bold" value={filmUrl} onChange={e => setFilmUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest">Category</Label>
              <Select value={filmType} onValueChange={setFilmType}>
                <SelectTrigger className="h-12 rounded-2xl border-2 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Highlight">Highlight</SelectItem>
                  <SelectItem value="fullGame">Full Game</SelectItem>
                  <SelectItem value="skills">Skills / Drills</SelectItem>
                  <SelectItem value="practice">Practice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="p-8 pt-0 gap-2">
            <Button variant="ghost" onClick={() => setIsAddFilmOpen(false)} className="rounded-2xl font-black uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleAddFilm} disabled={!filmUrl} className="rounded-2xl font-black uppercase text-[10px] px-8 shadow-lg shadow-primary/20">Archive Film</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── VIDEO VIEWER + COMMENT DIALOG ── */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-4xl p-0 border-none shadow-2xl overflow-hidden bg-white">
          {selectedVideo && (
            <>
              <div className="bg-black aspect-video relative flex items-center justify-center">
                {selectedVideo.url ? (
                  <iframe
                    src={selectedVideo.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    className="absolute inset-0 w-full h-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 opacity-30">
                    <Video className="h-16 w-16 text-white" />
                    <p className="text-white text-xs font-black uppercase">No URL provided</p>
                  </div>
                )}
                <div className="absolute top-4 left-4">
                  <Badge className="bg-primary text-white border-none font-black text-[8px] uppercase">{selectedVideo.type}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x max-h-[60vh]">
                <div className="md:col-span-3 p-8 space-y-4 overflow-y-auto">
                  <h3 className="font-black text-lg uppercase">{selectedVideo.title}</h3>
                  <div className="space-y-3">
                    {(selectedVideo.comments || []).length === 0 && (
                      <p className="text-xs font-black uppercase opacity-30 py-6 text-center">No coach marks yet.</p>
                    )}
                    {(selectedVideo.comments || []).map((c: VideoComment, i: number) => (
                      <div key={i} className="flex gap-3 p-4 bg-muted/20 rounded-2xl">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {c.timestamp != null && (
                            <span className="text-[8px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full mr-2">
                              {Math.floor(c.timestamp / 60)}:{String(c.timestamp % 60).padStart(2, '0')}
                            </span>
                          )}
                          <p className="text-xs font-bold mt-1">{c.text}</p>
                          <p className="text-[9px] text-muted-foreground font-black uppercase mt-1">{c.authorName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2 p-8 space-y-4 bg-muted/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Add Coach Mark</p>
                  <div className="space-y-3">
                    <Input
                      placeholder="Timestamp (e.g. 1:24)"
                      className="h-10 rounded-xl border-2 font-bold text-xs"
                      value={commentTimestamp}
                      onChange={e => setCommentTimestamp(e.target.value)}
                    />
                    <Textarea
                      placeholder="e.g. Great hip rotation on this swing..."
                      className="rounded-xl border-2 font-medium text-xs min-h-[100px] resize-none"
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                    />
                    <Button
                      className="w-full rounded-xl font-black uppercase text-[10px] shadow-lg shadow-primary/20"
                      onClick={async () => {
                        if (!newComment || !selectedVideo?.id || !member.playerId) return;
                        const parts = commentTimestamp.split(':');
                        const secs = parts.length === 2 ? parseInt(parts[0]) * 60 + parseInt(parts[1]) : undefined;
                        const newC: VideoComment = {
                          id: `c_${Date.now()}`,
                          text: newComment,
                          timestamp: secs,
                          authorName: user?.name || 'Coach',
                          createdAt: new Date().toISOString()
                        };
                        const updated = { ...selectedVideo, comments: [...(selectedVideo.comments || []), newC] };
                        await updatePlayerVideo(member.playerId, selectedVideo.id, updated);
                        setSelectedVideo(updated);
                        setVideos((prev: PlayerVideo[]) => prev.map((v: PlayerVideo) => v.id === selectedVideo.id ? updated : v));
                        setNewComment('');
                        setCommentTimestamp('');
                        toast({ title: "Mark Saved" });
                      }}
                      disabled={!newComment}
                    >
                      <Bookmark className="h-3 w-3 mr-2" /> Save Mark
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncidentDetailDialog({ incident, isOpen, onOpenChange }: { incident: TeamIncident | null, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { activeTeam } = useTeam();
  if (!incident) return null;

  const handleDownloadPDF = () => {
    generateBrandedPDF({
      title: "SQUAD SAFETY REPORT",
      subtitle: "INSTITUTIONAL ARCHIVE RECORD",
      filename: `INCIDENT_REPORT_${incident.date}_${incident.title.replace(/\s+/g, '_')}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Severity Label
      const severity = incident.severity || 'routine';
      const sevColors: Record<string, [number, number, number]> = {
        'critical': [220, 38, 38],
        'severe': [234, 88, 12],
        'moderate': [202, 138, 4],
        'minor': [22, 163, 74],
        'routine': [100, 100, 100]
      };
      const [r, g, b] = sevColors[severity.toLowerCase()] || [100, 100, 100];
      
      doc.setFillColor(r, g, b);
      doc.roundedRect(pageWidth - 60, startY - 25, 40, 8, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(severity.toUpperCase(), pageWidth - 40, startY - 20, { align: 'center' });

      // --- Content Section: Case Summary ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text("CASE SUMMARY: " + incident.title.toUpperCase(), 20, startY);
      
      doc.setDrawColor(230, 230, 230);
      doc.line(20, startY + 3, pageWidth - 20, startY + 3);
      
      // --- Metadata Grid ---
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("REPORT DATE", 20, startY + 13);
      doc.text("INCIDENT DATE", 75, startY + 13);
      doc.text("LOCATION", 130, startY + 13);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(new Date().toLocaleDateString(), 20, startY + 18);
      doc.text(`${incident.date} ${incident.time || ''}`, 75, startY + 18);
      doc.text(incident.location || 'TBD', 130, startY + 18);

      // --- Technical Specs ---
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("ENVIRONMENT", 20, startY + 25);
      doc.text("APPARATUS / EQUIPMENT", 75, startY + 25);
      doc.text("REPORTED TO", 130, startY + 25);
      
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(incident.weatherConditions || 'Recorded Environment', 20, startY + 29);
      doc.text(incident.equipmentInvolved || 'N/A', 75, startY + 29);
      doc.text(incident.reportedTo || 'Staff Registry', 130, startY + 29);

      // --- Primary Narrative ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text("FACTUAL NARRATIVE", 20, startY + 40);
      
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(incident.description, pageWidth - 40);
      doc.text(descLines, 20, startY + 48);
      
      let currentY = startY + 48 + (descLines.length * 6);
      
      // Involved Personnel
      if (incident.involvedPeople) {
        currentY += 10;
        doc.setFont('helvetica', 'bold');
        doc.text("INVOLVED PERSONNEL", 20, currentY);
        currentY += 8;
        doc.setFont('helvetica', 'normal');
        doc.text(incident.involvedPeople, 20, currentY);
      }
      
      // Immediate Treatment
      if (incident.treatmentProvided) {
        currentY += 15;
        doc.setFont('helvetica', 'bold');
        doc.text("TREATMENT & IMMEDIATE PROTOCOL", 20, currentY);
        currentY += 8;
        doc.setFont('helvetica', 'normal');
        const treatmentLines = doc.splitTextToSize(incident.treatmentProvided, pageWidth - 40);
        doc.text(treatmentLines, 20, currentY);
        currentY += (treatmentLines.length * 6);
      }
      
      // Witnesses
      currentY += 15;
      doc.setFont('helvetica', 'bold');
      doc.text("WITNESSES", 20, currentY);
      currentY += 8;
      doc.setFont('helvetica', 'normal');
      doc.text(incident.witnesses || 'None recorded', 20, currentY);
      
      // Tactical Actions
      currentY += 15;
      doc.setFont('helvetica', 'bold');
      doc.text("FOLLOW-UP ACTIONS TAKEN", 20, currentY);
      currentY += 8;
      doc.setFont('helvetica', 'normal');
      const actionLines = doc.splitTextToSize(incident.actionsTaken || 'Standard safety protocols applied.', pageWidth - 40);
      doc.text(actionLines, 20, currentY);
      currentY += (actionLines.length * 6);

      return currentY + 20;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[3.5rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-2xl bg-white text-foreground">
        <DialogTitle className="sr-only">Incident Audit: {incident.title}</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><ShieldAlert className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight truncate">{incident.title}</DialogTitle>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{incident.date} {incident.time} • {incident.location}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={cn(
                  "border-none font-black text-[10px] uppercase px-4 h-7 shrink-0",
                  incident.emergencyServicesCalled ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "bg-muted text-muted-foreground"
                )}>
                  {incident.emergencyServicesCalled ? 'Critical Alert' : 'Routine Log'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Factual Narrative</h4>
                <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed">
                  <p className="text-sm font-medium leading-relaxed italic text-foreground/80 leading-relaxed">"{incident.description}"</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Environmental Context</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-muted/20 rounded-xl border-2 space-y-1">
                    <p className="text-[7px] font-black uppercase text-muted-foreground">Conditions</p>
                    <p className="text-[10px] font-bold uppercase">{incident.weatherConditions || 'Archived'}</p>
                  </div>
                  <div className="p-4 bg-muted/20 rounded-xl border-2 space-y-1">
                    <p className="text-[7px] font-black uppercase text-muted-foreground">Apparatus</p>
                    <p className="text-[10px] font-bold uppercase truncate">{incident.equipmentInvolved || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Treatment Records</h4>
                <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/10 shadow-inner">
                  <p className="text-sm font-bold leading-relaxed text-foreground/80">{incident.treatmentProvided || 'Standard site protocols followed.'}</p>
                </div>
              </div>

              <Card className="bg-black text-white rounded-[2.5rem] p-6 space-y-4 relative overflow-hidden group border-none">
                <ShieldCheck className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
                <div className="space-y-2 relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Severity Classification</p>
                  <p className="text-xl font-black uppercase">{incident.severity || 'Minor'}</p>
                </div>
                {incident.followUpRequired && (
                  <Badge className="bg-amber-400 text-black border-none font-black text-[8px] uppercase px-3 h-5">Action Items Pending</Badge>
                )}
              </Card>
            </div>
          </div>

          <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1 h-14 rounded-2xl border-2 font-black uppercase text-xs tracking-widest transition-all hover:bg-muted" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button className="flex-1 h-14 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" /> Download Institutional PDF
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function SafetyHub() {
  const { activeTeam, isStaff, addIncident, db } = useTeam();
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingIncident, setViewingIncident] = useState<TeamIncident | null>(null);
  
  const [form, setForm] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    location: '',
    description: '',
    emergencyServicesCalled: false,
    severity: 'minor',
    witnesses: '',
    witnessesList: [
      { name: '', phone: '', email: '' },
      { name: '', phone: '', email: '' },
      { name: '', phone: '', email: '' },
    ],
    involvedPeople: '',
    involvedPersonnel: [
      { name: '', phone: '', email: '' },
      { name: '', phone: '', email: '' },
      { name: '', phone: '', email: '' },
    ],
    treatmentProvided: '',
    followUpRequired: false,
    actionsTaken: '',
    reportedTo: '',
    equipmentInvolved: '',
    weatherConditions: 'Clear/Indoor'
  });


  const incidentsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'incidents'), orderBy('date', 'desc')) : null, [activeTeam?.id, db]);
  const { data: incidents, isLoading } = useCollection<TeamIncident>(incidentsQuery);

  const handleLogIncident = async () => {
    if (!form.title || !form.date) return;
    setIsProcessing(true);
    await addIncident(form);
    setIsLogOpen(false);
    setIsProcessing(false);
    setForm({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      time: format(new Date(), 'HH:mm'),
      location: '',
      description: '',
      emergencyServicesCalled: false,
      severity: 'minor',
      witnesses: '',
      witnessesList: [
        { name: '', phone: '', email: '' },
        { name: '', phone: '', email: '' },
        { name: '', phone: '', email: '' },
      ],
      involvedPeople: '',
      involvedPersonnel: [
        { name: '', phone: '', email: '' },
        { name: '', phone: '', email: '' },
        { name: '', phone: '', email: '' },
      ],
      treatmentProvided: '',
      followUpRequired: false,
      actionsTaken: '',
      reportedTo: '',
      equipmentInvolved: '',
      weatherConditions: 'Clear/Indoor'
    });
    toast({ title: "Incident Logged", description: "Strategic safety report archived." });
  };


  const exportLedger = useCallback(() => {
    if (!incidents || incidents.length === 0) return;
    
    generateBrandedPDF({
      title: "SQUAD SAFETY LEDGER",
      subtitle: "OFFICIAL INSTITUTIONAL RISK LOG",
      filename: `SAFETY_LEDGER_${activeTeam?.name.replace(/\s+/g, '_')}`
    }, (doc, startY) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // --- Document Metadata ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Operational Summary: ${activeTeam?.name || 'Authorized Squad'}`, 20, startY);
      
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`GENERATE DATE: ${new Date().toLocaleDateString()}`, 20, startY + 7);
      doc.text(`LOG ENTRIES: ${incidents.length}`, pageWidth - 20, startY + 7, { align: 'right' });
      
      doc.setDrawColor(230, 230, 230);
      doc.line(20, startY + 12, pageWidth - 20, startY + 12);

      // --- Table Header ---
      doc.setFillColor(245, 245, 245);
      doc.rect(20, startY + 20, pageWidth - 40, 10, 'F');
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("DATE", 25, startY + 26.5);
      doc.text("INCIDENT TITLE", 50, startY + 26.5);
      doc.text("LOCATION", 120, startY + 26.5);
      doc.text("SEVERITY", pageWidth - 25, startY + 26.5, { align: 'right' });

      // --- Table Content ---
      let y = startY + 38;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      incidents.forEach((inc) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        
        doc.setFont("helvetica", "bold");
        doc.text(inc.date, 25, y);
        doc.text(inc.title.toUpperCase(), 50, y);
        doc.setFont("helvetica", "normal");
        doc.text(inc.location || 'TBD', 120, y);
        
        const sev = (inc.severity || 'minor').toUpperCase();
        doc.text(sev, pageWidth - 25, y, { align: 'right' });
        
        // Divider
        doc.setDrawColor(245, 245, 245);
        doc.line(25, y + 4, pageWidth - 25, y + 4);
        
        y += 12;
      });

      return y;
    });
    
    toast({ title: "Strategic Ledger Exported", description: "Professional PDF generated." });
  }, [incidents, activeTeam]);

  if (isLoading) return <div className="py-20 text-center animate-pulse"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 relative overflow-hidden group">
          <History className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <div className="relative z-10 space-y-2">
            <p className="text-[10px] font-black uppercase opacity-60">Total Reports</p>
            <p className="text-5xl font-black">{incidents?.length || 0}</p>
          </div>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-primary text-white p-8 relative overflow-hidden group">
          <ShieldAlert className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <div className="relative z-10 space-y-2">
            <p className="text-[10px] font-black uppercase opacity-60">Emergency Calls</p>
            <p className="text-5xl font-black">{incidents?.filter(i => i.emergencyServicesCalled).length || 0}</p>
          </div>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-4 ring-1 ring-black/5">
          <div className="flex items-center gap-3"><Activity className="h-5 w-5 text-primary" /><p className="text-[10px] font-black uppercase text-foreground">Risk Pulse</p></div>
          <p className="text-sm font-bold uppercase text-muted-foreground">Monitoring active squads for operational safety compliance.</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Incident Ledger</h3>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none rounded-xl h-11 border-2 font-black uppercase text-[10px] text-foreground" onClick={exportLedger} disabled={!incidents?.length}>
            <Download className="h-4 w-4 mr-2" /> Export Ledger
          </Button>
          <Button className="flex-1 sm:flex-none rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20" onClick={() => setIsLogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Log Incident
          </Button>
        </div>
      </div>

      <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
              <tr>
                <th className="px-8 py-5">Incident</th>
                <th className="px-4 py-5">Location</th>
                <th className="px-4 py-5 text-center">Emergency</th>
                <th className="px-8 py-5 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {incidents?.map((inc) => (
                <tr 
                  key={inc.id} 
                  className="hover:bg-primary/5 transition-colors group cursor-pointer"
                  onClick={() => setViewingIncident(inc)}
                >
                  <td className="px-8 py-6">
                    <p className="font-black text-sm uppercase tracking-tight text-foreground">{inc.title}</p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5 line-clamp-1 italic">"{inc.description}"</p>
                  </td>
                  <td className="px-4 py-6 font-bold text-xs uppercase text-muted-foreground">{inc.location || 'TBD'}</td>
                  <td className="px-4 py-6 text-center">
                    <Badge className={cn(
                      "border-none font-black text-[8px] uppercase px-2 h-5",
                      inc.emergencyServicesCalled ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                    )}>
                      {inc.emergencyServicesCalled ? 'CRITICAL' : 'ROUTINE'}
                    </Badge>
                  </td>
                  <td className="px-8 py-6 text-right font-black text-xs uppercase text-foreground">{inc.date}</td>
                </tr>
              ))}
              {(!incidents || incidents.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-20 text-center opacity-30 italic text-xs uppercase font-black text-foreground">No safety incidents archived.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="rounded-[3.5rem] sm:max-w-2xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Incident Reporting Protocol</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-red-100 p-3 rounded-2xl text-red-600 shadow-sm"><ShieldAlert className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">Log Incident</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Official Institutional Reporting Pipeline</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Incident Headline</Label>
                <Input placeholder="e.g. Field Collision, Heat Exhaustion..." value={form.title ?? ''} onChange={e => setForm({...form, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Date</Label><Input type="date" value={form.date ?? ''} onChange={e => setForm({...form, date: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Time</Label><Input type="time" value={form.time ?? ''} onChange={e => setForm({...form, time: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Location</Label><Input placeholder="Field/Court" value={form.location ?? ''} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Severity</Label>
                  <Select value={form.severity} onValueChange={(v: any) => setForm({...form, severity: v})}>
                    <SelectTrigger className="h-12 border-2 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor" className="font-bold">Minor (Bruises, Scrapes)</SelectItem>
                      <SelectItem value="moderate" className="font-bold">Moderate (Assessment Required)</SelectItem>
                      <SelectItem value="severe" className="font-bold">Severe (Possible ER)</SelectItem>
                      <SelectItem value="critical" className="font-bold">Critical (Immediate Response)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 flex items-center justify-between p-6 bg-red-50 rounded-2xl border-2 border-dashed border-red-200">
                  <p className="text-[10px] font-black uppercase text-red-700">Emergency Call</p>
                  <Switch checked={form.emergencyServicesCalled} onCheckedChange={v => setForm({...form, emergencyServicesCalled: v})} />
                </div>
                <div className="flex-1 flex items-center justify-between p-6 bg-amber-50 rounded-2xl border-2 border-dashed border-amber-200">
                  <p className="text-[10px] font-black uppercase text-amber-700">Follow-Up Needed</p>
                  <Switch checked={form.followUpRequired} onCheckedChange={v => setForm({...form, followUpRequired: v})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Factual Narrative</Label>
                <Textarea placeholder="What occurred? Be descriptive and objective..." value={form.description ?? ''} onChange={e => setForm({...form, description: e.target.value})} className="min-h-[100px] rounded-2xl border-2 font-medium" />
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2"><div className="bg-primary/10 p-1.5 rounded-lg text-primary"><Users className="h-4 w-4" /></div><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Personnel Involved</Label></div>
                  <div className="grid grid-cols-1 gap-2">
                    {form.involvedPersonnel.map((p, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2">
                        <Input placeholder="Name..." value={p.name} onChange={e => {
                          const newList = [...form.involvedPersonnel];
                          newList[i].name = e.target.value;
                          setForm({...form, involvedPersonnel: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                        <Input placeholder="Phone..." value={p.phone} onChange={e => {
                          const newList = [...form.involvedPersonnel];
                          newList[i].phone = e.target.value;
                          setForm({...form, involvedPersonnel: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                        <Input placeholder="Email..." value={p.email} onChange={e => {
                          const newList = [...form.involvedPersonnel];
                          newList[i].email = e.target.value;
                          setForm({...form, involvedPersonnel: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2"><div className="bg-primary/10 p-1.5 rounded-lg text-primary"><Eye className="h-4 w-4" /></div><Label className="text-[10px] font-black uppercase tracking-widest text-foreground">Witnesses</Label></div>
                  <div className="grid grid-cols-1 gap-2">
                    {form.witnessesList.map((p, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2">
                        <Input placeholder="Name..." value={p.name} onChange={e => {
                          const newList = [...form.witnessesList];
                          newList[i].name = e.target.value;
                          setForm({...form, witnessesList: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                        <Input placeholder="Phone..." value={p.phone} onChange={e => {
                          const newList = [...form.witnessesList];
                          newList[i].phone = e.target.value;
                          setForm({...form, witnessesList: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                        <Input placeholder="Email..." value={p.email} onChange={e => {
                          const newList = [...form.witnessesList];
                          newList[i].email = e.target.value;
                          setForm({...form, witnessesList: newList});
                        }} className="h-10 border-2 rounded-xl text-[10px] font-bold" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Reported To</Label>
                  <Input placeholder="Director X, Coach Y..." value={form.reportedTo ?? ''} onChange={e => setForm({...form, reportedTo: e.target.value})} className="h-12 border-2 rounded-xl font-bold text-[10px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Equipment</Label>
                  <Input placeholder="Cleats, Goal, Ball..." value={form.equipmentInvolved ?? ''} onChange={e => setForm({...form, equipmentInvolved: e.target.value})} className="h-12 border-2 rounded-xl font-bold text-[10px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Environment</Label>
                  <Input placeholder="Rain, Turf, Grass..." value={form.weatherConditions ?? ''} onChange={e => setForm({...form, weatherConditions: e.target.value})} className="h-12 border-2 rounded-xl font-bold text-[10px]" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Immediate Treatment Narrative</Label>
                <Textarea placeholder="First aid applied, ice, trainers consulted..." value={form.treatmentProvided ?? ''} onChange={e => setForm({...form, treatmentProvided: e.target.value})} className="min-h-[80px] rounded-2xl border-2 font-medium" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Institutional Actions Taken</Label>
                <Textarea placeholder="Coach notifications, return-to-play status..." value={form.actionsTaken ?? ''} onChange={e => setForm({...form, actionsTaken: e.target.value})} className="min-h-[80px] rounded-2xl border-2 font-medium" />
              </div>

            </div>

            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black bg-black text-white hover:bg-red-600 transition-all shadow-xl border-none" onClick={handleLogIncident} disabled={isProcessing || !form.title}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Commit Report to Ledger"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <IncidentDetailDialog incident={viewingIncident} isOpen={!!viewingIncident} onOpenChange={(o) => !o && setViewingIncident(null)} />
    </div>
  );
}

import { AccessRestricted } from '@/components/layout/AccessRestricted';

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, isPro, createTeamDocument, updateTeamDocument, db, members, createAlert } = useTeam();

  if (!isStaff) return <AccessRestricted type="role" title="Coaches Hub Restricted" description="This tactical vault is reserved for Coaching Staff and Team Administrators." />;
  if (!isPro) return <AccessRestricted type="tier" />;

  const [activeTab, setActiveTab] = useState('recruiting');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [editingWaiver, setEditingWaiver] = useState<TeamDocument | null>(null);

  const docsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc')) : null, [activeTeam?.id, db]);
  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  
  const teamProtocols = useMemo(() => allDocuments?.filter(d => DEFAULT_PROTOCOLS.some(p => p.id === d.id)) || [], [allDocuments]);
  const defaultDocIds = useMemo(() => DEFAULT_PROTOCOLS.map(p => p.id), []);
  const customProtocols = useMemo(() => allDocuments?.filter(d => !defaultDocIds.includes(d.id) && d.type === 'waiver') || [], [allDocuments, defaultDocIds]);

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId), [members, selectedMemberId]);

  const handleSaveProtocolUpdate = async () => {
    if (!editingWaiver || !activeTeam) return;
    
    // Check if it's a new custom waiver (no id prefix of 'default_')
    const isNew = !editingWaiver.id;
    
    if (isNew) {
      await createTeamDocument({
        title: editingWaiver.title ?? 'Custom Protocol',
        content: editingWaiver.content ?? '',
        type: 'waiver',
        isActive: true,
        assignedTo: editingWaiver.assignedTo ?? ['all']
      });
      toast({ title: "Custom Protocol Deployed", description: "Your custom waiver is now active for the squad." });
    } else {
      await updateTeamDocument(editingWaiver.id, { 
        title: editingWaiver.title ?? '',
        content: editingWaiver.content ?? '',
        type: editingWaiver.type ?? 'waiver'
      });
      toast({ title: "Protocol Synchronized", description: "Legal terms updated globally for the squad." });
    }
    
    setEditingWaiver(null);
  };

  if (!isStaff) return <div className="py-24 text-center opacity-20"><ShieldCheck className="h-16 w-16 mx-auto" /><h1 className="text-2xl font-black mt-4 uppercase tracking-widest text-foreground">Staff Access Restricted</h1></div>;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Command Hub</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tight text-foreground">Coaches Corner</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="bg-muted/50 rounded-xl h-auto p-1 border-2 w-full md:w-auto flex-wrap gap-1 shadow-sm">
            <TabsTrigger value="recruiting" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Recruiting Hub</TabsTrigger>
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Compliance</TabsTrigger>
            <TabsTrigger value="archives" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Waiver Library</TabsTrigger>
            <TabsTrigger value="fundraising" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Fundraising</TabsTrigger>
            <TabsTrigger value="safety" className="rounded-lg font-black text-[10px] uppercase tracking-widest px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Safety Hub</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} className="mt-0">
        <TabsContent value="recruiting" className="space-y-8 mt-0 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <aside className="space-y-6">
              <div className="flex items-center gap-2 px-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Select Athlete</h3></div>
              <ScrollArea className="h-[600px] border-2 rounded-[2.5rem] bg-muted/10 p-2 shadow-inner">
                <div className="space-y-1.5">
                  {members.map(m => (
                    <button key={m.id} onClick={() => setSelectedMemberId(m.id)} className={cn("w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-black text-xs uppercase", selectedMemberId === m.id ? "bg-primary text-white shadow-lg" : "hover:bg-white text-foreground")}>
                      <Avatar className="h-8 w-8 rounded-xl border shrink-0">
                        <AvatarImage src={m.avatar} />
                        <AvatarFallback className="font-black">{m.name[0]}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </aside>
            <div className="lg:col-span-3">
              {selectedMember ? (
                <RecruitingProfileManager member={selectedMember} />
              ) : (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center space-y-6 bg-muted/10 border-2 border-dashed rounded-[3rem] opacity-40 text-foreground">
                  <Star className="h-16 w-16" />
                  <div><h3 className="text-xl font-black uppercase">Talent Pipeline</h3><p className="text-xs font-bold uppercase tracking-widest mt-1">Select an athlete to manage their institutional recruiting pack.</p></div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-10 mt-0">
          <section className="space-y-6 pt-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Institutional Protocols</h2>
              </div>
              <Button size="sm" onClick={() => setEditingWaiver({ title: '', content: '', type: 'waiver', isActive: true, assignedTo: ['all'] } as any)} className="h-9 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">
                <Plus className="h-3 w-3 mr-1.5" /> Deploy Custom Protocol
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEFAULT_PROTOCOLS.map(proto => {
                const activeDoc = teamProtocols.find(d => d.id === proto.id);
                const isActive = activeDoc ? (activeDoc.isActive ?? true) : false;
                return (
                  <Card key={proto.id} className={cn("rounded-3xl border-none shadow-sm p-6 flex flex-col justify-between group transition-all", isActive ? "bg-white ring-1 ring-black/5" : "bg-muted/20 opacity-60")}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="bg-primary/5 p-3 rounded-2xl shadow-sm border"><CheckCircle2 className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground/30")} /></div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => setEditingWaiver(activeDoc || { ...proto, content: 'Enter legal text here...', isActive: true, assignedTo: ['all'] } as TeamDocument)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Switch checked={isActive} onCheckedChange={async (v) => {
                          const existing = teamProtocols.find(d => d.id === proto.id);
                          const defaultContent = "I hereby assume all risks, hazards, and liabilities associated with participation in this program. I waive, release, and discharge the organization, its directors, coaches, and facility providers from any and all claims for personal injury, property damage, or wrongful death occurring during or arising from program participation. I understand the inherent physical risks of athletic competition and certify that the participant is medically cleared to engage. I grant permission for emergency medical treatment if necessary, and acknowledge responsibility for any associated costs.";
                          
                          // Use createTeamDocument (setDoc) for both create and update to avoid "No document to update" errors
                          await createTeamDocument({ 
                            ...proto, 
                            isActive: v, 
                            assignedTo: ['all'], 
                            content: existing?.content || (proto.id === 'default_universal_hub' ? defaultContent : 'Enter legal text here...') 
                          });
                          
                          if (v) {
                            await createAlert(
                              `Action Required: Sign ${proto.title}`, 
                              `A new institutional protocol has been activated. Please review and sign the ${proto.title} in the Library & Docs section.`, 
                              'everyone'
                            );
                          }
                          toast({ title: `Protocol ${v ? 'Activated' : 'Deactivated'}` });
                        }} />
                      </div>
                    </div>
                    <div className="space-y-1 mb-4"><p className="font-black text-sm uppercase text-foreground">{proto.title}</p><p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">System Mandate</p></div>
                    
                    {/* Display Waiver Content if Active */}
                    {isActive && activeDoc?.content && (
                      <div className="mt-4 p-4 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/20">
                        <p className="text-[10px] font-medium text-muted-foreground line-clamp-3">
                          {activeDoc.content}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
              
              {customProtocols.map(proto => {
                const isActive = proto.isActive ?? true;
                return (
                  <Card key={proto.id} className={cn("rounded-3xl border-none shadow-sm p-6 flex flex-col justify-between group transition-all", isActive ? "bg-white ring-1 ring-black/5 border-l-4 border-l-primary" : "bg-muted/20 opacity-60")}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="bg-primary/5 p-3 rounded-2xl shadow-sm border"><CheckCircle2 className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground/30")} /></div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => setEditingWaiver(proto)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Switch checked={isActive} onCheckedChange={async (v) => {
                          await updateTeamDocument(proto.id, { isActive: v });
                          if (v) {
                            await createAlert(
                              `Action Required: Sign ${proto.title}`, 
                              `A new institutional protocol has been activated. Please review and sign the ${proto.title} in the Library & Docs section.`, 
                              'everyone'
                            );
                          }
                          toast({ title: `Protocol ${v ? 'Activated' : 'Deactivated'}` });
                        }} />
                      </div>
                    </div>
                    <div className="space-y-1 mb-4"><p className="font-black text-sm uppercase text-foreground truncate">{proto.title}</p><p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Custom Mandate</p></div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-6 pt-4 border-t-2 border-dashed border-primary/10 mt-10">
            <div className="flex items-center gap-3 px-2">
              <Zap className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Rapid Join Portal</h2>
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-xl transition-all bg-black text-white p-10 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                <Link2 className="h-40 w-40" />
              </div>
              
              <div className="max-w-xl space-y-8 relative z-10">
                <div className="space-y-2">
                  <h3 className="text-3xl font-black uppercase tracking-tighter leading-none">Onboarding Gateway</h3>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed text-balance">
                    Enable a public enrollment pipeline where new members can join your squad and execute mandatory compliance protocols in one step.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-white/10">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Squad Code</Label>
                    <div className="bg-white/10 rounded-2xl h-16 flex items-center justify-center border border-white/10 shadow-inner group-hover:border-primary/20 transition-all">
                      <span className="text-3xl font-black tracking-[0.3em] ml-[0.3em]">{activeTeam?.teamCode || activeTeam?.code || 'CODE'}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Portal Status</Label>
                    <div className="bg-primary/20 rounded-2xl h-16 flex items-center px-6 border border-primary/30">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse mr-3" />
                      <span className="text-sm font-black uppercase tracking-tight text-primary">Active Gateway</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end px-1">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Magic Join Link</Label>
                  </div>
                  <div className="flex gap-2">
                    <div className="bg-white/5 rounded-2xl h-14 flex items-center px-4 border border-white/10 flex-1 overflow-hidden shadow-inner font-mono text-primary/60">
                      <span className="text-[10px] font-bold truncate">
                        {typeof window !== 'undefined' ? `${window.location.origin}/register/squad/${activeTeam?.id}` : `/register/squad/${activeTeam?.id}`}
                      </span>
                    </div>
                    <Button 
                      className="h-14 w-14 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 shrink-0 transition-transform active:scale-95"
                      onClick={() => {
                        const link = `${window.location.origin}/register/squad/${activeTeam?.id}`;
                        navigator.clipboard.writeText(link);
                        toast({ title: "Link Copied", description: "Direct join link is ready to share." });
                      }}
                    >
                      <Copy className="h-5 w-5" />
                    </Button>
                  </div>
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.05em] leading-relaxed">
                    Share this unique institutional URL with parents and players to bypass manual coordination. 
                    Successful enrollments will appear instantly in your member roster.
                  </p>
                </div>
              </div>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="archives" className="mt-0 space-y-8 animate-in fade-in duration-500">
           <div className="space-y-2">
             <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">Global Library</Badge>
             <h2 className="text-3xl font-black uppercase tracking-tight">Vault Archives</h2>
             <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Auditable Log of Digital Signatures & Executed Agrements</p>
           </div>
           <WaiverArchive />
        </TabsContent>

        <TabsContent value="fundraising" className="mt-0 space-y-8 animate-in fade-in duration-500">
           <div className="space-y-2">
             <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">Financial Hub</Badge>
             <h2 className="text-3xl font-black uppercase tracking-tight">Fundraising Mobilization</h2>
             <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Manage Squad Campaigns, Tracking & Institutional Donations</p>
           </div>
           <FundraisingManager />
        </TabsContent>

        <TabsContent value="safety" className="mt-0">
          <SafetyHub />
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingWaiver} onOpenChange={(o) => !o && setEditingWaiver(null)}>
        <DialogContent className="rounded-[3rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground">
          <DialogTitle className="sr-only">Protocol Architect</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><FileText className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">Protocol Architect</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Update Institutional Mandate & Legal Terms</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Mandate Title</Label>
                <Input value={editingWaiver?.title ?? ''} onChange={e => setEditingWaiver(p => p ? { ...p, title: e.target.value } : null)} className="h-14 rounded-2xl border-2 font-black text-lg focus:border-primary/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Legal Execution Text</Label>
                <Textarea value={editingWaiver?.content ?? ''} onChange={e => setEditingWaiver(p => p ? { ...p, content: e.target.value } : null)} className="min-h-[300px] rounded-2xl border-2 font-medium p-6 bg-muted/5 focus:bg-white transition-all resize-none" placeholder="Define the official terms and conditions..." />
              </div>
              <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 flex items-start gap-4">
                <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                  Changes to this protocol will affect all future signatures. Teammates who have already signed may need to re-verify if the terms change significantly.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleSaveProtocolUpdate}>
                <Save className="h-6 w-6 mr-3" /> Commit Protocol Sync
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WaiverArchive() {
  const { db, activeTeam } = useTeam();
  const archRef = useMemoFirebase(() => db && activeTeam?.id ? query(collection(db, 'teams', activeTeam.id, 'archived_waivers'), orderBy('signedAt', 'desc')) : null, [db, activeTeam?.id]);
  const { data: archivedWaivers, isLoading } = useCollection(archRef);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {archivedWaivers?.map(w => (
          <Card key={w.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-4 group hover:shadow-2xl transition-all border-b-4 border-primary/20">
            <div className="flex justify-between items-start">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary"><FileText className="h-6 w-6" /></div>
              <Badge variant="outline" className="text-[7px] font-black uppercase text-primary border-primary/20 shrink-0">{w.type}</Badge>
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black uppercase tracking-tight truncate leading-none">{w.title}</h4>
              <p className="text-[7px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Legally Verified Vault Entry</p>
            </div>
            <div className="bg-muted/30 p-4 rounded-2xl space-y-2 border">
              <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase opacity-40">Signatory</span><span className="text-[9px] font-black uppercase truncate ml-2">{w.signer}</span></div>
              <div className="flex justify-between items-center"><span className="text-[8px] font-black uppercase opacity-40">Executed</span><span className="text-[9px] font-bold opacity-60 ml-2">{w.signedAt ? format(new Date(w.signedAt), 'MMM d, p') : 'TBD'}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-[8px] font-black uppercase opacity-40">Status</span>
                <Badge className="bg-green-100/50 text-green-700 hover:bg-green-100/50 border-none h-4 px-1.5 text-[6px] font-black">LEGALLY BINDING</Badge>
              </div>
            </div>
            <Button variant="outline" className="w-full h-11 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm" onClick={() => {
               generateBrandedPDF({
                 title: "WAIVER COMPLIANCE RECEIPT",
                 subtitle: "OFFICIAL INSTITUTIONAL ARCHIVE RECORD",
                 filename: `waiver_archive_${w.id}`
               }, (doc, startY) => {
                 // Main Info
                 doc.setTextColor(0, 0, 0);
                 doc.setFontSize(14);
                 doc.setFont("helvetica", "bold");
                 doc.text("Protocol Metadata", 20, startY);
                 
                 doc.setFontSize(10);
                 doc.setFont("helvetica", "normal");
                 doc.text(`Title: ${w.title}`, 20, startY + 10);
                 doc.text(`Waiver Type: ${w.type}`, 20, startY + 17);
                 doc.text(`Signer: ${w.signer}`, 20, startY + 24);
                 doc.text(`Timestamp: ${w.signedAt ? format(new Date(w.signedAt), 'PPP p') : 'TBD'}`, 20, startY + 31);
                 
                 doc.setDrawColor(200, 200, 200);
                 doc.line(20, startY + 40, 190, startY + 40);

                 // Answers Section
                 doc.setFontSize(12);
                 doc.setFont("helvetica", "bold");
                 doc.text("Execution Responses", 20, startY + 50);
                 doc.setFontSize(9);
                 
                 let yPos = startY + 60;
                 Object.entries(w.answers || {}).forEach(([k, v]) => {
                   const label = `${k}:`;
                   const val = String(v);
                   doc.setFont("helvetica", "bold");
                   doc.text(label, 20, yPos);
                   doc.setFont("helvetica", "normal");
                   doc.text(val, 60, yPos);
                   yPos += 7;
                   if (yPos > 270) { doc.addPage(); yPos = 20; }
                 });

                 return yPos + 10;
               });
               toast({ title: "Audit Log Exported" });
            }}>Download PDF Audit <Download className="ml-2 h-3 w-3" /></Button>
          </Card>
        ))}
      </div>
      {(!archivedWaivers || archivedWaivers.length === 0) && (
        <div className="text-center py-32 opacity-20 space-y-4">
           <Database className="h-16 w-16 mx-auto" />
           <p className="text-sm font-black uppercase tracking-widest leading-none">The Vault is empty.</p>
           <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Executed agreements will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}

