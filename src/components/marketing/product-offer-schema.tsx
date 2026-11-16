import type { DisplayPrice } from '@/lib/billing-display-price';
import { loadPublicProductOffers, productOffersFromCatalog } from '@/lib/public-product-offers';

export async function ProductOfferSchema({ prices }: { prices?: DisplayPrice[] } = {}) {
  const offers = prices ? productOffersFromCatalog(prices) : await loadPublicProductOffers();
  const schema = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': 'https://www.thesquad.pro/#software', name: 'The Squad', applicationCategory: 'SportsApplication', operatingSystem: 'Web browser', url: 'https://www.thesquad.pro', description: 'Sports team management for clubs, leagues and schools: schedules, rosters, team chat, digital waivers and competitions.', offers };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />;
}
