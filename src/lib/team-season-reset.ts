import { createHash } from 'node:crypto';

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
  hasDescendants(path: string): Promise<boolean>;
  storageExists(path: string): Promise<boolean>;
};

type ResetObligationKind = 'storage' | 'player' | 'userMembership' | 'firestore' | 'member';
type ResetObligation = {
  path: string;
  kind: ResetObligationKind;
  targetPath: string;
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
  return categories.sort();
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

function obligationId(operationKey: string, kind: ResetObligationKind, targetPath: string) {
  return createHash('sha256').update(`${operationKey}\0${kind}\0${targetPath}`).digest('hex').slice(0, 32);
}

function obligationRank(kind: ResetObligationKind) {
  return { storage: 0, player: 1, userMembership: 2, firestore: 3, member: 4 }[kind];
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
  const operationKey = categories.join('+');
  const obligationCollection = `teams/${teamId}/seasonResetObligations`;
  const obligations = new Map<string, ResetObligation>();

  for (const record of await adapter.list(obligationCollection)) {
    if (record.data.teamId !== teamId) continue;
    let priorCategories: string[];
    try {
      priorCategories = normalizeCategories(
        Array.isArray(record.data.categories)
          ? record.data.categories
          : String(record.data.operationKey || '').split('+'),
      );
    } catch {
      throw new SeasonResetError('INVALID_OBLIGATION', 'Reset recovery state is invalid.');
    }
    const compatible = categories[0] === 'complete' || priorCategories.join('+') === operationKey;
    if (!compatible) {
      throw new SeasonResetError(
        'UNRESOLVED_OBLIGATIONS',
        'Finish the earlier reset recovery before changing reset categories.',
      );
    }
    const kind = record.data.kind;
    const targetPath = record.data.targetPath;
    if (!['storage', 'player', 'userMembership', 'firestore', 'member'].includes(kind) || typeof targetPath !== 'string') {
      throw new SeasonResetError('INVALID_OBLIGATION', 'Reset recovery state is invalid.');
    }
    obligations.set(record.path, { path: record.path, kind, targetPath });
  }

  const register = (kind: ResetObligationKind, targetPath: string) => {
    const path = `${obligationCollection}/${obligationId(operationKey, kind, targetPath)}`;
    obligations.set(path, { path, kind, targetPath });
  };

  for (const record of records) {
    if (record.path === ownerMemberPath) continue;
    if (record.path.startsWith(`teams/${teamId}/members/`)) {
      const userId = typeof record.data.userId === 'string' ? record.data.userId : '';
      if (userId && userId !== ownerUid) register('userMembership', `users/${userId}/teamMemberships/${teamId}`);
      const playerId = typeof record.data.playerId === 'string' ? record.data.playerId : '';
      if (playerId) {
        const playerPath = `players/${playerId}`;
        if (await adapter.get(playerPath)) register('player', playerPath);
      }
      register('member', record.path);
    } else {
      register('firestore', record.path);
    }
    if (record.path.startsWith(`teams/${teamId}/files/`) && typeof record.data.storagePath === 'string') {
      if (!record.data.storagePath.startsWith(`teams/${teamId}/`)) {
        throw new SeasonResetError('UNSAFE_STORAGE_PATH', 'Reset refused an object outside the active squad.');
      }
      register('storage', record.data.storagePath);
    }
  }

  for (const obligation of obligations.values()) {
    await retry(`obligation:${obligation.path}`, () => adapter.update(obligation.path, {
      teamId,
      operationKey,
      categories,
      kind: obligation.kind,
      targetPath: obligation.targetPath,
    }), maxAttempts);
  }

  let storageDeleted = 0;
  let firestoreDeleted = 0;
  let projectionsUpdated = 0;
  const ordered = [...obligations.values()].sort((left, right) => obligationRank(left.kind) - obligationRank(right.kind));
  for (const obligation of ordered) {
    const path = obligation.targetPath;
    if (obligation.kind === 'storage') {
      await retry(`storage:${path}`, async () => {
        await adapter.removeStorage(path);
        if (await adapter.storageExists(path)) throw new Error('storage object remains');
      }, maxAttempts);
      storageDeleted += 1;
    } else if (obligation.kind === 'player') {
      await retry(`firestore:${path}`, async () => {
        await adapter.removePlayerTeamAssociation(path, teamId);
        const player = await adapter.get(path);
        if (player && (player.primaryTeamId === teamId || (Array.isArray(player.joinedTeamIds) && player.joinedTeamIds.includes(teamId)))) {
          throw new Error('player association remains');
        }
      }, maxAttempts);
      projectionsUpdated += 1;
    } else {
      await retry(`firestore:${path}`, async () => {
        await adapter.remove(path);
        if (await adapter.get(path) || await adapter.hasDescendants(path)) throw new Error('Firestore target remains');
      }, maxAttempts);
      firestoreDeleted += 1;
    }
    await retry(`obligation:${obligation.path}`, async () => {
      await adapter.remove(obligation.path);
      if (await adapter.get(obligation.path) || await adapter.hasDescendants(obligation.path)) throw new Error('reset obligation remains');
    }, maxAttempts);
  }

  return Object.freeze({
    teamId,
    categories: Object.freeze(categories),
    firestoreDeleted,
    storageDeleted,
    projectionsUpdated,
  });
}
