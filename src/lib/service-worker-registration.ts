type RegistrationWithActiveWorker = {
  active: unknown | null;
};

export async function waitForActiveServiceWorker<T extends RegistrationWithActiveWorker>(
  registration: T,
  ready: Promise<T>
): Promise<T> {
  return registration.active ? registration : ready;
}
