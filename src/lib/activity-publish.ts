export type ActivityConflict = { date: string; title: string; time?: string; replaceId?: string; revision?: string };
export type ActivityPublishOptions = {
  draft?: { id: string; version: string };
  skipDates?: string[];
  replace?: { id: string; revision: string }[];
};
export class ActivityConflictError extends Error {
  constructor(public conflicts: ActivityConflict[]) { super('Review scheduling conflicts.'); }
}
