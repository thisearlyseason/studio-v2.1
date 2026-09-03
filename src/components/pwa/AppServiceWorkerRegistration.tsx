'use client';

import { useEffect } from 'react';
import { registerPrimaryServiceWorker } from '@/lib/service-worker-registration';

export function AppServiceWorkerRegistration() {
  useEffect(() => {
    void registerPrimaryServiceWorker().catch(() => {
      console.warn('[Service Worker] Registration failed.');
    });
  }, []);

  return null;
}
