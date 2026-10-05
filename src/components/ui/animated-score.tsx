import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function AnimatedScore({ value, className }: { value: number | string | null | undefined, className?: string }) {
  const [pulse, setPulse] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  useEffect(() => {
    if (value !== lastValue) {
      setPulse(true);
      setLastValue(value);
      const timer = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [value, lastValue]);

  return (
    <span
      className={cn(
        "transition-all duration-300",
        pulse ? "text-primary scale-125 animate-pulse" : "",
        className
      )}
    >
      {value ?? '-'}
    </span>
  );
}
