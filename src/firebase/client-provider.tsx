'use client';

import React, { useMemo, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from './core';
import { Activity } from 'lucide-react';

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
    (msg?.includes('FIRESTORE') && msg?.includes('INTERNAL')) ||
    msg?.includes('auth/network-request-failed') ||
    msg?.includes('network-request-failed');

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
    try {
      // Initialize Firebase on the client side, once per component mount.
      return initializeFirebase();
    } catch (e) {
      console.error('[Firebase] SDK Initialization Critical Failure:', e);
      return {
        firebaseApp: null,
        auth: null,
        firestore: null,
        storage: null
      };
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  if (!firebaseServices.firebaseApp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <div className="h-16 w-16 bg-primary/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
          <Activity className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight mb-2">Tactical Link Failure</h1>
        <p className="text-sm font-bold text-white/40 uppercase tracking-widest max-w-xs">
          Unable to establish secure connection to Squad HQ. 
          Please check your network or refresh the protocol.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 h-12 px-10 rounded-xl bg-primary text-white font-black uppercase text-xs tracking-widest shadow-xl"
        >
          Retry Protocol
        </button>
      </div>
    );
  }

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp as any}
      auth={firebaseServices.auth as any}
      firestore={firebaseServices.firestore as any}
      storage={firebaseServices.storage as any}
    >
      {children}
    </FirebaseProvider>
  );
}