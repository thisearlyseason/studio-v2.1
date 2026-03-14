
"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  PiggyBank, 
  Plus, 
  DollarSign, 
  Target, 
  Users, 
  Clock, 
  Loader2, 
  Trash2, 
  Globe
} from 'lucide-react';
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

export default function FundraisingPage() {
  const { activeTeam, user, isStaff, addFundraisingOpportunity, signUpForFundraising, updateFundraisingAmount, deleteFundraisingOpportunity } = useTeam();
  const db = useFirestore();
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [updateAmt, setUpdateAmt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [newFund, setNewFund] = useState({ title: '', description: '', goal: '1000', deadline: '' });

  const fundsQuery = useMemoFirebase(() => {
    if (!activeTeam || !db) return null;
    return query(collection(db, 'teams', activeTeam.id, 'fundraising'), orderBy('deadline', 'asc'));
  }, [activeTeam?.id, db]);

  const { data: rawFunds, isLoading } = useCollection<FundraisingOpportunity>(fundsQuery);
  const campaigns = useMemo(() => rawFunds || [], [rawFunds]);

  const handleAddCampaign = async () => {
    if (!newFund.title || !newFund.goal) return;
    setIsProcessing(true);
    await addFundraisingOpportunity({
      title: newFund.title,
      description: newFund.description,
      goalAmount: parseFloat(newFund.goal),
      deadline: newFund.deadline
    });
    setIsAddOpen(false);
    setIsProcessing(false);
    setNewFund({ title: '', description: '', goal: '1000', deadline: '' });
    toast({ title: "Campaign Launched", description: "Parents can now participate." });
  };

  const handleUpdateAmount = async () => {
    if (!selectedFundId || !updateAmt) return;
    setIsProcessing(true);
    await updateFundraisingAmount(selectedFundId, parseFloat(updateAmt));
    setIsUpdateOpen(false);
    setIsProcessing(false);
    setUpdateAmt('');
    toast({ title: "Ledger Synchronized", description: "Fundraising total updated." });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Synchronizing Campaigns...</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Squad Capital</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">Fundraising</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Institutional Resource Acquisition</p>
        </div>

        {isStaff && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-14 px-8 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
                <Plus className="h-5 w-5 mr-2" /> Launch Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
              <DialogTitle className="sr-only">New Fundraising Campaign Initialization</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 lg:p-12 space-y-10">
                <DialogHeader>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                      <PiggyBank className="h-6 w-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">New Campaign</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Define the squad capital target</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Campaign Title</Label>
                    <Input placeholder="e.g. 2024 Nationals Travel Fund" value={newFund.title} onChange={e => setNewFund({...newFund, title: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Target Goal ($)</Label>
                      <Input type="number" value={newFund.goal} onChange={e => setNewFund({...newFund, goal: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Campaign Deadline</Label>
                      <Input type="date" value={newFund.deadline} onChange={e => setNewFund({...newFund, deadline: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Strategy Brief</Label>
                    <Textarea placeholder="Describe how the funds will empower the squad..." value={newFund.description} onChange={e => setNewFund({...newFund, description: e.target.value})} className="rounded-[1.5rem] min-h-[120px] border-2 font-medium focus:border-primary/20 transition-all p-4 resize-none" />
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleAddCampaign} disabled={isProcessing || !newFund.title}>
                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Authorize & Launch Campaign"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {campaigns.map((fund) => {
          const progress = (fund.currentAmount / fund.goalAmount) * 100;
          const participants = Object.values(fund.participants || {});
          const hasJoined = fund.participants?.[user?.id || ''];

          return (
            <Card key={fund.id} className="rounded-[3rem] border-none shadow-2xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col group">
              <div className="h-2 bg-primary w-full" />
              <CardContent className="p-8 lg:p-10 space-y-8 flex-1">
                <div className="flex justify-between items-start">
                  <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary shadow-inner">
                    <PiggyBank className="h-10 w-10" />
                  </div>
                  <Badge variant="secondary" className="bg-black text-white border-none font-black uppercase tracking-widest text-[10px] h-7 px-4 shadow-lg flex items-center gap-2">
                    <Target className="h-3 w-3" /> ${fund.goalAmount.toLocaleString()}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-3xl font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-none">{fund.title}</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed line-clamp-2">
                    {fund.description || 'Campaign dedicated to expanding squad capabilities and ensuring elite preparation.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end mb-1">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Total</p>
                      <p className="text-3xl font-black text-primary">${fund.currentAmount.toLocaleString()}</p>
                    </div>
                    <Badge variant="outline" className="border-primary/20 text-primary font-black text-[10px] h-6">{Math.round(progress)}%</Badge>
                  </div>
                  <Progress value={progress} className="h-3 rounded-full bg-muted shadow-inner" />
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                    <span className="flex items-center gap-2"><Users className="h-3 w-3" /> {participants.length} Active Participants</span>
                    <span className="flex items-center gap-2"><Clock className="h-3 w-3" /> {fund.deadline ? format(new Date(fund.deadline), 'MMM d') : 'No Deadline'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-2">
                  {isStaff ? (
                    <div className="flex gap-2">
                      <Button className="flex-1 h-14 rounded-2xl font-black uppercase text-xs shadow-xl shadow-primary/20" onClick={() => { setSelectedFundId(fund.id); setIsUpdateOpen(true); }}>
                        <Plus className="h-4 w-4 mr-2" /> Add Funds
                      </Button>
                      <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl text-destructive hover:bg-destructive/5" onClick={() => deleteFundraisingOpportunity(fund.id)}>
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      className={cn("w-full h-16 rounded-2xl font-black uppercase shadow-xl transition-all", hasJoined ? "bg-muted text-muted-foreground" : "bg-black text-white hover:bg-primary shadow-black/20")}
                      onClick={() => signUpForFundraising(fund.id)}
                      disabled={hasJoined}
                    >
                      {hasJoined ? "Participating" : "Join Campaign"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {campaigns.length === 0 && (
          <div className="col-span-full py-24 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
            <PiggyBank className="h-12 w-12 mx-auto mb-4" />
            <p className="text-sm font-black uppercase tracking-widest">No active funding campaigns established.</p>
          </div>
        )}
      </div>

      <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl p-8 bg-white">
          <DialogTitle className="sr-only">Sync Campaign Ledger</DialogTitle>
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Sync Ledger</DialogTitle>
            <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Post campaign revenue</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Contribution Amount ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                <Input 
                  type="number" 
                  placeholder="0.00" 
                  value={updateAmt} 
                  onChange={e => setUpdateAmt(e.target.value)}
                  className="h-14 pl-10 text-xl font-black rounded-xl border-2" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl" onClick={handleUpdateAmount} disabled={isProcessing || !updateAmt}>
              Post to Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-[3rem] border-none shadow-2xl bg-black text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
          <Globe className="h-48 w-48" />
        </div>
        <CardContent className="p-12 relative z-10 space-y-6">
          <Badge className="bg-primary text-white border-none font-black text-[10px] px-4 h-7">Institutional Strategy</Badge>
          <h2 className="text-4xl font-black tracking-tight leading-tight uppercase">Elite Resource Management</h2>
          <p className="text-white/60 font-medium text-lg leading-relaxed max-w-2xl">
            Coordinated fundraising ensures your squad has the equipment, transport, and facility access required for professional-level performance. Participants sign up to lead community mobilization efforts and drive capital growth.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
