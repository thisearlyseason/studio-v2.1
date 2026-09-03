import type { FirebaseOptions } from 'firebase/app';

type RegistrationWithActiveWorker = {
  active: unknown | null;
};

export async function waitForActiveServiceWorker<T extends RegistrationWithActiveWorker>(
  registration: T,
  ready: Promise<T>
): Promise<T> {
  return registration.active ? registration : ready;
}

export function firebaseServiceWorkerUrl(options: FirebaseOptions): string {
  const config = {
    apiKey: options.apiKey,
    authDomain: options.authDomain,
    projectId: options.projectId,
    storageBucket: options.storageBucket,
    messagingSenderId: options.messagingSenderId,
    appId: options.appId,
  };
  return `/sw.js?firebaseConfig=${encodeURIComponent(JSON.stringify(config))}`;
}

export async function registerPrimaryServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  const workerUrl = firebaseServiceWorkerUrl((await import('firebase/app')).getApp().options);
  const installingRegistration = await navigator.serviceWorker.register(workerUrl, {
    scope: '/',
    updateViaCache: 'none',
  });
  return waitForActiveServiceWorker(installingRegistration, navigator.serviceWorker.ready);
}
