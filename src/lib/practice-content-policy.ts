export const MAX_PRACTICE_TITLE_LENGTH = 120;
export const MAX_PRACTICE_DESCRIPTION_LENGTH = 5000;
export const MAX_PRACTICE_URL_LENGTH = 2048;
export const MAX_PRACTICE_VIDEO_BYTES = 500 * 1024 * 1024;

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);

type DrillSummary = { id?: string; title?: string; estimatedTime?: string | number };

function hasValidDuration(value: unknown): boolean {
  if (value == null || value === '') return true;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= 1440;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?$/i);
  if (!match) return false;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 1440;
}

export function validatePracticeTemplate(
  value: { title?: string; description?: string; drillIds?: string[] },
  drills: DrillSummary[],
): string | null {
  const title = value.title?.trim() || '';
  if (!title) return 'A protocol title is required.';
  if (title.length > MAX_PRACTICE_TITLE_LENGTH) return `Protocol title cannot exceed ${MAX_PRACTICE_TITLE_LENGTH} characters.`;
  if ((value.description || '').length > MAX_PRACTICE_DESCRIPTION_LENGTH) return `Protocol description cannot exceed ${MAX_PRACTICE_DESCRIPTION_LENGTH} characters.`;
  if (!Array.isArray(value.drillIds) || value.drillIds.length === 0) return 'Select at least one drill block.';
  const selected = new Set(value.drillIds);
  if (drills.some(drill => drill.id && selected.has(drill.id) && !hasValidDuration(drill.estimatedTime))) return 'Every selected drill must have a valid duration.';
  return null;
}

export function validatePracticeDrill(
  value: { id?: string; title?: string; description?: string; estimatedTime?: string | number },
  existing: DrillSummary[],
): string | null {
  const title = value.title?.trim() || '';
  if (!title) return 'A drill title is required.';
  if (title.length > MAX_PRACTICE_TITLE_LENGTH) return `Drill title cannot exceed ${MAX_PRACTICE_TITLE_LENGTH} characters.`;
  if (!(value.description?.trim())) return 'Strategic instructions are required.';
  if ((value.description || '').length > MAX_PRACTICE_DESCRIPTION_LENGTH) return `Drill instructions cannot exceed ${MAX_PRACTICE_DESCRIPTION_LENGTH} characters.`;
  if (!hasValidDuration(value.estimatedTime)) return 'Enter a valid drill duration in minutes.';
  if (existing.some(drill => drill.id !== value.id && drill.title?.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) return 'A drill with this title already exists.';
  return null;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

export function validatePracticeUrl(value: string): string | null {
  if (!value || value.length > MAX_PRACTICE_URL_LENGTH) return `Video URL must be between 1 and ${MAX_PRACTICE_URL_LENGTH} characters.`;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:') return 'Only HTTPS video URLs are supported.';
    if (url.username || url.password) return 'Credentialed video URLs are not supported.';
    if (!hostname || hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || isPrivateIpv4(hostname)) return 'Private-host video URLs are not supported.';
    return null;
  } catch {
    return 'Enter a valid HTTPS video URL.';
  }
}

export function validatePracticeFilmFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size > MAX_PRACTICE_VIDEO_BYTES) return 'Video exceeds the 500 MB limit.';
  if (!VIDEO_TYPES.has(file.type)) return 'Use an MP4, WebM, QuickTime, or M4V video.';
  return null;
}

export function parsePracticeTimestamp(value: string, durationSeconds?: number): number {
  const match = value.trim().match(/^(\d+):(\d{2})$/);
  if (!match) throw new Error('Enter a valid timestamp in minutes:seconds.');
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds) || seconds >= 60) throw new Error('Enter a valid timestamp in minutes:seconds.');
  const total = minutes * 60 + seconds;
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && total > durationSeconds) throw new Error('Timestamp cannot exceed the video duration.');
  return total;
}
