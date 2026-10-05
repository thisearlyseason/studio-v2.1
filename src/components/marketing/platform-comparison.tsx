import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";

const notListed = "Not listed";

// Reviewed against the linked official product pages on September 17, 2026.
// Describe documented capabilities; lack of documentation is not proof of absence.
const platforms = [
  { name: "TeamSnap", href: "https://www.teamsnap.com/teams/features" },
  { name: "Hudl", href: "https://www.hudl.com/products" },
  { name: "TeamReach", href: "https://teamreach.com/" },
  { name: "GameChanger", href: "https://gc.com/" },
];

const rows = [
  {
    feature: "Schedules & availability",
    squad: "Team calendars, RSVPs & attendance",
    others: [
      "Schedules & availability",
      "Scheduling & team management",
      "Schedules, RSVPs & attendance",
      "Team events & lineups",
    ],
  },
  {
    feature: "Team communication",
    squad: "Chats, polls & team feed",
    others: [
      "Messages & team updates",
      "Team messaging",
      "Group messages & updates",
      "Team messaging",
    ],
  },
  {
    feature: "Practice plans & playbooks",
    squad: "Reusable plans, drill instructions & diagrams",
    others: [
      "Practice plans & drills",
      "Fastmodel play diagramming",
      notListed,
      "Stats & film for practice planning",
    ],
  },
  {
    feature: "Video & athlete media",
    squad: "Hosted links & uploaded athlete film",
    others: [
      "Photo & video sharing; ONE streaming",
      "Video analysis, highlights & streaming",
      "Photo, video & file sharing",
      "Live streams & automatic highlights",
    ],
  },
  {
    feature: "Athlete profiles & recruiting",
    squad: "Staff evaluations, scout profiles & PDF exports",
    others: [
      "NCSA recruiting profile partnership",
      "Athlete profiles & recruiting tools",
      notListed,
      "Athlete Profiles & highlight reels",
    ],
  },
  {
    feature: "Family & multi-team access",
    squad: "Linked children, schedules, waivers & payments",
    others: [
      "Family contacts & team access",
      "Family access & organization tools",
      "Multiple groups in one app",
      "Family roles & followed teams",
    ],
  },
  {
    feature: "Registration & finances",
    squad: "Registration, dues, fundraising & club summaries",
    others: [
      "Registration, payments & invoicing",
      "Registration & fundraising products",
      notListed,
      notListed,
    ],
  },
  {
    feature: "Leagues & tournaments",
    squad: "Registration, brackets, tiered playoffs & standings",
    others: [
      "League tools & tournament product",
      notListed,
      notListed,
      "Scheduling, scoring & standings",
    ],
  },
  {
    feature: "Scores & game-day access",
    squad: "Scorekeeper, referee & spectator portals",
    others: [
      "TeamSnap Live! & statistics",
      "Video, stats & fan engagement tools",
      "Record event scores",
      "Live scorekeeping, stats & GameStream",
    ],
  },
  {
    feature: "Printable team resources",
    squad: "Branded reports & sport-specific scoresheets",
    others: [
      "Tournament schedules, rosters & results",
      "Analysis & scouting reports",
      "Shared documents & forms",
      "Printable game scorebook PDFs",
    ],
  },
];

const resources = [
  {
    title: "Sport-specific resources",
    description:
      "Explore sports, practice resources and printable scoresheets for your next game.",
    href: "/sports",
    label: "Explore sports",
  },
  {
    title: "Guides for every role",
    description:
      "Find step-by-step help for coaches, families, players and organization staff.",
    href: "/how-to",
    label: "Read the guides",
  },
  {
    title: "Community safety tools",
    description:
      "Report content, block users and learn how moderation works in The Squad.",
    href: "/safety",
    label: "View safety tools",
  },
];

export function PlatformComparison() {
  return (
    <div className="space-y-8">
      <div>
        <p className="mb-4 flex items-center gap-2 text-xs font-bold text-muted-foreground xl:hidden">
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          Swipe or scroll horizontally to compare all platforms.
        </p>
        <div
          role="region"
          aria-label="Sports platform feature comparison"
          tabIndex={0}
          className="overflow-x-auto rounded-3xl border-2 bg-white shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <table
            className="w-full min-w-[1120px] table-fixed border-collapse text-left text-sm"
            aria-describedby="comparison-notes"
          >
            <caption className="sr-only">
              The Squad and other sports platforms: documented capabilities,
              reviewed September 17, 2026.
            </caption>
            <thead>
              <tr className="bg-black text-white">
                <th
                  scope="col"
                  className="w-[200px] px-5 py-6 text-xs font-black uppercase tracking-wider"
                >
                  Capabilities
                </th>
                <th
                  scope="col"
                  className="w-[220px] bg-primary px-5 py-6 font-black uppercase tracking-wide"
                >
                  The Squad
                </th>
                {platforms.map((platform) => (
                  <th
                    key={platform.name}
                    scope="col"
                    className="px-4 py-6 text-xs font-black"
                  >
                    <a
                      href={platform.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-white/50 underline-offset-4 hover:text-white/80"
                    >
                      {platform.name}
                      <span className="sr-only">
                        {" "}
                        official features (opens in a new tab)
                      </span>
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.feature} className="hover:bg-muted/20">
                  <th scope="row" className="px-5 py-5 font-bold leading-snug">
                    {row.feature}
                  </th>
                  <td className="border-x border-primary/15 bg-primary/5 px-5 py-5">
                    <div className="flex items-start gap-2 font-semibold leading-relaxed">
                      <Check
                        className="mt-1 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{row.squad}</span>
                    </div>
                  </td>
                  {row.others.map((value, index) => (
                    <td
                      key={platforms[index].name}
                      className="px-4 py-5 text-xs leading-relaxed text-muted-foreground"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          id="comparison-notes"
          className="mt-5 space-y-2 text-xs leading-relaxed text-muted-foreground"
        >
          <p>
            Reviewed September 17, 2026 using the official sources linked here.
            Features vary by plan, sport and product. The Squad column covers
            the platform across its plans; some tools require a paid plan or
            staff permissions.{" "}
            <a
              href="#pricing"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              See plans
            </a>
            .
          </p>
          <p>
            “Not listed” means we did not find the capability in the reviewed
            sources; it does not mean the platform cannot support it.
            Descriptions summarize different workflows, not identical
            functionality.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-2">
            <span className="font-semibold text-foreground">
              Additional sources:
            </span>
            {[
              { label: "TeamSnap ONE", href: "https://www.teamsnap.com/" },
              {
                label: "TeamSnap family access",
                href: "https://helpme.teamsnap.com/article/1318-frequently-asked-questions",
              },
              {
                label: "TeamSnap tournaments",
                href: "https://www.teamsnap.com/for-business/features/tournaments",
              },
              {
                label: "TeamSnap recruiting",
                href: "https://helpme-admin.teamsnap.com/article/2674-ncsa-next-college-student-athlete",
              },
              {
                label: "TeamSnap print options",
                href: "https://helpme.teamsnap.com/article/582-tournaments-print-options",
              },
              {
                label: "GameChanger scorebooks",
                href: "https://gc.com/post/scorebook-sharing",
              },
              {
                label: "Hudl reports",
                href: "https://www.hudl.com/support/wyscout/guides/watching-video",
              },
              {
                label: "GameChanger leagues",
                href: "https://gc.com/organizations",
              },
            ].map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {source.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {resources.map((resource) => (
          <Link
            key={resource.href}
            href={resource.href}
            className="group flex flex-col rounded-2xl border bg-muted/20 p-6 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <h3 className="font-bold">{resource.title}</h3>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-muted-foreground">
              {resource.description}
            </p>
            <span className="mt-auto flex items-center gap-2 text-sm font-bold text-primary">
              {resource.label}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
