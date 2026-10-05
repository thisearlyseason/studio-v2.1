import Link from 'next/link';

const guides = {
  team: {
    title: 'New to managing a team? Start here',
    steps: [
      ['Set up your team', 'Add your team name and details. You can invite people after the team is created.', '/team'],
      ['Add your players and helpers', 'Open the roster to add people or share your team’s join details.', '/roster'],
      ['Plan your first activity', 'Add a game, practice, or event. Check the date, time, and location before sharing it.', '/events'],
    ],
  },
  league: {
    title: 'Your first league: a simple checklist',
    steps: [
      ['Create the league', 'Choose the season dates and rules. A league is a group of teams that play across a season.', '/leagues'],
      ['Confirm the teams and places to play', 'Collect registrations or add teams. Check which fields or courts are available and when.', '/facilities'],
      ['Build, review, then share the schedule', 'Use the league’s schedule setup. Resolve any conflicts before publishing, then record results as games finish.', '/leagues'],
    ],
  },
  organization: {
    title: 'Your first organization: start with these steps',
    steps: [
      ['Check your organization details', 'An organization brings several teams together. Confirm its name and the people who help manage it.', '/club'],
      ['Add your teams', 'Set up each team and invite its coaches or managers. Check the selected team before making changes.', '/teams/new'],
      ['Save your venues', 'Add facilities and their fields or courts so organizers can select them when scheduling.', '/facilities'],
    ],
  },
} as const;

export default function OrganizerGuide({kind}: {kind: keyof typeof guides}) {
  const guide = guides[kind];
  return <details className="rounded-2xl border border-black/10 bg-white p-5 text-black">
    <summary className="cursor-pointer font-black text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">{guide.title}</summary>
    <ol className="mt-4 space-y-4 list-decimal pl-5">
      {guide.steps.map(([title, description, href]) => <li key={title} className="pl-1">
        <Link href={href} className="font-bold underline underline-offset-4">{title}</Link>
        <p className="mt-1 text-sm leading-relaxed text-neutral-700">{description}</p>
      </li>)}
    </ol>
  </details>;
}
