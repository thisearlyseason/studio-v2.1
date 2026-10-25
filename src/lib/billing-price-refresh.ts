import { DISPLAY_PRICE_MAX_AGE_MS, isFreshDisplayPrice, type DisplayPrice } from './billing-display-price';

export type PriceRefreshState = { prices: DisplayPrice[]; loading: boolean };

/** GET-only scheduling; display and checkout still require a fresh server quote. */
export function createBillingPriceRefresh(deps: {
  load(signal: AbortSignal): Promise<unknown>;
  changed(state: PriceRefreshState): void;
  available(): boolean;
  now?: () => number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}) {
  const now = deps.now ?? Date.now, schedule = deps.schedule ?? setTimeout, cancel = deps.cancel ?? clearTimeout;
  let prices: DisplayPrice[] = [], stopped = false, loading = false;
  let retry = 1000, nextAllowed = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  type ActiveRequest = { controller: AbortController; timeout?: ReturnType<typeof setTimeout> };
  let request: ActiveRequest | undefined;
  const publish = () => { if (!stopped) deps.changed({ prices: [...prices], loading }); };
  function prune() { prices = prices.filter(p => isFreshDisplayPrice(p, now())); }
  function armExpiry() {
    if (expiryTimer !== undefined) cancel(expiryTimer);
    expiryTimer = undefined;
    if (!prices.length || stopped) return;
    const remaining = Math.min(...prices.map(p => p.fetchedAt + DISPLAY_PRICE_MAX_AGE_MS - now()));
    expiryTimer = schedule(() => { expiryTimer = undefined; prune(); publish(); armExpiry(); }, Math.max(1, remaining));
  }
  function armRefresh(delay: number) {
    if (refreshTimer !== undefined) cancel(refreshTimer);
    refreshTimer = undefined;
    if (stopped || !deps.available()) return;
    refreshTimer = schedule(() => { refreshTimer = undefined; refresh(); }, Math.max(1, delay));
  }
  function refresh() {
    if (stopped) return;
    prune(); armExpiry();
    if (!deps.available()) { publish(); return; }
    if (request) return;
    if (now() < nextAllowed) { armRefresh(nextAllowed - now()); return; }
    if (refreshTimer !== undefined) cancel(refreshTimer);
    refreshTimer = undefined;
    nextAllowed = now() + 1000;
    const current: ActiveRequest = { controller: new AbortController() };
    request = current; loading = true; publish();
    const timeout = new Promise<never>((_, reject) => {
      current.timeout = schedule(() => { current.controller.abort(); reject(new Error('Price request timed out')); }, 15000);
    });
    void Promise.race([Promise.resolve().then(() => deps.load(current.controller.signal)), timeout]).then(data => {
      if (stopped || request !== current) return;
      const list = (data as { prices?: unknown } | null)?.prices;
      // A successful empty/invalid catalog invalidates old quotes immediately.
      prices = Array.isArray(list) ? list.filter((p): p is DisplayPrice => isFreshDisplayPrice(p, now())) : [];
      prune();
      if (!prices.length) throw new Error('Fresh prices unavailable');
      retry = 1000;
      const remaining = Math.min(...prices.map(p => p.fetchedAt + DISPLAY_PRICE_MAX_AGE_MS - now()));
      armRefresh(remaining > 30000 ? remaining - 30000 : Math.max(1000, remaining));
    }).catch(() => {
      if (stopped || request !== current) return;
      prune(); armRefresh(retry); retry = Math.min(retry * 2, 60000);
    }).finally(() => {
      if (current.timeout !== undefined) cancel(current.timeout);
      if (stopped || request !== current) return;
      request = undefined; loading = false; prune(); armExpiry(); publish();
    });
  }
  return {
    refresh,
    stop() {
      stopped = true;
      if (refreshTimer !== undefined) cancel(refreshTimer);
      if (expiryTimer !== undefined) cancel(expiryTimer);
      if (request?.timeout !== undefined) cancel(request.timeout);
      request?.controller.abort(); request = undefined;
    },
  };
}
