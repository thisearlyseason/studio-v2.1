export type FacilityDeletionContext = {
  facilityId: string;
  facilityName: string;
  fieldName?: string;
  facilityFieldNames?: string[];
};

type RecordLike = Record<string, any>;

function isMatchingLocation(value: unknown, context: FacilityDeletionContext): boolean {
  if (typeof value !== 'string') return false;

  if (context.fieldName) {
    return (
      value === context.fieldName ||
      value === `${context.facilityName} - ${context.fieldName}`
    );
  }

  if (
    value === context.facilityName ||
    value.startsWith(`${context.facilityName} - `)
  ) {
    return true;
  }

  return (context.facilityFieldNames || []).includes(value);
}

function hasMatchingSelectedField(
  value: unknown,
  context: FacilityDeletionContext
): boolean {
  if (!Array.isArray(value)) return false;

  if (context.fieldName) {
    return value.some(
      field =>
        field === `${context.facilityId}:${context.fieldName}` ||
        field === context.fieldName
    );
  }

  const legacyFieldNames = new Set(context.facilityFieldNames || []);
  return value.some(
    field =>
      (typeof field === 'string' && field.startsWith(`${context.facilityId}:`)) ||
      legacyFieldNames.has(field)
  );
}

function gamesReferenceTarget(value: unknown, context: FacilityDeletionContext): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(
    game =>
      game &&
      typeof game === 'object' &&
      isMatchingLocation((game as RecordLike).location, context)
  );
}

export function getFacilityReferenceReasons(
  record: RecordLike,
  context: FacilityDeletionContext
): string[] {
  const reasons = new Set<string>();

  if (record.facilityId === context.facilityId) reasons.add('facility');
  if (hasMatchingSelectedField(record.selectedFields, context)) reasons.add('selected fields');
  if (isMatchingLocation(record.location, context)) reasons.add('location');
  if (isMatchingLocation(record.manualVenue, context)) reasons.add('manual venue');
  if (gamesReferenceTarget(record.tournamentGames, context)) {
    reasons.add('tournament schedule');
  }
  if (gamesReferenceTarget(record.schedule, context)) reasons.add('league schedule');

  const schedulerFields =
    record.schedulerConfig && typeof record.schedulerConfig === 'object'
      ? record.schedulerConfig.selectedFields
      : undefined;
  if (hasMatchingSelectedField(schedulerFields, context)) {
    reasons.add('scheduler configuration');
  }

  return [...reasons];
}
