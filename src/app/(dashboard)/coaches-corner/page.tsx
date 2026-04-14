"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam, TeamDocument, Member, PlayerProfile, RecruitingProfile, AthleticMetrics, PlayerStat, PlayerEvaluation, RecruitingContact, PlayerVideo, VideoComment, TeamIncident, TeamEvent } from '@/components/providers/team-provider';
import { EmailExportDialog } from '@/components/team/EmailExportDialog';
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
  Copy,
  Package,
  Upload,
  Lock,
  Edit2,
  Camera,
  MapPin,
  Mail,
  LayoutGrid,
  Check,
  Calendar as CalendarIcon,
  AlertHorizontal
} from 'lucide-react';
import { generateBrandedPDF } from '@/lib/pdf-utils';
import { collection, query, orderBy, doc, getDoc, updateDoc, collectionGroup, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FundraisingManager } from '@/components/coaches-corner/FundraisingManager';

const DEFAULT_PROTOCOLS = [
  { id: 'default_medical', title: 'Medical Clearance', type: 'waiver' },
  { id: 'default_travel', title: 'Travel Consent', type: 'waiver' },
  { id: 'default_parental', title: 'Parental Waiver', type: 'waiver' },
  { id: 'default_photography', title: 'Photography Release', type: 'waiver' },
  { id: 'default_tournament', title: 'Tournament Waiver', type: 'tournament_waiver' },
  { id: 'default_universal_hub', title: 'Universal Hub Release', type: 'waiver' }
];

function AccessRestricted({ type }: { type: 'feature' | 'data' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 bg-muted/5 border-2 border-dashed rounded-[3rem] opacity-60">
      <div className="bg-primary/10 p-6 rounded-3xl">
        <Lock className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-black uppercase tracking-tight">Access Restricted</h3>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest max-w-xs mx-auto">
          Upgrade to Squad Pro to unlock advanced institutional {type === 'feature' ? 'capabilities' : 'intelligence'}.
        </p>
      </div>
    </div>
  );
}


function MemberDetailsDialog({ member, protocols, volunteerOpps, events, isOpen, onOpenChange }: { 
  member: Member; 
  protocols: any[]; 
  volunteerOpps: any[]; 
  events: TeamEvent[];
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const signatures = member.signatures || {};
  
  // Calculate verified volunteer missions (include parent's work for family tracking)
  const missionHistory = volunteerOpps
    .filter(opp => {
      const signup = (member.userId && opp.signups?.[member.userId]) || 
                    (member.parentId && opp.signups?.[member.parentId]);
      return !!signup;
    })
    .map(opp => {
      const signup = (member.userId && opp.signups?.[member.userId]) || 
                    (member.parentId && opp.signups?.[member.parentId]);
      return {
        title: opp.title,
        date: opp.date,
        endDate: opp.endDate,
        points: opp.points,
        status: signup.status,
        id: opp.id,
        type: 'volunteer'
      };
    });

  // Calculate event assignments
  const assignmentHistory = events.flatMap(ev => 
    (ev.assignments || [])
      .filter((a: any) => 
        (member.userId && a.assigneeId === member.userId) || 
        (member.parentId && a.assigneeId === member.parentId)
      )
      .map((a: any) => ({
        title: `${ev.title}: ${a.title}`,
        date: ev.date,
        points: a.points || 25, // Default points for event tasks
        status: a.status,
        id: a.id,
        type: 'assignment'
      }))
  );

  const allPointsHistory = [...missionHistory, ...assignmentHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const totalVerifiedPoints = allPointsHistory
    .filter(h => (h.status === 'verified' || h.status === 'completed'))
    .reduce((acc, current) => acc + (current.points || 0), 0);

  const pendingPoints = allPointsHistory
    .filter(h => h.status === 'pending' || h.status === 'claimed')
    .reduce((acc, current) => acc + (current.points || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[3rem] sm:max-w-3xl p-0 overflow-hidden border-none shadow-2xl bg-white">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
          <DialogHeader>
            <div className="flex items-center gap-6 mb-4">
              <Avatar className="h-20 w-20 rounded-[2rem] border-4 border-white shadow-xl">
                <AvatarImage src={member.avatar} />
                <AvatarFallback className="font-black text-2xl">{member.name[0]}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <DialogTitle className="text-4xl font-black uppercase tracking-tight leading-none">{member.name}</DialogTitle>
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[10px] h-6 px-3">{member.position}</Badge>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{member.role}</span>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Compliance Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Institutional Protocols</h3>
              </div>
              <div className="bg-muted/10 rounded-[2.5rem] p-6 space-y-3 shadow-inner border border-black/5">
                {protocols.map(p => {
                  const isSigned = !!signatures[p.id];
                  return (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm">
                      <p className="text-[10px] font-black uppercase tracking-tight truncate max-w-[180px]">{p.title}</p>
                      <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center border-2 transition-all",
                        isSigned ? "bg-green-50 border-green-100 text-green-600" : "bg-red-50 border-red-100 text-red-600"
                      )}>
                        {isSigned ? <Check className="h-4 w-4" strokeWidth={3} /> : <AlertCircle className="h-4 w-4" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Points Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-2">
                <Trophy className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Strategic Mobilization</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="rounded-[2rem] border-none shadow-md bg-black text-white p-6 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Verified</p>
                  <p className="text-3xl font-black">{totalVerifiedPoints} <span className="text-[10px]">PTS</span></p>
                </Card>
                <Card className="rounded-[2rem] border-none shadow-md bg-white border border-black/5 p-6 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pending</p>
                  <p className="text-3xl font-black text-primary">{pendingPoints} <span className="text-[10px]">PTS</span></p>
                </Card>
              </div>

              <ScrollArea className="h-[280px] bg-muted/10 rounded-[2.5rem] p-4 shadow-inner border border-black/5">
                <div className="space-y-2">
                  {allPointsHistory.map((h, i) => (
                    <div key={`${h.id}-${i}`} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-tight truncate leading-none mb-1">{h.title}</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                          {h.date}{(h as any).endDate && (h as any).endDate !== h.date ? ` - ${(h as any).endDate}` : ''} • {h.type === 'volunteer' ? 'Mission' : 'Event Task'}
                        </p>
                      </div>
                      <Badge className={cn(
                        "border-none font-black text-[8px] uppercase px-2 h-5 shrink-0",
                        (h.status === 'verified' || h.status === 'completed') ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {h.points} PTS
                      </Badge>
                    </div>
                  ))}
                  {allPointsHistory.length === 0 && (
                    <div className="py-20 text-center opacity-20 italic text-[10px] font-black uppercase">No mobilization history found.</div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button onClick={() => onOpenChange(false)} className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest bg-black text-white hover:bg-black/90">Institutional Record Closed</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TrackingMatrix({ members, protocols, volunteerOpps, events }: { members: Member[], protocols: any[], volunteerOpps: any[], events: TeamEvent[] }) {
  const [view, setView] = useState<'compliance' | 'volunteers'>('compliance');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  return (
    <Card className="rounded-[3rem] border-none shadow-2xl bg-white overflow-hidden">
      <div className="p-8 border-b bg-muted/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-2xl font-black uppercase tracking-tight">Institutional Tracking</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Real-time visibility into squad readiness & mobilization</p>
        </div>
        <div className="flex bg-muted/20 p-1.5 rounded-2xl border-2 border-primary/5 shadow-inner">
          <button 
            onClick={() => setView('compliance')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
              view === 'compliance' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Protocol Sync
          </button>
          <button 
            onClick={() => setView('volunteers')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
              view === 'volunteers' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Volunteer Intel
          </button>
        </div>
      </div>

      <ScrollArea className="h-[600px] w-full">
        {/* Desktop Table View */}
        <div className="hidden md:block">
          <div className="min-w-[800px]">
            <Table>
              <TableHeader className="bg-muted/30 sticky top-0 z-20">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-[280px] h-16 font-black uppercase text-[10px] tracking-widest pl-8 text-primary/60">Personnel</TableHead>
                  {view === 'compliance' ? protocols.map(p => (
                    <TableHead key={p.id} className="text-center font-black uppercase text-[10px] tracking-widest text-primary/60">{p.title}</TableHead>
                  )) : (
                    <>
                      <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-primary/60">Total Points</TableHead>
                      <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-primary/60">Assignments</TableHead>
                      <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-primary/60">Status</TableHead>
                      <TableHead className="text-center font-black uppercase text-[10px] tracking-widest text-primary/60">Readiness</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, idx) => {
                  const signatures = m.signatures || {};
                  
                  // Calculate mobilization metrics
                  let totalPoints = 0;
                  let activeAssignmentsCount = 0;
                  
                  // 1. Volunteer Opportunities (Include parent contributions)
                  volunteerOpps.forEach(opp => {
                    const signup = (m.userId && opp.signups?.[m.userId]) || 
                                  (m.parentId && opp.signups?.[m.parentId]);
                    if (signup) {
                      if (signup.status === 'verified') {
                        totalPoints += (opp.points || 0);
                      } else {
                        activeAssignmentsCount++;
                      }
                    }
                  });

                  // 2. Event Assignments (Include parent contributions)
                  events.forEach(ev => {
                    (ev.assignments || []).forEach((a: any) => {
                      const isAssignedToMember = (m.userId && a.assigneeId === m.userId) || 
                                                (m.parentId && a.assigneeId === m.parentId);
                      if (isAssignedToMember) {
                        if (a.status === 'completed' || a.status === 'verified') {
                          totalPoints += (a.points || 25);
                        } else {
                          activeAssignmentsCount++;
                        }
                      }
                    });
                  });

                  return (
                    <TableRow 
                      key={m.id} 
                      className={cn("hover:bg-muted/5 transition-colors border-b-2 border-muted/20 cursor-pointer", idx % 2 === 1 && "bg-muted/5")}
                      onClick={() => setSelectedMember(m)}
                    >
                      <TableCell className="py-5 pl-8">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 rounded-xl border-2 border-white shadow-sm hover:scale-110 transition-transform">
                            <AvatarImage src={m.avatar} />
                            <AvatarFallback className="font-black text-xs">{m.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-black text-xs uppercase tracking-tight truncate leading-none mb-1">{m.name}</p>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                              {m.position} • {m.role}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {view === 'compliance' ? protocols.map(p => {
                        const isSigned = !!signatures[p.id];
                        return (
                          <TableCell key={p.id} className="text-center">
                            <div className="flex justify-center">
                              <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center border-2 transition-all shadow-sm",
                                isSigned ? "bg-green-50 border-green-200 text-green-600 shadow-green-600/5 rotate-0" : "bg-red-50/50 border-red-100 text-red-300 opacity-40 grayscale"
                              )}>
                                {isSigned ? <Check className="h-5 w-5" strokeWidth={3} /> : <AlertCircle className="h-5 w-5" />}
                              </div>
                            </div>
                          </TableCell>
                        );
                      }) : (
                        <>
                          <TableCell className="text-center">
                            <Badge className="bg-primary/10 text-primary border-none font-black text-xs px-4 h-8 rounded-lg shadow-sm">
                              {totalPoints} PTS
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-black uppercase tracking-widest opacity-60">{activeAssignmentsCount} Active</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={cn(
                              "border-none font-black text-[8px] uppercase px-3 h-6",
                              totalPoints >= 100 ? "bg-green-100 text-green-700" : totalPoints > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                            )}>
                              {totalPoints >= 300 ? 'Commander' : totalPoints >= 150 ? 'Elite Tier' : totalPoints >= 50 ? 'Engaged' : totalPoints > 0 ? 'Recruit' : 'Cold'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              const isCompliant = protocols.every(p => !!signatures[p.id]);
                              const isMobilized = totalPoints >= 50;
                              const status = (isCompliant && isMobilized) ? 'READY' : (isCompliant || isMobilized) ? 'PARTIAL' : 'NOT READY';
                              
                              return (
                                <Badge className={cn(
                                  "border-none font-black text-[8px] uppercase px-3 h-6",
                                  status === 'READY' ? "bg-green-500 text-white" : status === 'PARTIAL' ? "bg-amber-500 text-white" : "bg-destructive text-white"
                                )}>
                                  {status}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 p-4">
          {members.map((m) => {
            const signatures = m.signatures || {};
            let totalPoints = 0;
            let activeAssignmentsCount = 0;
            
            volunteerOpps.forEach(opp => {
              const signup = (m.userId && opp.signups?.[m.userId]) || (m.parentId && opp.signups?.[m.parentId]);
              if (signup) {
                if (signup.status === 'verified') {
                  totalPoints += (opp.points || 0);
                } else {
                  activeAssignmentsCount++;
                }
              }
            });

            events.forEach(ev => {
              (ev.assignments || []).forEach((a: any) => {
                const isAssignedToMember = (m.userId && a.assigneeId === m.userId) || (m.parentId && a.assigneeId === m.parentId);
                if (isAssignedToMember) {
                  if (a.status === 'completed' || a.status === 'verified') {
                    totalPoints += (a.points || 25);
                  } else {
                    activeAssignmentsCount++;
                  }
                }
              });
            });

            return (
              <Card key={m.id} className="rounded-2xl overflow-hidden" onClick={() => setSelectedMember(m)}>
                <div className="p-4 flex items-center gap-3">
                  <Avatar className="h-12 w-12 rounded-xl border-2 border-white shadow-sm">
                    <AvatarImage src={m.avatar} />
                    <AvatarFallback className="font-black text-sm">{m.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm uppercase truncate">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{m.position} • {m.role}</p>
                  </div>
                  {view === 'volunteers' && (
                    <div className="text-right">
                      <p className="text-lg font-black text-primary">{totalPoints}</p>
                      <p className="text-[8px] text-muted-foreground uppercase tracking-widest">PTS</p>
                    </div>
                  )}
                </div>
                
                <div className="px-4 pb-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 italic">Click to view details</p>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {selectedMember && (
        <MemberDetailsDialog 
          member={selectedMember} 
          protocols={protocols}
          volunteerOpps={volunteerOpps}
          events={events}
          isOpen={!!selectedMember} 
          onOpenChange={(o) => !o && setSelectedMember(null)} 
        />
      )}
    </Card>
  );
}

function VolunteerOpportunityManager() {
  const { db, activeTeam, members, addVolunteerOpportunity, updateVolunteerOpportunity, deleteVolunteerOpportunity, verifyVolunteerPoints, confirmVolunteerAttendance, createAlert } = useTeam();
  const [isAdding, setIsAdding] = useState(false);
  const [editingOpp, setEditingOpp] = useState<any>(null);
  const [managingOpp, setManagingOpp] = useState<any>(null);
  
  const vRef = useMemoFirebase(() => db && activeTeam?.id ? query(collection(db, 'teams', activeTeam.id, 'volunteers'), orderBy('date', 'desc')) : null, [db, activeTeam?.id]);
  const { data: opportunities, isLoading } = useCollection(vRef);

  const [form, setForm] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '09:00',
    location: '',
    points: 50,
    spots: 2,
    description: ''
  });

  const handleSave = async () => {
    if (editingOpp) {
      await updateVolunteerOpportunity(editingOpp.id, form);
      setEditingOpp(null);
    } else {
      await addVolunteerOpportunity(form);
      setIsAdding(false);
    }
    toast({ title: "Intelligence Updated", description: "Volunteer mission deployed successfully." });
    setForm({ title: '', date: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), startTime: '09:00', location: '', points: 50, spots: 2, description: '' });
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-4 rounded-[1.5rem] text-primary shadow-xl shadow-primary/5">
            <LayoutGrid className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Mission Board</h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1">Deploy Mobilization Opportunities for the Squad</p>
          </div>
        </div>
        <Button onClick={() => setIsAdding(true)} className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95 group">
          <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" /> Recruit Volunteers
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {opportunities?.map(opp => {
          const signupsMap = opp.signups || {};
          const signups = Object.values(signupsMap);
          const filled = signups.length;
          const isFull = filled >= opp.spots;

          return (
            <Card key={opp.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-6 group hover:shadow-2xl transition-all relative overflow-hidden">
              {isFull && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge className="bg-green-100 text-green-700 border-none font-black text-[8px] uppercase px-3 h-6 rounded-full shadow-sm">Fully Staffed</Badge>
                </div>
              )}
              
              <div className="space-y-1 relative z-10">
                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] opacity-40">Tactical Assignment</p>
                <div className="flex items-start justify-between">
                  <h3 className="text-2xl font-black uppercase tracking-tighter leading-none truncate pr-4">{opp.title}</h3>
                  <Badge variant="outline" className="h-6 font-black text-[9px] uppercase tracking-widest bg-primary/5 border-primary/20">{opp.points} PTS</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-muted/20 rounded-2xl space-y-1">
                  <p className="text-[7px] font-black uppercase text-muted-foreground">Logistics (Date Range)</p>
                  <p className="text-[10px] font-black uppercase truncate">
                    {opp.date}{opp.endDate && opp.endDate !== opp.date ? ` - ${opp.endDate}` : ''}
                  </p>
                </div>
                <div className="p-4 bg-muted/20 rounded-2xl space-y-1">
                  <p className="text-[7px] font-black uppercase text-muted-foreground">Intelligence (Start Time)</p>
                  <p className="text-[10px] font-black uppercase truncate">{opp.startTime}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Deployment Capacity</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">{filled} / {opp.spots} Secured</span>
                </div>
                <div className="h-2.5 w-full bg-muted/30 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-500", isFull ? "bg-green-500" : "bg-primary")} style={{ width: `${Math.min(100, (filled / opp.spots) * 100)}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 min-h-[40px] pt-2">
                {signups.map((s: any, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-xl border transition-all",
                    s.status === 'verified' ? "bg-green-50 border-green-200" : "bg-muted/50 border-muted-foreground/10"
                  )}>
                    <CheckCircle2 className={cn("h-3 w-3", s.status === 'verified' ? "text-green-600" : "text-muted-foreground/30")} />
                    <span className={cn("text-[9px] font-black uppercase", s.status === 'verified' ? "text-green-700" : "text-muted-foreground")}>{s.userName}</span>
                  </div>
                ))}
                {signups.length === 0 && <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 italic py-2">Mission unstaffed</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4 border-t-2 border-dashed border-muted/20">
                <Button onClick={() => setManagingOpp(opp)} className="h-12 rounded-xl text-[10px] font-black uppercase tracking-widest bg-black text-white hover:bg-black/90">Manage Personnel</Button>
                <div className="grid grid-cols-2 gap-1">
                  <Button variant="outline" size="icon" onClick={() => { setEditingOpp(opp); setForm(opp); }} className="h-12 rounded-xl border-2"><Edit3 className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => deleteVolunteerOpportunity(opp.id)} className="h-12 rounded-xl border-2 text-red-600 hover:bg-red-50 hover:border-red-100"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          );
        })}

        {(!opportunities || opportunities.length === 0) && (
          <div className="col-span-full py-40 text-center space-y-6 bg-muted/5 border-2 border-dashed rounded-[3.5rem] opacity-30">
            <LayoutGrid className="h-20 w-20 mx-auto" />
            <div>
              <p className="text-xl font-black uppercase tracking-tight">Mission Board Vacant</p>
              <p className="text-xs font-bold uppercase tracking-widest mt-1">Start deploying volunteer opportunities to mobilize your squad.</p>
            </div>
          </div>
        )}
      </div>

      {/* Deployment & Refinement Modal */}
      <Dialog open={isAdding || !!editingOpp} onOpenChange={(o) => { if(!o) { setIsAdding(false); setEditingOpp(null); } }}>
        <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 overflow-hidden border-none shadow-2xl bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-4 rounded-2xl text-primary shadow-lg shadow-primary/5"><LayoutGrid className="h-7 w-7" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingOpp ? 'Refine Mission' : 'Deploy Mission'}</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Define logistics & strategic reward value</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Assignment Title</Label>
                  <Input placeholder="e.g. Scorekeeping" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-14 rounded-2xl border-2 font-black text-base focus:ring-primary shadow-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Reward (Points)</Label>
                  <Input type="number" value={form.points} onChange={e => setForm({ ...form, points: parseInt(e.target.value) })} className="h-14 rounded-2xl border-2 font-black text-base shadow-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                  <DatePicker 
                    date={form.date} 
                    setDate={d => setForm({ ...form, date: d })} 
                    placeholder="Select Start Date"
                    className="h-14 rounded-2xl border-2 px-6 italic font-black uppercase tracking-widest bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                  <DatePicker 
                    date={form.endDate} 
                    setDate={d => setForm({ ...form, endDate: d })} 
                    placeholder="Select End Date"
                    className="h-14 rounded-2xl border-2 px-6 italic font-black uppercase tracking-widest bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Capacity (Spots)</Label>
                  <Input type="number" value={form.spots} onChange={e => setForm({ ...form, spots: parseInt(e.target.value) })} className="h-14 rounded-2xl border-2 font-black text-base shadow-sm" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Description</Label>
                <Textarea placeholder="Detail the duties and expectations..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[120px] rounded-3xl border-2 font-medium p-6 resize-none shadow-sm" />
              </div>
            </div>

            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleSave}>
                <Save className="h-5 w-5 mr-3" /> Commit Mission Deployment
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Personnel Management Modal */}
      <Dialog open={!!managingOpp} onOpenChange={(o) => { if(!o) setManagingOpp(null); }}>
        <DialogContent className="rounded-[4rem] sm:max-w-2xl p-0 overflow-hidden border-none shadow-3xl bg-[#fafafa]">
          <div className="p-12 space-y-10">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Mobilization Management</p>
                <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">{managingOpp?.title}</h2>
              </div>
              <Badge className="bg-primary/10 text-primary border-none font-black text-[10px] px-4 h-8 rounded-xl">{managingOpp?.points} PTS REWARD</Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Personnel Registry</h4>
                <Select onValueChange={async (uid) => {
                  const m = members.find(mem => mem.userId === uid);
                  if (m && managingOpp) {
                    const newSignups = {
                      ...(managingOpp.signups || {}),
                      [uid]: { userId: uid, userName: m.name, status: 'pending', createdAt: new Date().toISOString() }
                    };
                    await updateVolunteerOpportunity(managingOpp.id, { signups: newSignups });
                    await createAlert(
                      "New Mission Assigned",
                      `You have been assigned to the volunteer mission: ${managingOpp.title}. Check the Volunteer Board for details.`,
                      uid as any
                    );
                    setManagingOpp({ ...managingOpp, signups: newSignups });
                    toast({ title: "Personnel Deployed", description: `${m.name} has been assigned to this mission.` });
                  }
                }}>
                  <SelectTrigger className="w-[200px] h-10 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest bg-white">
                    <SelectValue placeholder="Assign Member" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-2">
                    {members.filter(m => !managingOpp?.signups?.[m.userId]).map(m => (
                      <SelectItem key={m.id} value={m.userId} className="font-black text-[10px] uppercase">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                {Object.values(managingOpp?.signups || {}).map((s: any) => (
                  <div key={s.userId} className="bg-white rounded-3xl p-5 border-2 border-black/5 flex items-center justify-between shadow-sm group hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shadow-inner", s.status === 'verified' ? "bg-green-500 text-white" : "bg-muted text-muted-foreground/40")}>
                        {s.status === 'verified' ? <Check className="h-5 w-5" strokeWidth={3} /> : <Users className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-black text-xs uppercase tracking-tight">{s.userName}</p>
                        <p className={cn("text-[8px] font-black uppercase tracking-widest mt-0.5", s.status === 'verified' ? "text-green-600" : "text-amber-500")}>
                          {s.status === 'verified' ? 'Points Awarded' : 'Awaiting Intelligence'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status !== 'verified' ? (
                        <Button onClick={async () => {
                          await verifyVolunteerPoints(managingOpp.id, s.userId, managingOpp.points);
                          await createAlert(
                            "Strategic Points Awarded",
                            `Your contribution to "${managingOpp.title}" has been verified. ${managingOpp.points} points have been credited to your institutional record.`,
                            s.userId as any
                          );
                          const updated = { ...managingOpp.signups, [s.userId]: { ...s, status: 'verified' } };
                          setManagingOpp({ ...managingOpp, signups: updated });
                          toast({ title: "Mission Verified", description: `Intelligence confirmed. Points awarded to ${s.userName}.` });
                        }} className="h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20">Verify & Award</Button>
                      ) : (
                         <div className="h-10 flex items-center px-4 rounded-xl border-2 border-green-100 text-green-600 font-black text-[10px] uppercase tracking-widest bg-green-50/50">Completed</div>
                      )}
                      <Button variant="ghost" size="icon" onClick={async () => {
                        const { [s.userId]: _, ...rest } = managingOpp.signups;
                        await updateVolunteerOpportunity(managingOpp.id, { signups: rest });
                        setManagingOpp({ ...managingOpp, signups: rest });
                        toast({ title: "Personnel Relieved", description: "Member removed from mission registry." });
                      }} className="h-10 w-10 rounded-xl text-red-600 hover:bg-red-50"><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                {Object.values(managingOpp?.signups || {}).length === 0 && (
                  <div className="py-12 bg-white rounded-[2.5rem] border-2 border-dashed border-black/5 text-center flex flex-col items-center justify-center space-y-4">
                    <div className="bg-muted p-4 rounded-2xl opacity-20"><Users className="h-8 w-8" /></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Registry Empty. Assign personnel above.</p>
                  </div>
                )}
              </div>
            </div>
            
            <Button onClick={() => setManagingOpp(null)} variant="outline" className="w-full h-14 rounded-2xl font-black uppercase text-xs tracking-widest border-2">Close Commander View</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function RecruitingProfileManager({ member }: { member: Member }) {
  const { 
    getRecruitingProfile, updateRecruitingProfile, getAthleticMetrics, 
    updateAthleticMetrics, getPlayerStats, addPlayerStat, deletePlayerStat,
    getEvaluations, addEvaluation, getRecruitingContact, updateRecruitingContact,
    getPlayerVideos, addPlayerVideo, updatePlayerVideo, deletePlayerVideo, toggleRecruitingProfile,
    updatePlayerStat, getStaffEvaluation
  } = useTeam();
  const { user } = useTeam();

  const [profile, setProfile] = useState<Partial<RecruitingProfile>>({});
  const [metrics, setMetrics] = useState<Partial<AthleticMetrics>>({});
  const [stats, setStats] = useState<PlayerStat[]>([]);
  const [evals, setEvaluations] = useState<PlayerEvaluation[]>([]);
  const [staffNote, setStaffNote] = useState('');
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletedStatIds, setDeletedStatIds] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [activeTeam] = useState(user?.clubName || 'Elite Academy'); // Fallback for prominent display
  const [photos, setPhotos] = useState<string[]>([]);
  const loadData = useCallback(async () => {
    if (!member.playerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, m, s, e, c, v, sn] = await Promise.all([
        getRecruitingProfile(member.playerId),
        getAthleticMetrics(member.playerId),
        getPlayerStats(member.playerId),
        getEvaluations(member.playerId),
        getRecruitingContact(member.playerId),
        getPlayerVideos(member.playerId),
        getStaffEvaluation(member.id)
      ]);
      if (p) {
        setProfile(p);
        setPhotos(p.photos || []);
      }
      if (p) setProfile(p);
      if (m) setMetrics(m);
      setStats(s || []);
      if (c) setContact(c);
      if (e) setEvaluations(e);
      if (v) setVideos(v || []);
      setStaffNote(sn || '');
      console.log("Loaded contact details:", c);
    } catch (error) {
      console.error("Error loading athlete pack:", error);
    } finally {
      setLoading(false);
    }
  }, [member.id, member.playerId, getRecruitingProfile, getAthleticMetrics, getPlayerStats, getEvaluations, getRecruitingContact, getPlayerVideos, getStaffEvaluation]);


  useEffect(() => { loadData(); }, [loadData]);

  const handleUpdateProfile = async () => {
    if (!member.playerId) {
      toast({ 
        title: "Synchronization Identity Failure", 
        description: "Athlete identity (playerId) not found. Verify this athlete is correctly assigned in the roster.", 
        variant: "destructive" 
      });
      if (!getApps().length) {
        initializeApp(firebaseConfig);
      }
      console.warn("Recruiting sync failed: No playerId for member", member);
      return;
    }
    
    setIsSyncing(true);
    console.log("Initiating pack synchronization for player:", member.playerId);

    try {
      const isEnabled = profile.status === 'active' || profile.status === 'committed';
      
      const updatePromises = [
        updateRecruitingProfile(member.playerId, { ...profile, photos }),
        updateAthleticMetrics(member.playerId, {
          ...metrics,
          graduationYear: profile.graduationYear ? Number(profile.graduationYear) : undefined,
          academicGPA: profile.academicGPA ? Number(profile.academicGPA) : undefined
        }),
        updateRecruitingContact(member.playerId, contact),
        toggleRecruitingProfile(member.playerId, isEnabled),
        ...stats.map(s => {
          if (s.id.startsWith('temp_')) {
            const { id, ...data } = s;
            return addPlayerStat(member.playerId as string, data);
          }
          return updatePlayerStat(member.playerId as string, s.id, s);
        }),
        ...deletedStatIds.map(id => deletePlayerStat(member.playerId as string, id))
      ];
      
      await Promise.all(updatePromises);
      
      setDeletedStatIds([]);
      console.log("Recruiting pack synchronization successfully persisted.");
      
      toast({
        title: "Recruiting Pack Synchronized",
        description: `Institutional repository for ${member.name} has been updated in the cloud registry.`,
      });
      
      setIsEditing(false);
      await loadData();
    } catch (error: any) {
      console.error("Recruiting synchronization failed:", error);
      toast({
        title: "Pack Sync Failed",
        description: error.message || "An unexpected latency error occurred. Attempting to restore connection...",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
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

  const updateStat = (id: string, field: string, val: any) => {
    setStats(stats.map(s => s.id === id ? { ...s, [field]: val } : s));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Asset Oversized", description: "Image exceeds 5MB threshold. Optimize or use a hosted URL.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setProfile({ ...profile, photoURL: base64 });
      toast({ title: "Image Uploaded", description: "Recruiting photo updated locally. Commit to synchronize." });
    };
    reader.readAsDataURL(file);
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Asset Oversized", description: "Image exceeds 5MB threshold.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPhotos(prev => [...prev, base64]);
      toast({ title: "Photo Added to Gallery", description: "Update successfully staged." });
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddStatRow = async () => {
    if (!member.playerId) return;
    const newStat: PlayerStat = { 
      id: `temp_${Date.now()}`,
      season: new Date().getFullYear().toString(), 
      gamesPlayed: 0, 
      points: 0, 
      assists: 0, 
      efficiency: 0,
      playerId: member.playerId
    };
    setStats([...stats, newStat]);
  };

  const handleDeleteStat = async (id: string) => {
    if (!member.playerId) return;
    
    if (!id.startsWith('temp_')) {
      setDeletedStatIds(prev => [...prev, id]);
    }
    
    setStats(stats.filter(s => s.id !== id));
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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
      <header className="grid grid-cols-1 xl:grid-cols-12 items-center gap-10 bg-white p-10 lg:p-14 rounded-[3.5rem] lg:rounded-[4.5rem] border-2 border-black/[0.03] shadow-2xl shadow-black/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-1000">
          <Star className="h-64 w-64 text-zinc-900" />
        </div>
        
        <div className="xl:col-span-8 flex flex-col md:flex-row items-center gap-10 lg:gap-14 relative z-10">
          <div className="relative shrink-0">
            <Avatar className="h-44 w-44 lg:h-52 lg:w-52 rounded-[3.5rem] lg:rounded-[4rem] ring-[12px] ring-primary/5 shadow-2xl overflow-hidden border-4 border-white transition-transform duration-500 group-hover:scale-[1.02]">
              <AvatarImage src={profile.photoURL || member.avatar} className="object-cover" />
              <AvatarFallback className="font-black text-5xl bg-zinc-50 text-zinc-300">{member.name[0]}</AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-2 -right-2 lg:-bottom-4 lg:-right-4 bg-black text-white h-14 w-14 lg:h-16 lg:w-16 rounded-2xl lg:rounded-3xl flex items-center justify-center shadow-2xl border-[6px] border-white font-black text-lg lg:text-xl transform rotate-3">
              #{profile.jerseyNumber || member.jersey || '00'}
            </div>
          </div>

          <div className="space-y-5 text-center md:text-left flex-1 min-w-0">
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <Badge className="bg-primary text-white border-none font-black text-[10px] tracking-widest px-5 h-8 w-fit mx-auto md:mx-0 shadow-lg shadow-primary/20">ATHLETE CORE</Badge>
                <div className="flex items-center justify-center md:justify-start gap-3">
                   <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse" />
                   <p className="text-[11px] font-black uppercase text-zinc-400 tracking-[0.35em]">
                     {activeSport} <span className="mx-2 text-zinc-200">/</span> {profile.status === 'committed' ? 'COMMITTED' : 'ACTIVE PROSPECT'}
                   </p>
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-zinc-900 leading-[1.1] break-words">
                {member.name}
              </h3>
              
              <div className="flex flex-col gap-1.5 mt-2">
                {member.email && (
                  <div className="flex items-center gap-2 group/contact">
                    <div className="bg-primary/5 p-1 rounded-md text-primary/60 group-hover/contact:text-primary transition-colors">
                      <Mail className="h-3 w-3" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover/contact:text-zinc-900 transition-colors">
                      {member.email}
                    </span>
                  </div>
                )}
                {member.parentEmail && (
                  <div className="flex items-center gap-2 group/contact">
                    <div className="bg-amber-500/5 p-1 rounded-md text-amber-500/60 group-hover/contact:text-amber-500 transition-colors">
                      <Users className="h-3 w-3" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover/contact:text-zinc-900 transition-colors">
                      <span className="text-amber-500/60 mr-1">GUARDIAN:</span> {member.parentEmail}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-8 gap-y-4 pt-2">
              <div className="flex items-center gap-3 group/item">
                <div className="h-9 w-9 rounded-2xl bg-zinc-50 flex items-center justify-center text-primary border border-black/[0.03] shadow-sm transition-colors group-hover/item:bg-primary/10">
                  <Target className="h-4.5 w-4.5" />
                </div>
                <p className="text-[13px] font-black text-zinc-700 uppercase tracking-widest">{profile.primaryPosition || member.position || 'Athlete'}</p>
              </div>
              <div className="flex items-center gap-3 group/item">
                <div className="h-9 w-9 rounded-2xl bg-zinc-50 flex items-center justify-center text-primary border border-black/[0.03] shadow-sm transition-colors group-hover/item:bg-primary/10">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </div>
                <p className="text-[13px] font-black text-primary uppercase tracking-widest">{activeTeam}</p>
              </div>
              <div className="flex items-center gap-3 text-zinc-400 group/item">
                <div className="h-9 w-9 rounded-2xl bg-zinc-50 flex items-center justify-center transition-colors group-hover/item:bg-zinc-100">
                  <MapPin className="h-4.5 w-4.5" />
                </div>
                <p className="text-[13px] font-bold uppercase tracking-widest">{profile.hometown || 'Location TBD'}</p>
              </div>
            </div>

            {member.status === 'removed' && (
              <div className="bg-red-50 p-6 rounded-[2rem] border-2 border-dashed border-red-200 mt-6 space-y-2 animate-in slide-in-from-top duration-500">
                <div className="flex items-center gap-2 mb-1">
                  <History className="h-4 w-4 text-red-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-700 leading-none">Decommissioned Personnel</p>
                  <p className="text-[8px] font-bold text-red-400 uppercase tracking-widest ml-auto">
                    {member.removedAt ? format(new Date(member.removedAt), 'MMM d, yyyy') : 'No Date Logged'}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-red-800 leading-relaxed italic">
                  "{member.removalReason || 'No removal audit trail established for this athlete record.'}"
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col sm:flex-row xl:flex-col items-stretch gap-4 w-full relative z-10 xl:pl-8">
          <Button 
            variant="outline" 
            className="group/btn relative overflow-hidden rounded-[2rem] h-16 xl:h-20 border-2 border-zinc-100 font-black uppercase text-[12px] tracking-[0.1em] hover:bg-zinc-50 hover:text-black transition-all active:scale-[0.98] shadow-sm px-10 bg-white" 
            onClick={() => window.open(`/recruit/player/${member.playerId}`, '_blank')}
          >
            <div className="flex items-center justify-center relative z-10">
              <ExternalLink className="h-5 w-5 mr-3 text-zinc-400 group-hover/btn:text-primary transition-colors" /> 
              Scout Portal
            </div>
          </Button>
          <Button 
            className="group/btn relative overflow-hidden rounded-[2rem] h-16 xl:h-20 font-black uppercase text-[12px] tracking-[0.1em] shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all bg-primary hover:bg-primary/95 text-white border-b-4 border-black/10 px-10" 
            onClick={() => setIsEditing(true)}
          >
            <div className="flex items-center justify-center relative z-10">
              <Sparkles className="h-5 w-5 mr-3 text-white/80 group-hover/btn:scale-110 transition-transform" /> 
              Pack Architect
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
          </Button>
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
                <h4 className="text-xl font-black uppercase tracking-tight">
                  {profile.status === 'active' ? 'Active Prospect' :
                   profile.status === 'committed' ? 'Committed' :
                   profile.status === 'hidden' ? 'Inactive / Private' : 'Not Set'}
                </h4>
              </div>
              <p className="text-[11px] font-bold text-white/40 leading-relaxed uppercase tracking-wider">
                {profile.status === 'hidden' ? 'Scout portal is private.' : 'Scout portal is active.'}
              </p>
            </div>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Seasonal Analytics</h4>
              <BarChart2 className="h-4 w-4 text-muted-foreground opacity-30" />
            </div>
            <div className="space-y-4">
              {stats.length > 0 ? (
                <div className="space-y-2">
                  {stats.slice(0, 3).map(s => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                      <p className="text-[10px] font-black uppercase">{s.season}</p>
                      <p className="text-[10px] font-black uppercase text-primary">{s.points} PTS • {s.assists} AST</p>
                    </div>
                  ))}
                  {stats.length > 3 && <p className="text-[8px] font-black uppercase text-muted-foreground text-center">+{stats.length - 3} more records</p>}
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed rounded-3xl opacity-20">
                  <p className="text-[8px] font-black uppercase">No records found</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Bio</h4>
              <Star className="h-4 w-4 text-primary opacity-20" />
            </div>
            <p className="text-xs font-medium text-muted-foreground leading-relaxed italic line-clamp-4">"{profile.bio || 'No strategic narrative established for this athlete.'}"</p>
          </Card>

          {staffNote && (
            <Card className="rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 bg-primary/5 p-6 space-y-4 animate-in fade-in duration-700">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Commander's Appraisal</h4>
                <ShieldAlert className="h-4 w-4 text-primary opacity-40" />
              </div>
              <p className="text-xs font-bold text-zinc-900 leading-relaxed italic">"{staffNote}"</p>
            </Card>
          )}
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 text-foreground">
              <div className="lg:col-span-1 space-y-8">
                <section className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Identity & Branding</h3>
                  <div className="space-y-5">
                    <div className="relative group mx-auto w-32 h-32">
                      <Avatar className="h-32 w-32 rounded-[2.5rem] ring-4 ring-primary/5 shadow-xl border-4 border-white overflow-hidden">
                        <AvatarImage src={profile.photoURL || member.avatar} className="object-cover" />
                        <AvatarFallback className="font-black text-2xl text-muted-foreground uppercase">{member.name[0]}</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase ml-1">Recruiting Image URL <span className="opacity-40 normal-case">(Max 5MB)</span></Label>
                       <div className="flex gap-2">
                         <Input value={profile.photoURL ?? ''} onChange={e => setProfile({...profile, photoURL: e.target.value})} className="h-10 border-2 rounded-xl font-bold text-[10px] flex-1" placeholder="https://image-hosting.com/photo.jpg" />
                         <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                         <Button type="button" variant="outline" className="h-10 border-2 rounded-xl text-[8px] font-black uppercase transition-all hover:bg-primary hover:text-white" onClick={() => imageInputRef.current?.click()}>
                           <Camera className="h-4 w-4 mr-1 text-primary group-hover:text-white" /> Upload
                         </Button>
                       </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Type of Sport</Label>
                        <Select value={activeSport} onValueChange={(v: any) => setProfile({...profile, typeOfSport: v})}>
                          <SelectTrigger className="h-12 border-2 rounded-xl font-bold uppercase text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {['Baseball', 'Softball', 'Basketball', 'Soccer', 'Football', 'Lacrosse', 'Hockey', 'Custom'].map(s => (
                              <SelectItem key={s} value={s} className="font-bold uppercase text-[10px]">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase ml-1">Pipeline Status</Label>
                        <Select value={profile.status ?? ''} onValueChange={(v: any) => setProfile({...profile, status: v})}>
                          <SelectTrigger className="h-12 border-2 rounded-xl font-bold uppercase text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="active" className="font-bold uppercase text-[10px]">Active Prospect</SelectItem>
                            <SelectItem value="hidden" className="font-bold uppercase text-[10px]">Inactive/Private</SelectItem>
                            <SelectItem value="committed" className="font-bold uppercase text-[10px]">Committed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-6 bg-primary/5 p-8 rounded-[2.5rem] border-2 border-primary/10">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-xl text-white shadow-lg shadow-primary/20"><Target className="h-4 w-4" /></div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Institutional Pulse</h3>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase leading-relaxed tracking-wider px-1">
                      Provide a strategic overview for recruiters. This narrative is private unless the profile is shared.
                    </p>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase ml-1 opacity-60">Institutional Pulse (Coach Narrative)</Label>
                       <Textarea 
                         value={profile.institutionalPulse ?? ''} 
                         onChange={e => setProfile({...profile, institutionalPulse: e.target.value})} 
                         className="min-h-[160px] border-2 rounded-2xl font-medium p-5 resize-none text-[13px] bg-white shadow-inner focus:ring-primary/20" 
                         placeholder="Institutional overview, coach feedback, or status update..." 
                       />
                    </div>
                  </div>
                </section>
              </div>

              <div className="lg:col-span-2 space-y-10">
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="bg-muted opacity-80 p-1 rounded-2xl h-14 w-full justify-start gap-2 px-2">
                    <TabsTrigger value="overview" className="rounded-xl h-10 px-8 font-black uppercase text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">Athlete Overview</TabsTrigger>
                    <TabsTrigger value="athletic" className="rounded-xl h-10 px-8 font-black uppercase text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">Athletic Metrics</TabsTrigger>
                    <TabsTrigger value="seasonal" className="rounded-xl h-10 px-8 font-black uppercase text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">Seasonal Analytics</TabsTrigger>
                    <TabsTrigger value="gallery" className="rounded-xl h-10 px-8 font-black uppercase text-[10px] data-[state=active]:bg-white data-[state=active]:shadow-sm">Gallery</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-8 space-y-8">
                     <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Primary Position</Label><Input placeholder="e.g. RHP / SS" value={profile.primaryPosition ?? ''} onChange={e => setProfile({...profile, primaryPosition: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Secondary Position</Label><Input placeholder="e.g. OF" value={profile.secondaryPosition ?? ''} onChange={e => setProfile({...profile, secondaryPosition: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Height</Label><Input placeholder="e.g. 6'2\" value={profile.height ?? ''} onChange={e => setProfile({...profile, height: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Weight (lbs)</Label><Input placeholder="e.g. 210" value={profile.weight ?? ''} onChange={e => setProfile({...profile, weight: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Dominant Hand</Label>
                         <Select value={profile.dominantHand ?? ''} onValueChange={v => setProfile({...profile, dominantHand: v})}>
                           <SelectTrigger className="h-12 border-2 rounded-xl font-bold text-[10px] uppercase"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="Right" className="font-bold">RIGHT</SelectItem>
                             <SelectItem value="Left" className="font-bold">LEFT</SelectItem>
                             <SelectItem value="Ambi" className="font-bold">AMBIDEXTROUS</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Institutional Team</Label><Input placeholder="e.g. Elite Baseball" value={profile.teamName ?? ''} onChange={e => setProfile({...profile, teamName: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Graduation Year</Label><Input type="number" placeholder="2024" value={profile.graduationYear ?? ''} onChange={e => setProfile({...profile, graduationYear: parseInt(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Hometown</Label><Input placeholder="City, State" value={profile.hometown ?? ''} onChange={e => setProfile({...profile, hometown: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Institutional Major</Label><Input placeholder="e.g. Business" value={profile.intendedMajor ?? ''} onChange={e => setProfile({...profile, intendedMajor: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">School</Label><Input placeholder="e.g. Highland High" value={profile.school ?? ''} onChange={e => setProfile({...profile, school: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">GPA</Label><Input type="number" step="0.01" value={profile.academicGPA ?? ''} onChange={e => setProfile({...profile, academicGPA: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" /></div>
                       <div className="space-y-2"><Label className="text-[10px] font-black uppercase ml-1">Jersey Number</Label><Input placeholder="e.g. 24" value={profile.jerseyNumber ?? ''} onChange={e => setProfile({...profile, jerseyNumber: e.target.value})} className="h-12 border-2 rounded-xl font-bold" /></div>
                     </div>
                     
                     <div className="space-y-4 pt-6 border-t border-dashed">
                          <Label className="text-[10px] font-black uppercase ml-1 text-primary">Recruiting Contact Details</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                               <Label className="text-[8px] font-bold uppercase ml-1 opacity-50">Player Email</Label>
                               <Input type="email" placeholder="athlete@example.com" value={contact.playerEmail ?? ''} onChange={e => setContact({...contact, playerEmail: e.target.value})} className="h-10 border-2 rounded-xl font-medium" />
                            </div>
                            <div className="space-y-2">
                               <Label className="text-[8px] font-bold uppercase ml-1 opacity-50">Parent/Guardian Email</Label>
                               <Input type="email" placeholder="parent@example.com" value={contact.parentEmail ?? ''} onChange={e => setContact({...contact, parentEmail: e.target.value})} className="h-10 border-2 rounded-xl font-medium" />
                            </div>
                          </div>
                      </div>

                     <div className="space-y-2 pt-6">
                         <Label className="text-[10px] font-black uppercase ml-1">Athlete Narrative / Bio</Label>
                         <Textarea value={profile.bio ?? ''} onChange={e => setProfile({...profile, bio: e.target.value})} className="min-h-[150px] border-2 rounded-[2rem] font-medium p-6 resize-none" placeholder="Athlete recruitment summary..." />
                       </div>

                      <div className="space-y-4 pt-6 border-t border-dashed">
                        <Label className="text-[10px] font-black uppercase ml-1 text-primary">Institutional Pulse (Coach Notes)</Label>
                        <Textarea 
                          value={profile.institutionalPulse ?? ''} 
                          onChange={e => setProfile({...profile, institutionalPulse: e.target.value})} 
                          className="min-h-[120px] border-2 rounded-[2rem] font-medium p-6 resize-none bg-muted/5" 
                          placeholder="Institutional overview, coach feedback, or status update..." 
                        />
                        <p className="text-[9px] font-bold text-muted-foreground uppercase px-2 italic">This field updates the strategic pulse appearing on the public portal.</p>
                      </div>
                  </TabsContent>

                  <TabsContent value="athletic" className="mt-8 space-y-8">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary opacity-60">Strategic Performance Metrics</p>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-[8px] font-black uppercase rounded-xl border-2" onClick={addCustomStat}><Plus className="h-3 w-3 mr-1" /> Custom Metric</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {getSportFields().map(f => (
                        <div key={f.key} className="space-y-2 bg-muted/20 p-5 rounded-3xl border border-black/5">
                          <Label className="text-[10px] font-black uppercase ml-1">{f.label}</Label>
                          <Input type={f.type} value={metrics[f.key] ?? ''} onChange={e => onChangeMetric(f.key, e.target.value)} className="h-12 border-2 rounded-xl font-black bg-white" />
                        </div>
                      ))}
                    </div>
                    
                    {customStats.length > 0 && (
                      <div className="grid grid-cols-2 gap-4">
                        {customStats.map((cs: any, i: number) => (
                          <div key={`cs-${i}`} className="flex items-end gap-2 bg-primary/5 p-5 rounded-3xl border border-primary/10">
                            <div className="flex-1 space-y-2">
                               <Label className="text-[10px] font-black uppercase ml-1 opacity-50">Label</Label>
                               <Input value={cs.label} onChange={e => updateCustomStat(i, 'label', e.target.value)} className="h-10 border-2 rounded-xl font-bold bg-white" />
                            </div>
                            <div className="flex-1 space-y-2">
                               <Label className="text-[10px] font-black uppercase ml-1 opacity-50">Value</Label>
                               <Input value={cs.value} onChange={e => updateCustomStat(i, 'value', e.target.value)} className="h-10 border-2 rounded-xl font-bold bg-white" />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-red-500 rounded-xl hover:bg-red-50" onClick={() => removeCustomStat(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="seasonal" className="mt-8 space-y-8">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary opacity-60">Verified Seasonal Records</p>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-[8px] font-black uppercase rounded-xl border-2" onClick={handleAddStatRow}><Plus className="h-3 w-3 mr-1" /> Add Record</Button>
                    </div>
                    <div className="space-y-4">
                      {stats.map((s, i) => (
                        <div key={s.id} className="grid grid-cols-6 gap-3 bg-muted/20 p-5 rounded-3xl border border-black/5 items-end">
                           <div className="space-y-1 col-span-1">
                             <Label className="text-[8px] font-black uppercase ml-1 opacity-50">Season</Label>
                             <Input value={s.season} onChange={e => updateStat(s.id, 'season', e.target.value)} className="h-10 border-2 rounded-xl font-bold text-center bg-white" />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <Label className="text-[8px] font-black uppercase ml-1 opacity-50">GP</Label>
                             <Input type="number" value={s.gamesPlayed} onChange={e => updateStat(s.id, 'gamesPlayed', parseInt(e.target.value))} className="h-10 border-2 rounded-xl font-bold text-center bg-white" />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <Label className="text-[8px] font-black uppercase ml-1 opacity-50">PTS</Label>
                             <Input type="number" value={s.points} onChange={e => updateStat(s.id, 'points', parseInt(e.target.value))} className="h-10 border-2 rounded-xl font-bold text-center bg-white" />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <Label className="text-[8px] font-black uppercase ml-1 opacity-50">AST</Label>
                             <Input type="number" value={s.assists} onChange={e => updateStat(s.id, 'assists', parseInt(e.target.value))} className="h-10 border-2 rounded-xl font-bold text-center bg-white" />
                           </div>
                           <div className="space-y-1 col-span-1">
                             <Label className="text-[8px] font-black uppercase ml-1 opacity-50">EFF</Label>
                             <Input type="number" value={s.efficiency} onChange={e => updateStat(s.id, 'efficiency', parseInt(e.target.value))} className="h-10 border-2 rounded-xl font-black text-center bg-zinc-100" />
                           </div>
                           <div className="flex justify-end p-1">
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 rounded-lg hover:bg-red-50" onClick={() => handleDeleteStat(s.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                           </div>
                        </div>
                      ))}
                      {stats.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed rounded-[2rem] opacity-30">
                           <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                           <p className="text-[10px] font-black uppercase">No seasonal analytics established.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                    
                  <TabsContent value="gallery" className="mt-8 space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary opacity-60">Scouting Photo Gallery</p>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase">Upload up to 5 strategic photos for recruiters (Max 5MB each).</p>
                      </div>
                      <input type="file" id="gallery-upload" className="hidden" accept="image/*" onChange={handleGalleryUpload} disabled={photos.length >= 5} />
                      <Button type="button" size="sm" variant="outline" className="h-10 px-6 font-black uppercase text-[10px] rounded-xl border-2" onClick={() => document.getElementById('gallery-upload')?.click()} disabled={photos.length >= 5}>
                        <Camera className="h-4 w-4 mr-2" /> Add Photo
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      {photos.map((url, i) => (
                        <div key={i} className="relative group aspect-square rounded-[2.5rem] overflow-hidden border-4 border-white shadow-xl ring-1 ring-black/5">
                          <img src={url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={`Gallery ${i}`} />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button type="button" variant="destructive" size="icon" className="h-12 w-12 rounded-2xl shadow-2xl" onClick={() => removePhoto(i)}>
                              <Trash2 className="h-6 w-6" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {photos.length === 0 && (
                        <div className="col-span-full py-20 text-center border-4 border-dashed rounded-[3rem] opacity-20">
                          <Camera className="h-12 w-12 mx-auto mb-4" />
                          <p className="text-sm font-black uppercase tracking-widest">No additional scouting photos archived.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>


            <DialogFooter className="pt-6">
              <Button 
                className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" 
                onClick={handleUpdateProfile}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-3" />
                    Synchronizing Tactical Folder...
                  </>
                ) : (
                  "Commit Pack Synchronization"
                )}
              </Button>
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

export function IncidentDetailDialog({ incident, isOpen, onOpenChange, onEdit }: { incident: TeamIncident | null, isOpen: boolean, onOpenChange: (o: boolean) => void, onEdit?: () => void }) {
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
                {onEdit && (
                  <Button variant="outline" size="sm" onClick={onEdit} className="h-7 text-[10px] font-black uppercase tracking-widest rounded-lg">Edit Report</Button>
                )}
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
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  
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
  const { updateIncident } = useTeam();

  const handleLogIncident = async () => {
    if (!form.title || !form.date) return;
    setIsProcessing(true);
    if (editingIncidentId) {
       await updateIncident(activeTeam!.id, editingIncidentId, form);
    } else {
       await addIncident(form);
    }
    setIsLogOpen(false);
    setEditingIncidentId(null);
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
          <Button className="flex-1 sm:flex-none rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20" onClick={() => { setEditingIncidentId(null); setIsLogOpen(true); setForm({
            title: '', date: format(new Date(), 'yyyy-MM-dd'), time: format(new Date(), 'HH:mm'), location: '', description: '', emergencyServicesCalled: false, severity: 'minor', witnesses: '', witnessesList: [{ name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }], involvedPeople: '', involvedPersonnel: [{ name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }], treatmentProvided: '', followUpRequired: false, actionsTaken: '', reportedTo: '', equipmentInvolved: '', weatherConditions: 'Clear/Indoor'
          }); }}>
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
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingIncidentId ? 'Edit Incident' : 'Log Incident'}</DialogTitle>
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
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Date</Label>
                  <DatePicker 
                    date={form.date ?? ''} 
                    setDate={d => setForm({ ...form, date: d })} 
                    placeholder="Select Date"
                    className="h-12 rounded-xl border-2 px-4 font-bold bg-white"
                  />
                </div>
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
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : (editingIncidentId ? "Update Report in Ledger" : "Commit Report to Ledger")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <IncidentDetailDialog incident={viewingIncident} isOpen={!!viewingIncident} onOpenChange={(o) => !o && setViewingIncident(null)} onEdit={() => {
        if (!viewingIncident) return;
        setForm({
          title: viewingIncident.title,
          date: viewingIncident.date,
          time: viewingIncident.time || '',
          location: viewingIncident.location || '',
          description: viewingIncident.description || '',
          emergencyServicesCalled: viewingIncident.emergencyServicesCalled || false,
          severity: viewingIncident.severity || 'minor',
          witnesses: viewingIncident.witnesses || '',
          witnessesList: viewingIncident.witnessesList?.length ? viewingIncident.witnessesList.map(w => ({ name: w.name, phone: w.phone || '', email: w.email || '' })) : [{ name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }],
          involvedPeople: viewingIncident.involvedPeople || '',
          involvedPersonnel: viewingIncident.involvedPersonnel?.length ? viewingIncident.involvedPersonnel.map(w => ({ name: w.name, phone: w.phone || '', email: w.email || '' })) : [{ name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }, { name: '', phone: '', email: '' }],
          treatmentProvided: viewingIncident.treatmentProvided || '',
          followUpRequired: viewingIncident.followUpRequired || false,
          actionsTaken: viewingIncident.actionsTaken || '',
          reportedTo: viewingIncident.reportedTo || '',
          equipmentInvolved: viewingIncident.equipmentInvolved || '',
          weatherConditions: viewingIncident.weatherConditions || 'Clear/Indoor'
        });
        setEditingIncidentId(viewingIncident.id);
        setViewingIncident(null);
        setIsLogOpen(true);
      }} />
    </div>
  );
}

import { AccessRestricted } from '@/components/layout/AccessRestricted';

function SignatureAuditDialog({ proto }: { proto: any }) {
  const { db, activeTeam, members } = useTeam();
  const q = useMemoFirebase(() => (db && activeTeam?.id && proto?.id) ? 
    query(
      collectionGroup(db, 'signatures'), 
      where('teamId', '==', activeTeam.id), 
      where('docId', '==', proto.id)
    ) : null, [db, activeTeam?.id, proto?.id]);
  const { data: signatures } = useCollection<any>(q);
  
  const signedMemberIds = signatures ? signatures.map(s => s.memberId) : [];
  const assignedMembers = members.filter(m => 
    m.status !== 'removed' && (
      !proto?.assignedTo || 
      proto?.assignedTo?.includes('all') || 
      proto?.assignedTo?.includes(m.id)
    )
  );
  
  const signedUsers = assignedMembers.filter(m => signedMemberIds.includes(m.id));
  const unsignedUsers = assignedMembers.filter(m => !signedMemberIds.includes(m.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mt-4 h-9 text-[10px] uppercase font-black tracking-widest hover:bg-black hover:text-white transition-all">Audit Signatures</Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl border-none shadow-2xl p-0 overflow-hidden bg-white max-w-lg">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">{proto.title} Audit</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">Compliance Status ({signedUsers.length} / {assignedMembers.length})</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="signed" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="signed" className="flex-1 text-xs font-black uppercase">Signed ({signedUsers.length})</TabsTrigger>
              <TabsTrigger value="unsigned" className="flex-1 text-xs font-black uppercase">Pending ({unsignedUsers.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="signed" className="space-y-2 mt-4 max-h-60 overflow-y-auto">
              {signedUsers.map(u => <div key={u.id} className="p-3 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100 flex justify-between"><span className="uppercase">{u.name}</span> <CheckCircle2 className="h-4 w-4" /></div>)}
              {signedUsers.length === 0 && <div className="text-center p-4 text-xs font-bold text-muted-foreground uppercase opacity-50">No Signatures</div>}
            </TabsContent>
            <TabsContent value="unsigned" className="space-y-2 mt-4 max-h-60 overflow-y-auto text-foreground">
              {unsignedUsers.map(u => <div key={u.id} className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100 flex justify-between"><span className="uppercase">{u.name}</span> <AlertCircle className="h-4 w-4" /></div>)}
              {unsignedUsers.length === 0 && <div className="text-center p-4 text-xs font-bold text-muted-foreground uppercase opacity-50">100% Compliant</div>}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CoachesCornerPage() {
  const router = useRouter();
  const { activeTeam, isStaff, isPro, isStarter, createTeamDocument, updateTeamDocument, deleteTeamDocument, db, members, createAlert, isSchoolMode, user, teams, getLeagueMembers } = useTeam();
  
  const isPartOfLeague = useMemo(() => {
    return activeTeam?.leagueIds && Object.keys(activeTeam.leagueIds).length > 0;
  }, [activeTeam]);

  // School-wide staff logic: prioritize schoolId filtering if available, fallback to ownerUserId
  const currentSchoolId = activeTeam?.schoolId || (activeTeam?.type === 'school' ? activeTeam?.id : null);
  
  const institutionalMembersQuery = useMemoFirebase(() => {
    if (!db || !isSchoolMode) return null;
    
    if (currentSchoolId) {
      return query(collectionGroup(db, 'members'), where('schoolId', '==', currentSchoolId));
    }
    
    // Fallback for older school accounts or club hubs using ownerUserId
    if (user?.id) {
      return query(collectionGroup(db, 'members'), where('ownerUserId', '==', user.id));
    }
    
    return null;
  }, [db, user?.id, isSchoolMode, currentSchoolId, activeTeam?.id]);

  const { data: institutionalMembers } = useCollection<Member>(institutionalMembersQuery);
  
  const allCoaches = useMemo(() => {
    if (!isSchoolMode) return [];
    
    // If we have institutional members (school owner), prioritize the global pool.
    // Fallback to local squad members if institutional data isn't available.
    const pool = (institutionalMembers && institutionalMembers.length > 0) ? institutionalMembers : members;
    const coachPositions = ['Coach', 'Assistant Coach', 'Manager', 'Squad Leader', 'Head Coach', 'Athletic Director', 'Staff'];
    
    return pool.filter(m => coachPositions.includes(m.position));
  }, [isSchoolMode, institutionalMembers, members]);

  if (!isStaff) return <AccessRestricted type="role" title="Coaches Hub Restricted" description="This tactical vault is reserved for Coaching Staff and Team Administrators." />;
  if (!isPro && !isStarter) return <AccessRestricted type="tier" />;

  const [activeTab, setActiveTab] = useState('recruiting');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [editingWaiver, setEditingWaiver] = useState<TeamDocument | null>(null);

  const docsQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'documents'), orderBy('createdAt', 'desc')) : null, [activeTeam?.id, db]);
  const { data: allDocuments } = useCollection<TeamDocument>(docsQuery);
  
  const teamProtocols = useMemo(() => allDocuments?.filter(d => DEFAULT_PROTOCOLS.some(p => p.id === d.id)) || [], [allDocuments]);
  const defaultDocIds = useMemo(() => DEFAULT_PROTOCOLS.map(p => p.id), []);
  const customProtocols = useMemo(() => allDocuments?.filter(d => !defaultDocIds.includes(d.id) && d.type === 'waiver') || [], [allDocuments, defaultDocIds]);

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId), [members, selectedMemberId]);

  const vRef = useMemoFirebase(() => db && activeTeam?.id ? query(collection(db, 'teams', activeTeam.id, 'volunteers'), orderBy('date', 'desc')) : null, [db, activeTeam?.id]);
  const { data: volunteerOpps } = useCollection(vRef);

  const eRef = useMemoFirebase(() => db && activeTeam?.id ? query(collection(db, 'teams', activeTeam.id, 'events'), orderBy('date', 'desc')) : null, [db, activeTeam?.id]);
  const { data: events } = useCollection<TeamEvent>(eRef);

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
            <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-4xl font-black uppercase tracking-tight text-foreground">Coaches Corner</h1>
            {isStaff && activeTeam && (
              <>
                <EmailExportDialog 
                  members={members} 
                  teamName={activeTeam.name} 
                  getLeagueMembers={getLeagueMembers}
                  leagueIds={activeTeam.leagueIds}
                />
                <Button 
                  variant="outline" 
                  className="rounded-xl h-10 border-2 font-black uppercase text-[10px] tracking-widest gap-2 bg-white text-foreground hover:bg-muted/50"
                  onClick={() => router.push('/coaches-corner/attendance')}
                >
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Attendance Tracking
                </Button>
              </>
            )}
            <Badge className={cn(
              "rounded-xl font-black uppercase text-[10px] px-3 h-7 border-none",
              isPro ? "bg-black text-white shadow-xl shadow-black/10" : "bg-primary text-white shadow-lg shadow-primary/20"
            )}>
              {isPro ? 'Elite Pro' : isStarter ? 'Starter Tier' : 'Base Tier'}
            </Badge>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="mb-0 overflow-x-auto whitespace-nowrap bg-white p-2 rounded-2xl shadow-sm border border-black/5 gap-2 flex-nowrap shrink-0">
            <TabsTrigger value="recruiting" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Talent Center</TabsTrigger>
            {isSchoolMode && (
              <TabsTrigger value="coaches" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Coaches</TabsTrigger>
            )}
            <TabsTrigger value="tracking" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Tracking</TabsTrigger>
            <TabsTrigger value="volunteers" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Volunteers</TabsTrigger>
            <TabsTrigger value="compliance" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Legal Docs</TabsTrigger>
            <TabsTrigger value="archives" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Waiver Library</TabsTrigger>
            <TabsTrigger value="fundraising" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Fundraising</TabsTrigger>
            <TabsTrigger value="safety" className="rounded-lg font-black text-[10px] uppercase px-6 h-10 data-[state=active]:bg-primary data-[state=active]:text-white">Safety Hub</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} className="mt-0">
        <TabsContent value="recruiting" className="space-y-8 mt-0 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <aside className="space-y-6 md:col-span-1">
              <div className="flex items-center gap-2 px-2"><Users className="h-4 w-4 text-primary" /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Select Athlete</h3></div>
              <ScrollArea className="h-[600px] border-2 rounded-[2.5rem] bg-muted/10 p-2 shadow-inner">
                <div className="space-y-1.5">
                  {members.filter(m => m.status !== 'removed' && !['Coach', 'Assistant Coach', 'Manager', 'Staff', 'Athletic Director'].includes(m.position)).map(m => (
                    <button key={m.id} onClick={() => setSelectedMemberId(m.id)} className={cn("w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-black text-xs uppercase", selectedMemberId === m.id ? "bg-primary text-white shadow-lg" : "hover:bg-white text-foreground")}>
                      <Avatar className="h-8 w-8 rounded-xl border shrink-0">
                        <AvatarImage src={m.avatar} />
                        <AvatarFallback className="font-black">{m.name[0]}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}

                  {members.some(m => m.status === 'removed') && (
                    <div className="pt-6 space-y-2 border-t mt-6">
                      <div className="flex items-center gap-2 px-2 py-2">
                        <History className="h-3 w-3 text-red-500/50" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-500/50">Removed Personnel</p>
                      </div>
                      {members.filter(m => m.status === 'removed').map(m => (
                        <button key={m.id} onClick={() => setSelectedMemberId(m.id)} className={cn("w-full flex items-center gap-3 p-3 rounded-2xl transition-all font-black text-xs uppercase opacity-50 grayscale hover:grayscale-0 hover:opacity-100", selectedMemberId === m.id ? "bg-red-600 text-white shadow-lg grayscale-0 opacity-100" : "bg-white border-dashed border-red-100 text-foreground")}>
                          <Avatar className="h-8 w-8 rounded-xl border shrink-0 opacity-40">
                            <AvatarImage src={m.avatar} />
                            <AvatarFallback className="font-black text-red-600/50">{m.name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{m.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </aside>
            <div className="md:col-span-2 lg:col-span-3">
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

        {isSchoolMode && (
          <TabsContent value="coaches" className="space-y-8 mt-0 animate-in fade-in duration-500">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] h-6 px-3 tracking-widest">Directory</Badge>
                  <h2 className="text-3xl font-black uppercase tracking-tight">Institutional Staff</h2>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allCoaches.map(coach => (
                  <Card key={coach.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-4 group hover:shadow-2xl transition-all border-b-4 border-primary/20">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 rounded-[1.5rem] border-2 border-white ring-4 ring-primary/5 shadow-lg group-hover:scale-105 transition-transform">
                        <AvatarImage src={coach.avatar} />
                        <AvatarFallback className="font-black text-xl">{coach.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-black uppercase tracking-tight truncate leading-none">{coach.name}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase h-5 px-2">{coach.position}</Badge>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate max-w-[120px]">
                            {teams.find(t => t.id === coach.teamId)?.name || 'Central Staff'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Star className="h-3 w-3 text-primary opacity-40 shrink-0" />
                        <p className="text-[10px] font-bold uppercase tracking-widest leading-none">Institutional Authority</p>
                      </div>
                   </div>
                  </Card>
                ))}
                {allCoaches.length === 0 && (
                  <div className="col-span-full py-32 text-center opacity-20 space-y-4 border-2 border-dashed rounded-[3rem]">
                    <Users className="h-16 w-16 mx-auto" />
                    <p className="text-sm font-black uppercase tracking-widest">No staff members identified.</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em]">Institutional coaches will appear here automatically.</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="tracking" className="mt-0 space-y-8 animate-in fade-in duration-500">
           {!isPro ? <AccessRestricted type="feature" /> : (
             <>
               <div className="space-y-2">
                 <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">Readiness Hub</Badge>
                 <h2 className="text-3xl font-black uppercase tracking-tight">Personnel Intelligence</h2>
                 <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Institutional Matrix for Compliance & Volunteer Mobilization</p>
               </div>
               <TrackingMatrix 
                  members={members} 
                  protocols={[...DEFAULT_PROTOCOLS, ...customProtocols]} 
                  volunteerOpps={volunteerOpps || []}
                  events={events || []}
               />
             </>
           )}
        </TabsContent>

        <TabsContent value="volunteers" className="mt-0 space-y-8 animate-in fade-in duration-500">
           {!isPro ? <AccessRestricted type="feature" /> : (
             <VolunteerOpportunityManager />
           )}
        </TabsContent>

        <TabsContent value="compliance" className="space-y-10 mt-0">
          {!isPro ? <AccessRestricted type="feature" /> : (
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => setEditingWaiver(activeDoc || { ...proto, content: '', isActive: true, assignedTo: ['all'] } as TeamDocument)}>
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
                              content: existing?.content || (proto.id === 'default_universal_hub' ? defaultContent : '') 
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
                      <SignatureAuditDialog proto={proto} />
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10" onClick={async () => {
                            if(confirm('Delete this protocol?')) {
                              await deleteTeamDocument(proto.id);
                              toast({ title: 'Protocol Deleted' });
                            }
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                      <SignatureAuditDialog proto={proto} />
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {!isPro ? null : (
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
          )}
        </TabsContent>

        <TabsContent value="archives" className="mt-0 space-y-8 animate-in fade-in duration-500">
           {!isPro ? <AccessRestricted type="feature" /> : (
             <>
               <div className="space-y-2">
                 <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">Global Library</Badge>
                 <h2 className="text-3xl font-black uppercase tracking-tight">Vault Archives</h2>
                 <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Auditable Log of Digital Signatures & Executed Agrements</p>
               </div>
               <WaiverArchive />
             </>
           )}
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

