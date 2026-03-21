
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ROOT REDIRECT
 * Satisfies Next.js parallel route requirements while preserving public sub-paths.
 */
export default function TournamentRootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/manage-tournaments');
  }, [router]);

  return null;
}
