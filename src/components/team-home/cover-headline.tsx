import type { Team } from '@/components/providers/team-provider';
import { defaultHeadlinePosition, type HeadlinePosition } from '@/lib/cover-headline-position';

export function CoverHeadline({ team, headline = team.homeCoverHeadline, position = team.homeCoverHeadlinePosition ?? defaultHeadlinePosition, identityPosition = team.homeCoverIdentityPosition ?? team.homeCoverHeadlinePosition ?? defaultHeadlinePosition, preview = false }: {
  team: Team;
  headline?: string;
  position?: HeadlinePosition;
  identityPosition?: HeadlinePosition;
  preview?: boolean;
}) {
  const Title = preview ? 'p' : 'h1';
  const together = identityPosition === position;
  const title = headline || <>Built for<br/>game day.</>;
  return <><div className="team-cover-caption" data-position={identityPosition}>
    <div>
      {team.teamLogoUrl && <img src={team.teamLogoUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}
      <span>Team home</span>
      {together ? <Title className="team-cover-title">{title}</Title> : <p aria-hidden="true" className="team-cover-title invisible">{title}</p>}
      <p className="team-cover-name">{team.name}</p>
    </div>
  </div>
    {!together && <div className="team-cover-caption" data-position={position}>
      <div><Title className="team-cover-title">{title}</Title></div>
    </div>}
  </>;
}
