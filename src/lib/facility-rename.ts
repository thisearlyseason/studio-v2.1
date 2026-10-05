export type FacilityRenameContext = {
  facilityId: string;
  oldFacilityName: string;
  newFacilityName?: string;
  oldFieldName?: string;
  newFieldName?: string;
};

type RecordLike = Record<string, any>;

export function getFacilityFieldName(value: string): string {
  const separator = value.indexOf(':');
  return separator >= 0 ? value.slice(separator + 1) : value;
}

function renameLocation(value: unknown, context: FacilityRenameContext): unknown {
  if (typeof value !== 'string') return value;

  let next = value;
  if (context.newFacilityName && context.newFacilityName !== context.oldFacilityName) {
    if (next === context.oldFacilityName) {
      next = context.newFacilityName;
    } else if (next.startsWith(`${context.oldFacilityName} - `)) {
      next = `${context.newFacilityName}${next.slice(context.oldFacilityName.length)}`;
    }
  }

  if (context.oldFieldName && context.newFieldName && context.oldFieldName !== context.newFieldName) {
    if (next === context.oldFieldName) {
      next = context.newFieldName;
    } else {
      const facilityName = context.newFacilityName || context.oldFacilityName;
      const oldQualifiedName = `${facilityName} - ${context.oldFieldName}`;
      if (next === oldQualifiedName) {
        next = `${facilityName} - ${context.newFieldName}`;
      }
    }
  }

  return next;
}

function renameSelectedFields(
  fields: unknown,
  context: FacilityRenameContext,
  includeLegacyFieldName: boolean
): unknown {
  if (!Array.isArray(fields) || !context.oldFieldName || !context.newFieldName) return fields;

  const oldQualifiedField = `${context.facilityId}:${context.oldFieldName}`;
  const newQualifiedField = `${context.facilityId}:${context.newFieldName}`;
  let changed = false;

  const renamedFields = fields.map(field => {
    if (field === oldQualifiedField) {
      changed = true;
      return newQualifiedField;
    }
    if (includeLegacyFieldName && field === context.oldFieldName) {
      changed = true;
      return context.newFieldName;
    }
    return field;
  });
  return changed ? renamedFields : fields;
}

function renameGames(games: unknown, context: FacilityRenameContext): unknown {
  if (!Array.isArray(games)) return games;
  let changed = false;
  const renamedGames = games.map(game => {
    if (!game || typeof game !== 'object') return game;
    const location = renameLocation((game as RecordLike).location, context);
    if (location === (game as RecordLike).location) return game;
    changed = true;
    return { ...game, location };
  });
  return changed ? renamedGames : games;
}

export function buildEventRenameUpdates(
  event: RecordLike,
  context: FacilityRenameContext
): RecordLike {
  const updates: RecordLike = {};
  const location = renameLocation(event.location, context);
  const manualVenue = renameLocation(event.manualVenue, context);
  const selectedFields = renameSelectedFields(event.selectedFields, context, false);
  const tournamentGames = renameGames(event.tournamentGames, context);

  if (location !== event.location) updates.location = location;
  if (manualVenue !== event.manualVenue) updates.manualVenue = manualVenue;
  if (selectedFields !== event.selectedFields) updates.selectedFields = selectedFields;
  if (tournamentGames !== event.tournamentGames) updates.tournamentGames = tournamentGames;

  return updates;
}

export function buildLeagueRenameUpdates(
  league: RecordLike,
  context: FacilityRenameContext
): RecordLike {
  if (!context.oldFieldName || !context.newFieldName) return {};

  const updates: RecordLike = {};
  const schedulerConfig = league.schedulerConfig;
  if (schedulerConfig && typeof schedulerConfig === 'object') {
    const selectedFields = renameSelectedFields(
      schedulerConfig.selectedFields,
      context,
      true
    );
    if (selectedFields !== schedulerConfig.selectedFields) {
      updates.schedulerConfig = { ...schedulerConfig, selectedFields };
    }
  }

  const schedule = renameGames(league.schedule, context);
  if (schedule !== league.schedule) updates.schedule = schedule;

  return updates;
}
