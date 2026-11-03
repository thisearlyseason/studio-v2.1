import { discoveryMetadata } from '@/lib/discovery-metadata';
export const metadata = discoveryMetadata('/terms', 'Terms of Service', 'Terms governing use of The Squad sports management platform.');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
