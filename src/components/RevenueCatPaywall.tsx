
"use client";

import React, { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTeam } from '@/components/providers/team-provider';
import { Purchases, Offering, Package } from '@revenuecat/purchases-js';
import { Check, Loader2, Sparkles, Trophy, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function RevenueCatPaywall() {
  const { isPaywallOpen, setIsPaywallOpen, isPro, isRCInitialized } = useTeam();
  const [offering, setOffering] = useState<Offering | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    if (isPaywallOpen && isRCInitialized) {
      setIsLoading(true);
      try {
        const instance = Purchases.getSharedInstance();
        instance.getOfferings()
          .then(offerings => {
            setOffering(offerings.current);
            setIsLoading(false);
          })
          .catch(err => {
            console.error("RC Offering Error:", err);
            setIsLoading(false);
          });
      } catch (e) {
        console.warn("Purchases not ready for offerings", e);
        setIsLoading(false);
      }
    }
  }, [isPaywallOpen, isRCInitialized]);

  const handlePurchase = async (pkg: Package) => {
    setIsPurchasing(true);
    try {
      await Purchases.getSharedInstance().purchasePackage(pkg);
      toast({ title: "Welcome to Pro!", description: "Subscription activated successfully." });
      setIsPaywallOpen(false);
    } catch (err: any) {
      if (!err.userCancelled) {
        toast({ title: "Purchase Error", description: err.message || "Failed to process payment.", variant: "destructive" });
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <Dialog open={isPaywallOpen} onOpenChange={setIsPaywallOpen}>
      <DialogContent className="sm:max-w-lg rounded-[2.5rem] overflow-hidden p-0 border-none shadow-2xl">
        <div className="h-2 hero-gradient w-full" />
        <div className="p-8 space-y-8">
          <DialogHeader className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest mx-auto">
              <Sparkles className="h-3 w-3" /> The Squad Pro
            </div>
            <DialogTitle className="text-4xl font-black tracking-tighter leading-tight">
              Master the Game
            </DialogTitle>
            <DialogDescription className="text-base font-medium">
              Unlock the full potential of your squad with professional training and analytics.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {[
              { icon: Zap, text: "Advanced Performance & Scoring Metrics" },
              { icon: Trophy, text: "Private Training & Playbook Library" },
              { icon: Check, text: "Elite Roster & Fee Management" },
              { icon: Check, text: "Priority High-Priority Broadcasts" }
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-4 text-sm font-bold">
                <div className="bg-primary/5 p-2 rounded-lg text-primary shrink-0">
                  <feature.icon className="h-4 w-4" />
                </div>
                <span>{feature.text}</span>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading Tiers...</p>
              </div>
            ) : offering?.availablePackages.map((pkg) => (
              <Button 
                key={pkg.identifier}
                className="w-full h-16 rounded-2xl flex flex-col items-center justify-center shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform"
                onClick={() => handlePurchase(pkg)}
                disabled={isPurchasing}
              >
                {isPurchasing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <span className="text-lg font-black">{(pkg as any).product?.title || pkg.identifier}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                      {(pkg as any).product?.priceString || 'Subscribe'} / {pkg.packageType.toLowerCase()}
                    </span>
                  </>
                )}
              </Button>
            ))}
            
            <p className="text-[10px] text-center text-muted-foreground font-medium max-w-[280px] mx-auto leading-relaxed italic">
              Payments are processed securely via RevenueCat. Manage your subscription anytime in Settings.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
