export const headlinePositions = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;

export type HeadlinePosition = typeof headlinePositions[number];
export const defaultHeadlinePosition: HeadlinePosition = 'bottom-left';

export function readHeadlinePosition(value: unknown): HeadlinePosition {
  const position = headlinePositions.find(position => position === value);
  if (!position) throw new Error('Choose a valid headline position.');
  return position;
}
