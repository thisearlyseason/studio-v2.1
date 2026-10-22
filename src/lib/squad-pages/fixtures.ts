import { emptyContent, EntityRef, entityKey } from './model';
import type { Data } from './store';
export const previewActors = [{ uid: 'demo-owner', name: 'Morgan · organization owner' }, { uid: 'demo-admin', name: 'Avery · team admin' }, { uid: 'demo-free', name: 'Sam · uncovered team owner' }, { uid: 'demo-outsider', name: 'Taylor · unrelated account' }];
export const previewEntities: Array<{ ref: EntityRef; label: string }> = [
  { ref: { kind: 'team', id: 'demo-hawks' }, label: 'River City Hawks · covered team' }, { ref: { kind: 'team', id: 'demo-free-team' }, label: 'River City Falcons · Starter draft' },
  ...(['simple', 'modern', 'bold'] as const).map(template => ({ ref: { kind: 'team' as const, id: `demo-example-${template}` }, label: `River City Hawks · ${template} example` })),
  { ref: { kind: 'club', id: 'demo-owner' }, label: 'River City Sports · club' }, { ref: { kind: 'school', id: 'demo-school' }, label: 'River City Academy · school' },
  { ref: { kind: 'program', id: 'demo-program' }, label: 'Academy Volleyball · covered program squad' }, { ref: { kind: 'league', id: 'demo-league' }, label: 'River City League' },
  { ref: { kind: 'tournament', teamId: 'demo-hawks', id: 'demo-tournament' }, label: 'River City Invitational · tournament' },
];
export function previewRecords(includeReviewExamples = false): Record<string, Data> {
  const records: Record<string, Data> = { 'users/demo-owner': { name: 'Morgan', role: 'coach', clubName: 'River City Sports', plan_type: 'elite', subscription_status: 'active', team_limit: 8 }, 'users/demo-admin': { name: 'Avery', role: 'coach', plan_type: 'free' }, 'users/demo-free': { name: 'Sam', role: 'coach', plan_type: 'free' }, 'users/demo-outsider': { name: 'Taylor', role: 'coach', plan_type: 'free' }, 'users/demo-school-owner': { name: 'School Owner', role: 'coach', plan_type: 'school', subscription_status: 'active', team_limit: 15 },
    'teams/demo-hawks': { name: 'River City Hawks', ownerUserId: 'demo-owner', type: 'adult', isPro: true, planId: 'elite', clubId: 'demo-owner', organizationOwnerUserId: 'demo-owner' },
    'teams/demo-free-team': { name: 'River City Falcons', ownerUserId: 'demo-free', type: 'adult', isPro: false, planId: 'free', participatingTournamentIds: ['demo-tournament'] },
    'teams/demo-school': { name: 'River City Academy', ownerUserId: 'demo-school-owner', type: 'school', schoolAdminIds: ['demo-owner'], isPro: true, planId: 'school' },
    'teams/demo-program': { name: 'Academy Volleyball', ownerUserId: 'demo-school-owner', type: 'school_squad', schoolId: 'demo-school', organizationHubId: 'demo-school', isPro: true, planId: 'school' },
    'leagues/demo-league': { name: 'River City League', creatorId: 'demo-owner', billingOwnerUserId: 'demo-owner', tenantId: 'demo-hawks', is_active: true },
    'teams/demo-hawks/events/demo-tournament': { title: 'River City Invitational', teamId: 'demo-hawks', isTournament: true, registrationOpen: true, date: '2027-05-15', timezone: 'America/Edmonton' },
    'leagues/demo-league/registration/player_config': { title: 'Player registration', is_active: true, form_version: 1 },
    'teams/demo-hawks/events/demo-tournament/registration/team_config': { title: 'Tournament team registration', is_active: true, form_version: 1 } };
  if (includeReviewExamples) for (const template of ['simple', 'modern', 'bold']) records[`teams/demo-example-${template}`] = { name: `River City Hawks · ${template} example`, ownerUserId: 'demo-owner', type: 'adult', isPro: true, planId: 'elite', clubId: 'demo-owner', organizationOwnerUserId: 'demo-owner' };
  for (const team of ['demo-hawks', 'demo-program']) records[`teams/${team}/members/demo-admin`] = { userId: 'demo-admin', role: 'Admin', position: 'Coach', status: 'active' };
  for (const { ref } of previewEntities) for (const id of ['demo-photo-hero', 'demo-photo-team']) records[`squadPageMedia/${entityKey(ref)}/items/${id}`] = { mime: 'image/jpeg', createdBy: 'fictional-seed', retired: false, fixture: true };
  return records;
}
export function fictionalContent(name = 'River City Hawks') {
  const c = emptyContent(name); c.slug = 'river-city-hawks'; c.headline = 'Find your team. Play your game.'; c.intro = 'A welcoming sports community. New teammates, shared goals, a season to remember.'; c.aboutHeading = 'Built for the love of the game.'; c.about = 'We bring people together through sport. Develop your skills, find your confidence and enjoy being part of a team.\n\nThis is fictional preview content. No real team or customer records are used.'; c.joinHeading = 'Your next season starts here.'; c.joinText = 'Find your place on the team. Explore registration and join a community that plays together.'; c.details = { ...c.details, sport: 'Basketball', ages: 'Adults 18+', location: 'River City', season: '2027 season' }; c.contact = { heading: 'Get in touch', text: 'Questions about the season? We would love to hear from you.', email: 'hello@rivercityhawks.example', phone: '' }; return c;
}
