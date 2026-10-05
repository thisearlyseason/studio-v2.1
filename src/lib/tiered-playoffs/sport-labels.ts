export type TieredScoreLabels = {
  forLabel: string;
  againstLabel: string;
  differentialLabel: string;
};

export function tieredScoreLabels(sport: string | null | undefined): TieredScoreLabels {
  const normalized = String(sport || '').trim().toLowerCase();
  if (normalized.includes('baseball') || normalized.includes('softball')) {
    return { forLabel: 'Runs For', againstLabel: 'Runs Against', differentialLabel: 'Run Differential' };
  }
  if (normalized.includes('basketball')) {
    return { forLabel: 'Points For', againstLabel: 'Points Against', differentialLabel: 'Point Differential' };
  }
  if (normalized.includes('hockey') || normalized.includes('soccer')) {
    return { forLabel: 'Goals For', againstLabel: 'Goals Against', differentialLabel: 'Goal Differential' };
  }
  return { forLabel: 'Points For', againstLabel: 'Points Against', differentialLabel: 'Differential' };
}
