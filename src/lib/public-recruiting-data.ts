type UnknownRecord = Record<string, unknown>;

function pick(source: UnknownRecord, fields: readonly string[]): UnknownRecord {
  return Object.fromEntries(fields.flatMap(field => source[field] === undefined ? [] : [[field, source[field]]]));
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeUrls(value: unknown): string[] {
  return Array.isArray(value) ? value.map(safeUrl).filter((url): url is string => !!url).slice(0, 10) : [];
}

const PLAYER_FIELDS = [
  'name', 'firstName', 'lastName', 'displayName', 'fullName', 'position', 'clubName',
  'hometown', 'school', 'graduationYear', 'gradYear', 'gpa', 'dominantHand', 'skills',
  'achievements', 'recruitingProfileEnabled',
] as const;

const PROFILE_FIELDS = [
  'firstName', 'lastName', 'fullName', 'typeOfSport', 'status', 'primaryPosition',
  'secondaryPosition', 'height', 'weight', 'dominantHand', 'hometown', 'graduationYear',
  'academicGPA', 'intendedMajor', 'school', 'teamName', 'jerseyNumber', 'bio',
  'institutionalPulse', 'downloadsDisabled',
] as const;

const PRIVATE_METRIC_FIELDS = new Set(['updatedByTeamId', 'playerEmail', 'parentEmail', 'email', 'phone']);
const STAT_PRIVATE_FIELDS = new Set(['updatedByTeamId', 'ownerUserId', 'userId', 'playerId']);
const PUBLIC_EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

export function buildPublicRecruitingDto(input: {
  playerId: string;
  player: UnknownRecord;
  profile?: UnknownRecord;
  metrics?: UnknownRecord;
  contact?: UnknownRecord;
  stats?: Array<{ id: string; data: UnknownRecord }>;
  evaluations?: Array<{ id: string; data: UnknownRecord }>;
  videos?: Array<{ id: string; data: UnknownRecord }>;
}) {
  const player = pick(input.player, PLAYER_FIELDS);
  const playerPhoto = safeUrl(input.player.photoURL);
  if (playerPhoto) player.photoURL = playerPhoto;

  const profile = pick(input.profile || {}, PROFILE_FIELDS);
  const profilePhoto = safeUrl(input.profile?.photoURL);
  if (profilePhoto) profile.photoURL = profilePhoto;
  const photos = safeUrls(input.profile?.photos);
  if (photos.length) profile.photos = photos;

  const metrics = Object.fromEntries(
    Object.entries(input.metrics || {}).filter(([key]) => !PRIVATE_METRIC_FIELDS.has(key)),
  );

  const stats = (input.stats || []).map(({ id, data }) => ({
    id,
    ...Object.fromEntries(Object.entries(data).filter(([key]) => !STAT_PRIVATE_FIELDS.has(key))),
  }));

  const evaluations = (input.evaluations || []).map(({ id, data }) => ({
    id,
    ...pick(data, ['coachName', 'authorName', 'overall', 'athleticism', 'skillLevel', 'gameIQ', 'leadership']),
  }));

  const videos = (input.videos || []).flatMap(({ id, data }) => {
    const url = safeUrl(data.url);
    if (!url) return [];
    const video: Record<string, unknown> = {
      id,
      ...pick(data, ['title', 'type', 'description', 'isTacticalClip', 'startAt', 'endAt', 'segments']),
      url,
    };
    const thumbnailUrl = safeUrl(data.thumbnailUrl);
    if (thumbnailUrl) video.thumbnailUrl = thumbnailUrl;
    return [video];
  });

  return {
    playerId: input.playerId,
    player,
    profile,
    metrics,
    contact: typeof input.contact?.coachEmail === 'string' &&
      PUBLIC_EMAIL_PATTERN.test(input.contact.coachEmail.trim())
      ? { coachEmail: input.contact.coachEmail.trim().slice(0, 254) }
      : {},
    stats,
    evaluations,
    videos,
  };
}
