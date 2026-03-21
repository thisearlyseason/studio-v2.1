
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * REDIRECT HUB
 * Neutralizes the parallel route conflict with the root /tournaments path.
 * Management HQ is consolidated at /manage-tournaments.
 */
export default function RedirectToManage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/manage-tournaments');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse font-black uppercase tracking-widest text-muted-foreground text-xs">
        Redirecting to Command HQ...
      </div>
    </div>
  );
}
