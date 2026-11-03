import HomePage from '@/components/marketing/home-page';
import { discoveryMetadata, SITE_URL } from '@/lib/discovery-metadata';
export const metadata = discoveryMetadata('', 'The Squad: Sports Team Management', 'Organize team schedules, rosters, chat and competitions. The Squad connects coaches, athletes and families, with free and paid plans.');
const structuredData = {
  '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'The Squad', url: SITE_URL, logo: `${SITE_URL}/app-icon-512-v5.png`, email: 'team@thesquad.pro' },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'The Squad', url: SITE_URL, inLanguage: 'en', publisher: { '@id': `${SITE_URL}/#organization` } },
    { '@type': 'SoftwareApplication', name: 'The Squad', applicationCategory: 'SportsApplication', operatingSystem: 'Web', url: SITE_URL, description: 'Sports team management for coaches, athletes and families: schedules, rosters, conversations and competitions.', provider: { '@id': `${SITE_URL}/#organization` } },
  ],
};
export default function Page() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><HomePage /></>;
}
