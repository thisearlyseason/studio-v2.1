'use client';
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isFreshDisplayPrice, type DisplayPrice } from './billing-display-price';
import { createBillingPriceRefresh, type PriceRefreshState } from './billing-price-refresh';

const BillingPriceSeed = createContext<DisplayPrice[]>([]);
export function BillingDisplayPriceProvider({ prices, children }: { prices: DisplayPrice[]; children: ReactNode }) {
  return createElement(BillingPriceSeed.Provider, { value: prices }, children);
}

export function useBillingDisplayPrices(enabled = true) {
  const pathname = usePathname();
  const initialPrices = useContext(BillingPriceSeed);
  const [state, setState] = useState<PriceRefreshState>(() => ({ prices: enabled ? initialPrices.filter(price => isFreshDisplayPrice(price)) : [], loading: true }));
  const controller = useRef<ReturnType<typeof createBillingPriceRefresh> | null>(null);
  useEffect(() => {
    setState({ prices: enabled ? initialPrices.filter(price => isFreshDisplayPrice(price)) : [], loading: enabled });
    if (!enabled) return;
    const current = createBillingPriceRefresh({
      initialPrices,
      available: () => document.visibilityState === 'visible' && navigator.onLine !== false,
      changed: setState,
      load: async signal => {
        const response = await fetch('/api/billing/display-catalog', { cache: 'no-store', signal });
        if (!response.ok) throw new Error('Prices unavailable');
        return response.json();
      },
    });
    controller.current = current;
    const refresh = () => current.refresh();
    document.addEventListener('visibilitychange', refresh);
    for (const event of ['focus', 'online', 'pageshow', 'popstate']) window.addEventListener(event, refresh);
    current.refresh();
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      for (const event of ['focus', 'online', 'pageshow', 'popstate']) window.removeEventListener(event, refresh);
      current.stop();
      if (controller.current === current) controller.current = null;
    };
  }, [enabled, pathname, initialPrices]);
  const quote = (id: string) => enabled ? state.prices.find(price => price.id === id && isFreshDisplayPrice(price)) : undefined;
  return { quote, loading: state.loading, label: (id: string) => quote(id)?.formatted || (state.loading ? 'Loading price…' : 'Price unavailable'), refresh: () => controller.current?.refresh() };
}
