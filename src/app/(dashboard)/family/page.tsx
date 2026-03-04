"use client";

import React, { useState } from 'react';
import { useTeam } from '@/components/providers/team-provider';
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
  Signature
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { format, differenceInYears } from 'date-fns';

export default function FamilyDashboardPage() {
  const { user, myChildren, registerChild, signWaiver } = useTeam();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newChild, setNewChild] = useState({ firstName: '', lastName: '', dob: '' });

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

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Family Hub</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase">Guardianship</h1>
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
              <CardDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Under-18 Enrollment Hub</CardDescription>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myChildren.map((child) => {
          const age = differenceInYears(new Date(), new Date(child.dateOfBirth));
          return (
            <Card key={child.id} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 hover:ring-primary/20 transition-all group">
              <div className="h-2 bg-primary/10 group-hover:bg-primary transition-colors" />
              <CardContent className="p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="bg-primary/5 p-4 rounded-2xl text-primary">
                    <Baby className="h-8 w-8" />
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase border-primary/20 text-primary">{age} Years Old</Badge>
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight">{child.firstName} {child.lastName}</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Minor Player • No Direct Login</p>
                </div>

                <div className="pt-4 border-t border-muted space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-muted-foreground">Compliance</span>
                    <span className="text-green-600 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Verified</span>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl h-10 border-2 font-black uppercase text-[10px] tracking-widest">
                    <Signature className="h-3.5 w-3.5 mr-2" /> Sign New Waivers
                  </Button>
                </div>
              </CardContent>
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

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <ShieldCheck className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Legal Infrastructure</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Unified Guardian Control</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            You maintain absolute legal authority over your children's data and coordination hub. Minor players appear on team rosters but have no direct access to the platform, ensuring compliance with global child safety standards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
