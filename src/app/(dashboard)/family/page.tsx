"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, PlayerProfile, Team } from '@/components/providers/team-provider';
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
  AlertCircle
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
import { format, differenceInYears } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

function WaiverComplianceHub({ child, isOpen, onOpenChange }: { child: PlayerProfile, isOpen: boolean, onOpenChange: (o: boolean) => void }) {
  const { teams, signWaiver } = useTeam();
  const db = useFirestore();
  
  // Find teams this child is in
  const joinedTeams = useMemo(() => {
    return teams.filter(t => child.joinedTeamIds?.includes(t.id));
  }, [teams, child.joinedTeamIds]);

  const [isSigning, setIsSigning] = useState(false);

  const handleSignAll = async () => {
    setIsSigning(true);
    await signWaiver(child.id, 'v1.0_PRO');
    setIsSigning(false);
    toast({ title: "Compliance Verified", description: "All team waivers updated for this season." });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2.5rem] sm:max-w-xl border-none shadow-2xl p-0 overflow-hidden">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Compliance Hub</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Waiver & Insurance Audit: {child.firstName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Active Squads</p>
            <div className="space-y-2">
              {joinedTeams.length > 0 ? joinedTeams.map(t => (
                <div key={t.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg shadow-sm border"><Users className="h-4 w-4 text-primary" /></div>
                    <span className="font-black text-sm uppercase">{t.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-amber-500/20 text-amber-600">Pending Signature</Badge>
                </div>
              )) : (
                <div className="p-10 text-center border-2 border-dashed rounded-3xl opacity-40">
                  <p className="text-xs font-black uppercase">No squads joined yet</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-[2rem] border-2 border-dashed border-primary/20 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Master Agreement</h4>
            </div>
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              By signing below, you authorize participation in all listed squads and verify that medical insurance data is current for the {new Date().getFullYear()} season.
            </p>
          </div>

          <DialogFooter>
            <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleSignAll} disabled={isSigning || joinedTeams.length === 0}>
              {isSigning ? <Loader2 className="h-6 w-6 animate-spin" /> : "Verify & Sign Legally"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FamilyDashboardPage() {
  const { user, myChildren, registerChild, upgradeChildToLogin, teams } = useTeam();
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newChild, setNewChild] = useState({ firstName: '', lastName: '', dob: '' });
  
  const [selectedChildForWaiver, setSelectedChildForWaiver] = useState<PlayerProfile | null>(null);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [targetChildId, setTargetChildId] = useState<string | null>(null);

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

  const handleUpgrade = async () => {
    if (!targetChildId || !upgradeEmail) return;
    setIsProcessing(true);
    await upgradeChildToLogin(targetChildId, upgradeEmail);
    setIsProcessing(false);
    setIsUpgradeOpen(false);
    setUpgradeEmail('');
  };

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Family Hub</Badge>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {myChildren.map((child) => {
          const age = differenceInYears(new Date(), new Date(child.dateOfBirth));
          const joinedTeams = teams.filter(t => child.joinedTeamIds?.includes(t.id));

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
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Minor Player Hub • Guardian ID: {user.id.slice(-4)}</p>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Joined Squads</p>
                    <Badge variant="outline" className="text-[8px] font-black border-primary/20 text-primary">{joinedTeams.length} TOTAL</Badge>
                  </div>
                  <div className="space-y-2">
                    {joinedTeams.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-2xl border">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-xs font-black uppercase tracking-tight truncate">{t.name}</span>
                      </div>
                    ))}
                    {joinedTeams.length === 0 && (
                      <Button variant="ghost" className="w-full h-12 rounded-2xl border-2 border-dashed text-[10px] font-black uppercase text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/20" onClick={() => router.push('/teams/join')}>
                        <Plus className="h-4 w-4 mr-2" /> Enroll in first squad
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4">
                  <Button variant="outline" className="rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1 group-hover:border-primary transition-colors" onClick={() => setSelectedChildForWaiver(child)}>
                    <Signature className="h-4 w-4 text-primary" />
                    <span>Sign Waivers</span>
                  </Button>
                  <Button variant="outline" className="rounded-2xl h-14 border-2 font-black uppercase text-[10px] tracking-widest flex flex-col items-center justify-center gap-1" onClick={() => { setTargetChildId(child.id); setIsUpgradeOpen(true); }} disabled={child.hasLogin}>
                    <Key className={cn("h-4 w-4", child.hasLogin ? "text-green-600" : "text-amber-600")} />
                    <span>{child.hasLogin ? "Login Enabled" : "Enable Login"}</span>
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="px-8 lg:px-10 pb-8 pt-0">
                <Button className="w-full h-14 rounded-2xl bg-black text-white font-black uppercase text-xs tracking-widest shadow-xl group-hover:bg-primary transition-colors" onClick={() => router.push('/teams/join')}>
                  Deploy to New Team <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {myChildren.length === 0 && (
          <div className="col-span-full py-24 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
            <Baby className="h-12 w-12 mx-auto mb-4" />
            <p className="text-sm font-black uppercase tracking-widest">No players registered under your hub yet.</p>
          </div>
        )}
      </div>

      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Activate Player Features</DialogTitle>
            <DialogDescription className="font-bold text-amber-600 uppercase text-[10px] tracking-widest">Authorize Direct Platform Access</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 space-y-2">
              <p className="text-[11px] font-bold text-amber-900 leading-relaxed italic">
                Enabling a login allows the athlete to RSVP, chat, and study playbooks directly. As a guardian, you retain full monitoring control over their account interactions.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Athlete Email Address</Label>
              <Input 
                type="email" 
                placeholder="athlete@example.com" 
                value={upgradeEmail} 
                onChange={e => setUpgradeEmail(e.target.value)}
                className="h-12 rounded-xl border-2 font-bold" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-lg font-black bg-black text-white shadow-xl shadow-black/20" onClick={handleUpgrade} disabled={!upgradeEmail || isProcessing}>
              {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Dispatch Activation Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedChildForWaiver && (
        <WaiverComplianceHub 
          child={selectedChildForWaiver} 
          isOpen={!!selectedChildForWaiver} 
          onOpenChange={(o) => !o && setSelectedChildForWaiver(null)} 
        />
      )}

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <ShieldCheck className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Legal Infrastructure</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Unified Guardian Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            You maintain absolute legal authority over your children's data and coordination hub. Minor players appear on team rosters but their direct platform access is optional and managed by you, ensuring compliance with global child safety standards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
