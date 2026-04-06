"use client";

import React, { useState } from 'react';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
import { useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, Loader2, DollarSign, Target, Calendar, Link as LinkIcon, DollarSign as DollarIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FundraisingManager() {
  const { activeTeam, db, addFundraisingOpportunity, updateFundraisingOpportunity, deleteFundraisingOpportunity } = useTeam();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<FundraisingOpportunity | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [form, setForm] = useState<Partial<FundraisingOpportunity>>({
    title: '',
    description: '',
    goalAmount: 0,
    deadline: format(new Date(), 'yyyy-MM-dd'),
    externalLink: '',
    eTransferDetails: '',
    isShareable: true
  });

  const fundraisingQuery = useMemoFirebase(() => (activeTeam && db) ? query(collection(db, 'teams', activeTeam.id, 'fundraising'), orderBy('deadline', 'asc')) : null, [activeTeam?.id, db]);
  const { data: opportunities, isLoading } = useCollection<FundraisingOpportunity>(fundraisingQuery);

  const handleSubmit = async () => {
    if (!form.title || !form.goalAmount) return;
    setIsProcessing(true);
    try {
      if (editingCampaign) {
        await updateFundraisingOpportunity(editingCampaign.id, form);
        toast({ title: "Campaign Updated", description: "Your fundraising details have been synchronized." });
      } else {
        await addFundraisingOpportunity(form);
        toast({ title: "Campaign Launched", description: "New fundraising opportunity is now active." });
      }
      setIsFormOpen(false);
      setEditingCampaign(null);
      setForm({
        title: '',
        description: '',
        goalAmount: 0,
        deadline: format(new Date(), 'yyyy-MM-dd'),
        externalLink: '',
        eTransferDetails: '',
        isShareable: true
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save campaign. Please try again.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = (opp: FundraisingOpportunity) => {
    setEditingCampaign(opp);
    setForm(opp);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this campaign? This will remove all associated tracking data.")) return;
    try {
      await deleteFundraisingOpportunity(id);
      toast({ title: "Campaign Terminated", description: "Opportunity removed from squad archives." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete campaign.", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="py-20 text-center animate-pulse"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <DollarIcon className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Fundraising Tactical Manager</h3>
        </div>
        <Button className="flex-1 sm:flex-none rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20" onClick={() => { setEditingCampaign(null); setForm({ title: '', description: '', goalAmount: 0, deadline: format(new Date(), 'yyyy-MM-dd'), externalLink: '', eTransferDetails: '', isShareable: true }); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Launch Campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {opportunities?.map((opp) => (
          <Card key={opp.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-6 relative overflow-hidden group hover:shadow-2xl transition-all border-b-4 border-primary/20">
            <div className="flex justify-between items-start">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary"><DollarSign className="h-6 w-6" /></div>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => handleEdit(opp)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-none font-black uppercase text-[10px] tracking-widest">
                    Edit Campaign
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 text-red-500" onClick={() => handleDelete(opp.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-destructive text-white border-none font-black uppercase text-[10px] tracking-widest">
                    Delete Campaign
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            
            <div className="space-y-1">
              <h4 className="text-lg font-black uppercase tracking-tight truncate leading-none">{opp.title}</h4>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2 line-clamp-2">{opp.description}</p>
            </div>

            <div className="space-y-4 pt-4 border-t border-dashed">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Target Goal</p>
                  <p className="text-2xl font-black text-foreground">${opp.goalAmount.toLocaleString()}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Deadline</p>
                  <p className="text-xs font-bold uppercase">{opp.deadline ? format(new Date(opp.deadline), 'MMM d, yyyy') : 'NO DATE'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase">
                  <span>Progress</span>
                  <span>{Math.round((opp.currentAmount / opp.goalAmount) * 100)}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (opp.currentAmount / opp.goalAmount) * 100)}%` }}
                  />
                </div>
                <p className="text-[9px] font-bold text-primary uppercase text-center">${opp.currentAmount.toLocaleString()} RAISED TO DATE</p>
              </div>
            </div>
          </Card>
        ))}

        {(!opportunities || opportunities.length === 0) && (
          <div className="col-span-full py-32 text-center opacity-30 italic text-xs uppercase font-black text-foreground border-2 border-dashed rounded-[3rem]">
            No fundraising campaigns launched.
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="rounded-[3.5rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Campaign Deployment Protocol</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-10 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary shadow-sm"><Target className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">{editingCampaign ? 'Update Campaign' : 'Launch Campaign'}</DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">Institutional Financial Mobilization</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Campaign Headline</Label>
                <Input placeholder="e.g. New Uniform Fund drive..." value={form.title ?? ''} onChange={e => setForm({...form, title: e.target.value})} className="h-14 rounded-2xl border-2 font-bold" />
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Target Amount ($)</Label>
                  <Input type="number" placeholder="5000" value={form.goalAmount || ''} onChange={e => setForm({...form, goalAmount: parseFloat(e.target.value)})} className="h-12 border-2 rounded-xl font-bold" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Deadline Date</Label>
                  <Input type="date" value={form.deadline ?? ''} onChange={e => setForm({...form, deadline: e.target.value})} className="h-12 border-2 rounded-xl font-bold" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Mission Narrative</Label>
                <Textarea placeholder="Explain why the squad needs these funds..." value={form.description ?? ''} onChange={e => setForm({...form, description: e.target.value})} className="min-h-[100px] rounded-2xl border-2 font-medium" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2"><LinkIcon className="h-4 w-4 text-primary" /><Label className="text-[10px] font-black uppercase tracking-widest">External Links & Details</Label></div>
                <div className="space-y-4">
                  <Input placeholder="Direct Donation URL (Stripe, PayPal, GoFundMe)..." value={form.externalLink ?? ''} onChange={e => setForm({...form, externalLink: e.target.value})} className="h-12 border-2 rounded-xl text-[10px] font-bold" />
                  <Input placeholder="E-Transfer Instructions..." value={form.eTransferDetails ?? ''} onChange={e => setForm({...form, eTransferDetails: e.target.value})} className="h-12 border-2 rounded-xl text-[10px] font-bold" />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button className="w-full h-16 rounded-[2rem] text-lg font-black bg-black text-white hover:bg-primary transition-all shadow-xl border-none" onClick={handleSubmit} disabled={isProcessing || !form.title || !form.goalAmount}>
                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : (editingCampaign ? "Commit Update" : "Launch Campaign")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
