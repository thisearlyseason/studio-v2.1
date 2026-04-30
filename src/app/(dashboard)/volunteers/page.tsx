
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, VolunteerOpportunity, TeamEvent } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  HandHelping, 
  Plus, 
  Calendar as CalendarIcon, 
  MapPin, 
  Users, 
  ShieldCheck, 
  Loader2, 
  Trash2, 
  Timer, 
  ChevronRight, 
  ClipboardList,
  Share2,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Zap,
  Star,
  Edit3,
  Check,
  Database,
  Users2
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Lock as LockIcon } from 'lucide-react';
import { DatePicker } from "@/components/ui/date-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function VolunteerHubPage() {
  const { 
    activeTeam, 
    user, 
    isStaff, 
    isParent, 
    addVolunteerOpportunity, 
    updateVolunteerOpportunity,
    signUpForVolunteer, 
    deleteVolunteerOpportunity, 
    confirmVolunteerAttendance,
    verifyVolunteerPoints,
    claimAssignment,
    isPro, 
    purchasePro 
  } = useTeam();
  const db = useFirestore();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<VolunteerOpportunity | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newOpp, setNewOpp] = useState({ title: '', description: '', date: '', location: '', spots: 2, points: 50, startTime: '09:00', isShareable: false });

  const oppsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'volunteers'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);

  const { data: rawOpps, isLoading: isOppsLoading } = useCollection<VolunteerOpportunity>(oppsQuery);
  const opportunities = useMemo(() => rawOpps || [], [rawOpps]);

  const eventsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'events'));
  }, [activeTeam?.id, db]);

  const { data: rawEvents, isLoading: isEventsLoading } = useCollection<TeamEvent>(eventsQuery);

  const isLoading = isOppsLoading || isEventsLoading;

  const allTasks = useMemo(() => {
    const opps = opportunities.map(o => ({ ...o, entryType: 'opportunity' as const }));
    const eventTasks = (rawEvents || []).flatMap(e => 
      (e.assignments || []).map((a: any) => ({
        id: a.id,
        eventId: e.id,
        assignmentId: a.id,
        title: a.title,
        description: `Strategic role for event: ${e.title}`,
        date: e.date,
        location: e.location,
        spots: 1,
        points: a.points || 25,
        startTime: e.startTime || 'TBD',
        signups: a.assigneeId ? { [a.assigneeId]: { userId: a.assigneeId, userName: a.assigneeName, status: 'claimed' } } : {},
        entryType: 'event_assignment' as const,
        eventTitle: e.title
      }))
    );
    return [...opps, ...eventTasks].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [opportunities, rawEvents]);

  const totalPoints = useMemo(() => {
    let total = 0;
    opportunities.forEach(opp => {
      Object.values(opp.signups || {}).forEach(s => {
        if (s.userId === user?.id && s.status === 'verified') {
          total += opp.points || 0;
        }
      });
    });
    return total;
  }, [opportunities, user?.id]);

  const handleAddOpportunity = async () => {
    if (!newOpp.title || !newOpp.date) return;
    setIsProcessing(true);
    await addVolunteerOpportunity({
      ...newOpp,
      spots: parseInt(String(newOpp.spots)),
      points: parseInt(String(newOpp.points))
    });
    setIsAddOpen(false);
    setIsProcessing(false);
    setNewOpp({ title: '', description: '', date: '', location: '', spots: 2, points: 50, startTime: '09:00', isShareable: false });
    toast({ title: "Mission Published", description: "The squad has been notified of the new deployment." });
  };

  const handleEditOpportunity = async () => {
    if (!editingOpp) return;
    setIsProcessing(true);
    await updateVolunteerOpportunity(editingOpp.id, {
      ...editingOpp,
      spots: parseInt(String(editingOpp.spots)),
      points: parseInt(String(editingOpp.points))
    });
    setIsEditOpen(false);
    setIsProcessing(false);
    setEditingOpp(null);
    toast({ title: "Mission Updated" });
  };

  const handleCopyLink = (oppId: string) => {
    const url = `${window.location.origin}/public/volunteer/${activeTeam?.id}/${oppId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Portal Link Copied", description: "External signup link ready for dispatch." });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Syncing Mission Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-10rem)]">
      {!isPro && (
        <div 
          className="absolute inset-x-[-2rem] inset-y-[-2rem] z-50 flex items-center justify-center p-6 sm:p-10 animate-in fade-in zoom-in duration-500"
          style={{ 
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.8) 100%)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <Card className="max-w-md w-full rounded-[3.5rem] border-none shadow-3xl bg-white overflow-hidden ring-1 ring-black/5">
            <div className="h-2 bg-primary w-full" />
            <CardHeader className="p-12 text-center space-y-8">
              <div className="bg-primary/10 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner group">
                <LockIcon className="h-12 w-12 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <div className="space-y-3">
                <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-7 px-5 mb-2 mx-auto rounded-full shadow-sm">Elite Intelligence Hub</Badge>
                <CardTitle className="text-4xl font-black uppercase tracking-tight leading-none">Logistics Locked</CardTitle>
                <CardDescription className="font-bold uppercase tracking-[0.2em] text-[10px] text-muted-foreground/60">Institutional Performance Tracking</CardDescription>
              </div>
              <p className="text-xs font-semibold text-muted-foreground leading-relaxed px-4">
                The Volunteer Intel Hub is an <span className="text-primary font-black uppercase underline underline-offset-4">Elite Pro</span> feature. Unlock unlimited mission coordination, automated point audits, and public enrollment portals.
              </p>
            </CardHeader>
            <CardFooter className="p-12 pt-0">
              <Button 
                onClick={purchasePro}
                className="w-full h-16 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/30 active:scale-95 transition-all bg-black hover:bg-primary"
              >
                Unlock Pro Access
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <div className={cn("space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700", !isPro && "blur-[4px] pointer-events-none grayscale opacity-30 select-none")}>
      <header className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-1000">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-2 w-12 bg-primary rounded-full" />
              <span className="text-xs font-black uppercase tracking-[0.4em] text-primary/60">Tactical Mobilization</span>
            </div>
            <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tight leading-[0.85] italic">Volunteer Intelligence</h1>
          </div>
          {isStaff && (
            <Button onClick={() => setIsAddOpen(true)} className="h-16 md:h-20 px-8 md:px-12 rounded-[2rem] bg-black text-white hover:bg-black/90 font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95 group shrink-0">
              <Plus className="h-4 w-4 md:h-5 md:w-5 mr-3 group-hover:rotate-90 transition-transform" /> Deploy Mission
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="rounded-[3rem] border-none shadow-2xl bg-primary text-white overflow-hidden group hover:scale-[1.02] transition-transform">
          <CardContent className="p-10 space-y-4">
            <div className="flex justify-between items-start">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md shadow-inner"><Star className="h-8 w-8 text-white" /></div>
              <Badge className="bg-white/20 text-white border-none font-black text-[9px] uppercase tracking-widest px-4 h-7 rounded-full">Personal Rank</Badge>
            </div>
            <div>
              <p className="text-6xl font-black leading-none tracking-tighter">{totalPoints}</p>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-60 mt-2">Earned Contribution Points</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[3rem] border-none shadow-2xl bg-white overflow-hidden ring-1 ring-black/5 group hover:scale-[1.02] transition-transform">
          <CardContent className="p-10 space-y-4">
            <div className="flex justify-between items-start">
              <div className="bg-primary/5 p-4 rounded-2xl shadow-inner"><Users className="h-8 w-8 text-primary" /></div>
              <Badge className="bg-primary/5 text-primary border-none font-black text-[9px] uppercase tracking-widest px-4 h-7 rounded-full">Live Operations</Badge>
            </div>
            <div>
              <p className="text-6xl font-black leading-none tracking-tighter text-primary">{opportunities.length}</p>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground mt-2">Open Squad Assignments</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden group hover:scale-[1.02] transition-transform">
          <CardContent className="p-10 space-y-4">
            <div className="flex justify-between items-start">
              <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md shadow-inner"><ShieldCheck className="h-8 w-8 text-white" /></div>
              <Badge className="bg-white/10 text-white border-none font-black text-[9px] uppercase tracking-widest px-4 h-7 rounded-full">Officer Status</Badge>
            </div>
            <div>
              <p className="text-2xl font-black leading-tight uppercase tracking-tight truncate">{user?.name}</p>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-60 mt-2">Verified Contributor</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="board" className="space-y-10">
        <div className="overflow-x-auto pb-4 -mx-4 px-4 no-scrollbar">
          <TabsList className="bg-muted/50 p-1.5 rounded-[2rem] h-auto border-2 border-black/5 inline-flex">
            <TabsTrigger value="board" className="rounded-2xl px-6 md:px-10 py-3 md:py-4 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-lg transition-all">Mission Board</TabsTrigger>
            {isStaff && (
              <TabsTrigger value="ledger" className="rounded-2xl px-6 md:px-10 py-3 md:py-4 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-lg transition-all">Audit Terminal</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="board" className="mt-0 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {allTasks.map((task) => {
              const signups = Object.values(task.signups || {});
              const hasSignedUp = !!(task.signups as Record<string, any>)?.[user?.id || ''];
              const isFull = task.entryType === 'opportunity' ? signups.length >= (task as any).spots : !!task.signups && Object.keys(task.signups).length > 0;
              const isEventTask = task.entryType === 'event_assignment';

              return (
                <Card key={task.id} className="rounded-[4rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group hover:shadow-3xl transition-all duration-500 relative">
                  {hasSignedUp && (
                    <div className="absolute top-8 right-8 z-20">
                      <div className="bg-green-500 text-white p-2 rounded-full shadow-lg shadow-green-500/20"><CheckCircle2 className="h-5 w-5" /></div>
                    </div>
                  )}
                  
                  <CardHeader className="p-10 pb-6 space-y-6">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className={cn("font-black uppercase text-[8px] tracking-[0.3em] border-primary/20 text-primary py-1.5 px-4 rounded-full", isEventTask && "border-black text-black")}>
                        {isEventTask ? 'Logistics Protocol' : 'Squad Assignment'}
                      </Badge>
                      <div className="flex gap-2">
                        {task.entryType === 'opportunity' && (task as any).isShareable && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/5 text-primary" onClick={() => handleCopyLink(task.id)}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <CardTitle className="text-3xl font-black uppercase tracking-tighter leading-[0.9] group-hover:text-primary transition-colors">{task.title}</CardTitle>
                      <CardDescription className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 line-clamp-2">{task.description}</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="p-10 pt-0 flex-1 space-y-6 border-b border-black/5 bg-muted/5">
                    <div className="grid grid-cols-2 gap-4 pt-6">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Rewards</p>
                        <p className="text-xl font-black text-primary italic">+{task.points} PTS</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Logistics</p>
                        <p className="text-[10px] font-black uppercase truncate">{format(new Date(task.date), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <p className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Personnel Capacity</p>
                        <p className="text-[9px] font-black uppercase">{signups.length} / {task.spots} SECURED</p>
                      </div>
                      <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-700", isFull ? "bg-green-500" : "bg-primary")} style={{ width: `${Math.min(100, (signups.length / task.spots) * 100)}%` }} />
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-10 flex flex-col gap-4">
                    {isStaff ? (
                      <div className="flex gap-2 w-full">
                        <Button className={cn("flex-1 h-14 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl transition-all", hasSignedUp ? "bg-muted text-muted-foreground" : "bg-black text-white hover:bg-primary shadow-black/10")} onClick={() => signUpForVolunteer(task.id)} disabled={hasSignedUp || isFull}>
                          {hasSignedUp ? "Deployment Confirmed" : isFull ? "Target Met" : "Claim Mission"}
                        </Button>
                        {task.entryType === 'opportunity' && (
                          <Button variant="outline" size="icon" className="h-14 w-14 rounded-[1.5rem] border-2 group-hover:border-primary/20 transition-all" onClick={() => { setEditingOpp(task as any); setIsEditOpen(true); }}>
                            <Edit3 className="h-5 w-5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button 
                        disabled={hasSignedUp || isFull || !isParent}
                        className={cn("w-full h-16 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl transition-all active:scale-95", hasSignedUp ? "bg-green-100 text-green-700 shadow-none ring-2 ring-green-500/20" : isFull ? "bg-muted text-muted-foreground grayscale" : "bg-primary text-white shadow-primary/30 hover:bg-black")} 
                        onClick={() => {
                          if (isEventTask) claimAssignment((task as any).eventId!, (task as any).assignmentId!);
                          else signUpForVolunteer(task.id);
                        }}
                      >
                        {hasSignedUp ? "Deployment Confirmed" : isFull ? "Mission Staffed" : !isParent ? "Parents Only" : "Accept Assignment"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-0 outline-none">
          <Card className="rounded-[4rem] border-none shadow-3xl overflow-hidden ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-black text-white p-12">
              <div className="flex items-center gap-8">
                <div className="bg-primary p-5 rounded-3xl shadow-xl shadow-primary/20"><ClipboardList className="h-10 w-10 text-white" /></div>
                <div>
                  <CardTitle className="text-4xl font-black uppercase tracking-tight">Audit Terminal</CardTitle>
                  <CardDescription className="text-white/60 font-bold uppercase tracking-[0.3em] text-[10px] mt-3">Personnel Contribution Analysis & Verification</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left min-w-[800px]">
                  <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground border-b-2 border-black/5">
                    <tr>
                      <th className="px-12 py-8">Active Personnel</th>
                      <th className="px-8 py-8">Strategic Assignment</th>
                      <th className="px-8 py-8 text-center">Deployment</th>
                      <th className="px-8 py-8 text-center">Intelligence Status</th>
                      <th className="px-12 py-8 text-right">Action Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {opportunities.flatMap(opp => Object.values(opp.signups || {}).map(signup => (
                      <tr key={`${opp.id}_${signup.userId}`} className="hover:bg-primary/5 transition-all group">
                        <td className="px-12 py-8">
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-black text-xs text-muted-foreground">{signup.userName?.charAt(0)}</div>
                            <div>
                              <p className="font-black text-sm uppercase tracking-tight">{signup.userName}</p>
                              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{signup.email || 'INTERNAL SQUAD'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-8"><Badge variant="outline" className="font-black text-[9px] uppercase border-black/10">{opp.title}</Badge></td>
                        <td className="px-8 py-8 text-center">
                          <button 
                            onClick={() => confirmVolunteerAttendance(opp.id, signup.userId, !signup.isConfirmed)} 
                            className={cn("h-10 w-10 rounded-2xl flex items-center justify-center mx-auto transition-all shadow-sm ring-2", signup.isConfirmed ? "bg-green-500 text-white ring-green-500/20" : "bg-white text-muted-foreground/30 ring-black/5 hover:bg-muted/10")}
                          >
                            <Check className="h-5 w-5" strokeWidth={3} />
                          </button>
                        </td>
                        <td className="px-8 py-8 text-center">
                          <Badge className={cn("border-none font-black text-[9px] uppercase h-7 px-4 rounded-full", signup.status === 'verified' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                            {signup.status === 'verified' ? 'Verified Intel' : 'Pending Verification'}
                          </Badge>
                        </td>
                        <td className="px-12 py-8 text-right">
                          {signup.status === 'verified' ? (
                            <div className="flex flex-col items-end">
                              <span className="font-black text-primary text-base italic">+{opp.points} PTS</span>
                              <span className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Intelligence Confirmed</span>
                            </div>
                          ) : (
                            <Button size="sm" className="rounded-xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-black text-white hover:bg-primary shadow-xl shadow-black/5 group" onClick={() => verifyVolunteerPoints(opp.id, signup.userId, 1)}>
                              <ShieldCheck className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" /> Verify & Award
                            </Button>
                          )}
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
                {opportunities.flatMap(o => Object.values(o.signups || {})).length === 0 && (
                  <div className="py-40 text-center flex flex-col items-center justify-center space-y-6 opacity-20 italic">
                    <Database className="h-20 w-20" />
                    <p className="text-xs font-black uppercase tracking-[0.4em]">Contribution Registry Vacant</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-[4rem] sm:max-w-xl p-0 border-none shadow-3xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-12 space-y-10">
            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] px-4 rounded-full">Strategic Deployment</Badge>
              <DialogHeader><DialogTitle className="text-4xl font-black uppercase tracking-tighter italic">Create Mission</DialogTitle></DialogHeader>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Assignment Descriptor</Label>
                <Input value={newOpp.title} onChange={e => setNewOpp({...newOpp, title: e.target.value})} className="h-16 rounded-2xl border-2 font-black text-lg shadow-sm focus:ring-primary" placeholder="e.g. Tactical Logistics Officer" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Deployment Date</Label>
                  <DatePicker 
                    date={newOpp.date} 
                    setDate={d => setNewOpp({ ...newOpp, date: d })} 
                    placeholder="Select Date"
                    className="h-14 rounded-2xl border-2 px-6 italic font-black uppercase tracking-widest bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Personnel Limit</Label>
                  <Input type="number" value={newOpp.spots} onChange={e => setNewOpp({...newOpp, spots: parseInt(e.target.value)})} className="h-14 rounded-2xl border-2 font-black shadow-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Mission Reward (Pts)</Label>
                  <Input type="number" value={newOpp.points} onChange={e => setNewOpp({...newOpp, points: parseInt(e.target.value)})} className="h-14 rounded-2xl border-2 font-black shadow-sm text-primary" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Intelligence (Start Time)</Label>
                  <Input type="time" value={newOpp.startTime} onChange={e => setNewOpp({...newOpp, startTime: e.target.value})} className="h-14 rounded-2xl border-2 font-black shadow-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between p-6 bg-muted/20 rounded-[2rem] border-2 border-transparent hover:border-black/5 transition-all">
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-tight leading-none">Public Outreach</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">Allow external enrollment via secure portal</p>
                </div>
                <Switch checked={newOpp.isShareable} onCheckedChange={v => setNewOpp({...newOpp, isShareable: v})} />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-20 rounded-[2.5rem] text-xl font-black shadow-3xl shadow-primary/30 active:scale-[0.98] transition-all bg-black hover:bg-primary" onClick={handleAddOpportunity} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy to Squad Ledger"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[4rem] sm:max-w-xl p-0 border-none shadow-3xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <div className="p-12 space-y-10">
            <div className="space-y-2">
              <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] px-4 rounded-full">Refine Deployment</Badge>
              <DialogHeader><DialogTitle className="text-4xl font-black uppercase tracking-tighter italic">Edit Mission</DialogTitle></DialogHeader>
            </div>
            {editingOpp && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Mission Title</Label>
                  <Input value={editingOpp.title} onChange={e => setEditingOpp({...editingOpp, title: e.target.value})} className="h-16 rounded-2xl border-2 font-black text-lg focus:ring-primary shadow-sm" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Operational Date</Label>
                    <DatePicker 
                      date={editingOpp.date} 
                      setDate={d => setEditingOpp({...editingOpp, date: d})} 
                      placeholder="Operational Date"
                      className="h-14 rounded-2xl border-2 font-black bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Personnel Limit</Label>
                    <Input type="number" value={editingOpp.spots} onChange={e => setEditingOpp({...editingOpp, spots: parseInt(String(e.target.value))})} className="h-14 rounded-2xl border-2 font-black shadow-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Tactical Points</Label>
                    <Input type="number" value={editingOpp.points || 50} onChange={e => setEditingOpp({...editingOpp, points: parseInt(e.target.value)})} className="h-14 rounded-2xl border-2 font-black shadow-sm text-primary" />
                  </div>
                   <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Start Intelligence</Label>
                    <Input type="time" value={(editingOpp as any).startTime || '09:00'} onChange={e => setEditingOpp({...editingOpp, startTime: e.target.value} as any)} className="h-14 rounded-2xl border-2 font-black shadow-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-50">Operational Protocol</Label>
                  <Textarea value={editingOpp.description || ''} onChange={e => setEditingOpp({...editingOpp, description: e.target.value})} className="min-h-[120px] rounded-3xl border-2 font-medium p-6 resize-none shadow-sm" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button className="w-full h-20 rounded-[2.5rem] text-xl font-black shadow-3xl shadow-primary/30 active:scale-[0.98] transition-all bg-black hover:bg-primary" onClick={handleEditOpportunity} disabled={isProcessing || !editingOpp?.title}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Authorize Refinements"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
