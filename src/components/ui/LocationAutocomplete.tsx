"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Enter venue address or name…',
  className,
  inputClassName,
  disabled,
  id,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback((query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`,
      {
        signal: abortRef.current.signal,
        headers: { 'Accept-Language': 'en' },
      }
    )
      .then(r => r.json())
      .then((results: NominatimResult[]) => {
        setSuggestions(results);
        setIsOpen(results.length > 0);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val); // keep parent in sync while typing
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 380);
  };

  const handleSelect = (result: NominatimResult) => {
    // Build a clean human-readable address
    const parts = result.display_name.split(',').slice(0, 4).join(',').trim();
    setInputValue(parts);
    onChange(parts);
    setSuggestions([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn('pl-9 pr-9', inputClassName)}
        />
        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 animate-spin pointer-events-none" />
        ) : inputValue ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 hover:text-foreground transition-colors"
            aria-label="Clear location"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-black/5 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden">
          <ul className="max-h-64 overflow-y-auto divide-y divide-black/[0.04]">
            {suggestions.map(result => {
              const [primary, ...rest] = result.display_name.split(',');
              const secondary = rest.slice(0, 3).join(',').trim();
              return (
                <li key={result.place_id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-primary/5 transition-colors group"
                    onClick={() => handleSelect(result)}
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-black truncate text-foreground group-hover:text-primary transition-colors">{primary.trim()}</p>
                      {secondary && <p className="text-[10px] font-medium text-muted-foreground truncate mt-0.5">{secondary}</p>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2 border-t bg-muted/5 flex items-center gap-1.5">
            <svg viewBox="0 0 256 256" className="h-2.5 w-2.5 opacity-40" fill="currentColor"><path d="M237.66 90.34l-56-56a8 8 0 00-11.32 0l-96 96a8 8 0 000 11.32l56 56a8 8 0 0011.32 0l96-96a8 8 0 000-11.32zM176 212.69L67.31 104l84-84L240 128.69z"/></svg>
            <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Powered by OpenStreetMap · Nominatim</p>
          </div>
        </div>
      )}
    </div>
  );
}
