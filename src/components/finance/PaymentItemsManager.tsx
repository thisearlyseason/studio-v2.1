"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Copy, ExternalLink, Trash2, Loader2, Link2,
  Tag, Trophy, Package, HelpCircle, ChevronDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { useAuth } from '@/firebase';

type PaymentCategory = 'league' | 'tournament' | 'equipment' | 'other';

interface PaymentItem {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  amount: number; // cents
  currency: string;
  category: PaymentCategory;
  stripePaymentLinkUrl: string;
  createdAt: string;
  isActive: boolean;
}

const CATEGORY_META: Record<PaymentCategory, { label: string; icon: React.ReactNode; color: string }> = {
  league:     { label: 'League Fee',      icon: <Trophy className="h-3.5 w-3.5" />,  color: 'bg-blue-100 text-blue-700'    },
  tournament: { label: 'Tournament Fee',  icon: <Tag className="h-3.5 w-3.5" />,     color: 'bg-purple-100 text-purple-700' },
  equipment:  { label: 'Equipment',       icon: <Package className="h-3.5 w-3.5" />, color: 'bg-orange-100 text-orange-700' },
  other:      { label: 'Other',           icon: <HelpCircle className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-600'  },
};

interface PaymentItemsManagerProps {
  userId: string;
  teamId: string;
  /** Whether the user's Stripe account has charges enabled */
  stripeChargesEnabled: boolean;
}

/**
 * PaymentItemsManager
 *
 * Lets Pro team owners create, view, copy links for, and deactivate payment
 * items (league fees, tournament fees, equipment charges, etc.). Each item
 * is backed by a Stripe Payment Link on their connected Express account.
 */
export function PaymentItemsManager({ userId, teamId, stripeChargesEnabled }: PaymentItemsManagerProps) {
  const auth = useAuth();
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<PaymentItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const createOperationRef = React.useRef<{ id: string; fingerprint: string } | null>(null);

  const [form, setForm] = useState({
    name: '',
    category: 'other' as PaymentCategory,
    amountDollars: '',
    description: '',
  });

  const fetchItems = useCallback(async () => {
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) return;
      const res = await fetch(`/api/stripe/payment-items?teamId=${teamId}`, {
        headers: authHeader(idToken),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('[PaymentItemsManager] fetchItems error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [auth, teamId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const resetForm = () => setForm({ name: '', category: 'other', amountDollars: '', description: '' });

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(form.amountDollars);
    if (!isFinite(amount) || amount < 0.50) {
      toast({ title: 'Amount must be at least $0.50', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const fingerprint = JSON.stringify({ teamId, ...form });
      if (createOperationRef.current?.fingerprint !== fingerprint) {
        createOperationRef.current = {
          id: crypto.randomUUID(),
          fingerprint,
        };
      }
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');

      const res = await fetch('/api/stripe/payment-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({
          userId,
          teamId,
          name: form.name.trim(),
          category: form.category,
          amountDollars: amount,
          description: form.description.trim() || undefined,
          operationId: createOperationRef.current.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment item');

      setItems(prev => [data.item, ...prev.filter(item => item.id !== data.item.id)]);
      createOperationRef.current = null;
      setIsDialogOpen(false);
      resetForm();
      toast({ title: '✓ Payment Item Created', description: `"${data.item.name}" payment link is ready to share.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const idToken = await getAuthToken(auth);
      if (!idToken) throw new Error('Not authenticated');

      const res = await fetch('/api/stripe/payment-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
        body: JSON.stringify({ userId, teamId, itemId: itemToDelete.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate');

      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
      toast({ title: 'Payment Item Deactivated', description: `"${itemToDelete.name}" link has been disabled.` });
      setItemToDelete(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const copyLink = (url: string, name: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: '✓ Link Copied', description: `Payment link for "${name}" copied to clipboard.` });
    }).catch(() => {
      toast({ title: 'Copy Failed', variant: 'destructive' });
    });
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/5 text-primary border-none font-black uppercase text-[8px] h-5 px-2 tracking-widest">Payment Links</Badge>
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight">Payment Items</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Create shareable payment links for team fees and charges
          </p>
        </div>
        <Button
          onClick={() => { resetForm(); setIsDialogOpen(true); }}
          disabled={!stripeChargesEnabled}
          className="h-11 px-5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-black text-white hover:bg-primary border-none shadow-xl active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4 mr-2" /> New Item
        </Button>
      </div>

      {!stripeChargesEnabled && (
        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
          ⚠ Connect your Stripe account above to create payment links.
        </p>
      )}

      {/* Items List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center opacity-30 space-y-3 border-2 border-dashed rounded-[2.5rem]">
          <Link2 className="h-12 w-12 mx-auto" />
          <p className="text-xs font-black uppercase tracking-widest">No payment items yet.</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em]">
            Create your first item to generate a shareable payment link.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const meta = CATEGORY_META[item.category] ?? CATEGORY_META.other;
            const amountDollars = (item.amount / 100).toFixed(2);
            return (
              <Card key={item.id} className="rounded-[2rem] border-none shadow-lg bg-white ring-1 ring-black/5 overflow-hidden group hover:shadow-xl transition-all">
                <CardContent className="p-6 space-y-4">
                  {/* Category badge + amount */}
                  <div className="flex items-start justify-between">
                    <Badge className={cn('border-none font-black text-[8px] uppercase px-2.5 h-5 flex items-center gap-1', meta.color)}>
                      {meta.icon}{meta.label}
                    </Badge>
                    <span className="text-2xl font-black text-primary">${amountDollars}</span>
                  </div>

                  {/* Name */}
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight leading-tight">{item.name}</h4>
                    {item.description && (
                      <p className="text-[9px] font-bold text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                    )}
                  </div>

                  {/* Payment link URL (truncated) */}
                  <div className="bg-muted/30 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[8px] font-mono text-muted-foreground truncate flex-1">
                      {item.stripePaymentLinkUrl}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => copyLink(item.stripePaymentLinkUrl, item.name)}
                      className="flex-1 h-9 rounded-xl font-black text-[9px] uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary hover:text-white border-none transition-all"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(item.stripePaymentLinkUrl, '_blank')}
                      className="h-9 w-9 rounded-xl border-none bg-muted/30 hover:bg-muted p-0 flex items-center justify-center"
                      title="Open payment link"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setItemToDelete(item)}
                      className="h-9 w-9 rounded-xl border-none bg-red-50 hover:bg-red-100 text-red-500 p-0 flex items-center justify-center"
                      title="Deactivate item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={o => { if (!isSubmitting) { setIsDialogOpen(o); if (!o) resetForm(); } }}>
        <DialogContent className="rounded-[3rem] sm:max-w-lg p-0 border-none shadow-2xl overflow-hidden bg-white text-foreground">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight">New Payment Item</DialogTitle>
                  <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Creates a shareable Stripe Payment Link
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Item Name *</Label>
                <Input
                  placeholder="e.g. Spring League Registration"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-12 rounded-2xl border-2 font-bold"
                />
              </div>

              {/* Category + Amount side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Category *</Label>
                  <Select
                    value={form.category}
                    onValueChange={v => setForm(f => ({ ...f, category: v as PaymentCategory }))}
                  >
                    <SelectTrigger className="h-12 rounded-2xl border-2 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="league" className="font-bold">League Fee</SelectItem>
                      <SelectItem value="tournament" className="font-bold">Tournament Fee</SelectItem>
                      <SelectItem value="equipment" className="font-bold">Equipment</SelectItem>
                      <SelectItem value="other" className="font-bold">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Amount (USD) *</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0.50"
                      step="0.01"
                      placeholder="0.00"
                      value={form.amountDollars}
                      onChange={e => setForm(f => ({ ...f, amountDollars: e.target.value }))}
                      className="h-12 rounded-2xl border-2 font-bold pl-8"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Description (optional)</Label>
                <Textarea
                  placeholder="Add context for payers (season, due date, etc.)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="rounded-2xl border-2 font-bold resize-none"
                  rows={2}
                />
              </div>

              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest text-center">
                A Stripe Payment Link will be generated on your connected account.
                Funds go directly to you — no platform fee.
              </p>
            </div>

            <DialogFooter>
              <Button
                className="w-full h-14 rounded-[2rem] text-base font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                onClick={handleCreate}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Creating Link...</>
                ) : (
                  <><Link2 className="h-5 w-5 mr-2" /> Create Payment Link</>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={!!itemToDelete} onOpenChange={o => { if (!isDeleting && !o) setItemToDelete(null); }}>
        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black uppercase">Deactivate Payment Item?</AlertDialogTitle>
            <AlertDialogDescription className="font-bold text-muted-foreground">
              This will disable the Stripe Payment Link for <strong>"{itemToDelete?.name}"</strong>.
              Existing payments already collected are not affected. This cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl font-black" disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl font-black bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeactivate}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
