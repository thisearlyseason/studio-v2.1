// Use the venue's country when the weather service identifies one. Otherwise
// respect an explicit region in the device locale.
export function weatherUnits(country: string | undefined, locale: string) {
  const name = (country || '').trim().toLowerCase();
  let region = '';
  try { region = new Intl.Locale(locale).region || ''; } catch {}
  const us = name ? /^(us|usa|united states(?: of america)?)$/.test(name) : region === 'US';
  const uk = name ? /^(gb|uk|united kingdom|england|scotland|wales|northern ireland)$/.test(name) : region === 'GB';
  return { fahrenheit: us, miles: us || uk };
}

export function weatherReadings(celsius: number, kph: number, mm: number, units: ReturnType<typeof weatherUnits>) {
  return {
    temp: Number.isFinite(celsius) ? Math.round(units.fahrenheit ? celsius * 9 / 5 + 32 : celsius) + (units.fahrenheit ? '°F' : '°C') : '—',
    wind: Number.isFinite(kph) ? Math.round(units.miles ? kph / 1.609344 : kph) + (units.miles ? ' mph' : ' km/h') : '—',
    precip: Number.isFinite(mm) ? (units.fahrenheit ? (mm / 25.4).toFixed(2) + ' in' : mm + ' mm') : '—',
  };
}
