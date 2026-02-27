import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PlaceHolderImages } from '@/lib/placeholder-images';

interface BrandLogoProps {
  variant: 'dark-background' | 'light-background';
  className?: string;
  priority?: boolean;
}

/**
 * Strictly image-based BrandLogo component.
 * - 'dark-background' uses the white logo asset (hint: "white logo").
 * - 'light-background' uses the black logo asset (hint: "black logo").
 * No text fallback is allowed per business requirements.
 */
export function BrandLogo({ variant, className, priority }: BrandLogoProps) {
  const isDarkBg = variant === 'dark-background';
  const logoId = isDarkBg ? 'brand-logo-light' : 'brand-logo-dark';
  const logoData = PlaceHolderImages.find(img => img.id === logoId);

  if (!logoData) return null;

  return (
    <div className={cn("relative", className)}>
      <Image
        src={logoData.imageUrl}
        alt="The Squad"
        width={400}
        height={120}
        className="object-contain w-full h-full"
        data-ai-hint={logoData.imageHint}
        priority={priority}
      />
    </div>
  );
}
