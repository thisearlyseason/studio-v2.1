'use client';

import React, { useEffect, useRef, useState } from 'react';
import { signInWithCustomToken, signOut, setPersistence, inMemoryPersistence, browserLocalPersistence } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { clearBrowserSession, establishBrowserSession } from '@/lib/client-auth';
import { safeReturnPath } from '@/lib/app-distribution';
import { createNativeAuthClient, type NativeAuthState } from '@/lib/native-auth/client';
import { nativeBrowserAuthGate } from '@/lib/native-auth/browser-gate';
import { nativeBrowserTransport } from '@/lib/native-auth/transport';
import type { Provider } from '@/lib/native-auth/protocol';
import { NativeFreeOnboarding } from './NativeFreeOnboarding';

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function NativeProviderLogin({ disabled, onVerified }: { disabled: boolean; onVerified(): void }) {
  const auth = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [state, setState] = useState<NativeAuthState>({ phase: 'idle' });
  const [joinCode, setJoinCode] = useState('');
  const client = useRef<ReturnType<typeof createNativeAuthClient> | null>(null);
  const verified = useRef(onVerified); verified.current = onVerified;
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    const transport = nativeBrowserTransport(window as Parameters<typeof nativeBrowserTransport>[0]);
    if (!transport || !crypto?.subtle) return;
    setProviders(transport.providers);
    // Child effects run before the login page stores its returnTo parameter.
    const search = new URLSearchParams(window.location.search);
    const returnPath = safeReturnPath(search.get('returnTo') || sessionStorage.getItem('squad_return_path'), 'store');
    const route = new URL(returnPath, window.location.origin);
    const pendingCode = search.get('code') || (route.pathname === '/teams/join' ? route.searchParams.get('code') : '');
    setJoinCode((pendingCode || '').slice(0, 128));
    const instance = createNativeAuthClient({
      transport, fetcher: (...args) => fetch(...args),
      auth: {
        signIn: async token => {
          // A reload during a partial handoff must not restore an identity
          // that has not yet passed the browser and server UID checks.
          await setPersistence(auth, inMemoryPersistence);
          return (await signInWithCustomToken(auth, token)).user;
        },
        persist: () => setPersistence(auth, browserLocalPersistence),
        signOut: async () => { await signOut(auth); await setPersistence(auth, browserLocalPersistence); },
      },
      session: {
        establish: async () => { if (!auth.currentUser) throw new Error('No identity'); await establishBrowserSession(auth.currentUser); },
        readUid: async () => {
          const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error('No session');
          const data = await response.json();
          if (data.authenticated !== true || typeof data.uid !== 'string') throw new Error('No identity');
          return data.uid;
        },
        clear: async () => {
          await clearBrowserSession();
          // The existing web cleanup is best-effort. A native account switch
          // must additionally prove the server cookie is no longer usable.
          const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
          if (response.status !== 401) throw new Error('Session cleanup incomplete');
        },
      },
      random: { secret: () => base64url(crypto.getRandomValues(new Uint8Array(32))), requestId: () => crypto.randomUUID(), hash: async raw => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))) },
      onState: next => {
        if (next.phase === 'verified') {
          if (next.returnPath) sessionStorage.setItem('squad_return_path', safeReturnPath(next.returnPath, 'store'));
          verified.current();
        }
        if (['idle', 'verified', 'failed'].includes(next.phase) && !next.locked) { release.current?.(); release.current = null; }
        setState(next);
      },
    });
    client.current = instance;
    return () => {
      client.current = null;
      const lease = release.current; release.current = null;
      void instance.dispose().then(clean => { if (clean) lease?.(); });
      transport.dispose();
    };
  }, [auth]);
  const begin = (provider: Provider) => {
    if (disabled || !client.current) return;
    const lease = nativeBrowserAuthGate.acquire();
    if (!lease) return;
    release.current = lease;
    void client.current.begin(provider).catch(() => { lease(); release.current = null; setState({ phase: 'failed' }); });
  };
  const busy = state.phase === 'working' || state.phase === 'onboarding' || state.locked;
  if (!providers.length) return <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Provider sign-in is unavailable in this app version. Please use email and password below.</p>;
  return <div className="space-y-3" aria-label="App sign-in">
    {providers.map(provider => <Button key={provider} type="button" variant="outline" disabled={disabled || !!busy || nativeBrowserAuthGate.busy()} onClick={() => begin(provider)} className="min-h-12 w-full rounded-xl">Continue with {provider === 'apple.com' ? 'Apple' : 'Google'}</Button>)}
    {state.phase === 'working' && <p role="status" className="text-sm">Complete sign-in in the account window. We’ll verify your session before opening The Squad.</p>}
    {state.phase === 'onboarding' && <NativeFreeOnboarding initialJoinCode={joinCode} onSubmit={value => { void client.current?.submitOnboarding(value); }} />}
    {state.phase === 'failed' && <p role="alert" className="text-sm font-semibold text-destructive">{state.locked ? 'Sign-in cleanup could not be confirmed. Close and reopen the app before trying again.' : 'Sign-in could not be completed. Try again or use another sign-in method for your account.'}</p>}
    {busy && !state.locked && <Button type="button" variant="ghost" onClick={() => { void client.current?.cancel(); }} className="min-h-11 w-full">Cancel sign-in</Button>}
  </div>;
}
