/** Calendar-date arithmetic avoids device timezone and daylight-saving shifts. */
export function buildPlayingWindows(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
) {
  const start = Date.parse(`${startDate}T12:00:00Z`),
    end = Date.parse(`${endDate}T12:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString().slice(0, 10) !== startDate ||
    new Date(end).toISOString().slice(0, 10) !== endDate ||
    end < start ||
    end - start > 89 * 86400000
  )
    return [];
  return Array.from(
    { length: Math.round((end - start) / 86400000) + 1 },
    (_, i) => ({
      date: new Date(start + i * 86400000).toISOString().slice(0, 10),
      startTime,
      endTime,
    }),
  );
}
