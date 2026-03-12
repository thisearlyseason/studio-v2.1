
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, VolunteerOpportunity } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  HandHelping, 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Loader2, 
  Trash2, 
  Timer, 
  ChevronRight, 
  ClipboardList 
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
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function VolunteerHubPage() {
  const { activeTeam, user, isStaff, isParent, addVolunteerOpportunity, signUpForVolunteer, verifyVolunteerHours, deleteVolunteerOpportunity } = useTeam();
  const db = useFirestore();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newOpp, setNewOpp] = useState({ title: '', description: '', date: '', location: '', slots: '5', hoursPerSlot: '2' });

  const oppsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'volunteers'), orderBy('date', 'asc'));
  }, [activeTeam?.id, db]);

  const { data: rawOpps, isLoading } = useCollection<VolunteerOpportunity>(oppsQuery);
  const opportunities = useMemo(() => rawOpps || [], [rawOpps]);

  const handleAddOpportunity = async () => {
    if (!newOpp.title || !newOpp.date) return;
    setIsProcessing(true);
    await addVolunteerOpportunity({
      ...newOpp,
      slots: parseInt(newOpp.slots),
      hoursPerSlot: parseFloat(newOpp.hoursPerSlot)
    });
    setIsAddOpen(false);
    setIsProcessing(false);
    setNewOpp({ title: '', description: '', date: '', location: '', slots: '5', hoursPerSlot: '2' });
    toast({ title: "Opportunity Published", description: "Parents can now sign up." });
  };

  const totalVerifiedHours = useMemo(() => {
    let total = 0;
    opportunities.forEach(opp => {
      Object.values(opp.signups || {}).forEach(s => {
        if (s.userId === user?.id && s.status === 'verified') {
          total += s.verifiedHours || 0;
        }
      });
    });
    return total;
  }, [opportunities, user?.id]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Opening Support Hub...</p>
      </div>
    );
  }

  // ALLOWED FOR STAFF OR PARENTS
  const canInteract = isStaff || isParent;

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Squad Support</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Volunteer Hub</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Parental Coordination Ledger</p>
        </div>

        {isStaff && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                <Plus className="h-5 w-5 mr-2" /> Dispatch Request
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-black tracking-tight uppercase">New Assignment</DialogTitle>
                <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Enroll tactical squad support</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Title</Label>
                  <Input placeholder="e.g. Concession Management" value={newOpp.title} onChange={e => setNewOpp({...newOpp, title: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Date</Label>
                    <Input type="date" value={newOpp.date} onChange={e => setNewOpp({...newOpp, date: e.target.value})} className="h-12 rounded-xl font-black border-2" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Slots</Label>
                    <Input type="number" value={newOpp.slots} onChange={e => setNewOpp({...newOpp, slots: e.target.value})} className="h-12 rounded-xl font-black border-2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                  <Input placeholder="Venue/Field name" value={newOpp.location} onChange={e => setNewOpp({...newOpp, location: e.target.value})} className="h-12 rounded-xl font-bold border-2" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Hours per Person</Label>
                  <Input type="number" step="0.5" value={newOpp.hoursPerSlot} onChange={e => setNewOpp({...newOpp, hoursPerSlot: e.target.value})} className="h-12 rounded-xl font-black border-2" />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleAddOpportunity} disabled={isProcessing || !newOpp.title}>
                  Publish Assignment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-primary text-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <Timer className="h-10 w-10 text-white/40" />
              <Badge className="bg-white/20 text-white font-black text-[8px] uppercase tracking-widest px-2">Audit</Badge>
            </div>
            <div>
              <p className="text-4xl font-black leading-none">{totalVerifiedHours}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Your Verified Hours</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <Users className="h-10 w-10 text-primary/40" />
              <Badge className="bg-primary/5 text-primary font-black text-[8px] uppercase tracking-widest px-2">Active</Badge>
            </div>
            <div>
              <p className="text-4xl font-black leading-none text-primary">{opportunities.length}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Open Assignments</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md ring-1 ring-black/5 bg-black text-white overflow-hidden">
          <CardContent className="p-8 space-y-2">
            <div className="flex justify-between items-start">
              <HandHelping className="h-10 w-10 text-white/40" />
              <Badge className="bg-white/20 text-white font-black text-[8px] uppercase tracking-widest px-2">Status</Badge>
            </div>
            <div>
              <p className="text-xl font-black leading-tight uppercase truncate">{user?.name}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Verified Contributor</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="available" className="space-y-8">
        <TabsList className="bg-muted/50 rounded-xl p-1 h-12 inline-flex border-2">
          <TabsTrigger value="available" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Support Board</TabsTrigger>
          {isStaff && <TabsTrigger value="ledger" className="rounded-lg font-black text-xs uppercase tracking-widest px-8 data-[state=active]:bg-black data-[state=active]:text-white transition-all">Audit Ledger</TabsTrigger>}
        </TabsList>

        <TabsContent value="available" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {opportunities.map((opp) => {
              const signups = Object.values(opp.signups || {});
              const hasSignedUp = opp.signups?.[user?.id || ''];
              const isFull = signups.length >= opp.slots;

              return (
                <Card key={opp.id} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group">
                  <CardHeader className="p-8 pb-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest border-primary/20 text-primary">Assignment</Badge>
                      {hasSignedUp && <Badge className="bg-green-500 text-white font-black text-[8px] px-2 h-5 border-none uppercase">Enrolled</Badge>}
                    </div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{opp.title}</CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">{opp.description || 'General support assignment for the upcoming event.'}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 pt-0 flex-1 space-y-6">
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center gap-3 text-[11px] font-bold uppercase text-muted-foreground"><Calendar className="h-4 w-4 text-primary" /> {format(new Date(opp.date), 'MMM d, yyyy')}</div>
                      <div className="flex items-center gap-3 text-[11px] font-bold uppercase text-muted-foreground"><MapPin className="h-4 w-4 text-primary" /> {opp.location || 'TBD'}</div>
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          <span className="text-[10px] font-black uppercase">{signups.length} / {opp.slots} Enrolled</span>
                        </div>
                        <span className="text-[10px] font-black uppercase text-primary bg-primary/5 px-2 py-1 rounded-lg">{opp.hoursPerSlot} Hours</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="p-8 pt-0">
                    {isStaff ? (
                      <div className="flex gap-2 w-full">
                        <Button 
                          className={cn("flex-1 h-14 rounded-2xl font-black uppercase shadow-lg", hasSignedUp ? "bg-muted text-muted-foreground" : "bg-black text-white hover:bg-primary")}
                          onClick={() => signUpForVolunteer(opp.id)}
                          disabled={hasSignedUp || isFull}
                        >
                          {hasSignedUp ? "Enrolled" : "Sign Up"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl text-destructive hover:bg-destructive/5" onClick={() => deleteVolunteerOpportunity(opp.id)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        className={cn("w-full h-14 rounded-2xl font-black uppercase shadow-lg", hasSignedUp ? "bg-muted text-muted-foreground" : "bg-black text-white hover:bg-primary shadow-black/20")}
                        onClick={() => signUpForVolunteer(opp.id)}
                        disabled={hasSignedUp || isFull || !isParent}
                      >
                        {hasSignedUp ? "Deployment Confirmed" : isFull ? "Full Strength" : !isParent ? "Parents Only" : "Claim Assignment"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
            {opportunities.length === 0 && (
              <div className="col-span-full py-24 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
                <HandHelping className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">No active support requests found.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-0">
          <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white">
            <CardHeader className="bg-black text-white p-10">
              <div className="flex items-center gap-6">
                <div className="bg-primary p-4 rounded-2xl shadow-xl shadow-primary/20">
                  <ClipboardList className="h-8 w-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight uppercase leading-none">Support Audit</CardTitle>
                  <CardDescription className="text-white/60 font-bold uppercase tracking-widest text-[10px] mt-2">Verify parent contributions & verify hours</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                    <tr>
                      <th className="px-10 py-6">Contributor</th>
                      <th className="px-6 py-6">Assignment</th>
                      <th className="px-6 py-6">Status</th>
                      <th className="px-10 py-6 text-right">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/50">
                    {opportunities.flatMap(opp => Object.values(opp.signups || {}).map(signup => (
                      <tr key={`${opp.id}_${signup.userId}`} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-10 py-6">
                          <p className="font-black text-sm uppercase tracking-tight">{signup.userName}</p>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Parent Contributor</p>
                        </td>
                        <td className="px-6 py-6">
                          <p className="text-xs font-bold uppercase">{opp.title}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(opp.date), 'MMM d')}</p>
                        </td>
                        <td className="px-6 py-6">
                          <Badge className={cn(
                            "border-none font-black text-[8px] uppercase px-2 h-5",
                            signup.status === 'verified' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {signup.status}
                          </Badge>
                        </td>
                        <td className="px-10 py-6 text-right">
                          {signup.status === 'verified' ? (
                            <span className="font-black text-primary text-sm">+{signup.verifiedHours} HOURS</span>
                          ) : (
                            <Button 
                              size="sm" 
                              className="rounded-xl h-10 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20"
                              onClick={() => verifyVolunteerHours(opp.id, signup.userId, opp.hoursPerSlot)}
                            >
                              <ShieldCheck className="h-3 w-3 mr-2" /> Verify {opp.hoursPerSlot}h
                            </Button>
                          )}
                        </td>
                      </tr>
                    )))}
                    {opportunities.every(o => Object.keys(o.signups || {}).length === 0) && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center opacity-30">
                          <p className="text-xs font-black uppercase tracking-widest">No contributors pending verification.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
