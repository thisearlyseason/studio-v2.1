
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * REDIRECT HUB
 * To resolve Next.js parallel route conflict, administrative management 
 * is handled at /manage-tournaments. This route acts as a fallback redirect.
 */
export default function TournamentRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/manage-tournaments');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-32 text-center gap-6 animate-pulse">
      <div className="bg-primary/10 p-8 rounded-[3rem] shadow-xl">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
      <p className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground">
        Accessing Coordination Suite...
      </p>
    </div>
  );
}
