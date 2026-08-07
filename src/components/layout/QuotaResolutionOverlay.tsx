
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useTeam } from '@/components/providers/team-provider';
import { ShieldAlert, Check, Users, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import { toast } from '@/hooks/use-toast';

export function QuotaResolutionOverlay() {
  const { proQuotaStatus, teams, user, resolveQuota } = useTeam();
  const [selectedIds, setSelectedTeamIds] = useState<string[]>([]);
  const [isResolving, setIsResolving] = useState(false);

  // Filter for teams owned by the current user that are currently Pro
  const ownedProTeams = useMemo(() => {
    return teams.filter(
      t => t.ownerUserId === user?.id && t.isPro && isBillableSquadSeat(t)
    );
  }, [teams, user?.id]);

  useEffect(() => {
    // Default to selecting the first N teams up to the limit
    if (proQuotaStatus.exceeded && selectedIds.length === 0) {
      setSelectedTeamIds(ownedProTeams.slice(0, proQuotaStatus.limit).map(t => t.id));
    }
  }, [proQuotaStatus.exceeded, proQuotaStatus.limit, ownedProTeams, selectedIds.length]);

  const toggleTeam = (tid: string) => {
    setSelectedTeamIds(prev => {
      if (prev.includes(tid)) return prev.filter(id => id !== tid);
      if (prev.length >= proQuotaStatus.limit) return prev;
      return [...prev, tid];
    });
  };

  const handleConfirm = async () => {
    setIsResolving(true);
    try {
      await resolveQuota(selectedIds);
    } catch (error: any) {
      toast({
        title: 'Quota Update Failed',
        description: error.message || 'Unable to update team access.',
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  if (!proQuotaStatus.exceeded) return null;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
        <div className="h-2 bg-primary w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-red-100 text-red-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mx-auto">
              <ShieldAlert className="h-3 w-3" /> Management Required
            </div>
            <DialogTitle className="text-3xl font-black tracking-tighter leading-tight">
              Elite Quota Exceeded
            </DialogTitle>
            <DialogDescription className="text-base font-medium">
              Your Pro team limit has changed. Please select the <strong>{proQuotaStatus.limit}</strong> squads that will retain Elite Pro access. Others will be moved to the Starter tier.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/30 rounded-2xl p-4 border flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Selected Seats</span>
              <span className={cn(
                "text-2xl font-black transition-colors",
                selectedIds.length === proQuotaStatus.limit ? "text-primary" : "text-foreground"
              )}>
                {selectedIds.length} / {proQuotaStatus.limit}
              </span>
            </div>
            {selectedIds.length === proQuotaStatus.limit && (
              <Badge className="bg-primary text-white font-black py-1.5 h-auto">READY TO SYNC</Badge>
            )}
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
            {ownedProTeams.map((team) => {
              const isSelected = selectedIds.includes(team.id);
              const isDisabled = !isSelected && selectedIds.length >= proQuotaStatus.limit;

              return (
                <div 
                  key={team.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer group",
                    isSelected ? "bg-primary/5 border-primary shadow-sm" : "bg-background border-transparent hover:border-muted",
                    isDisabled && "opacity-50 grayscale pointer-events-none"
                  )}
                  onClick={() => toggleTeam(team.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <Avatar className="h-12 w-12 rounded-xl border-2 border-background shadow-md">
                      <AvatarImage src={team.teamLogoUrl} />
                      <AvatarFallback className="font-black bg-muted text-xs">{team.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h4 className="font-black text-sm truncate tracking-tight">{team.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[8px] h-4 font-black uppercase border-primary/20 text-primary">{team.sport}</Badge>
                        <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Code: {team.code}</span>
                      </div>
                    </div>
                  </div>
                  <Checkbox 
                    checked={isSelected} 
                    className="h-6 w-6 rounded-lg border-2" 
                    onCheckedChange={() => toggleTeam(team.id)} 
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="pt-4">
            <Button 
              className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
              onClick={handleConfirm}
              disabled={selectedIds.length !== proQuotaStatus.limit || isResolving}
            >
              {isResolving ? "Synchronizing Squad Tiers..." : "Commit Selection"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
