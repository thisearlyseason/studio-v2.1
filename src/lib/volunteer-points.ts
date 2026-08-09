export function volunteerPoints(opportunity: { points?: unknown; pointsPerSlot?: unknown }): number {
  const value = Number(opportunity.points ?? opportunity.pointsPerSlot ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
