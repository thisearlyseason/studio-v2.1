import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function AnimatedScore({ value, className }: { value: number | string, className?: string }) {
  const [pulse, setPulse] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (value !== displayValue) {
      setPulse(true);
      setDisplayValue(value);
      const timer = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  return (
    <span
      className={cn(
        "transition-all duration-300",
        pulse ? "text-primary scale-125 animate-pulse" : "",
        className
      )}
    >
      {displayValue}
    </span>
  );
}
