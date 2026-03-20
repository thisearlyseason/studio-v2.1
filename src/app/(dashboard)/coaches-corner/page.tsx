"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTeam, TeamDocument, Member, PlayerProfile, RecruitingProfile, AthleticMetrics, PlayerStat, PlayerEvaluation, RecruitingContact, PlayerVideo, TeamIncident } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  PenTool, 
  FileSignature, 
  Users, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Search, 
  ShieldCheck,
  Loader2,
  FileText,
  ShieldAlert,
  Edit3,
  Settings,
  Info,
  Shield,
  Target,
  Trophy,
  Video,
  ExternalLink,
  BarChart2,
  Star,
  UserPlus,
  ArrowUpRight,
  Download,
  Share2,
  Play,
  AlertCircle,
  Activity,
  History,
  ClipboardList,
  X
} from 'lucide-react';
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

const DEFAULT_PROTOCOLS = [
  { id: 'default_medical', title: 'Medical Clearance', type: 'waiver' },
  { id: 'default_travel', title: 'Travel Consent', type: 'waiver' },
  { id: 'default_parental', title: 'Parental Waiver', type: 'waiver' },
  { id: 'default_photography', title: 'Photography Release', type: 'waiver' },
  { id: 'default_tournament', title: 'Tournament Waiver', type: 'tournament_waiver' }
];

function RecruitingProfileManager({ member }: { member: Member }) {
  const { 
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, 
    updateAthleticMetrics, getPlayerStats, addPlayerStat, deletePlayerStat,
    getEvaluations, addEvaluation, getRecruitingContact, updateRecruitingContact,
    getPlayerVideos, addPlayerVideo, deletePlayerVideo, toggleRecruitingProfile
  } = useTeam();

  const [profile, setProfile] = useState<Partial<RecruitingProfile>>({});
  const [metrics, setMetrics] = useState<Partial<AthleticMetrics>>({});
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [evals, setEvaluations] = useState<PlayerEvaluation[]>([]);
  const [contact, setContact] = useState<Partial<RecruitingContact>>({});
  const [videos, setVideos] = useState<PlayerVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

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
    setIsEditing(false);
    toast({ title: "Recruiting Pack Synchronized" });
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
                <p className="text-[8px] font-black uppercase opacity-40">40yd Dash</p>
                <p className="text-xl font-black text-primary">{metrics.fortyYardDash || '--'}s</p>
              </div>
              <div className="bg-muted/20 p-4 rounded-2xl text-center space-y-1">
                <p className="text-[8px] font-black uppercase opacity-40">Vertical</p>
                <p className="text-xl font-black text-primary">{metrics.verticalJump || '--'}"</p>
              </div>
              <div className="bg-muted/20 p-4 rounded-2xl text-center space-y-1">
                <p className="text-[8px] font-black uppercase opacity-40">GPA</p>
                <p className="text-xl font-black text-primary">{profile.academicGPA || '--'}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-muted/30 p-6 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-widest">Highlight Reel</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-[8px] font-black uppercase" onClick={() => toast({ title: "Film Room Restricted" })}><Plus className="h-3 w-3 mr-1" /> Add Film</Button>
            </CardHeader>
            <CardContent className="p-6">
              {videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map(v => (
                    <div key={v.id} className="aspect-video bg-black rounded-xl relative overflow-hidden group">
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"><Play className="h-8 w-8 text-white fill-current" /></div>
                      <Badge className="absolute top-2 left-2 bg-primary text-white border-none text-[7px] font-black uppercase">{v.type}</Badge>
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
              <h4 className="text-xl font-black uppercase">{profile.status || 'PROSPECTING'}</h4>
              <p className="text-[10px] font-bold text-white/40 leading-relaxed">This status controls visibility within collegiate scout search filters.</p>
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
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase ml-1">Pipeline Status</Label>
                      <Select value={profile.status} onValueChange={(v: any) => setProfile({...profile, status: v})}>
                        <SelectTrigger className="h-12 border-2 rounded-xl font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="active" className="font-bold">Active Prospect</SelectItem>
                          <SelectItem value="hidden" className="font-bold">Inactive/Private</SelectItem>
                          <SelectItem value="committed" className="font-bold">Committed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Height</Label><Input value={profile.height} onChange={e => setProfile({...profile, height: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Weight (lbs)</Label><Input value={profile.weight} onChange={e => setProfile({...profile, weight: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    </div>
                  </div>
                </section>

                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Athletic Pulse (Verified)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">40yd Dash (s)</Label><Input type="number" value={metrics.fortyYardDash} onChange={e => setMetrics({...metrics, fortyYardDash: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Vertical Jump (in)</Label><Input type="number" value={metrics.verticalJump} onChange={e => setMetrics({...metrics, verticalJump: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Narrative & Academics</h3>
                  <div className="space-y-4">
                    <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Academic GPA</Label><Input type="number" step="0.01" value={profile.academicGPA} onChange={e => setProfile({...profile, academicGPA: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase ml-1">Athletic Narrative</Label>
                      <Textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} className="min-h-[150px] border-2 rounded-2xl font-medium p-4 resize-none" placeholder="Recruiting summary..." />
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
    </div>
  );
}

function IncidentDetailDialog({ incident, isOpen, onOpenChange }: { incident: TeamIncident | null, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  if (!incident) return null;
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[3.5rem] p-0 border-none shadow-2xl overflow-hidden sm:max-w-2xl bg-white text-foreground">
        <DialogTitle className="sr-only">Incident Audit: {incident.title}</DialogTitle>
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><ShieldAlert className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight truncate">{incident.title}</DialogTitle>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{incident.date} • {incident.location}</p>
                </div>
              </div>
              <Badge className={cn(
                "border-none font-black text-[10px] uppercase px-4 h-7 shrink-0",
                incident.emergencyServicesCalled ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "bg-muted text-muted-foreground"
              )}>
                {incident.emergencyServicesCalled ? 'Critical Alert' : 'Routine Log'}
              </Badge>
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
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Witness Roster</h4>
                <div className="p-5 bg-white rounded-2xl border-2 font-bold text-xs leading-relaxed text-foreground">
                  {incident.witnesses || 'No witnesses recorded in the official log.'}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary ml-1">Tactical Actions Taken</h4>
                <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/10 shadow-inner">
                  <p className="text-sm font-bold leading-relaxed text-foreground/80">{incident.actionsTaken || 'Standard safety protocols applied.'}</p>
                </div>
              </div>

              <div className="p-6 bg-black text-white rounded-[2.5rem] space-y-3 relative overflow-hidden group">
                <ShieldCheck className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Compliance Status</p>
                <p className="text-[11px] font-medium leading-relaxed italic text-white/60 relative z-10">
                  This report is permanently archived in the institutional vault for organizational safety auditing and insurance verification purposes.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="outline" className="w-full h-14 rounded-2xl border-2 font-black uppercase text-xs tracking-widest transition-all hover:bg-muted" onClick={() => onOpenChange(false)}>
              Close Audit Detail
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
    location: '',
    description: '',
    emergencyServicesCalled: false,
    witnesses: '',
    actionsTaken: ''
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
      location: '',
      description: '',
      emergencyServicesCalled: false,
      witnesses: '',
      actionsTaken: ''
    });
    toast({ title: "Incident Logged", description: "Strategic safety report archived." });
  };

  const exportLedger = useCallback(() => {
    if (!incidents || incidents.length === 0) return;
    const headers = ["Title", "Date", "Location", "Emergency Services", "Description", "Witnesses", "Actions Taken"];
    const rows = incidents.map(inc => [
      inc.title,
      inc.date,
      inc.location,
      inc.emergencyServicesCalled ? "YES" : "NO",
      inc.description.replace(/,/g, ';'),
      (inc.witnesses || "").replace(/,/g, ';'),
      (inc.actionsTaken || "").replace(/,/g, ';')
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SAFETY_LEDGER_${activeTeam?.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [incidents, activeTeam?.name]);

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
                <Input placeholder="e.g. Field Collision, Heat Exhaustion..." value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Location</Label><Input placeholder="Which field/court?" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
              </div>

              <div className="flex items-center justify-between p-6 bg-red-50 rounded-[2rem] border-2 border-dashed border-red-200">
                <div>
                  <p className="text-sm font-black uppercase leading-tight text-red-700">Emergency Services Call</p>
                  <p className="text-[10px] font-bold text-red-600/60 uppercase">Were 911 or first responders dispatched?</p>
                </div>
                <Switch checked={form.emergencyServicesCalled} onCheckedChange={v => setForm({...form, emergencyServicesCalled: v})} className="data-[state=checked]:bg-red-600" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Factual Narrative</Label>
                <Textarea placeholder="What occurred? Be descriptive and objective..." value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="min-h-[120px] rounded-2xl border-2 font-medium" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Witnesses</Label>
                <Input placeholder="Teammates, parents, or staff present..." value={form.witnesses} onChange={e => setForm({...form, witnesses: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Immediate Actions Taken</Label>
                <Textarea placeholder="First aid applied, return-to-play status, etc..." value={form.actionsTaken} onChange={e => setForm({...form, actionsTaken: e.target.value})} className="min-h-[100px] rounded-2xl border-2 font-medium" />
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

export default function CoachesCornerPage() {
  const { activeTeam, isStaff, createTeamDocument, updateTeamDocument, deleteTeamDocument, db, members } = useTeam();
  const [activeTab, setActiveTab] = useState('recruiting');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const docsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc')) : null, [activeTeam?.id, db]);
  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  
  const teamProtocols = useMemo(() => allDocuments?.filter(d => DEFAULT_PROTOCOLS.some(p => p.id === d.id)) || [], [allDocuments]);

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId), [members, selectedMemberId]);

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
            <div className="flex items-center gap-3 px-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Institutional Protocols</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEFAULT_PROTOCOLS.map(proto => {
                const activeDoc = teamProtocols.find(d => d.id === proto.id);
                const isActive = activeDoc ? (activeDoc.isActive ?? true) : false;
                return (
                  <Card key={proto.id} className={cn("rounded-3xl border-none shadow-sm p-6 flex flex-col justify-between group transition-all", isActive ? "bg-white ring-1 ring-black/5" : "bg-muted/20 opacity-60")}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="bg-primary/5 p-3 rounded-2xl shadow-sm border"><CheckCircle2 className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground/30")} /></div>
                      <Switch checked={isActive} onCheckedChange={async (v) => {
                        const existing = teamProtocols.find(d => d.id === proto.id);
                        if (!existing) await createTeamDocument({ ...proto, isActive: v, assignedTo: ['all'] });
                        else await updateTeamDocument(proto.id, { isActive: v });
                        toast({ title: `Protocol ${v ? 'Activated' : 'Deactivated'}` });
                      }} />
                    </div>
                    <div className="space-y-1 mb-4"><p className="font-black text-sm uppercase text-foreground">{proto.title}</p><p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">System Mandate</p></div>
                  </Card>
                );
              })}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="safety" className="mt-0">
          <SafetyHub />
        </TabsContent>
      </Tabs>
    </div>
  );
}