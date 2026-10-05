import type { Article } from './sports-hub-articles';

type Group = { section: string; category: string; author: Article['author']; titles: string[]; tags: string[] };

const groups: Group[] = [
  { section: 'Youth Sports', category: 'Youth Sports', author: { name: 'The Squad Youth Sports Team', title: 'Youth Program Operations' }, tags: ['youth sports', 'development', 'program operations'], titles: [
    'Choosing Age Groups for a Youth Sports Program', 'Youth Sports Tryout Day Plan', 'Build a Skill Progression for Young Athletes', 'Inclusive Youth Sports Program Checklist', 'Writing a Clear Youth Sports Weather Policy', 'Designing a First Practice That Builds Belonging', 'Why Multi-Sport Development Helps Young Athletes', 'Age-Appropriate Competition in Youth Sports', 'A Simple Goal-Setting Workshop for Young Athletes', 'Onboard Youth Sports Volunteers in One Session', 'Equipment-Sharing Systems for Youth Programs', 'Positive Coaching Language Young Athletes Understand', 'How to Run a Developmental Athlete Review', 'Safe Drop-Off and Pickup for Youth Sports', 'Building Community Partnerships for Youth Sports', 'Designing a Youth Sports Scholarship Program', 'Helping Athletes Transition Between Youth Teams', 'The 10-Minute Youth Camp Daily Briefing', 'A Youth Sports Feedback Survey That Gets Answers', 'Planning an End-of-Season Celebration With Purpose', 'Quarterly Youth Program Review Template'
  ] },
  { section: 'Coaching', category: 'Coaching', author: { name: 'The Squad Coaching Team', title: 'Coach Education & Development' }, tags: ['coaching', 'practice planning', 'athlete development'], titles: [
    'Write Better Practice Objectives', 'Using Small-Sided Games to Teach Decisions', 'The Coach Feedback Loop', 'A Practical Team Film Review Format', 'Build a Fair and Flexible Substitution Plan', 'Developing Captains Through Real Responsibility', 'Injury-Aware Practice Planning', 'How to Reset a Team After a Tough Loss', 'Youth-Friendly Opponent Scouting', 'Monthly Season Goal Reviews for Coaches', 'Design a Warm-Up That Prepares the Whole Athlete', 'Teach Through Better Questions', 'Practice Pacing: Keep Athletes Moving and Learning', 'Emotional Regulation Tools for Coaches', 'A 15-Minute Athlete One-on-One', 'Align Assistant Coaches Before Practice', 'Balance Technical and Tactical Training', 'Teach Recovery as a Team Skill', 'Healthy Competition in Practice', 'Midseason Coaching Adjustment Meeting', 'Run an Honest End-of-Season Coaching Debrief'
  ] },
  { section: 'parents', category: 'Parents', author: { name: 'The Squad Parent Support Team', title: 'Youth Sports Family Support' }, tags: ['parents', 'family support', 'youth sports'], titles: [
    'Build a Realistic Youth Sports Budget', 'A Healthy Sideline Role for Parents', 'Questions to Ask a New Coach', 'Understanding Youth Sports Consent Forms', 'Protecting Sleep During Competition Season', 'Digital Safety for Young Athletes', 'Help Your Child Set Their Own Sports Goals', 'When Should a Young Athlete Change Teams?', 'Navigating Conflict Between Teammates', 'Help Athletes Build an Identity Beyond Sport', 'Tournament Travel Packing for Families', 'Questions to Ask After a Sports Injury', 'Encouraging Effort Without Empty Praise', 'Supporting a Child With Sports Anxiety', 'Questions About Team Fees and Refunds', 'Healthy Boundaries for Parent Volunteers', 'Supporting a Child Trying a New Sport', 'Connecting School and Club Sports Responsibly', 'What Good Youth Coaching Looks Like', 'End-of-Season Reflection for Families', 'A Safer Team Transportation Plan'
  ] },
  { section: 'Tournament Management', category: 'Tournament Management', author: { name: 'The Squad Events Team', title: 'Tournament Operations' }, tags: ['tournaments', 'event operations', 'planning'], titles: [
    'Choosing the Right Tournament Format', 'A Transparent Tournament Seeding Method', 'Tournament Venue Walkthrough Checklist', 'Brief Officials Before the First Game', 'Fast and Accurate Team Check-In', 'Tournament Weather Decision Timeline', 'Live Scoring Workflow for Tournament Directors', 'Schedule Tournament Volunteers Without Gaps', 'Plan Tournament Concessions Responsibly', 'Tournament Parking and Traffic Plan', 'Tournament Complaint Escalation Path', 'A Smooth Tournament Awards Ceremony', 'Tournament Budget Template', 'Useful Tournament Sponsor Activations', 'Why Tournament Schedules Need Buffer Time', 'Accessibility Review for Tournament Hosts', 'Tournament Medical Coverage Plan', 'Verify Results Before Publishing Brackets', 'Post-Event Survey for Tournament Teams', 'Rescheduling a Tournament After a Rainout', 'Tournament Director Daybook'
  ] },
  { section: 'Team Management', category: 'Team Management', author: { name: 'The Squad Operations Team', title: 'Sports Program Administration' }, tags: ['team management', 'operations', 'administration'], titles: [
    'Monthly Roster Audit for Team Managers', 'Build a Shared Team Season Calendar', 'Create a Team Parent Handbook', 'Collect Practice Requests Without Chaos', 'Team Equipment Inventory System', 'A Reliable Team Communication Cadence', 'Manage Team Fees Transparently', 'Define Volunteer Roles That Get Filled', 'A Fair Team Attendance Policy', 'Run a Team Uniform Order', 'Prepare a Travel Roster and Contact Sheet', 'Assign Game-Day Roles Before Arrival', 'Midseason Parent Meeting Agenda', 'A Private Team Conflict Log', 'Protect Team Data in Shared Tools', 'Season Budget Review for Team Leaders', 'Coach-to-Coach Handoff Notes', 'Close Registration Without Loose Ends', 'End-of-Season Team Report', 'Family Onboarding for a New Team', 'Role-Based Access for Team Admins'
  ] },
];

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildContent(title: string, section: string): string {
  const sectionNotes: Record<string, string> = {
    'Youth Sports': 'For youth programs, check age-appropriate expectations, safeguarding, inclusion, family communication, and recovery.',
    Coaching: 'For coaches, connect the idea to an observable athlete behavior, a short teaching cue, and a progression for the next practice.',
    parents: "For families, protect the athlete's voice, privacy, wellbeing, and ability to participate without turning every conversation into a performance review.",
    'Tournament Management': 'For tournament directors, publish decision points and assign an owner for every operational handoff.',
    'Team Management': 'For team administrators, make permissions, deadlines, contact ownership, and record retention clear.',
  };
  return `## ${title}

${title} gives ${section.toLowerCase()} leaders a practical way to make the next decision visible, repeatable, and easier to communicate. Use this guide as a starting point, then adapt it to your sport, age group, facilities, governing body, and local policies.

${sectionNotes[section] ?? 'Keep the process practical, inclusive, and easy to review after the next activity.'}

## Start With the Outcome

Write down the result you want, who owns it, and when it must be complete. Ask the people closest to the activity what information they need and what could create a safety, access, timing, or communication problem.

## A Practical Workflow

1. Gather the facts from athletes, families, coaches, and administrators.
2. Choose one simple process with a clear owner for each handoff.
3. Share the process before the activity and make the next action easy to find on a phone.
4. Test the workflow with a small group, then fix unclear steps.
5. Record decisions, exceptions, and follow-up dates so another volunteer can continue the work.

## What You Can Do This Week

Choose one small improvement from this guide, assign an owner, and put the next review date on the shared calendar.

## Quick Review

- Is the purpose clear to every audience involved?
- Are private details limited to people who genuinely need access?
- Does the process include a safe escalation contact?
- Have you left enough time for questions, recovery, and transitions?

Review the process after the next activity and keep the version your community can actually sustain.`;
}

export const EXPANDED_ARTICLES: Record<string, Article> = Object.fromEntries(
  groups.flatMap(group => group.titles.map((title, index) => {
    const slug = slugify(title);
    const summary = `A practical guide to ${title.toLowerCase()}, with clear steps for planning, communication, safety, and follow-through.`;
    const article: Article = {
      id: slug, slug, title, excerpt: summary, categories: [group.category],
      tags: [...group.tags, slug.split('-').slice(0, 3).join(' ')], author: group.author,
      readingTime: 5 + (index % 4), publishedAt: `2026-08-${String(8 - Math.min(index, 7)).padStart(2, '0')}`,
      seoTitle: `${title} | The Squad Sports Hub`, seoDescription: summary, isFeatured: index === 0, section: group.section,
      content: buildContent(title, group.section),
    };
    return [slug, article];
  }))
);
