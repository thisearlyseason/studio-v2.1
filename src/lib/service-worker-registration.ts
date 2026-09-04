type RegistrationWithActiveWorker = {
  active: unknown | null;
};

export async function waitForActiveServiceWorker<T extends RegistrationWithActiveWorker>(
  registration: T,
  ready: Promise<T>
): Promise<T> {
  return registration.active ? registration : ready;
}

export async function registerPrimaryServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  return waitForActiveServiceWorker(registration, navigator.serviceWorker.ready);
}
