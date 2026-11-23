import { format } from 'date-fns';

export function formatActivityTime(value?: string | null): string {
  value = value?.trim();
  if (!value) return 'TBD';
  try { return format(new Date('2000-01-01T' + value), 'h:mm a'); }
  catch { return value; }
}
