"use client";

import React, { useEffect, useState } from 'react';
import { Download, MoreVertical, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  pwaInstallPromptBroker,
  requestPwaInstall,
  type PwaInstallPrompt,
} from '@/lib/pwa-install-prompt';
import { cn } from '@/lib/utils';

type LandingPwaInstallButtonProps = {
  placement: 'navigation' | 'menu';
  isScrolled?: boolean;
};

type ManualPlatform = 'ios' | 'android' | 'desktop' | null;

function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectPlatform(): Exclude<ManualPlatform, null> {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(userAgent) || isIPadOS) return 'ios';
  if (/android/.test(userAgent)) return 'android';
  return 'desktop';
}

export function LandingPwaInstallButton({ placement, isScrolled = false }: LandingPwaInstallButtonProps) {
  const [prompt, setPrompt] = useState<PwaInstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [manualPlatform, setManualPlatform] = useState<ManualPlatform>(null);

  useEffect(() => {
    setIsStandalone(isStandaloneApp());
    const unsubscribe = pwaInstallPromptBroker.subscribe(setPrompt);
    const capturePrompt = (event: Event) => {
      pwaInstallPromptBroker.capture(event as PwaInstallPrompt);
    };
    const markInstalled = () => {
      setIsStandalone(true);
      pwaInstallPromptBroker.consume();
    };

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
      unsubscribe();
    };
  }, []);

  if (isStandalone) return null;

  const handleInstall = async () => {
    const platform = detectPlatform();
    await requestPwaInstall({
      isIOS: platform === 'ios',
      prompt,
      showIOSInstructions: () => setManualPlatform('ios'),
      showGeneralInstructions: () => setManualPlatform(platform),
      consumePrompt: () => pwaInstallPromptBroker.consume(),
    });
  };

  const menuPlacement = placement === 'menu';
  const instruction = manualPlatform === 'ios'
    ? <><Share className="inline h-4 w-4 text-primary" /> In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>
    : manualPlatform === 'android'
      ? <><MoreVertical className="inline h-4 w-4 text-primary" /> Open Chrome&apos;s menu, then choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>
      : <>Use the install icon in your Chrome or Edge address bar. On Safari for Mac, choose <strong>File → Add to Dock</strong>.</>;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleInstall}
        aria-label="Install The Squad app"
        className={cn(
          'font-black uppercase tracking-widest transition-all',
          menuPlacement
            ? 'h-14 w-full rounded-2xl border-2 text-xs'
            : isScrolled
              ? 'h-10 rounded-full border-primary/30 bg-primary/5 px-4 text-[10px] text-foreground hover:bg-primary/10 hover:text-primary'
              : 'h-10 rounded-full border-white/30 bg-white/10 px-4 text-[10px] text-white hover:bg-white/20 hover:text-white',
        )}
      >
        <Download className="mr-2 h-4 w-4" /> Install The Squad
      </Button>

      <Dialog open={manualPlatform !== null} onOpenChange={(open) => !open && setManualPlatform(null)}>
        <DialogContent className="max-w-sm overflow-hidden rounded-[2rem] border-none p-0 shadow-2xl">
          <div className="h-2 w-full bg-primary" />
          <div className="space-y-5 p-7">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight">
                <Download className="h-6 w-6 text-primary" /> Install The Squad
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm font-medium leading-relaxed text-foreground/75">
                Add The Squad to your device for fast, standalone access.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl bg-muted/50 p-4 text-sm font-medium leading-relaxed text-foreground/80">
              {instruction}
            </div>
            <Button onClick={() => setManualPlatform(null)} className="h-11 w-full rounded-xl font-black uppercase tracking-widest">
              Got It
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
