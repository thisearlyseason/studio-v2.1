"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicCalendarFeedFailure = publicCalendarFeedFailure;
exports.redactCalendarFeedPublicResponse = redactCalendarFeedPublicResponse;
/** Calendar-feed URLs are bearer credentials, so public failures are non-enumerating. */
function publicCalendarFeedFailure(_reason) {
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
function redactCalendarFeedPublicResponse(value) {
    if (typeof value === 'string') {
        const withoutSensitiveUrls = value.replace(URL_CANDIDATE, candidate => {
            const decoded = candidate.replace(/&amp;/gi, '&');
            return /(?:[?&](?:token|oobcode|actioncode|secret|signature|key)=|\b[a-f0-9]{64}\b|\/(?:action|subscribe|feed)\/)/i.test(decoded)
                ? '[redacted-url]'
                : candidate;
        });
        return withoutSensitiveUrls.replace(OPAQUE_CALENDAR_TOKEN, '[redacted]');
    }
    if (Array.isArray(value))
        return value.map(item => redactCalendarFeedPublicResponse(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            redactCalendarFeedPublicResponse(item),
        ]));
    }
    return value;
}
//# sourceMappingURL=calendar-feed-public-boundary.js.map