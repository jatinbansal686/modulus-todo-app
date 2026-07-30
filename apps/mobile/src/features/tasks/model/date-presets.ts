import { addDays, nextSaturday, setHours, startOfHour } from 'date-fns';

/**
 * The quick-chip row that replaces a date picker for the common cases.
 *
 * ## Why chips instead of the picker
 *
 * `@react-native-community/datetimepicker` on Android opens the stock Material
 * date dialog **and then a separate time dialog** — two system modals, five taps,
 * for the most-used interaction in the app. Nearly every real deadline is one of
 * four or five relative times, so those get one tap each and the picker stays
 * behind a `Custom…` chip for the rest.
 *
 * Every preset is a pure function of an injected `now`, which is what makes the
 * table testable — "This weekend" on a Saturday is exactly the case that gets
 * written wrong and never noticed.
 */

/** Hour presets, so the numbers appear once rather than in each function. */
const EVENING_HOUR = 18;
const NIGHT_HOUR = 21;
const MORNING_HOUR = 9;

/** Sets a whole hour on a date, zeroing everything below it. */
function atHour(date: Date, hour: number): Date {
  return startOfHour(setHours(date, hour));
}

/** One chip: what it says, and what it resolves to. */
export interface DatePreset {
  /** Stable key for lists and tests. */
  id: string;
  /** Chip text. */
  label: string;
  /** Resolves the preset against the current time. */
  resolve: (now: Date) => Date;
}

/**
 * The presets, in the order they appear.
 *
 * Ordered by how soon they are, so the row reads as a timeline left to right.
 */
export const DATE_PRESETS: readonly DatePreset[] = [
  {
    id: 'today-evening',
    label: 'Today 6pm',
    resolve: (now) => atHour(now, EVENING_HOUR),
  },
  {
    id: 'tonight',
    label: 'Tonight',
    resolve: (now) => atHour(now, NIGHT_HOUR),
  },
  {
    id: 'tomorrow-morning',
    label: 'Tomorrow 9am',
    resolve: (now) => atHour(addDays(now, 1), MORNING_HOUR),
  },
  {
    id: 'this-weekend',
    label: 'This weekend',
    /*
     * ⚠️ `nextSaturday` is strictly forward-looking: on a Saturday it returns the
     * *following* Saturday, which is a week away and not what "this weekend"
     * means to someone standing in it. Saturday and Sunday therefore resolve to
     * today, at a plausible weekend hour.
     *
     * Covered by the table-driven tests, because this is the case that gets
     * written as a bare `nextSaturday(now)` and is only wrong two days in seven —
     * i.e. rarely enough to survive manual testing.
     */
    resolve: (now) => {
      const day = now.getDay();
      const isWeekend = day === 0 || day === 6;
      return atHour(isWeekend ? now : nextSaturday(now), MORNING_HOUR);
    },
  },
];

/**
 * Whether a chosen date is the one a preset would produce right now.
 *
 * Used to show a chip as selected. Compares to the minute rather than exactly,
 * because the stored value is an ISO string that has been through a round trip
 * and `now` has moved on since the tap.
 *
 * @param preset The chip in question.
 * @param iso The currently selected value, if any.
 * @param now The current time, injected.
 * @returns True when the chip should render as selected.
 */
export function isPresetSelected(
  preset: DatePreset,
  iso: string | null | undefined,
  now: Date,
): boolean {
  if (!iso) {
    return false;
  }
  const selected = new Date(iso);
  if (Number.isNaN(selected.getTime())) {
    return false;
  }
  const resolved = preset.resolve(now);
  return (
    selected.getFullYear() === resolved.getFullYear() &&
    selected.getMonth() === resolved.getMonth() &&
    selected.getDate() === resolved.getDate() &&
    selected.getHours() === resolved.getHours()
  );
}
