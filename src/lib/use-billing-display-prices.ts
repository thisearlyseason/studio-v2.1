'use client';
import { useEffect, useState } from 'react';
import { isFreshDisplayPrice, type DisplayPrice, DISPLAY_PRICE_MAX_AGE_MS } from './billing-display-price';
export function useBillingDisplayPrices(enabled = true) {
  const [prices, setPrices] = useState<DisplayPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if(!enabled){setPrices([]);setLoading(false);return;}
    const controller = new AbortController();
    let expire: ReturnType<typeof setTimeout> | undefined;
    setPrices([]); setLoading(true);
    void fetch('/api/billing/display-catalog', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (!Array.isArray(data.prices)) throw new Error('Invalid catalog');
      if(controller.signal.aborted) return;
      const fresh: DisplayPrice[] = data.prices.filter((price: DisplayPrice) => isFreshDisplayPrice(price));
      setPrices(fresh);
      if(fresh.length) expire=setTimeout(()=>setPrices([]),Math.max(0,Math.min(...fresh.map(price=>price.fetchedAt+DISPLAY_PRICE_MAX_AGE_MS-Date.now()))));
    }).catch(() => { if (!controller.signal.aborted) setPrices([]); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const refresh = () => { if (document.visibilityState === 'visible') setGeneration(value => value + 1); };
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearTimeout(expire); document.removeEventListener('visibilitychange', refresh); };
  }, [generation, enabled]);
  const quote = (id: string) => prices.find(price => price.id === id && isFreshDisplayPrice(price));
  return { quote, loading, label: (id: string) => quote(id)?.formatted || (loading ? 'Loading price…' : 'Price unavailable'), refresh: () => setGeneration(value => value + 1) };
}
