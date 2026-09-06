/** Calendar-feed URLs are bearer credentials, so public failures are non-enumerating. */
export function publicCalendarFeedFailure(_reason: string): { status: 404; body: string } {
  return { status: 404, body: 'Calendar feed not found.' };
}
