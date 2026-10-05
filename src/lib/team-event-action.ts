export function eventActionNeedsGeneratedId(action: string): boolean {
  return action === 'create' || action === 'create-series';
}
