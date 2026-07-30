import {
  differenceInCalendarDays,
  format,
  formatDistanceStrict,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';

/**
 * Human labels for a task's two dates.
 *
 * ## The distinction this module exists to protect
 *
 * The brief names *"date-time"* and *"deadline"* as separate fields, which users
 * routinely conflate — and so do implementations. `scheduledAt` is when you intend
 * to work on something; `dueAt` is when it becomes late. The countdown and the
 * overdue signal come from **`dueAt` only**, never from `scheduledAt`.
 *
 * That rule is enforced structurally rather than by comment: {@link describeDue}
 * and {@link describeScheduled} take one date each, so there is no call site where
 * the wrong field could be passed to the overdue logic.
 *
 * Every function takes `now` explicitly. Reading the clock inside a formatter makes
 * it untestable at the boundaries that matter — "due in 1 hour" versus "overdue by
 * 1 minute" is exactly where the bugs are.
 *
 * @see docs/ui-spec.md §5
 */

/**
 * A rendered deadline, in both the forms a caller might need.
 *
 * ⚠️ Two fields rather than one, and the reason is a bug this shape prevents.
 * The two renderings carry *different content*, not different wording: `text` is
 * a date ("Tomorrow 9:00 AM"), `overdueText` is an elapsed duration ("Overdue by
 * 3 days"). Collapsing them into one string and letting the caller prefix "Due
 * by" produces **"Due by Overdue by 3 days"** the moment a caller wants the
 * neutral form for a past date — which is exactly what a completed task needs.
 */
export interface DateLabel {
  /** The date itself, always neutral. Safe to prefix with "Due by". */
  text: string;
  /**
   * How late it is, or `null` when the deadline has not passed.
   *
   * A caller that wants to suppress lateness — a completed task, say — can use
   * {@link DateLabel.text} and simply ignore this.
   */
  overdueText: string | null;
}

/** Time of day, e.g. `9:00 AM`. */
function timeOfDay(date: Date): string {
  return format(date, 'h:mm a');
}

/**
 * Calendar-relative wording for a date the user is looking at today.
 *
 * ⚠️ Uses `differenceInCalendarDays`, not elapsed hours. "Tomorrow" is a property
 * of the calendar, not of a 24-hour window: at 11pm, something due at 1am is two
 * hours away and *tomorrow*, and saying "today" would be wrong in the way people
 * actually notice.
 */
function calendarPrefix(date: Date, now: Date): string | null {
  if (isToday(date)) {
    return 'Today';
  }
  if (isTomorrow(date)) {
    return 'Tomorrow';
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  // Inside the coming week, a weekday name reads faster than a date.
  const days = differenceInCalendarDays(date, now);
  if (days > 0 && days < 7) {
    return format(date, 'EEEE');
  }
  return null;
}

/**
 * Describes a **deadline**.
 *
 * @param dueAt ISO 8601, or null/undefined when the task has no deadline.
 * @param now The current time, injected.
 * @returns A label, or `null` when there is no deadline to describe — a task
 *   without one shows no chip at all rather than an empty or "no deadline" chip.
 */
export function describeDue(
  dueAt: string | null | undefined,
  now: Date,
): DateLabel | null {
  if (!dueAt) {
    return null;
  }

  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const prefix = calendarPrefix(date, now);
  const text = prefix ? `${prefix} ${timeOfDay(date)}` : format(date, 'd MMM');

  if (date.getTime() < now.getTime()) {
    return {
      text,
      // `formatDistanceStrict` rather than the fuzzy `formatDistance`: "overdue
      // by about 1 month" is a strange thing to tell someone about their own
      // deadline.
      overdueText: `Overdue by ${formatDistanceStrict(date, now)}`,
    };
  }

  return { text, overdueText: null };
}

/**
 * Describes when the user plans to *work on* a task.
 *
 * Returns a bare string, not a {@link DateLabel}: a scheduled time that has passed
 * is not late — you simply did not start when you meant to — so there is no
 * overdue concept here to return. This asymmetry is the point.
 *
 * @param scheduledAt ISO 8601, or null/undefined.
 * @param now The current time, injected.
 * @returns The label, or `null` when nothing is scheduled.
 */
export function describeScheduled(
  scheduledAt: string | null | undefined,
  now: Date,
): string | null {
  if (!scheduledAt) {
    return null;
  }

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const prefix = calendarPrefix(date, now);
  return prefix
    ? `${prefix} ${timeOfDay(date)}`
    : format(date, 'd MMM, h:mm a');
}

/**
 * Full date and time, for the composer's selected-value display.
 *
 * Unabbreviated on purpose: the row is a glance, but confirming what you just
 * picked deserves the unambiguous form.
 *
 * @param iso ISO 8601 string.
 * @returns e.g. `Fri 31 Jul, 5:00 PM`.
 */
export function formatFullDateTime(iso: string): string {
  return format(new Date(iso), 'EEE d MMM, h:mm a');
}
