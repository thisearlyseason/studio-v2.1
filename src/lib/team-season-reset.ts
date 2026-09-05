const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const CATEGORY_COLLECTIONS = Object.freeze({
  games: ['games'],
  events: ['events'],
  roster: ['members'],
});

const COMPLETE_COLLECTIONS = Object.freeze([
  'games', 'events', 'members', 'incidents', 'equipment', 'groupChats',
  'feedPosts', 'files', 'documents',
]);

type ResetRecord = { path: string; id: string; data: Record<string, any> };

export type TeamSeasonResetAdapter = {
  get(path: string): Promise<Record<string, any> | null>;
  list(collectionPath: string): Promise<ResetRecord[]>;
  remove(path: string): Promise<void>;
  update(path: string, patch: Record<string, unknown>): Promise<void>;
  removePlayerTeamAssociation(path: string, teamId: string): Promise<void>;
  removeStorage(path: string): Promise<void>;
};

export class SeasonResetError extends Error {
  code: string;
  summary?: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, summary?: Record<string, unknown>) {
    super(message);
    this.name = 'SeasonResetError';
    this.code = code;
    this.summary = summary ? Object.freeze({ ...summary }) : undefined;
  }
}

function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string')) {
    throw new SeasonResetError('INVALID_CATEGORIES', 'Choose at least one supported reset category.');
  }
  const categories = [...new Set(value.map(item => item.trim()))];
  if (categories.includes('complete')) return categories.length === 1
    ? ['complete']
    : (() => { throw new SeasonResetError('INVALID_CATEGORIES', 'Complete reset cannot be combined with other categories.'); })();
  if (categories.some(category => !Object.hasOwn(CATEGORY_COLLECTIONS, category))) {
    throw new SeasonResetError('INVALID_CATEGORIES', 'Choose only supported reset categories.');
  }
  return categories;
}

async function retry(label: string, operation: () => Promise<void>, maxAttempts: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new SeasonResetError('PARTIAL_FAILURE', `Unable to reset ${label}.`, {
    target: label,
    attempts: maxAttempts,
    diagnostic: lastError instanceof Error ? lastError.message.slice(0, 160) : 'reset operation failed',
  });
}

export async function executeTeamSeasonReset({
  teamId,
  ownerUid,
  categories: requestedCategories,
  adapter,
  maxAttempts = 2,
}: {
  teamId: string;
  ownerUid: string;
  categories: unknown;
  adapter: TeamSeasonResetAdapter;
  maxAttempts?: number;
}) {
  const categories = normalizeCategories(requestedCategories);
  if (!TEAM_ID_PATTERN.test(teamId) || !TEAM_ID_PATTERN.test(ownerUid) || !adapter || maxAttempts < 1 || maxAttempts > 3) {
    throw new SeasonResetError('INVALID_REQUEST', 'Reset request is invalid.');
  }
  const team = await adapter.get(`teams/${teamId}`);
  if (!team) throw new SeasonResetError('NOT_FOUND', 'Squad not found.');
  if (team.ownerUserId !== ownerUid) throw new SeasonResetError('FORBIDDEN', 'Only the squad owner can reset a season.');

  const collectionNames = categories[0] === 'complete'
    ? [...COMPLETE_COLLECTIONS]
    : [...new Set(categories.flatMap(category => CATEGORY_COLLECTIONS[category as keyof typeof CATEGORY_COLLECTIONS]))];
  const records = (await Promise.all(collectionNames.map(name => adapter.list(`teams/${teamId}/${name}`)))).flat();
  const ownerMemberPath = `teams/${teamId}/members/${ownerUid}`;
  const removals = new Set<string>();
  const playerUpdates = new Set<string>();
  const storagePaths = new Set<string>();

  for (const record of records) {
    if (record.path === ownerMemberPath) continue;
    removals.add(record.path);
    if (record.path.startsWith(`teams/${teamId}/members/`)) {
      const userId = typeof record.data.userId === 'string' ? record.data.userId : '';
      if (userId && userId !== ownerUid) removals.add(`users/${userId}/teamMemberships/${teamId}`);
      const playerId = typeof record.data.playerId === 'string' ? record.data.playerId : '';
      if (playerId) {
        const playerPath = `players/${playerId}`;
        if (await adapter.get(playerPath)) playerUpdates.add(playerPath);
      }
    }
    if (record.path.startsWith(`teams/${teamId}/files/`) && typeof record.data.storagePath === 'string') {
      if (!record.data.storagePath.startsWith(`teams/${teamId}/`)) {
        throw new SeasonResetError('UNSAFE_STORAGE_PATH', 'Reset refused an object outside the active squad.');
      }
      storagePaths.add(record.data.storagePath);
    }
  }

  let storageDeleted = 0;
  let firestoreDeleted = 0;
  let projectionsUpdated = 0;
  for (const path of storagePaths) {
    await retry(`storage:${path}`, () => adapter.removeStorage(path), maxAttempts);
    storageDeleted += 1;
  }
  // Reconcile the projection before deleting the member document that acts as
  // the durable discovery source for retry. The adapter owns the transaction,
  // so a concurrent join cannot be overwritten by a stale captured array.
  for (const path of playerUpdates) {
    await retry(`firestore:${path}`, () => adapter.removePlayerTeamAssociation(path, teamId), maxAttempts);
    projectionsUpdated += 1;
  }
  for (const path of removals) {
    await retry(`firestore:${path}`, () => adapter.remove(path), maxAttempts);
    firestoreDeleted += 1;
  }

  return Object.freeze({
    teamId,
    categories: Object.freeze(categories),
    firestoreDeleted,
    storageDeleted,
    projectionsUpdated,
  });
}
