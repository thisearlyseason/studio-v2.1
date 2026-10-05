"use client";
import { BILLING_COUNTRY_CODES } from '@/lib/checkout-billing-country';
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = BILLING_COUNTRY_CODES.map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, 'en'));

export function BillingCountryDeclaration({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-2 rounded-xl border bg-background p-4 text-sm">
      <span>Billing country</span>
      <select autoFocus aria-label="Billing country" className="w-full rounded-md border bg-background p-2 text-foreground"
        value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Choose your billing country</option>
        {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
      </select>
      <span className="block text-xs text-muted-foreground">Choose the country of your billing address, then select your plan again. Use the same country in Checkout and enter the billing address details requested there.</span>
    </label>
  );
}
