
'use client';

import React, { useMemo, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    return initializeFirebase();
  }, []);

  // Section 5: Abuse Protection - Initialize App Check
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_APP_CHECK_KEY) {
      try {
        initializeAppCheck(firebaseServices.firebaseApp, {
          provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_APP_CHECK_KEY),
          isTokenAutoRefreshEnabled: true
        });
      } catch (e) {
        console.warn("App Check initialization skipped or failed", e);
      }
    }
  }, [firebaseServices.firebaseApp]);

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
