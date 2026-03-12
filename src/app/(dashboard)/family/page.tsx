
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, PlayerProfile, Team, TeamEvent } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Baby, 
  Plus, 
  ChevronRight, 
  ShieldCheck, 
  Calendar, 
  User, 
  Users, 
  Loader2,
  Lock,
  Signature,
  AtSign,
  Key,
  ShieldAlert,
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Info,
  Clock,
  MapPin,
  DollarSign,
  CalendarDays,
  Activity,
  FileText
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
import { format, differenceInYears, isFuture, isToday } from 'date-fns';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FamilyDashboardPage() {
  const { user, myChildren, registerChild, upgradeChildToLogin, teams, householdEvents, householdBalance } = useTeam();
  const router = useRouter();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isNoWaiversOpen, setIsNoWaiversOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newChild, setNewChild] = useState({ firstName: '', lastName: '', dob: '' });

  const upcomingEvents = useMemo(() => {
    return householdEvents.filter(e => isFuture(new Date(e.date)) || isToday(new Date(e.date))).slice(0, 5);
  }, [householdEvents]);

  if (user?.role !== 'parent') {
    return (
      <div className="py-24 text-center space-y-6 max-w-md mx-auto">
        <div className="bg-muted p-6 rounded-[3rem] opacity-20"><Users className="h-16 w-16 mx-auto" /></div>
        <h1 className="text-3xl font-black uppercase">Guardian Access Only</h1>
        <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">This dashboard is reserved for parent accounts managing minor players.</p>
      </div>
    );
  }

  const handleAddChild = async () => {
    if (!newChild.firstName || !newChild.lastName || !newChild.dob) return;
    setIsProcessing(true);
    try {
      await registerChild(newChild.firstName, newChild.lastName, newChild.dob);
      setIsAddOpen(false);
      setNewChild({ firstName: '', lastName: '', dob: '' });
      toast({ title: "Player Registered", description: "Your child has been added to your hub." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignWaiversClick = () => {
    // Check if there are any active teams or files first
    if (teams.length === 0) {
      setIsNoWaiversOpen(true);
    } else {
      router.push('/files');
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Household Command</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Guardianship</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Managing {myChildren.length} Minor Players</p>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
              <Plus className="h-5 w-5 mr-2" /> Register New Player
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-10">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black uppercase tracking-tight">Athlete Data</DialogTitle>
              <DialogDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Under-18 Enrollment Hub</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">First Name</Label>
                  <Input value={newChild.firstName} onChange={e => setNewChild({...newChild, firstName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Last Name</Label>
                  <Input value={newChild.lastName} onChange={e => setNewChild({...newChild, lastName: e.target.value})} className="h-12 rounded-xl border-2 font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Date of Birth</Label>
                <Input type="date" value={newChild.dob} onChange={e => setNewChild({...newChild, dob: e.target.value})} className="h-12 rounded-xl border-2 font-black" />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddChild} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enroll Athlete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-[2.5rem] border-none shadow-xl bg-black text-white overflow-hidden group">
            <CardContent className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="bg-primary p-4 rounded-2xl shadow-lg">
                  <DollarSign className="h-8 w-8 text-white" />
                </div>
                <Badge className="bg-white/20 text-white border-none font-black text-[10px] uppercase tracking-widest px-3 h-6">Consolidated</Badge>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-1">Household Balance</p>
                <p className="text-5xl font-black tracking-tighter">${householdBalance.toLocaleString()}</p>
              </div>
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                Aggregated dues across all registered players.
              </p>
              <Button className="w-full h-12 rounded-xl bg-white text-black font-black uppercase text-xs tracking-widest hover:bg-white/90" onClick={() => router.push('/pricing')}>
                Manage Payments
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2.5rem] border-none shadow-md bg-white ring-1 ring-black/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em]">Operational Pulse</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-transparent">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-40">Active Squads</p>
                  <p className="text-xl font-black">{Array.from(new Set(myChildren.flatMap(c => c.joinedTeamIds || []))).length}</p>
                </div>
                <Users className="h-6 w-6 text-primary/40" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-transparent">
                <div>
                  <p className="text-[10px] font-black uppercase opacity-40">Pending Waivers</p>
                  <p className="text-xl font-black">0</p>
                </div>
                <Signature className="h-6 w-6 text-primary/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-black uppercase tracking-tight">Household Itinerary</h2>
            </div>
            <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest" onClick={() => router.push('/calendar')}>
              Master View <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-4">
            {upcomingEvents.length > 0 ? upcomingEvents.map((event) => {
              const team = teams.find(t => t.id === event.teamId);
              return (
                <Card key={event.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 hover:shadow-lg transition-all group overflow-hidden bg-white">
                  <CardContent className="p-0">
                    <div className="flex items-stretch h-24">
                      <div className="w-20 bg-muted/30 flex flex-col items-center justify-center border-r shrink-0 group-hover:bg-primary/5 transition-colors">
                        <span className="text-[8px] font-black uppercase opacity-40">{format(new Date(event.date), 'MMM')}</span>
                        <span className="text-2xl font-black">{format(new Date(event.date), 'dd')}</span>
                      </div>
                      <div className="flex-1 p-5 flex flex-col justify-center min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary/10 text-primary border-none text-[7px] uppercase font-black px-1.5 h-4">{event.eventType}</Badge>
                            <span className="text-[9px] font-black uppercase text-muted-foreground">{team?.name}</span>
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground">{event.startTime}</span>
                        </div>
                        <h4 className="font-black text-sm uppercase truncate group-hover:text-primary transition-colors">{event.title}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-[9px] font-medium text-muted-foreground uppercase flex items-center gap-1"><MapPin className="h-2 w-2" /> {event.location}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
              <div className="text-center py-20 bg-muted/10 rounded-[3rem] border-2 border-dashed opacity-40">
                <Calendar className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">Clear Schedule</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-6 pt-10 border-t">
        <div className="flex items-center gap-3 px-2">
          <Baby className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Athlete Roster</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {myChildren.map((child) => {
            const age = differenceInYears(new Date(), new Date(child.dateOfBirth));
            const childTeams = teams.filter(t => child.joinedTeamIds?.includes(t.id));

            return (
              <Card key={child.id} className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group">
                <div className="h-2 hero-gradient w-full" />
                <CardContent className="p-8 lg:p-10 space-y-8 flex-1">
                  <div className="flex justify-between items-start">
                    <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
                      <Baby className="h-10 w-10" />
                    </div>
                    <Badge variant="secondary" className="bg-black text-white border-none font-black uppercase tracking-widest text-[10px] h-7 px-4 shadow-lg">{age} Years Old</Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black uppercase tracking-tight">{child.firstName} {child.lastName}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Minor Player Hub • Guardian ID: {user?.id.slice(-4)}</p>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Enrolled Squads</p>
                      <Badge variant="outline" className="text-[8px] font-black border-primary/20 text-primary">{childTeams.length} TOTAL</Badge>
                    </div>
                    <div className="space-y-2">
                      {childTeams.map(t => (
                        <div key={t.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-2xl border">
                          <Users className="h-4 w-4 text-primary" />
                          <span className="text-xs font-black uppercase tracking-tight truncate">{t.name}</span>
                        </div>
                      ))}
                      {childTeams.length === 0 && (
                        <Button variant="ghost" className="w-full h-12 rounded-2xl border-2 border-dashed text-[10px] font-black uppercase text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20" onClick={() => router.push('/teams/join')}>
                          <Plus className="h-4 w-4 mr-2" /> Enroll in first squad
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4">
                    <Button variant="outline" className="rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1 group-hover:border-primary transition-colors" onClick={handleSignWaiversClick}>
                      <Signature className="h-4 w-4 text-primary" />
                      <span>Sign Waivers</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1" 
                      onClick={() => {
                        upgradeChildToLogin(child.id);
                        toast({ title: "Account Initialized", description: `A linked player account for ${child.firstName} has been created and attached to your dashboard.` });
                      }} 
                      disabled={child.hasLogin}
                    >
                      <Key className={cn("h-4 w-4", child.hasLogin ? "text-green-600" : "text-amber-600")} />
                      <span>{child.hasLogin ? "Login Enabled" : "Enable Login"}</span>
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="px-8 lg:p-10 pb-8 pt-0">
                  <Button className="w-full h-14 rounded-2xl bg-black text-white font-black uppercase text-xs tracking-widest shadow-xl group-hover:bg-primary transition-colors" onClick={() => router.push('/teams/join')}>
                    Enroll in New League <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <Dialog open={isNoWaiversOpen} onOpenChange={setIsNoWaiversOpen}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl p-10 max-w-md text-center">
          <div className="bg-primary/5 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="h-10 w-10 text-primary" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Compliance Verified</DialogTitle>
            <DialogDescription className="font-bold text-base text-foreground/80 pt-2 leading-relaxed">
              No waivers pending for your roster at this time.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                Make sure you sign up for a league by using the special league code shared by your organization lead!
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={() => router.push('/teams/join')}>
              Go to Recruitment Hub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <ShieldCheck className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Institutional Compliance</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Unified Household Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            As a guardian, you maintain absolute authority over your children's data and schedules. The household collection links multiple athletes to your account, allowing for single-point billing and unified scheduling across the entire organization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
