"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type TieredPlayoffSetupPayload = {
  sizing: 'automatic' | 'custom';
  divisionNames: string[];
  divisionSizes?: number[];
  avoidPreliminaryRematches: boolean;
};

export function TieredPlayoffSetupDialog({
  open,
  onOpenChange,
  teamCount,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamCount: number;
  submitting: boolean;
  onSubmit: (payload: TieredPlayoffSetupPayload) => Promise<void>;
}) {
  const [sizing, setSizing] = useState<'automatic' | 'custom'>('automatic');
  const [names, setNames] = useState('Championship, Consolation');
  const [sizes, setSizes] = useState('');
  const [avoidPreliminaryRematches, setAvoidPreliminaryRematches] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) setError('');
  }, [open]);

  const submit = async () => {
    const divisionNames = names.split(',').map(name => name.trim()).filter(Boolean);
    const divisionSizes = sizes.split(',').map(size => Number(size.trim())).filter(Number.isFinite);
    if (!divisionNames.length) {
      setError('Enter at least one playoff division name.');
      return;
    }
    if (sizing === 'custom' && (divisionSizes.length !== divisionNames.length || divisionSizes.reduce((sum, size) => sum + size, 0) !== teamCount)) {
      setError(`Custom division sizes must assign all ${teamCount} eligible teams exactly once.`);
      return;
    }
    setError('');
    await onSubmit({
      sizing,
      divisionNames,
      ...(sizing === 'custom' ? { divisionSizes } : {}),
      avoidPreliminaryRematches,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl border-2 border-black/10 bg-white p-6 text-black sm:p-8">
        <DialogHeader className="text-left">
          <DialogTitle className="text-3xl font-black uppercase tracking-tight">Configure Playoff Divisions</DialogTitle>
          <DialogDescription className="text-sm font-medium text-black/60">
            All preliminary results are final. Define how the {teamCount} eligible teams should be grouped before reviewing playoff seeds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          <div className="space-y-2">
            <Label htmlFor="tiered-division-names" className="font-black uppercase tracking-wider">Division names</Label>
            <Input id="tiered-division-names" value={names} onChange={event => setNames(event.target.value)} placeholder="Championship, Consolation" className="h-12 border-2 border-black/20 bg-white text-black" />
            <p className="text-xs text-black/55">Separate names with commas. Every division must contain at least two teams.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant={sizing === 'automatic' ? 'default' : 'outline'} onClick={() => setSizing('automatic')}>Automatic sizes</Button>
            <Button type="button" variant={sizing === 'custom' ? 'default' : 'outline'} onClick={() => setSizing('custom')}>Custom sizes</Button>
          </div>

          {sizing === 'custom' && <div className="space-y-2">
            <Label htmlFor="tiered-division-sizes" className="font-black uppercase tracking-wider">Division sizes</Label>
            <Input id="tiered-division-sizes" value={sizes} onChange={event => setSizes(event.target.value)} placeholder="4, 4" className="h-12 border-2 border-black/20 bg-white text-black" />
          </div>}

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-black/10 bg-neutral-50 p-4">
            <Checkbox checked={avoidPreliminaryRematches} onCheckedChange={checked => setAvoidPreliminaryRematches(checked === true)} />
            <span><strong className="block text-sm">Avoid preliminary rematches</strong><span className="text-xs text-black/55">Prefer new opponents when constructing the playoff brackets.</span></span>
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting} className="bg-primary text-white hover:bg-primary/90">
            {submitting ? 'Saving…' : 'Save Divisions & Review Seeding'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
