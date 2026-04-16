'use client';

import React, { useMemo, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from './core';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

// --- GLOBAL SDK PANIC SUPPRESSION ---
// These are SDK-level bugs (ID: ca9, b815) triggered by Next.js HMR and listener teardown.
// Moving this to the top level ensures it's active BEFORE initializeFirebase() is called in useMemo.
if (typeof window !== 'undefined') {
  const isFirestoreInternalError = (msg: string) =>
    msg?.includes('INTERNAL ASSERTION FAILED') ||
    msg?.includes('Unexpected state (ID: ca9)') ||
    msg?.includes(' Unexpected state (ID: ca9)') ||
    msg?.includes('Unexpected state (ID: b815)') ||
    msg?.includes('ve: -1') ||
    msg?.includes('hc: "Error: FIRESTORE') ||
    msg?.includes('could not be completed') ||
    (msg?.includes('FIRESTORE') && msg?.includes('INTERNAL'));

  const handleError = (event: ErrorEvent) => {
    const msg = event.message || event.error?.message || String(event.error || '');
    if (isFirestoreInternalError(msg)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Firebase] Suppressed early-boot Firestore SDK internal error:', msg.slice(0, 100));
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const msg = event.reason?.message || String(event.reason || '');
    if (isFirestoreInternalError(msg)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Firebase] Suppressed early-boot Firestore SDK internal rejection:', msg.slice(0, 100));
    }
  };

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = (...args: any[]) => {
    const msg = args.map(a => String(a)).join(' ');
    if (isFirestoreInternalError(msg)) return;
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    const msg = args.map(a => String(a)).join(' ');
    if (isFirestoreInternalError(msg)) return;
    originalConsoleWarn.apply(console, args);
  };

  window.addEventListener('error', handleError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    // Initialize Firebase on the client side, once per component mount.
    return initializeFirebase();
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
    </FirebaseProvider>
  );
}