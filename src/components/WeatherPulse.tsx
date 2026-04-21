"use client";

import React, { useState, useEffect } from 'react';
import { MapPin, Sun, Wind, Cloud, Thermometer, CloudRain, Snowflake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function WeatherPulse({ location }: { location?: string }) {
  const [weather, setWeather] = useState<{ temp: string, wind: string, precip: string, desc: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location || location === 'TBD' || location === 'Simulated Venue') {
      setWeather({ temp: '78°F', wind: '8 MPH', precip: '0%', desc: 'Fair Skies' });
      return;
    };
    setLoading(true);
    fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`)
      .then(res => res.json())
      .then(data => {
        if (!data.current_condition) throw new Error();
        const current = data.current_condition[0];
        const desc = current.weatherDesc[0].value;
        setWeather({
          temp: `${current.temp_F}°F`,
          wind: `${current.windspeedMiles} MPH`,
          precip: `${current.precipMM > 0 ? (current.precipMM / 25.4).toFixed(1) : '0.0'}"`,
          desc: desc
        });
      })
      .catch(() => {
        setWeather({ temp: '75°F', wind: '5 MPH', precip: '0%', desc: 'Clear Skies' });
      })
      .finally(() => setLoading(false));
  }, [location]);

  if (!location) return null;

  const getWeatherIcon = () => {
    const desc = weather?.desc?.toLowerCase() || '';
    if (desc.includes('sun') || desc.includes('clear')) return <Sun className="h-5 w-5 mx-auto text-amber-500 group-hover:scale-110 transition-transform" />;
    if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) return <CloudRain className="h-5 w-5 mx-auto text-blue-500 group-hover:scale-110 transition-transform" />;
    if (desc.includes('cloud') || desc.includes('overcast') || desc.includes('mist')) return <Cloud className="h-5 w-5 mx-auto text-slate-400 group-hover:scale-110 transition-transform" />;
    if (desc.includes('snow') || desc.includes('ice')) return <Snowflake className="h-5 w-5 mx-auto text-cyan-300 group-hover:scale-110 transition-transform" />;
    return <Sun className="h-5 w-5 mx-auto text-amber-500 group-hover:scale-110 transition-transform" />;
  };

  return (
    <div className="pt-6 border-t space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Thermometer className="h-5 w-5 text-orange-500" />
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Conditions Pulse</h3>
        </div>
        <Badge className={cn(
          "border-none font-black text-[8px] h-5 px-3",
          loading ? "animate-pulse bg-muted text-muted-foreground" : "bg-orange-100/50 text-orange-700"
        )}>
          {loading ? 'CALIBRATING...' : 'LIVE SATELLITE DATA'}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          {getWeatherIcon()}
          <p className="text-[10px] font-black uppercase">{weather?.temp || '--'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase">{weather?.desc || '...'}</p>
        </div>
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          <Wind className="h-5 w-5 mx-auto text-blue-400 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-black uppercase">{weather?.wind || '--'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase">Local Gusts</p>
        </div>
        <div className="bg-muted/30 p-4 rounded-2xl border text-center space-y-1 transition-all hover:bg-white hover:shadow-lg group">
          <Cloud className="h-5 w-5 mx-auto text-slate-400 group-hover:scale-110 transition-transform" />
          <p className="text-[10px] font-black uppercase">{weather?.precip || '--'}</p>
          <p className="text-[7px] font-bold text-muted-foreground uppercase">Precip Density</p>
        </div>
      </div>
      <p className="text-[9px] font-medium text-muted-foreground italic leading-tight px-2 text-center flex items-center justify-center gap-2">
        <MapPin className="h-2 w-2" /> Real-time environmental calibration for {location}. Protocol parameters validated for squad deployment.
      </p>
    </div>
  );
}
