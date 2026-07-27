type UnknownRecord = Record<string, unknown>;

const PUBLIC_PLAYER_FIELDS = [
  'firstName', 'lastName', 'name', 'displayName', 'fullName', 'photoURL',
  'position', 'primaryPosition', 'jersey', 'school', 'gradYear', 'height',
  'weight', 'clubName', 'hometown', 'graduationYear', 'gpa', 'dominantHand',
] as const;

const PUBLIC_PROFILE_FIELDS = [
  'firstName', 'lastName', 'fullName', 'photoURL', 'typeOfSport', 'status',
  'primaryPosition', 'secondaryPosition', 'height', 'weight', 'dominantHand',
  'hometown', 'graduationYear', 'academicGPA', 'intendedMajor', 'school',
  'teamName', 'jerseyNumber', 'bio', 'institutionalPulse', 'downloadsDisabled',
] as const;

const PUBLIC_METRIC_FIELDS = [
  'height', 'weight', 'graduationYear', 'academicGPA', 'school', 'verified',
  'fortyYard', 'vertical', 'benchPress', 'speedRating', 'agilityRating',
  'strengthRating', 'sixtyYardDash', 'exitVelo', 'throwingVelo', 'popTime',
  'pitchVelo', 'infieldVelo', 'batSpeed', 'launchAngle', 'sprintHome',
  'verticalJump', 'fieldingRange', 'armStrength', 'reactionTime', 'broadJump',
  'threeConeDrill', 'twentyYardShuttle', 'squat', 'powerClean', 'wingspan',
  'shuttleRun', 'beepTest', 'sprintSpeed', 'vo2Max', 'passingAcc', 'shotPower',
  'serveVelo', 'forehandVelo', 'backhandVelo', 'footworkDrill', 'firstServePerc',
  'rallyConsist', 'clubSpeed', 'ballSpeed', 'smashFactor', 'spinRate',
  'carryDistance', 'attackAngle', 'clubPath', 'faceAngle', 'dynamicLoft',
  'agility', 'strength', 'sprint', 'endurance', 'flexibility', 'explosiveness',
  'coordination', 'balance',
] as const;

function safeString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeUrl(value: unknown): string | undefined {
  const url = safeString(value, 2_000);
  if (!url) return undefined;
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function publicScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'boolean') return value;
  return safeNumber(value) ?? safeString(value);
}

function pickPublicFields(source: UnknownRecord, fields: readonly string[]): UnknownRecord {
  return fields.reduce<UnknownRecord>((result, field) => {
    const value = publicScalar(source[field]);
    if (value !== undefined) result[field] = value;
    return result;
  }, {});
}

function publicStringArray(value: unknown, maxItems = 40, maxLength = 160): string[] {
  return Array.isArray(value)
    ? value.map(item => safeString(item, maxLength)).filter((item): item is string => Boolean(item)).slice(0, maxItems)
    : [];
}

function publicStats(stats: UnknownRecord[]): UnknownRecord[] {
  return stats.slice(0, 50).map(stat => ({
    season: safeString(stat.season, 40) || 'Season',
    gamesPlayed: safeNumber(stat.gamesPlayed) || 0,
    points: safeNumber(stat.points) || 0,
    assists: safeNumber(stat.assists) || 0,
  }));
}

function publicVideos(videos: UnknownRecord[]): UnknownRecord[] {
  return videos.slice(0, 50).flatMap(video => {
    const url = safeUrl(video.url);
    if (!url) return [];
    return [{
      id: safeString(video.id, 200) || '',
      url,
      thumbnailUrl: safeUrl(video.thumbnailUrl),
      title: safeString(video.title, 160) || 'Highlight',
      description: safeString(video.description, 1_000),
      type: safeString(video.type, 40) || 'video',
      isTacticalClip: video.isTacticalClip === true,
      startAt: safeNumber(video.startAt),
      endAt: safeNumber(video.endAt),
      segments: Array.isArray(video.segments) ? video.segments.slice(0, 25) : undefined,
    }];
  });
}

export function buildPublicRecruitingProfile(input: {
  player: UnknownRecord;
  profile: UnknownRecord;
  metrics: UnknownRecord;
  stats: UnknownRecord[];
  videos: UnknownRecord[];
}) {
  const player = pickPublicFields(input.player, PUBLIC_PLAYER_FIELDS);
  const profile = pickPublicFields(input.profile, PUBLIC_PROFILE_FIELDS);
  const metrics = pickPublicFields(input.metrics, PUBLIC_METRIC_FIELDS);
  const photoURL = safeUrl(input.player.photoURL);
  const profilePhotoURL = safeUrl(input.profile.photoURL);
  const photos = publicStringArray(input.profile.photos, 24, 2_000).filter(url => Boolean(safeUrl(url)));
  const customStats = Array.isArray(input.metrics.customStats)
    ? input.metrics.customStats.slice(0, 20).flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const record = item as UnknownRecord;
      const label = safeString(record.label, 80);
      const value = publicScalar(record.value);
      return label && value !== undefined ? [{ label, value }] : [];
    })
    : [];

  // URLs require stricter validation than ordinary display strings.
  delete player.photoURL;
  delete profile.photoURL;
  if (photoURL) player.photoURL = photoURL;
  if (profilePhotoURL) profile.photoURL = profilePhotoURL;
  if (photos.length) profile.photos = photos;
  if (customStats.length) metrics.customStats = customStats;
  if (Array.isArray(input.player.skills)) player.skills = publicStringArray(input.player.skills);
  if (Array.isArray(input.player.achievements)) player.achievements = publicStringArray(input.player.achievements);

  return {
    player,
    profile,
    metrics,
    stats: publicStats(input.stats),
    videos: publicVideos(input.videos),
  };
}
