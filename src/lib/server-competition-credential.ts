import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'hmac-sha256:v1:';

function validSecrets(secrets: readonly string[]): string[] {
  const normalized = [...new Set(secrets.map(secret => secret.trim()).filter(Boolean))];
  if (!normalized.length || normalized.some(secret => Buffer.byteLength(secret, 'utf8') < 32)) {
    throw new Error('COMPETITION_CREDENTIAL_SECRET_MISSING');
  }
  return normalized;
}

export function competitionCredentialSecrets(): string[] {
  const current = process.env.COMPETITION_CREDENTIAL_HMAC_SECRET || '';
  const previous = String(process.env.COMPETITION_CREDENTIAL_HMAC_PREVIOUS_SECRETS || '').split(',');
  return validSecrets([current, ...previous]);
}

function digest(leagueId: string, pin: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`league-scorekeeper:${leagueId}\0${pin}`)
    .digest('hex');
}

function tournamentDigest(teamId: string, eventId: string, code: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`tournament-scorekeeper:${teamId}:${eventId}\0${code.trim().toLowerCase()}`)
    .digest('hex');
}

export function hashLeagueScorekeeperPin(
  leagueId: string,
  pin: string,
  secrets: readonly string[] = competitionCredentialSecrets(),
): string {
  const [current] = validSecrets(secrets);
  return `${PREFIX}${digest(leagueId, pin, current)}`;
}

export function verifyLeagueScorekeeperPin(
  leagueId: string,
  pin: string,
  storedHash: string,
  secrets: readonly string[] = competitionCredentialSecrets(),
): boolean {
  const match = /^hmac-sha256:v1:([a-f0-9]{64})$/.exec(storedHash);
  if (!match) return false;
  const supplied = Buffer.from(match[1], 'hex');
  return validSecrets(secrets).some(secret => {
    const expected = Buffer.from(digest(leagueId, pin, secret), 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}

export function hashTournamentScorekeeperCode(
  teamId: string,
  eventId: string,
  code: string,
  secrets: readonly string[] = competitionCredentialSecrets(),
): string {
  const [current] = validSecrets(secrets);
  return `${PREFIX}${tournamentDigest(teamId, eventId, code, current)}`;
}

export function verifyTournamentScorekeeperCode(
  teamId: string,
  eventId: string,
  code: string,
  storedHash: string,
  secrets: readonly string[] = competitionCredentialSecrets(),
): boolean {
  const match = /^hmac-sha256:v1:([a-f0-9]{64})$/.exec(storedHash);
  if (!match) return false;
  const supplied = Buffer.from(match[1], 'hex');
  return validSecrets(secrets).some(secret => {
    const expected = Buffer.from(tournamentDigest(teamId, eventId, code, secret), 'hex');
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}
