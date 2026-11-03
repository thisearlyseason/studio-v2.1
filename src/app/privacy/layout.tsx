import { discoveryMetadata } from '@/lib/discovery-metadata';
export const metadata = discoveryMetadata('/privacy', 'Privacy Policy', 'How The Squad collects, uses, protects, and manages personal information.');
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
