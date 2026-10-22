'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/firebase/provider';

/** A listener's result belongs to both its query reference and its account. */
export function useScopedSnapshotState<T>(target: unknown) {
  const { user } = useUser();
  const accountId = user?.uid || null;
  const scope = useMemo(() => ({ target, accountId }), [target, accountId]);
  const currentScope = useRef(scope);
  // Publish only committed scopes. A suspended/aborted render must not silence
  // callbacks for the account and target that are still on screen.
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const isCurrent = useCallback(() => currentScope.current === scope, [scope]);
  const [state, setState] = useState<{ scope: typeof scope; data: T | null; isLoading: boolean; error: Error | null }>({ scope, data: null, isLoading: !!target, error: null });
  const update = useCallback((patch: Partial<Pick<typeof state, 'data' | 'isLoading' | 'error'>>) => {
    // An unsubscribed listener can still have a callback queued. Never let it
    // replace a newer account/target result or its loading/error state.
    if (currentScope.current !== scope) return;
    setState(previous => {
      if (currentScope.current !== scope) return previous;
      return { ...(previous.scope === scope ? previous : { scope, data: null, isLoading: !!target, error: null }), ...patch };
    });
  }, [scope, target]);
  const setData = useCallback((data: T | null) => update({ data }), [update]);
  const setIsLoading = useCallback((isLoading: boolean) => update({ isLoading }), [update]);
  const setError = useCallback((error: Error | null) => update({ error }), [update]);
  // Hide the old result on the first render, before effect cleanup/setup runs.
  return { data: state.scope === scope ? state.data : null, isLoading: state.scope === scope ? state.isLoading : !!target, error: state.scope === scope ? state.error : null, accountId, isCurrent, setData, setIsLoading, setError };
}
