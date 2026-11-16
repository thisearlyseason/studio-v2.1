import Link from 'next/link';

export const MARKETING_FAQS = [
  { question: 'Why pay when TeamLinkt, Spond and TeamReach have free options?', answer: 'A free plan may be enough for schedules and team chat. Start with The Squad Starter for those basics. Consider a paid plan when you need digital waivers, dues through Stripe Connect, auto-brackets or several Pro teams under one club or school. Compare the jobs you need and the total cost, including payment processing, before switching.' },
  { question: 'Do I need a card for the paid trial?', answer: 'Paid plans have a 5-day free trial with a card saved upfront. There is no charge for 5 days. Cancel before the trial ends if you do not want the paid subscription. You can also choose the free Starter plan.' },
  { question: 'How do we move our club from another tool?', answer: 'Try a demo first. Create one squad, add a sample of your roster, enter upcoming events and check staff access. Confirm registration forms, waivers and payment setup before inviting families. Keep exports of your old records and move the rest of the club only after the first squad works for you. This is a setup checklist, not an automatic data transfer.' },
  { question: 'What should we do with our records after the season?', answer: 'Review results, attendance, unpaid fees and outstanding waivers, then export the records you need before resetting or deleting anything. Season Reset is currently a demo-only tool and can remove sample records. Use the season-end guide to review the available controls; do not treat a season reset as a backup.' },
  { question: 'Which plan fits a club or school?', answer: 'Squad Pro covers one Pro team. Elite Teams includes 8 Pro teams and a club hub; Elite League includes 18; School District includes 15. Organization plans support additional paid teams. Compare included teams, features and current prices below before choosing.' },
  { question: 'Are web and app-store prices the same?', answer: 'Web prices use the configured billing catalog. App-store prices and taxes may differ by region. Check the billing period, currency and final confirmation wherever you subscribe. Dues collected by an organizer through Stripe Connect are separate from your platform subscription.' },
];

export function MarketingFaq() {
  return <section id="faq" className="py-20 bg-muted/30">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: MARKETING_FAQS.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }).replace(/</g, '\\u003c') }} />
    <div className="container mx-auto px-6 max-w-4xl">
      <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-8">Before you move your season</h2>
      <div className="divide-y">{MARKETING_FAQS.map(item => <details key={item.question} className="py-5"><summary className="cursor-pointer font-bold text-lg">{item.question}</summary><p className="mt-3 leading-relaxed text-muted-foreground">{item.answer}</p></details>)}</div>
      <p className="mt-6 flex flex-wrap gap-5"><Link href="/how-to?q=season" className="underline">Setup and season-end guides</Link><Link href="/#pricing" className="underline">Compare plans</Link><Link href="/refunds" className="underline">Refund terms</Link></p>
    </div>
  </section>;
}
