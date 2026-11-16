import LandingPage from '@/components/marketing/landing-page';
import { BillingDisplayPriceProvider } from '@/lib/use-billing-display-prices';
import { loadPublicDisplayPrices } from '@/lib/public-product-offers';
import { ProductOfferSchema } from '@/components/marketing/product-offer-schema';

// Fresh public catalog quotes seed both the visible HTML and machine-readable offers.
export const dynamic = 'force-dynamic';
export default async function HomePage() {
  const prices = await loadPublicDisplayPrices();
  return <><ProductOfferSchema prices={prices} /><BillingDisplayPriceProvider prices={prices}><LandingPage /></BillingDisplayPriceProvider></>;
}
