import { parseISO, isValid, format } from 'date-fns';

export type HomeEvent = {
  id: string; teamId: string; title: string; date: unknown; endDate?: unknown;
  startTime?: string; endTime?: string; location?: string; eventType?: string;
  status?: string; isCancelled?: boolean; cancelled?: boolean; isArchived?: boolean;
  isCompleted?: boolean; allDay?: boolean; isAllDay?: boolean; userRsvps?: Record<string, string>;
};
export function eventDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : parseISO(String(value));
  return isValid(date) ? date : null;
}
function atTime(date: Date, time?: string): Date {
  const result = new Date(date);
  const match = time?.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (match) {
    let hour = Number(match[1]);
    if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    result.setHours(hour, Number(match[2]), 0, 0);
  }
  return result;
}
export function nextTeamEvent(events: HomeEvent[], teamId: string, now = new Date()): HomeEvent | undefined {
  return events.filter(event => {
    if (event.teamId !== teamId || event.isArchived || event.isCompleted || event.isCancelled || event.cancelled || /cancelled|canceled|postponed|completed/i.test(event.status || '')) return false;
    const date = eventDate(event.date);
    if (!date) return false;
    const end = atTime(eventDate(event.endDate) || date, event.endTime || event.startTime);
    if (!event.endTime && (event.allDay || event.isAllDay || !event.startTime || event.endDate || /ongoing|in.progress/i.test(event.status || ''))) end.setHours(23, 59, 59, 999);
    return end >= now;
  }).sort((a, b) => atTime(eventDate(a.date)!, a.startTime).getTime() - atTime(eventDate(b.date)!, b.startTime).getTime())[0];
}
export function homeEventDateLabel(event: HomeEvent): string {
  const date = eventDate(event.date);
  return date ? `${format(date, 'EEE, MMM d')} · ${event.allDay || event.isAllDay ? 'All day' : event.startTime || 'Time TBD'}` : 'Date TBD';
}

// Shared by Schedule and Modern home so team participation and TBD rules agree.
export function expandTournamentMatches<T extends { id: string; teamId: string; title: string; isTournament?: boolean; location?: string; leagueName?: string; tournamentGames?: { id?: string; date?: string; time?: string; location?: string; team1?: string; team2?: string; team1Id?: string; team2Id?: string; round?: string }[] }>(events: T[], team: {id: string; name?: string; teamName?: string} | null) {
  if (!team) return [];
  return events.flatMap(event => !event.isTournament ? [] : (event.tournamentGames || []).flatMap((game, index) => {
    if (!game.date || /tbd/i.test(game.team1 || '') || /tbd/i.test(game.team2 || '')) return [];
    if (![game.team1Id, game.team2Id].includes(team.id) && ![game.team1, game.team2].some(name => name && [team.name, team.teamName].includes(name))) return [];
    return [{ ...event, id: game.id || `${event.id}_match_${index}`, teamId: team.id, title: `[Match] ${game.team1} vs ${game.team2}`, date: game.date, endDate: game.date, startTime: game.time || '', location: game.location || event.location || '', eventType: 'tournament', isTournamentMatch: true, round: game.round, parentTournamentId: event.id, matchTeamIds: [game.team1Id, game.team2Id].filter(Boolean), leagueName: event.leagueName || event.title.replace(/^\[Tournament\]\s*/i, '').trim() }];
  }));
}

export function homeWinRate(games: {result?: string}[]): number {
  return games.length ? Math.round(games.filter(game => game.result === 'Win').length / games.length * 100) : 0;
}
