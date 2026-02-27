
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
  // 'brand-logo-light' is the white version for dark backgrounds
  // 'brand-logo-dark' is the black version for light backgrounds
  const logoId = isDarkBg ? 'brand-logo-light' : 'brand-logo-dark';
  const logoData = PlaceHolderImages.find(img => img.id === logoId);

  if (!logoData) {
    return <span className={cn("font-black text-xl tracking-tighter uppercase", className)}>THE SQUAD.</span>;
  }

  return (
    <div className={cn("relative", className)}>
      <Image
        src={logoData.imageUrl}
        alt="THE SQUAD."
        width={400}
        height={120}
        className="object-contain w-full h-full"
        data-ai-hint={logoData.imageHint}
        priority={priority}
      />
    </div>
  );
}
