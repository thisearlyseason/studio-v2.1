// Document-memory only. A replacement login component must wait for the old
// component's unabortable Firebase operation and cleanup, not start a new user.
export function createBrowserAuthGate() {
  let owner: symbol | null = null;
  const listeners = new Set<() => void>();
  return {
    busy: () => owner !== null,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acquire(): (() => void) | null {
      if (owner) return null;
      const lease = Symbol(); owner = lease;
      listeners.forEach(listener => listener());
      return () => {
        if (owner !== lease) return;
        owner = null; listeners.forEach(listener => listener());
      };
    },
  };
}
export const nativeBrowserAuthGate = createBrowserAuthGate();
