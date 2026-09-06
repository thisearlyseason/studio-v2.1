// Serialized into the Playwright CLI run-code sandbox by schedule workflows.
export function observeCalendarResponse(response, baseUrl, tag, actionPath = '/api/calendar/feed') {
  // CLI run-code has no global URL constructor. Responses supply absolute
  // URLs; include the slash to enforce the exact configured origin boundary.
  const responseUrl = response.url();
  if (!responseUrl.startsWith(`${baseUrl}/`)) return null;
  const pathname = responseUrl.slice(baseUrl.length).split(/[?#]/, 1)[0];
  if (response.request().isNavigationRequest() || pathname === actionPath) {
    return { tag, method: response.request().method(), pathname, status: response.status() };
  }
  return null;
}
