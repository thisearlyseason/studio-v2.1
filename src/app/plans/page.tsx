import type { Metadata } from 'next';
import Link from 'next/link';
import { TierComparison } from '@/components/marketing/tier-comparison';
import { ProductOfferSchema } from '@/components/marketing/product-offer-schema';
import { CustomerStories } from '@/components/marketing/trust-proof';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sports Team Plans and Pricing', description: 'Compare Starter, Squad Pro, Elite Teams, Elite League and School District plans, included teams and current web prices.', alternates: { canonical: 'https://www.thesquad.pro/plans' } };
export default function PlansPage() {
  return <main><ProductOfferSchema /><div className="bg-black text-white py-16"><div className="container mx-auto px-6"><Link href="/" className="underline">The Squad</Link><h1 className="text-4xl font-black mt-8">Choose a plan for your season</h1><p className="mt-4">Start free for schedules and team chat. Add Pro tools when your team needs them.</p></div><TierComparison /><div className="container mx-auto px-6"><Link href="/#pricing" className="underline">See monthly and annual options</Link> · <Link href="/signup" className="underline">Create your squad</Link></div></div><CustomerStories /></main>;
}
