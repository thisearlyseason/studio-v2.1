import { RequestBodyError } from './server-request-guards';

export const MAX_HIGHLIGHT_FRAMES = 24;
export const MAX_HIGHLIGHT_PROMPT_CHARS = 2_000;
export const MAX_VIDEO_DURATION_SECONDS = 8 * 60 * 60;

const ALLOWED_FRAME_HOSTS = new Set([
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'freeimage.host',
  'iili.io',
]);

type FrameInput = { timestamp: number; url?: string; base64?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseAllowedFrameUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4_096) {
    throw new RequestBodyError('Each frame must have a valid hosted image URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RequestBodyError('Each frame must have a valid hosted image URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !ALLOWED_FRAME_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new RequestBodyError('Frame URLs must use an approved image host.');
  }

  return url.toString();
}

function parseTimestamp(value: unknown, duration: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > duration) {
    throw new RequestBodyError('Frame timestamps must be within the video duration.');
  }
  return value;
}

function parseFrames(value: unknown, duration: number, requireUrl: boolean): FrameInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HIGHLIGHT_FRAMES) {
    throw new RequestBodyError(`A maximum of ${MAX_HIGHLIGHT_FRAMES} frames may be analyzed at once.`);
  }

  return value.map(frame => {
    if (!isRecord(frame)) throw new RequestBodyError('Each frame must be an object.');
    const parsed: FrameInput = { timestamp: parseTimestamp(frame.timestamp, duration) };
    if (requireUrl) parsed.url = parseAllowedFrameUrl(frame.url);
    return parsed;
  });
}

export function parseHighlightAnalyzeBody(value: unknown): {
  frameUrls: Array<{ timestamp: number; url: string }>;
  frames: Array<{ timestamp: number }>;
  prompt: string;
  videoDuration: number;
} {
  if (!isRecord(value)) throw new RequestBodyError('Request body must be an object.');

  const videoDuration = value.videoDuration;
  if (
    typeof videoDuration !== 'number' ||
    !Number.isFinite(videoDuration) ||
    videoDuration <= 0 ||
    videoDuration > MAX_VIDEO_DURATION_SECONDS
  ) {
    throw new RequestBodyError('Video duration must be between 0 and 8 hours.');
  }

  if (typeof value.prompt !== 'string' || !value.prompt.trim()) {
    throw new RequestBodyError('A scouting prompt is required.');
  }
  const prompt = value.prompt.trim();
  if (prompt.length > MAX_HIGHLIGHT_PROMPT_CHARS) {
    throw new RequestBodyError(`Prompt must be ${MAX_HIGHLIGHT_PROMPT_CHARS} characters or fewer.`);
  }

  const frameUrls = parseFrames(value.frameUrls, videoDuration, true) as Array<{ timestamp: number; url: string }>;
  const frames = parseFrames(value.frames, videoDuration, false).map(frame => ({ timestamp: frame.timestamp }));
  if (frameUrls.length === 0 && frames.length === 0) {
    throw new RequestBodyError('No frames provided.');
  }

  return { frameUrls, frames, prompt, videoDuration };
}

export function parseHighlightGenerateBody(value: unknown): {
  videoUrl: string;
  prompt: string;
  videoDuration: number;
} {
  if (!isRecord(value)) throw new RequestBodyError('Request body must be an object.');
  if (typeof value.videoUrl !== 'string' || value.videoUrl.length > 4_096) {
    throw new RequestBodyError('Video URL is required.');
  }

  let videoUrl: URL;
  try {
    videoUrl = new URL(value.videoUrl);
  } catch {
    throw new RequestBodyError('Video URL must be valid.');
  }
  if (!['http:', 'https:'].includes(videoUrl.protocol) || videoUrl.username || videoUrl.password) {
    throw new RequestBodyError('Video URL must use HTTP or HTTPS without embedded credentials.');
  }

  if (typeof value.prompt !== 'string' || !value.prompt.trim()) {
    throw new RequestBodyError('A scouting prompt is required.');
  }
  const prompt = value.prompt.trim();
  if (prompt.length > MAX_HIGHLIGHT_PROMPT_CHARS) {
    throw new RequestBodyError(`Prompt must be ${MAX_HIGHLIGHT_PROMPT_CHARS} characters or fewer.`);
  }

  const videoDuration = value.videoDuration;
  if (
    typeof videoDuration !== 'number' ||
    !Number.isFinite(videoDuration) ||
    videoDuration <= 0 ||
    videoDuration > MAX_VIDEO_DURATION_SECONDS
  ) {
    throw new RequestBodyError('Video duration must be between 0 and 8 hours.');
  }

  return { videoUrl: videoUrl.toString(), prompt, videoDuration };
}
