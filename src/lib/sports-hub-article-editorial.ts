import { ARTICLE_OPENING_ANSWERS, ARTICLE_PRACTICAL_ANSWERS } from './sports-hub-opening-answers';
import { ARTICLE_WORKED_EXAMPLES } from './sports-hub-editorial-examples';
import { ARTICLE_MERGES, ARTICLE_REDIRECTS } from './sports-hub-article-redirects';

const parentDefinitions: Record<string, string> = {
  'supporting-young-athletes-without-adding-pressure': 'Supportive sports parenting is encouragement that protects a child’s enjoyment, choices and sense of worth, regardless of the score.',
  'building-a-healthy-parent-coach-partnership': 'A parent–coach partnership is an agreement about communication, responsibilities and how adults will support an athlete’s development.',
  'balancing-school-sports-and-family-life': 'A family sports plan is a shared schedule and budget that leaves room for school, sleep, travel and time away from competition.',
  'recognizing-and-preventing-youth-sports-burnout': 'Youth sports burnout is sustained exhaustion and loss of interest in sport, rather than disappointment after one difficult game.',
  'supporting-your-child-through-a-sports-injury': 'Injury support is the practical and emotional help a family gives while a qualified clinician guides an athlete’s treatment and return to activity.',
  'sports-nutrition-basics-for-busy-families': 'Sports nutrition is the food and fluid planning that helps an athlete meet everyday needs alongside training and competition.',
  'sleep-and-recovery-guide-for-sports-parents': 'Athlete recovery is the time and support a young person needs between activities, including sufficient sleep, food and manageable training demands.',
  'supporting-a-child-with-sports-anxiety': 'Sports anxiety is worry connected to participation or performance that can affect how a child feels before, during or after an activity.',
  'team-conflict-bullying-and-exclusion-parent-guide': 'Team conflict is a disagreement between participants; bullying involves harmful behaviour that requires a protective adult response.',
  'social-media-highlights-and-recruiting-pressure': 'A youth sports media plan is a family agreement about what gets shared, who can see it and who may contact the athlete.',
  'parenting-the-transition-to-teen-sports': 'The transition to teen sport is a shift toward greater athlete independence alongside changing school, social and training demands.',
};

const parentQuestions: Record<string, string> = {
  "supporting-young-athletes-without-adding-pressure": "How can you encourage effort without adding pressure?",
  "building-a-healthy-parent-coach-partnership": "How should a parent and coach raise a concern?",
  "balancing-school-sports-and-family-life": "What belongs in a sustainable family sports schedule?",
  "recognizing-and-preventing-youth-sports-burnout": "When does lost interest need a closer conversation?",
  "supporting-your-child-through-a-sports-injury": "What can a family do while an athlete recovers?",
  "sports-nutrition-basics-for-busy-families": "How can a family plan food around sport?",
  "sleep-and-recovery-guide-for-sports-parents": "How do you protect sleep during a competition season?",
  "supporting-a-child-with-sports-anxiety": "How can you listen when sport makes a child anxious?",
  "team-conflict-bullying-and-exclusion-parent-guide": "What should a parent do about exclusion or bullying?",
  "social-media-highlights-and-recruiting-pressure": "Who should see a young athlete’s highlight footage?",
  "parenting-the-transition-to-teen-sports": "How much responsibility can a teen athlete take on?"
};

const parentAnswers: Record<string, string> = {
  "supporting-young-athletes-without-adding-pressure": "Ask what support the child prefers and praise actions they can control rather than the score.",
  "building-a-healthy-parent-coach-partnership": "Agree on written expectations and a private process for discussing concerns before the season starts.",
  "balancing-school-sports-and-family-life": "Put fixed commitments, transport responsibilities and rest time into one calendar before accepting optional events.",
  "recognizing-and-preventing-youth-sports-burnout": "Ask calmly about a pattern of exhaustion or lost interest, and seek qualified support when concerns persist.",
  "supporting-your-child-through-a-sports-injury": "Coordinate the clinician’s instructions while supporting the athlete’s connection with the team and ordinary family life.",
  "sports-nutrition-basics-for-busy-families": "Plan familiar meals and water around activities, and use qualified advice for individual nutrition concerns.",
  "sleep-and-recovery-guide-for-sports-parents": "Work backward from the required wake-up time, allowing time for travel home, food and settling down.",
  "supporting-a-child-with-sports-anxiety": "Listen without correcting the feeling, ask what would help and keep the child involved in the next step.",
  "team-conflict-bullying-and-exclusion-parent-guide": "Listen to the child, record observable events privately and use the organization’s safeguarding or reporting process.",
  "social-media-highlights-and-recruiting-pressure": "Share footage only with the audience the family has agreed on, with appropriate permissions from others shown.",
  "parenting-the-transition-to-teen-sports": "Agree on specific responsibilities with the teenager and keep a clear adult backup available for support."
};

function removeRepeatedParentCopy(content: string): string {
  return content
    .replace(/These prompts are intentionally open-ended\.[\s\S]*?being corrected, coached, or rushed\.\n\n/g, '')
    .replace(/One difficult day is normal\.[\s\S]*?another qualified professional\.\n\n/g, '')
    .replace(/You do not need to have every answer\.[\s\S]*?final score\./g, '');
}

export function prepareArticleCatalog<T extends { slug: string; title: string; content: string; readingTime: number; publishedAt: string }>(seeds: Record<string, T>): Record<string, T & { updatedAt?: string }> {
  return Object.fromEntries(Object.entries(seeds).filter(([slug]) => !ARTICLE_REDIRECTS[slug]).map(([slug, article]) => {
    let content = removeRepeatedParentCopy(article.content);
    const definition = parentDefinitions[slug];
    if (definition) {
      content = `${definition}\n\n${content}`;
      content = content.replace('## Start With the Relationship', `## ${parentQuestions[slug]}\n\n${parentAnswers[slug]}`)
        .replace('## What You Can Do This Week', '## What can your family change this week?')
        .replace('## Helpful Conversation Starters', '## How can you start the conversation?')
        .replace('## Signs That More Support May Be Needed', '## When should you ask for more help?');
    }
    for (const retiredSlug of ARTICLE_MERGES[slug] || []) {
      const supplement = seeds[retiredSlug];
      if (!supplement) throw new Error(`Missing consolidation source: ${retiredSlug}`);
      const body = removeRepeatedParentCopy(supplement.content)
        .replace('## Start With the Relationship', '')
        .replace(/## What You Can Do This Week/g, `### Practical steps: ${supplement.title}`)
        .replace(/## Helpful Conversation Starters/g, '### Questions to ask together')
        .replace(/## Signs That More Support May Be Needed/g, '### Concerns to follow up')
        .replace(/## The Parent's Role/g, '### Keeping the athlete involved');
      content += `\n\n## ${supplement.title} {#${retiredSlug}}\n\n${body}`;
    }
    if (ARTICLE_WORKED_EXAMPLES[slug]) content += `\n\n${ARTICLE_WORKED_EXAMPLES[slug]}`;
    const opening = ARTICLE_OPENING_ANSWERS[slug];
    if (opening) {
      const [question, definition] = opening;
      const answer = ARTICLE_PRACTICAL_ANSWERS[slug];
      if (!answer) throw new Error(`Missing direct opening answer: ${slug}`);
      content = content.replace(/^## [^\n]+\n\n/, `${definition}\n\n## ${question}\n\n${answer}\n\n`);
    }
    if (slug === 'volunteer-program-guide') content = content.replace('They simply need to know', 'Volunteers need to know');
    if (slug === 'technology-in-sports-management') content = content.replace('This is not just inefficient.', 'Scattered sports administration records are inefficient.');
    const changed = content !== article.content;
    return [slug, { ...article, content, updatedAt: '2026-11-16', ...(changed ? { readingTime: Math.max(1, Math.ceil(content.split(/\s+/).length / 200)) } : {}) }];
  }));
}
