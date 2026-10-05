/** Calendar-feed URLs are bearer credentials, so public failures are non-enumerating. */
export function publicCalendarFeedFailure(_reason: string): { status: 404; body: string } {
  return { status: 404, body: 'Calendar feed not found.' };
}

const OPAQUE_CALENDAR_TOKEN = /\b[a-f0-9]{64}\b/gi;
const URL_CANDIDATE = /\b(?:https?|webcal|calendar):\/\/[^\s<>"']+/gi;

/**
 * Calendar event metadata is untrusted free-form input but the generated ICS
 * document is publicly readable by anyone holding its subscription URL. Do
 * not serialize bearer-token-shaped values or action/subscription URLs into
 * that public body. Keeping this boundary separately testable also lets the
 * local evidence recorder use the same policy.
 */
export function redactCalendarFeedPublicResponse<T>(value: T): T {
  if (typeof value === 'string') {
    const withoutSensitiveUrls = value.replace(URL_CANDIDATE, candidate => {
      const decoded = candidate.replace(/&amp;/gi, '&');
      return /(?:[?&](?:token|oobcode|actioncode|secret|signature|key)=|\b[a-f0-9]{64}\b|\/(?:action|subscribe|feed)\/)/i.test(decoded)
        ? '[redacted-url]'
        : candidate;
    });
    return withoutSensitiveUrls.replace(OPAQUE_CALENDAR_TOKEN, '[redacted]') as T;
  }
  if (Array.isArray(value)) return value.map(item => redactCalendarFeedPublicResponse(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      redactCalendarFeedPublicResponse(item),
    ])) as T;
  }
  return value;
}
