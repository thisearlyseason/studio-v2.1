'use client';
import { useEffect, useState } from 'react';
import { billingUiMode, type BillingUiMode } from '@/lib/native-billing/capabilities';
import { LegacyNativeSubscriptions } from './LegacyNativeSubscriptions';
import { QuoteNativeSubscriptions } from './QuoteNativeSubscriptions';
export function NativeSubscriptions() {
  const [mode, setMode] = useState<BillingUiMode | null>(null);
  useEffect(() => { setMode(billingUiMode(window)); }, []);
  if (mode === null) return <p role="status">Loading store subscriptions…</p>;
  if (mode === 'legacy') return <LegacyNativeSubscriptions />;
  if (mode === 'quote') return <QuoteNativeSubscriptions />;
  return <p role="status">This app’s store interface is unsupported. Update the app before subscribing.</p>;
}
