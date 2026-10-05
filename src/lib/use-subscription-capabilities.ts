"use client";
import { useEffect, useState } from 'react';
import type { Auth } from 'firebase/auth';
import { getAuthToken, authHeader } from '@/lib/client-auth';

export function useSubscriptionCapabilities(auth: Auth, uid?: string, subscriptionId?: string | null) {
  const identity = `${uid || ''}:${subscriptionId || ''}`;
  const [state, setState] = useState<{ identity: string; paymentMethodUpdateAllowed: boolean; portalAllowed: boolean; planChangesAllowed: boolean; addonsAllowed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (uid) void (async () => {
      try {
        const token = await getAuthToken(auth);
        if (!token) throw new Error('Authentication required');
        const response = await fetch('/api/subscription/capabilities', { headers: authHeader(token), cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Capabilities unavailable');
        const data = await response.json();
        if (active) setState({ identity, paymentMethodUpdateAllowed: data.paymentMethodUpdateAllowed === true, portalAllowed: data.portalAllowed === true, planChangesAllowed: data.planChangesAllowed === true, addonsAllowed: data.addonsAllowed === true });
      } catch { if (active) setState({ identity, paymentMethodUpdateAllowed: false, portalAllowed: false, planChangesAllowed: false, addonsAllowed: false }); }
    })();
    return () => { active = false; controller.abort(); };
  }, [auth, uid, identity]);
  return state?.identity === identity ? state : { paymentMethodUpdateAllowed: false, portalAllowed: false, planChangesAllowed: false, addonsAllowed: false };
}
