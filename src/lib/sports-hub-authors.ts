export type HubAuthor = { slug: string; name: string; kind: 'Person' | 'Organization'; bio: string; profiles: readonly string[] };

// The owner confirmed these four named reviewers on 2026-11-16.
// Do not add qualifications, years of experience or external profiles without evidence.
export const HUB_AUTHORS: readonly HubAuthor[] = [
  { slug: 'marcus-rivera', name: 'Coach Marcus Rivera', kind: 'Person', bio: 'Marcus Rivera reviews Sports Hub articles about coaching, leadership and team culture. His credited guides cover practice, athlete feedback and competition preparation.', profiles: [] },
  { slug: 'sarah-mitchell', name: 'Sarah Mitchell', kind: 'Person', bio: 'Sarah Mitchell reviews Sports Hub guidance for team administrators and organizers. Her credited articles cover parent communication, volunteers, registration and season operations.', profiles: [] },
  { slug: 'james-chen', name: 'James Chen', kind: 'Person', bio: 'James Chen reviews Sports Hub articles about sports science and performance. His credited guides discuss training, recovery, nutrition and mental preparation.', profiles: [] },
  { slug: 'dana-williams', name: 'Coach Dana Williams', kind: 'Person', bio: 'Dana Williams reviews Sports Hub guidance on youth athlete development. Her credited articles focus on age-appropriate participation, coaching and the athlete’s experience.', profiles: [] },
  { slug: 'the-squad-team', name: 'The Squad Team', kind: 'Organization', bio: 'The Squad Team publishes guidance on running sports teams and competitions. The Squad is a Gameday Sports product owned by Tyler Ans.', profiles: [] },
  { slug: 'parent-support-team', name: 'The Squad Parent Support Team', kind: 'Organization', bio: 'The Squad Parent Support Team publishes practical guidance for sports families. These articles focus on communication, wellbeing and supporting an athlete’s participation.', profiles: [] },
  { slug: 'youth-sports-team', name: 'The Squad Youth Sports Team', kind: 'Organization', bio: 'The Squad Youth Sports Team publishes guides for youth program organizers, including camp planning, nonprofit formation and choosing a team name.', profiles: [] },
];

export function findHubAuthor(name: string): HubAuthor | undefined {
  return HUB_AUTHORS.find(author => author.name === name);
}
export function hubAuthorSchema(name: string) {
  const author = findHubAuthor(name);
  if (!author) return { '@type': 'Organization', name: 'The Squad', url: 'https://www.thesquad.pro/about' };
  const url = `https://www.thesquad.pro/author/${author.slug}`;
  return { '@type': author.kind, '@id': `${url}#author`, name: author.name, url, ...(author.profiles.length ? { sameAs: author.profiles } : {}) };
}
