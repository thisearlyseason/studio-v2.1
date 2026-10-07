export const DISPLAY_PRICE_MAX_AGE_MS = 5 * 60_000;
export type DisplayPrice = { id: string; amount: number; currency: string; formatted: string; interval: 'month' | 'year'; fetchedAt: number };
export function isFreshDisplayPrice(value: DisplayPrice | undefined, now = Date.now()) {
  return Boolean(value && typeof value.id === 'string' && typeof value.formatted === 'string' && Number.isFinite(value.fetchedAt) && Number.isFinite(value.amount) && value.amount >= 0 && /^[A-Z]{3}$/.test(value.currency) && value.formatted.trim() && value.fetchedAt <= now && now - value.fetchedAt < DISPLAY_PRICE_MAX_AGE_MS);
}
export function displayPriceFromStripe(price: { id: string; active: boolean; currency: string; unit_amount: number | null; recurring?: { interval: string; interval_count: number } | null; currency_options?: Record<string, { unit_amount: number | null }> }, now = Date.now(), checkoutCurrency?: string): DisplayPrice | null {
  if(checkoutCurrency && checkoutCurrency!==price.currency && price.currency_options?.[checkoutCurrency]) price={...price,currency:checkoutCurrency,unit_amount:price.currency_options[checkoutCurrency].unit_amount};
  if (!price.active || !Number.isSafeInteger(price.unit_amount) || price.unit_amount === null || price.unit_amount < 0 || !/^[a-z]{3}$/.test(price.currency) || !price.recurring || !['month', 'year'].includes(price.recurring.interval) || price.recurring.interval_count !== 1) return null;
  const currency = price.currency.toUpperCase();
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits!;
  const amount = price.unit_amount / 10 ** digits;
  return { id: price.id, amount, currency, formatted: new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount), interval: price.recurring.interval as 'month' | 'year', fetchedAt: now };
}
export type StoreDisplayQuote = { productId: string; price: string; currencyCode: string; priceAmount: string; period: string };
export function validStoreDisplayQuote(value: Partial<StoreDisplayQuote>): value is StoreDisplayQuote {
  return typeof value.productId === 'string' && Boolean(value.productId) && typeof value.price === 'string' && Boolean(value.price.trim()) && typeof value.currencyCode === 'string' && /^[A-Z]{3}$/.test(value.currencyCode) && typeof value.priceAmount === 'string' && /^\d+(\.\d+)?$/.test(value.priceAmount) && Number(value.priceAmount) > 0 && ['P1M', 'P1Y'].includes(value.period || '');
}
export function sameStoreDisplayQuote(a: StoreDisplayQuote, b: StoreDisplayQuote) {
  return ['productId', 'price', 'currencyCode', 'priceAmount', 'period'].every(key => a[key as keyof StoreDisplayQuote] === b[key as keyof StoreDisplayQuote]);
}
