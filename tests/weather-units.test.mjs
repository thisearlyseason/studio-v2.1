import assert from 'node:assert/strict';
import test from 'node:test';
import { weatherReadings, weatherUnits } from '../src/lib/weather-units.ts';

test('venue country takes precedence and wind and temperature follow regional conventions independently', () => {
  for (const [country, locale, temp, wind] of [
    ['Canada', 'en-US', '20°C', '16 km/h'], ['United States of America', 'en-CA', '68°F', '10 mph'],
    ['United Kingdom', 'en-US', '20°C', '10 mph'], [undefined, 'fr-CA', '20°C', '16 km/h'],
  ]) {
    const reading = weatherReadings(20, 16, 2, weatherUnits(country, locale));
    assert.equal(reading.temp, temp);
    assert.equal(reading.wind, wind);
  }
});
