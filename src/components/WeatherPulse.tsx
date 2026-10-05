"use client";

import React, { useState, useEffect } from 'react';
import { MapPin, Sun, Wind, Cloud, Thermometer, CloudRain, Snowflake, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type WeatherStatus = 'live' | 'simulated' | 'demo' | 'unavailable' | 'loading';

export function WeatherPulse({ location, isDemo }: { location?: string; isDemo?: boolean }) {
  const [weather, setWeather] = useState<{ temp: string; wind: string; precip: string; desc: string } | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('loading');

  useEffect(() => {
    if (!location || location === 'TBD') {
      setWeather({ temp: '—', wind: '—', precip: '—', desc: 'No location set' });
      setStatus('unavailable');
      return;
    }

    // Known un-geocodable generic demo venue names
    const genericVenues = ['Simulated Venue', 'Field 7', 'Court A', 'Court B', 'Main Arena', 'Home Stadium', 'City Arena'];
    if (isDemo && genericVenues.some(v => location.toLowerCase().includes(v.toLowerCase()))) {
      setWeather({ temp: '74°F', wind: '7 MPH', precip: '0%', desc: 'Partly Cloudy' });
      setStatus('demo');
      return;
    }

    setStatus('loading');
    const controller = new AbortController();

    fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('wttr error');
        return res.json();
      })
      .then(data => {
        if (!data?.current_condition?.[0]) throw new Error('no data');
        const current = data.current_condition[0];
        setWeather({
          temp: `${current.temp_F}°F`,
          wind: `${current.windspeedMiles} MPH`,
          precip: `${current.precipMM > 0 ? (current.precipMM / 25.4).toFixed(1) : '0.0'}"`,
          desc: current.weatherDesc[0].value,
        });
        setStatus('live');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // Fallback: still show something rather than nothing
        setWeather({ temp: '72°F', wind: '6 MPH', precip: '0%', desc: 'Data Unavailable' });
        setStatus(isDemo ? 'demo' : 'simulated');
      });

    return () => controller.abort();
  }, [location, isDemo]);

  if (!location) return null;

  const getWeatherIcon = () => {
    const desc = weather?.desc?.toLowerCase() || '';
    if (status === 'unavailable') return <WifiOff className="h-5 w-5 mx-auto text-muted-foreground/40 group-hover:scale-110 transition-transform" />;
    if (desc.includes('sun') || desc.includes('clear') || desc.includes('fair')) return <Sun className="h-5 w-5 mx-auto text-amber-500 group-hover:scale-110 transition-transform" />;
    if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower') || desc.includes('thunder')) return <CloudRain className="h-5 w-5 mx-auto text-blue-500 group-hover:scale-110 transition-transform" />;
    if (desc.includes('cloud') || desc.includes('overcast') || desc.includes('mist') || desc.includes('fog')) return <Cloud className="h-5 w-5 mx-auto text-slate-400 group-hover:scale-110 transition-transform" />;
    if (desc.includes('snow') || desc.includes('ice') || desc.includes('sleet')) return <Snowflake className="h-5 w-5 mx-auto text-cyan-300 group-hover:scale-110 transition-transform" />;
    return <Sun className="h-5 w-5 mx-auto text-amber-500 group-hover:scale-110 transition-transform" />;
  };

  const badgeConfig: Record<WeatherStatus, { label: string; className: string }> = {
    live:        { label: 'LIVE WEATHER',  className: 'bg-green-100/80 text-green-700' },
    loading:     { label: 'LOADING...',    className: 'animate-pulse bg-muted text-muted-foreground' },
    demo:        { label: 'DEMO LOCATION', className: 'bg-primary/10 text-primary' },
    simulated:   { label: 'SIMULATED',     className: 'bg-muted text-muted-foreground' },
    unavailable: { label: 'NO LOCATION',   className: 'bg-muted text-muted-foreground' },
  };

  const badge = badgeConfig[status];

  return (
    <div className="pt-6 border-t space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Thermometer className="h-5 w-5 text-orange-500" />
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Conditions Pulse</h3>
        </div>
        <Badge className={cn('border-none font-black text-[8px] h-5 px-3', badge.className)}>
          {badge.label}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          {getWeatherIcon()}
          <p className="text-[10px] font-black uppercase">{weather?.temp || '—'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase truncate">{weather?.desc || '...'}</p>
        </div>
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          <Wind className="h-5 w-5 mx-auto text-blue-400 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-black uppercase">{weather?.wind || '—'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase">Local Gusts</p>
        </div>
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          <Cloud className="h-5 w-5 mx-auto text-slate-400 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-black uppercase">{weather?.precip || '—'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase">Precip</p>
        </div>
      </div>

      <p className="text-[9px] font-medium text-muted-foreground italic leading-tight px-2 text-center flex items-center justify-center gap-2">
        <MapPin className="h-2 w-2 shrink-0" />
        {status === 'live'
          ? `Live conditions for ${location}`
          : status === 'demo'
          ? `Illustrative forecast — real weather loads for actual venue addresses`
          : status === 'unavailable'
          ? 'Add a venue address to this event to see real-time conditions'
          : `Weather data for ${location}`}
      </p>
    </div>
  );
}
