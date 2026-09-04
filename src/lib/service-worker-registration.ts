import type { FirebaseOptions } from 'firebase/app';

type RegistrationWithActiveWorker = {
  active: unknown | null;
};

type ConfiguredWorker = {
  scriptURL: string;
  state: string;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
};

type RegistrationWithConfiguredWorkers = {
  active: ConfiguredWorker | null;
  installing: ConfiguredWorker | null;
  waiting: ConfiguredWorker | null;
};

export async function waitForActiveServiceWorker<T extends RegistrationWithActiveWorker>(
  registration: T,
  ready: Promise<T>
): Promise<T> {
  return registration.active ? registration : ready;
}

export async function waitForConfiguredServiceWorker<T extends RegistrationWithConfiguredWorkers>(
  registration: T,
  expectedScriptUrl: string
): Promise<T> {
  if (registration.active?.scriptURL === expectedScriptUrl) return registration;

  const configuredWorker = [registration.waiting, registration.installing]
    .find(worker => worker?.scriptURL === expectedScriptUrl);
  if (!configuredWorker) {
    throw new Error('The configured notification service worker did not start installing.');
  }
  if (configuredWorker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const handleStateChange = () => {
        if (configuredWorker.state !== 'activated' && configuredWorker.state !== 'redundant') return;
        configuredWorker.removeEventListener('statechange', handleStateChange);
        if (configuredWorker.state === 'activated') resolve();
        else reject(new Error('The configured notification service worker became redundant.'));
      };
      configuredWorker.addEventListener('statechange', handleStateChange);
      handleStateChange();
    });
  }

  if (registration.active?.scriptURL !== expectedScriptUrl) {
    throw new Error('The configured notification service worker did not activate.');
  }
  return registration;
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
  const configuredRegistration = await navigator.serviceWorker.register(workerUrl, {
    scope: '/',
    updateViaCache: 'none',
  });
  const expectedScriptUrl = new URL(workerUrl, window.location.origin).href;
  return waitForConfiguredServiceWorker(configuredRegistration, expectedScriptUrl);
}
