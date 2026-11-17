import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  variant: 'dark-background' | 'light-background';
  className?: string;
  priority?: boolean;
}

/**
 * Centralized BrandLogo component.
 * - 'dark-background' renders logo-light.png (for visibility on dark surfaces)
 * - 'light-background' renders logo-dark.png (for visibility on light surfaces)
 */
export default function BrandLogo({ variant, className, priority }: BrandLogoProps) {
  const isDarkBg = variant === 'dark-background';
  
  // Use the specific file names requested for the project assets
  const src = isDarkBg ? '/logo-light.webp' : '/logo-dark.webp';
  const hint = isDarkBg ? 'white logo' : 'black logo';

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <Image
        src={src}
        alt="The Squad sports team management app"
        width={2000}
        height={800}
        sizes="200px"
        className="object-contain w-full h-full"
        data-ai-hint={hint}
        priority={priority}
      />
    </div>
  );
}
