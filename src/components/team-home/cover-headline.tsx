import type { Team } from '@/components/providers/team-provider';
import { defaultHeadlinePosition, type HeadlinePosition } from '@/lib/cover-headline-position';

export function CoverHeadline({ team, headline = team.homeCoverHeadline, position = team.homeCoverHeadlinePosition ?? defaultHeadlinePosition, preview = false }: {
  team: Team;
  headline?: string;
  position?: HeadlinePosition;
  preview?: boolean;
}) {
  const Title = preview ? 'p' : 'h1';
  return <div className="team-cover-caption" data-position={position}>
    <div>
      {team.teamLogoUrl && <img src={team.teamLogoUrl} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}
      <span>Team home</span>
      <Title className="team-cover-title">{headline || <>Built for<br/>game day.</>}</Title>
      <p className="team-cover-name">{team.name}</p>
    </div>
  </div>;
}
