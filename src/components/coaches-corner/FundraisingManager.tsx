"use client";

import React, { useState, useCallback } from 'react';
import { useTeam, FundraisingOpportunity } from '@/components/providers/team-provider';
import { useCollection, useMemoFirebase, useAuth } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  Plus, Edit3, Trash2, Loader2, DollarSign, Target, Link as LinkIcon,
  DollarSign as DollarIcon, Copy, ExternalLink, CreditCard, Zap, XCircle
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/date-picker";
import { getAuthToken, authHeader } from '@/lib/client-auth';

export function FundraisingManager() {
  const { activeTeam, db, user, addFundraisingOpportunity, updateFundraisingOpportunity, deleteFundraisingOpportunity } = useTeam();
  const auth = useAuth();
  const stripeLinkOperations = React.useRef(new Map<string, string>());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<FundraisingOpportunity | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [removingLinkFor, setRemovingLinkFor] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<FundraisingOpportunity>>({
    title: '',
    description: '',
    goalAmount: 0,
    deadline: format(new Date(), 'yyyy-MM-dd'),
    externalLink: '',
    eTransferDetails: '',
    isShareable: true
  });

  const fundraisingQuery = useMemoFirebase(
    () => (activeTeam && db)
      ? query(collection(db, 'teams', activeTeam.id, 'fundraising'), orderBy('deadline', 'asc'))
      : null,
    [activeTeam?.id, db]
  );
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
      resetForm();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save campaign. Please try again.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => setForm({
    title: '',
    description: '',
    goalAmount: 0,
    deadline: format(new Date(), 'yyyy-MM-dd'),
    externalLink: '',
    eTransferDetails: '',
    isShareable: true
  });

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

  /** Generate a Stripe Payment Link with custom amount for this campaign */
  const handleGenerateStripeLink = useCallback(async (opp: FundraisingOpportunity) => {
    if (!user?.id || !activeTeam?.id) return;
    setGeneratingLinkFor(opp.id);
    try {
      const operationId = stripeLinkOperations.current.get(opp.id) || crypto.randomUUID();
      stripeLinkOperations.current.set(opp.id, operationId);
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');

      const res = await fetch('/api/stripe/fundraising-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({
          userId: user.id,
          teamId: activeTeam.id,
          campaignId: opp.id,
          campaignTitle: opp.title,
          campaignDescription: opp.description,
          operationId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment link');
      stripeLinkOperations.current.delete(opp.id);

      toast({
        title: '✓ Stripe Donation Link Created',
        description: 'Donors can now choose any amount to give.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingLinkFor(null);
    }
  }, [auth, user?.id, activeTeam?.id]);

  /** Remove / deactivate the Stripe Payment Link from a campaign */
  const handleRemoveStripeLink = useCallback(async (opp: FundraisingOpportunity) => {
    if (!user?.id || !activeTeam?.id) return;
    if (!window.confirm('Deactivate the Stripe donation link for this campaign?')) return;
    setRemovingLinkFor(opp.id);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');

      const res = await fetch('/api/stripe/fundraising-link', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ userId: user.id, teamId: activeTeam.id, campaignId: opp.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove link');
      toast({ title: 'Donation link deactivated.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setRemovingLinkFor(null);
    }
  }, [auth, user?.id, activeTeam?.id]);

  const copyLink = (url: string, title: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: '✓ Link Copied', description: `Donation link for "${title}" copied.` });
    });
  };

  if (isLoading) return <div className="py-20 text-center animate-pulse"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <DollarIcon className="h-5 w-5 text-primary" />
          <h3 className="text-xl font-black uppercase tracking-tight text-foreground">Fundraising Tactical Manager</h3>
        </div>
        <Button
          className="flex-1 sm:flex-none rounded-xl h-11 px-6 font-black uppercase text-[10px] shadow-lg shadow-primary/20"
          onClick={() => {
            setEditingCampaign(null);
            resetForm();
            setIsFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Launch Campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {opportunities?.map((opp) => {
          const hasStripeLink = !!(opp as any).stripePaymentLinkUrl;
          const pct = opp.goalAmount > 0 ? Math.round((opp.currentAmount / opp.goalAmount) * 100) : 0;
          const isGenerating = generatingLinkFor === opp.id;
          const isRemoving = removingLinkFor === opp.id;

          return (
            <Card key={opp.id} className="rounded-[2.5rem] border-none shadow-xl bg-white p-8 space-y-6 relative overflow-hidden group hover:shadow-2xl transition-all border-b-4 border-primary/20">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div className="flex gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10 text-primary" onClick={() => handleEdit(opp)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-black text-white border-none font-black uppercase text-[10px] tracking-widest">Edit Campaign</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50 text-red-500" onClick={() => handleDelete(opp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-destructive text-white border-none font-black uppercase text-[10px] tracking-widest">Delete Campaign</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Title & description */}
              <div className="space-y-1">
                <h4 className="text-lg font-black uppercase tracking-tight truncate leading-none">{opp.title}</h4>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2 line-clamp-2">{opp.description}</p>
              </div>

              {/* Progress */}
              <div className="space-y-4 pt-4 border-t border-dashed">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Target Goal</p>
                    <p className="text-2xl font-black text-foreground">${opp.goalAmount.toLocaleString()}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Deadline</p>
                    <p className="text-xs font-bold uppercase">
                      {opp.deadline ? (() => { try { return format(new Date(opp.deadline), 'MMM d, yyyy'); } catch { return 'NO DATE'; } })() : 'NO DATE'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase">
                    <span>Progress</span><span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-1000"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-[9px] font-bold text-primary uppercase text-center">
                    ${opp.currentAmount.toLocaleString()} RAISED TO DATE
                  </p>
                </div>
              </div>

              {/* ── Stripe Donation Link section ── */}
              <div className="pt-2 border-t border-dashed space-y-3">
                {hasStripeLink ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="bg-emerald-100 p-1.5 rounded-lg text-emerald-600">
                          <CreditCard className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Stripe Donations Active</p>
                          <p className="text-[8px] font-bold text-emerald-600">Donors set their own amount</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveStripeLink(opp)}
                        disabled={isRemoving}
                        className="h-7 w-7 p-0 rounded-lg hover:bg-red-50 text-red-400"
                        title="Deactivate Stripe link"
                      >
                        {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {/* Link row */}
                    <div className="bg-muted/30 rounded-xl px-3 py-2 flex items-center gap-2">
                      <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[8px] font-mono text-muted-foreground truncate flex-1">
                        {(opp as any).stripePaymentLinkUrl}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => copyLink((opp as any).stripePaymentLinkUrl, opp.title)}
                        className="flex-1 h-9 rounded-xl font-black text-[9px] uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary hover:text-white border-none transition-all"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open((opp as any).stripePaymentLinkUrl, '_blank')}
                        className="h-9 w-9 rounded-xl border-none bg-muted/30 hover:bg-muted p-0"
                        title="Open link"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateStripeLink(opp)}
                    disabled={isGenerating}
                    className="w-full h-10 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 border-dashed hover:bg-primary/5 hover:border-primary hover:text-primary transition-all"
                  >
                    {isGenerating ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating...</>
                    ) : (
                      <><Zap className="h-3.5 w-3.5 mr-1.5" /> Enable Stripe Donations</>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}

        {(!opportunities || opportunities.length === 0) && (
          <div className="col-span-full py-32 text-center opacity-30 italic text-xs uppercase font-black text-foreground border-2 border-dashed rounded-[3rem]">
            No fundraising campaigns launched.
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={o => { if (!isProcessing) { setIsFormOpen(o); if (!o) { setEditingCampaign(null); resetForm(); } } }}>
        <DialogContent className="rounded-[3.5rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <DialogTitle className="sr-only">Campaign Deployment Protocol</DialogTitle>
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 lg:p-12 space-y-8 overflow-y-auto max-h-[90vh] custom-scrollbar">
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary shadow-sm"><Target className="h-6 w-6" /></div>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tight">
                    {editingCampaign ? 'Update Campaign' : 'Launch Campaign'}
                  </DialogTitle>
                  <DialogDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">
                    Institutional Financial Mobilization
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Campaign Headline</Label>
                <Input
                  placeholder="e.g. New Uniform Fund Drive..."
                  value={form.title ?? ''}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="h-14 rounded-2xl border-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Target Amount ($)</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={form.goalAmount || ''}
                    onChange={e => setForm({ ...form, goalAmount: parseFloat(e.target.value) })}
                    className="h-12 border-2 rounded-xl font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase ml-1">Deadline Date</Label>
                  <DatePicker
                    date={form.deadline ?? ''}
                    setDate={d => setForm({ ...form, deadline: d })}
                    placeholder="Campaign Deadline"
                    className="h-12 border-2 rounded-xl font-bold bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase ml-1">Mission Narrative</Label>
                <Textarea
                  placeholder="Explain why the squad needs these funds..."
                  value={form.description ?? ''}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="min-h-[100px] rounded-2xl border-2 font-medium"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  <Label className="text-[10px] font-black uppercase tracking-widest">External Links & Details</Label>
                </div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest -mt-2">
                  Optional — use these for GoFundMe, PayPal, or e-Transfer alongside (or instead of) a Stripe link.
                  To add a Stripe donation link, save the campaign first then click "Enable Stripe Donations" on the card.
                </p>
                <div className="space-y-4">
                  <Input
                    placeholder="External Donation URL (GoFundMe, PayPal...)..."
                    value={form.externalLink ?? ''}
                    onChange={e => setForm({ ...form, externalLink: e.target.value })}
                    className="h-12 border-2 rounded-xl text-[10px] font-bold"
                  />
                  <Input
                    placeholder="E-Transfer Instructions..."
                    value={form.eTransferDetails ?? ''}
                    onChange={e => setForm({ ...form, eTransferDetails: e.target.value })}
                    className="h-12 border-2 rounded-xl text-[10px] font-bold"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="w-full h-16 rounded-[2rem] text-lg font-black bg-black text-white hover:bg-primary transition-all shadow-xl border-none"
                onClick={handleSubmit}
                disabled={isProcessing || !form.title || !form.goalAmount}
              >
                {isProcessing
                  ? <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  : (editingCampaign ? 'Commit Update' : 'Launch Campaign')
                }
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
