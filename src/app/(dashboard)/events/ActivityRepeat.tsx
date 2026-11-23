'use client';

import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { buildRecurringEventDates, recurrenceLabels, type TeamEventRecurrence, type TeamEventRecurrenceFrequency } from '@/lib/team-event-recurrence';

type Props = {
  start: string;
  repeat: TeamEventRecurrence | null;
  onChange: (value: TeamEventRecurrence | null) => void;
};

export function ActivityRepeat({ start, repeat, onChange }: Props) {
  let preview: string[] = [];
  if (start && repeat) {
    try { preview = buildRecurringEventDates(start, repeat.frequency, repeat.count, repeat); }
    catch { /* The selection can be incomplete while editing. */ }
  }
  const selectClass = 'h-11 w-full rounded-xl border px-3 bg-white';
  return <div className="space-y-2">
    <label htmlFor="activity-repeat">Repeat this event</label>
    <select id="activity-repeat" className={selectClass} value={repeat?.frequency || 'none'} onChange={e => {
      const frequency = e.target.value as TeamEventRecurrenceFrequency | 'none';
      onChange(frequency === 'none' ? null : { frequency, count: frequency === 'dates' ? 1 : 2, weekdays: [], dates: [] });
    }}>
      <option value="none">Does not repeat</option>
      {Object.entries(recurrenceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    {repeat?.frequency === 'weekdays' && <fieldset>
      <legend>Repeat on these weekdays</legend>
      <div className="flex flex-wrap gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) =>
          <label key={day} className="flex items-center gap-1 p-1">
            <input type="checkbox" checked={repeat.weekdays?.includes(index) || false} onChange={e => {
              const days = repeat.weekdays || [];
              onChange({ ...repeat, weekdays: e.target.checked ? [...days, index] : days.filter(value => value !== index) });
            }} />{day}
          </label>)}
      </div>
    </fieldset>}
    {repeat?.frequency === 'dates' && (start ? <>
      <p>Select additional dates. The start date is already included.</p>
      <Calendar mode="multiple" max={51} defaultMonth={parseISO(start)} disabled={date => format(date, 'yyyy-MM-dd') <= start}
        selected={repeat.dates?.map(value => parseISO(value))}
        onSelect={selected => {
          const dates = (selected || []).map(value => format(value, 'yyyy-MM-dd'));
          onChange({ ...repeat, dates, count: dates.length + 1 });
        }} />
    </> : <p>Choose a start date first.</p>)}
    {repeat && repeat.frequency !== 'dates' && <>
      <label htmlFor="activity-repeat-count">Total events</label>
      <select id="activity-repeat-count" className={selectClass} value={repeat.count} onChange={e => onChange({ ...repeat, count: Number(e.target.value) })}>
        {Array.from({ length: 51 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </>}
    {preview.length > 0 && <p className="text-sm text-muted-foreground" aria-live="polite">
      {preview.length} events · {preview.slice(0, 3).map(date => format(parseISO(date), 'MMM d, yyyy')).join(' · ')}
      {preview.length > 3 && ' … through ' + format(parseISO(preview[preview.length - 1]), 'MMM d, yyyy')}
    </p>}
  </div>;
}
