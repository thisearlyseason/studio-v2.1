
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PlaceHolderImages } from '@/lib/placeholder-images';

interface BrandLogoProps {
  variant: 'dark-background' | 'light-background';
  className?: string;
  priority?: boolean;
}

/**
 * Centralized BrandLogo component for The Squad.
 * - 'dark-background' variant renders the white logo (optimized for dark surfaces).
 * - 'light-background' variant renders the black logo (optimized for light surfaces).
 */
export function BrandLogo({ variant, className, priority }: BrandLogoProps) {
  const isDarkBg = variant === 'dark-background';
  
  // Retrieve logo data from central placeholder repository
  const logoId = isDarkBg ? 'brand-logo-light' : 'brand-logo-dark';
  const logoData = PlaceHolderImages.find(img => img.id === logoId);

  if (!logoData) {
    return <span className="font-black text-xl tracking-tighter">THE SQUAD.</span>;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={logoData.imageUrl}
        alt="THE SQUAD."
        fill
        className="object-contain"
        data-ai-hint={logoData.imageHint}
        priority={priority}
      />
    </div>
  );
}
