"use client";

import React, { useState, useMemo } from 'react';
import { useTeam, FundraisingOpportunity, DonationEntry } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, increment, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  PiggyBank, 
  Plus, 
  DollarSign, 
  Target, 
  Users, 
  Clock, 
  Loader2, 
  Trash2, 
  Globe,
  Share2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Search,
  ChevronRight,
  Zap,
  History,
  Info
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
import { format, isPast } from 'date-fns';
import { Lock as LockIcon } from 'lucide-react';

function DonationAuditLedger({ fundId }: { fundId: string }) {
  const { activeTeam, confirmExternalDonation } = useTeam();
  const db = useFirestore();
  const q = useMemoFirebase(() => (db && activeTeam?.id && fundId) ? query(collection(db, 'teams', activeTeam.id, 'fundraising', fundId, 'donations'), orderBy('createdAt', 'desc')) : null, [db, activeTeam?.id, fundId]);
  const { data: donations, isLoading } = useCollection<DonationEntry>(q);

  if (isLoading) return <div className="p-10 text-center animate-pulse"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  if (!donations || donations.length === 0) return <p className="text-[10px] text-center opacity-20 py-10 uppercase font-black">No donations recorded.</p>;

  return (
    <div className="space-y-3">
      {donations.map(don => (
        <div key={don.id} className="p-4 bg-muted/20 rounded-2xl border flex items-center justify-between group">
          <div className="min-w-0">
            <p className="font-black text-sm uppercase truncate">{don.donorName}</p>
            <p className="text-[8px] font-bold text-muted-foreground uppercase">{don.method === 'external' ? 'Digital Hub' : 'E-Transfer/Offline'} • {format(new Date(don.createdAt), 'MMM d, h:mm a')}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-black text-sm text-primary">${don.amount.toLocaleString()}</span>
            {don.status === 'pending' ? (
              <Button size="sm" className="h-8 px-4 rounded-xl font-black text-[8px] uppercase shadow-lg shadow-primary/20" onClick={() => confirmExternalDonation(fundId, don.id, don.amount)}>Confirm</Button>
            ) : (
              <Badge className="bg-green-100 text-green-700 border-none font-black text-[8px] h-6 px-3">VERIFIED</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FundraisingPage() {
  const { activeTeam, user, isStaff, addFundraisingOpportunity, updateFundraisingOpportunity, deleteFundraisingOpportunity, isPro, purchasePro } = useTeam();
  const db = useFirestore();
  
  const [filterMode, setFilterMode] = useState<'active' | 'past'>('active');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<FundraisingOpportunity | null>(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newFund, setNewFund] = useState({ 
    title: '', description: '', goal: '1000', deadline: '', 
    isShareable: false, externalLink: '', eTransferDetails: '' 
  });
  const [configMethod, setConfigMethod] = useState<'external' | 'e-transfer'>('external');

  const fundsQuery = useMemoFirebase(() => (activeTeam?.id && db) ? query(collection(db, 'teams', activeTeam.id, 'fundraising'), orderBy('deadline', 'asc')) : null, [activeTeam?.id, db]);
  const { data: rawCampaigns, isLoading } = useCollection<FundraisingOpportunity>(fundsQuery);
  const allCampaigns = rawCampaigns || [];

  const activeCampaigns = useMemo(() => allCampaigns.filter(f => !isPast(new Date(f.deadline))), [allCampaigns]);
  const pastCampaigns = useMemo(() => allCampaigns.filter(f => isPast(new Date(f.deadline))), [allCampaigns]);
  
  const displayedCampaigns = useMemo(() => {
    const list = filterMode === 'active' ? activeCampaigns : pastCampaigns;
    return list.filter(f => f.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [filterMode, activeCampaigns, pastCampaigns, searchTerm]);

  const stats = useMemo(() => {
    const totalRaised = allCampaigns.reduce((sum, f) => sum + (f.currentAmount || 0), 0);
    const totalGoal = allCampaigns.reduce((sum, f) => sum + (f.goalAmount || 0), 0);
    const efficiency = totalGoal > 0 ? Math.round((totalRaised / totalGoal) * 100) : 0;
    const donorCount = allCampaigns.length > 0 ? Math.floor(totalRaised / 50) + allCampaigns.length : 0;
    return { totalRaised, efficiency, donorCount };
  }, [allCampaigns]);

  const isLimitReached = !isPro && activeCampaigns.length >= 2;

  const handleAddCampaign = async () => {
    if (!newFund.title || !newFund.goal) return;
    setIsProcessing(true);
    await addFundraisingOpportunity({
      ...newFund,
      goalAmount: parseFloat(newFund.goal),
      externalLink: configMethod === 'external' ? newFund.externalLink : '',
      eTransferDetails: configMethod === 'e-transfer' ? newFund.eTransferDetails : ''
    });
    setIsAddOpen(false);
    setIsProcessing(false);
    setNewFund({ title: '', description: '', goal: '1000', deadline: '', isShareable: false, externalLink: '', eTransferDetails: '' });
    toast({ title: "Campaign Strategy Launched" });
  };

  const handleEditCampaign = async () => {
    if (!editingFund) return;
    setIsProcessing(true);
    await updateFundraisingOpportunity(editingFund.id, {
      ...editingFund,
      goalAmount: parseFloat(String(editingFund.goalAmount))
    });
    setIsEditOpen(false);
    setIsProcessing(false);
    setEditingFund(null);
    toast({ title: "Campaign Strategy Updated" });
  };

  const handleCopyLink = (fundId: string) => {
    const url = `${window.location.origin}/public/donate/${activeTeam?.id}/${fundId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Portal Link Copied", description: "External contributors can now donate via this URL." });
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Opening Fiscal Hub...</p>
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-10rem)]">
      {!isPro && (
        <div 
          className="absolute inset-x-[-2rem] inset-y-[-2rem] z-50 flex items-center justify-center p-6 sm:p-10 animate-in fade-in zoom-in duration-500"
          style={{ 
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.8) 100%)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <Card className="max-w-md w-full rounded-[3.5rem] border-none shadow-[0_40px_80px_-15px_rgba(0,0,0,0.15)] bg-white overflow-hidden ring-1 ring-black/5">
            <div className="h-2 bg-primary w-full" />
            <CardHeader className="p-10 lg:p-12 text-center space-y-6">
              <div className="bg-primary/10 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner ring-8 ring-primary/5">
                <LockIcon className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-4 mb-2 mx-auto">Fiscal Access Protocol</Badge>
                <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none">Fundraising Locked</CardTitle>
                <CardDescription className="font-bold uppercase tracking-widest text-[10px] text-muted-foreground/60">Institutional Capital Mobilization Hub</CardDescription>
              </div>
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                Unlock the <span className="text-primary font-black uppercase tracking-tighter">Elite Pro</span> fundraising suite. Manage multi-channel campaigns, automated audit ledgers, and institutional donor portals.
              </p>
            </CardHeader>
            <CardFooter className="p-10 lg:p-12 pt-0">
              <Button 
                onClick={purchasePro}
                className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all bg-primary"
              >
                Unlock Pro Capital Hub
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <div className={cn("space-y-10 pb-20 animate-in fade-in duration-500", !isPro && "blur-[1px] pointer-events-none grayscale opacity-40")}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Squad Capital</Badge>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none text-foreground">Fundraising</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px] ml-1">Institutional Capital Mobilization</p>
        </div>
        {isStaff && (
          <Button 
            onClick={() => isLimitReached ? null : setIsAddOpen(true)} 
            className={cn("h-14 px-8 rounded-2xl text-lg font-black shadow-xl transition-all", isLimitReached ? "bg-muted text-muted-foreground cursor-not-allowed" : "shadow-primary/20 active:scale-95")}
          >
            {isLimitReached ? <AlertCircle className="h-5 w-5 mr-2 text-red-600" /> : <Plus className="h-5 w-5 mr-2" />}
            Launch Campaign
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="rounded-[2.5rem] border-none shadow-md bg-primary text-white p-8 space-y-4 relative overflow-hidden group">
          <TrendingUp className="absolute -right-4 -bottom-4 h-24 w-24 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Capital Raised</p>
          <p className="text-4xl font-black">${stats.totalRaised.toLocaleString()}</p>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-black text-white p-8 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Campaign Efficiency</p>
          <div className="space-y-2">
            <p className="text-4xl font-black text-primary">{stats.efficiency}%</p>
            <Progress value={stats.efficiency} className="h-1.5 bg-white/10" />
          </div>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 space-y-4 ring-1 ring-black/5">
          <p className="text-[10px] font-black uppercase text-muted-foreground">Strategic Units</p>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-foreground">{allCampaigns.length}</p>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Campaigns</span>
          </div>
        </Card>
        <Card className="rounded-[2.5rem] border-none shadow-md bg-muted/20 p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <p className="text-[10px] font-black uppercase">Contributor Pulse</p>
          </div>
          <p className="text-4xl font-black text-foreground">{stats.donorCount}</p>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-2">
        <div className="flex bg-muted/50 p-1.5 rounded-2xl border-2 shadow-inner w-full md:w-auto">
          <Button variant={filterMode === 'active' ? 'default' : 'ghost'} className="flex-1 md:flex-none rounded-xl h-10 px-8 font-black uppercase text-[10px] tracking-widest" onClick={() => setFilterMode('active')}>Active Strategies</Button>
          <Button variant={filterMode === 'past' ? 'default' : 'ghost'} className="flex-1 md:flex-none rounded-xl h-10 px-8 font-black uppercase text-[10px] tracking-widest" onClick={() => setFilterMode('past')}>Archive Ledger</Button>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            placeholder="Search campaigns..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 h-11 w-full rounded-xl bg-muted/30 border-none font-bold text-xs focus:ring-2 focus:ring-primary/20 outline-none" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {displayedCampaigns.map((fund) => {
          const progress = (fund.currentAmount / fund.goalAmount) * 100;
          const isArchive = isPast(new Date(fund.deadline));
          
          return (
            <Card key={fund.id} className="rounded-[3rem] border-none shadow-xl overflow-hidden bg-white flex flex-col group transition-all hover:shadow-2xl hover:ring-2 hover:ring-primary/10">
              <div className={cn("h-2 w-full", isArchive ? "bg-muted" : "bg-primary")} />
              <CardContent className="p-8 lg:p-10 space-y-8 flex-1">
                <div className="flex justify-between items-start">
                  <div className="bg-primary/5 p-5 rounded-[1.5rem] text-primary group-hover:text-black shadow-inner transition-colors">
                    <PiggyBank className="h-10 w-10" />
                  </div>
                  <div className="flex gap-1">
                    {fund.isShareable && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/5 rounded-lg" onClick={() => handleCopyLink(fund.id)}>
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Badge variant="secondary" className="bg-black text-white border-none font-black text-[10px] h-7 px-4 shadow-lg flex items-center gap-2">
                       <Target className="h-3 w-3" /> ${fund.goalAmount.toLocaleString()}
                    </Badge>
                  </div>
                </div>
                <div>
                  <h3 className="text-3xl font-black uppercase tracking-tight leading-none group-hover:text-black transition-colors uppercase">{fund.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {isArchive ? 'Archived' : 'Ends'}: {format(new Date(fund.deadline), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Verified Total</p>
                      <p className="text-3xl font-black text-primary">${fund.currentAmount.toLocaleString()}</p>
                    </div>
                    <Badge variant="outline" className="border-primary/20 text-primary font-black text-[10px] h-6">{Math.round(progress)}%</Badge>
                  </div>
                  <Progress value={progress} className="h-3 rounded-full" />
                </div>
                {isStaff && (
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" className="flex-1 rounded-xl h-12 font-black uppercase text-[10px] border-2 group-hover:border-primary hover:text-black transition-all" onClick={() => { setSelectedFundId(fund.id); setIsAuditOpen(true); }}>
                      <DollarSign className="h-4 w-4 mr-2" /> Audit Hub
                    </Button>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-primary hover:bg-primary/5" onClick={() => { setEditingFund(fund); setIsEditOpen(true); }}>
                        <Zap className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl text-destructive hover:bg-destructive/5" onClick={() => deleteFundraisingOpportunity(fund.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {displayedCampaigns.length === 0 && (
          <div className="col-span-full py-32 text-center border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40 text-foreground">
            <BarChart3 className="h-16 w-16 mx-auto mb-4" />
            <p className="text-sm font-black uppercase tracking-widest">No strategies found in this sector.</p>
          </div>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-[3.5rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Campaign Deployment Strategy</DialogTitle>
          <DialogDescription className="sr-only">Configure multi-channel payment protocols for fundraising</DialogDescription>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Zap className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Campaign Strategy</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Deploy a new capital mobilization strategy</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Campaign Title</Label>
                <Input placeholder="e.g. 2024 Nationals Travel Fund" value={newFund.title} onChange={e => setNewFund({...newFund, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold focus:border-primary/20 transition-all shadow-inner text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Goal ($)</Label>
                  <Input type="number" value={newFund.goal} onChange={e => setNewFund({...newFund, goal: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-xl text-primary" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Deadline</Label>
                  <Input type="date" value={newFund.deadline} onChange={e => setNewFund({...newFund, deadline: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-foreground" />
                </div>
              </div>
              
              <div className="space-y-4 pt-4 border-t">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Configure Payment Protocol</Label>
                <RadioGroup value={configMethod} onValueChange={(v: any) => setConfigMethod(v)} className="grid grid-cols-2 gap-4">
                  <div className={cn("p-4 rounded-xl border-2 transition-all cursor-pointer", configMethod === 'external' ? "border-primary bg-primary/5 shadow-sm" : "border-muted")} onClick={() => setConfigMethod('external')}>
                    <div className="flex items-center gap-2 mb-1">
                      <RadioGroupItem value="external" id="c_ext" />
                      <Label htmlFor="c_ext" className="font-black text-[10px] uppercase cursor-pointer text-foreground">Digital Hub</Label>
                    </div>
                    <p className="text-[8px] font-medium text-muted-foreground uppercase">External redirect</p>
                  </div>
                  <div className={cn("p-4 rounded-xl border-2 transition-all cursor-pointer", configMethod === 'e-transfer' ? "border-primary bg-primary/5 shadow-sm" : "border-muted")} onClick={() => setConfigMethod('e-transfer')}>
                    <div className="flex items-center gap-2 mb-1">
                      <RadioGroupItem value="e-transfer" id="c_et" />
                      <Label htmlFor="c_et" className="font-black text-[10px] uppercase cursor-pointer text-foreground">E-Transfer</Label>
                    </div>
                    <p className="text-[8px] font-medium text-muted-foreground uppercase">Manual verification</p>
                  </div>
                </RadioGroup>

                {configMethod === 'external' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label className="text-[10px] font-black uppercase ml-1 text-foreground">Digital Payment URL</Label>
                    <Input placeholder="Stripe, PayPal, Venmo URL..." value={newFund.externalLink} onChange={e => setNewFund({...newFund, externalLink: e.target.value})} className="h-12 rounded-xl border-2 bg-muted/10 font-bold text-foreground" />
                  </div>
                )}

                {configMethod === 'e-transfer' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label className="text-[10px] font-black uppercase ml-1 text-foreground">E-Transfer Protocol</Label>
                    <Textarea placeholder="Recipient email and security instructions..." value={newFund.eTransferDetails} onChange={e => setNewFund({...newFund, eTransferDetails: e.target.value})} className="min-h-[80px] rounded-2xl border-2 font-medium bg-muted/10 resize-none p-4 text-foreground" />
                  </div>
                )}

                <div className="flex items-center justify-between p-5 bg-primary/5 rounded-[2rem] border-2 border-dashed border-primary/20 mt-4">
                  <div>
                    <p className="text-xs font-black uppercase leading-tight text-foreground">Public Enrollment</p>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter mt-1">Enable unauthenticated portal links</p>
                  </div>
                  <Switch checked={newFund.isShareable} onCheckedChange={v => setNewFund({...newFund, isShareable: v})} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all border-none" onClick={handleAddCampaign} disabled={isProcessing || !newFund.title || !newFund.goal}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Authorize Deployment"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-[3.5rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Edit Campaign Strategy</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar text-foreground">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Zap className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground">Edit Strategy</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Modify existing capital mobilization protocol</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {editingFund && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Campaign Title</Label>
                  <Input placeholder="e.g. 2024 Nationals Travel Fund" value={editingFund.title} onChange={e => setEditingFund({...editingFund, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold focus:border-primary/20 transition-all shadow-inner text-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Goal ($)</Label>
                    <Input type="number" value={editingFund.goalAmount} onChange={e => setEditingFund({...editingFund, goalAmount: parseFloat(e.target.value)})} className="h-14 rounded-2xl border-2 font-black text-xl text-primary" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-foreground">Deadline</Label>
                    <Input type="date" value={editingFund.deadline} onChange={e => setEditingFund({...editingFund, deadline: e.target.value})} className="h-14 rounded-2xl border-2 font-black text-foreground" />
                  </div>
                </div>
                
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="text-[10px] font-black uppercase ml-1 text-foreground">Digital Payment URL</Label>
                  <Input placeholder="Stripe, PayPal, Venmo URL..." value={editingFund.externalLink} onChange={e => setEditingFund({...editingFund, externalLink: e.target.value})} className="h-12 rounded-xl border-2 bg-muted/10 font-bold text-foreground" />
                </div>

                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="text-[10px] font-black uppercase ml-1 text-foreground">E-Transfer Protocol</Label>
                  <Textarea placeholder="Recipient email and security instructions..." value={editingFund.eTransferDetails} onChange={e => setEditingFund({...editingFund, eTransferDetails: e.target.value})} className="min-h-[80px] rounded-2xl border-2 font-medium bg-muted/10 resize-none p-4 text-foreground" />
                </div>

                <div className="flex items-center justify-between p-5 bg-primary/5 rounded-[2rem] border-2 border-dashed border-primary/20 mt-4">
                  <div>
                    <p className="text-xs font-black uppercase leading-tight text-foreground">Public Enrollment</p>
                    <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter mt-1">Enable unauthenticated portal links</p>
                  </div>
                  <Switch checked={editingFund.isShareable} onCheckedChange={v => setEditingFund({...editingFund, isShareable: v})} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all border-none" onClick={handleEditCampaign} disabled={isProcessing || !editingFund?.title}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Update Strategy"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAuditOpen} onOpenChange={setIsAuditOpen}>
        <DialogContent className="rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white sm:max-w-lg text-foreground">
          <DialogTitle className="sr-only">Donation Audit Ledger</DialogTitle>
          <DialogDescription className="sr-only">Verify and confirm receipt of manual or digital donations</DialogDescription>
          <div className="h-2 bg-black w-full" />
          <div className="p-8 lg:p-10 space-y-8">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="bg-black p-3 rounded-2xl text-white shadow-lg"><History className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Campaign Audit</DialogTitle>
                  <DialogDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">Verify and confirm manual receipts</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="py-2">
              {selectedFundId && <DonationAuditLedger fundId={selectedFundId} />}
            </div>
            <DialogFooter>
              <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[10px] border-2 text-foreground" onClick={() => setIsAuditOpen(false)}>Close Audit Hub</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
