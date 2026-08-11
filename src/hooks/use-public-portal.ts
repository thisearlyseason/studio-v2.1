'use client';

import { useCallback, useEffect, useState } from 'react';

interface PublicPortalOptions {
  authorizationToken?: string | null;
}

export function usePublicPortal<T>(url: string | null, options: PublicPortalOptions = {}) {
  const authorizationToken = options.authorizationToken || null;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setStatus(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setIsLoading(true);
    setError(null);
    setStatus(null);

    fetch(url, {
      signal: controller.signal,
      headers: authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : undefined,
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) {
          const portalError = new Error(body.error || 'Portal could not be loaded.') as Error & { status?: number };
          portalError.status = response.status;
          throw portalError;
        }
        return body;
      })
      .then(body => setData(body.data))
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') {
          setData(null);
          setError(fetchError.message);
          setStatus(typeof fetchError.status === 'number' ? fetchError.status : null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [authorizationToken, url, retryKey]);

  const retry = useCallback(() => setRetryKey(value => value + 1), []);

  return { data, isLoading, error, status, retry };
}
