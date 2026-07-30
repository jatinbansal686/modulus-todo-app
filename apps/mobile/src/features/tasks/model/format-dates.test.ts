import { DATE_PRESETS, isPresetSelected } from './date-presets';
import { describeDue, describeScheduled } from './format-dates';

/**
 * A pinned "now": Thursday 30 July 2026, 14:00 local time.
 *
 * Constructed from local parts rather than parsed from a UTC string, because
 * every function under test reasons in the device's timezone — the whole point of
 * "Today" and "Tomorrow" — and a UTC literal would silently shift the calendar
 * boundaries depending on where the suite runs.
 */
const NOW = new Date(2026, 6, 30, 14, 0, 0);

/** Builds a local-time ISO string offset from {@link NOW}. */
function at(dayOffset: number, hour: number, minute = 0): string {
  return new Date(2026, 6, 30 + dayOffset, hour, minute, 0).toISOString();
}

describe('describeDue', () => {
  it.each([
    ['no deadline at all', null],
    ['undefined', undefined],
    ['an unparseable string', 'not-a-date'],
  ])('renders no chip for %s', (_case, value) => {
    // A task with no deadline shows nothing, rather than an empty chip or the
    // words "no deadline" taking up a row's worth of attention.
    expect(describeDue(value, NOW)).toBeNull();
  });

  it('says when something is due later today', () => {
    expect(describeDue(at(0, 18), NOW)).toEqual({
      text: 'Today 6:00 PM',
      overdueText: null,
    });
  });

  it('says tomorrow for tomorrow', () => {
    expect(describeDue(at(1, 9), NOW)).toEqual({
      text: 'Tomorrow 9:00 AM',
      overdueText: null,
    });
  });

  /**
   * ⚠️ The case that separates calendar days from elapsed hours.
   *
   * Two hours after 11pm is 1am *tomorrow*. An implementation that bucketed by
   * elapsed time would call this "Today", which is wrong in precisely the way a
   * user notices at the moment it matters most.
   */
  it('calls 1am tomorrow "Tomorrow", even though it is two hours away', () => {
    const lateNight = new Date(2026, 6, 30, 23, 0, 0);
    expect(describeDue(at(1, 1), lateNight)).toEqual({
      text: 'Tomorrow 1:00 AM',
      overdueText: null,
    });
  });

  it('names the weekday for later this week', () => {
    // 3 August 2026 is a Monday.
    expect(describeDue(at(4, 10), NOW)).toEqual({
      text: 'Monday 10:00 AM',
      overdueText: null,
    });
  });

  it('falls back to a date beyond a week out', () => {
    expect(describeDue(at(20, 10), NOW)).toEqual({
      text: '19 Aug',
      overdueText: null,
    });
  });

  it.each([
    ['an hour ago', at(0, 13), 'Overdue by 1 hour'],
    ['two days ago', at(-2, 14), 'Overdue by 2 days'],
    ['a minute ago', at(0, 13, 59), 'Overdue by 1 minute'],
  ])('flags %s as overdue', (_case, dueAt, expected) => {
    const label = describeDue(dueAt, NOW);
    expect(label?.overdueText).toBe(expected);
    // ⚠️ The neutral date is still available, and never carries the lateness
    // wording. A caller rendering `Due by ${text}` on a past deadline — which is
    // what a completed task does — must not get "Due by Overdue by 3 days".
    expect(label?.text).not.toMatch(/Overdue/);
  });

  it('treats a deadline exactly now as not yet overdue', () => {
    // The boundary is strict: at the instant it is due, it is due — not late.
    expect(describeDue(NOW.toISOString(), NOW)?.overdueText).toBeNull();
  });
});

describe('describeScheduled', () => {
  it('describes when work is planned', () => {
    expect(describeScheduled(at(1, 9), NOW)).toBe('Tomorrow 9:00 AM');
  });

  /**
   * The asymmetry with {@link describeDue}, pinned deliberately.
   *
   * A scheduled time in the past is not a failure — you just did not start when
   * you meant to. Only a *deadline* can be late, which is why this function
   * returns a bare string with no overdue flag to get wrong.
   */
  it('does not treat a past scheduled time as late', () => {
    const label = describeScheduled(at(-1, 9), NOW);
    expect(label).toBe('Yesterday 9:00 AM');
    // No overdue concept exists in the return type at all.
    expect(typeof label).toBe('string');
  });

  it('returns nothing when nothing is scheduled', () => {
    expect(describeScheduled(null, NOW)).toBeNull();
  });
});

describe('DATE_PRESETS', () => {
  const byId = (id: string) => {
    const preset = DATE_PRESETS.find((candidate) => candidate.id === id);
    if (!preset) {
      throw new Error(`no preset ${id}`);
    }
    return preset;
  };

  it.each([
    ['today-evening', 30, 18],
    ['tonight', 30, 21],
    ['tomorrow-morning', 31, 9],
  ])('%s resolves to day %s at %s:00', (id, day, hour) => {
    const resolved = byId(id).resolve(NOW);
    expect(resolved.getDate()).toBe(day);
    expect(resolved.getHours()).toBe(hour);
    // Zeroed below the hour, so two taps of the same chip produce the same value.
    expect(resolved.getMinutes()).toBe(0);
    expect(resolved.getSeconds()).toBe(0);
  });

  it('resolves "This weekend" to the coming Saturday on a weekday', () => {
    // NOW is Thursday 30 July 2026; the coming Saturday is 1 August.
    const resolved = byId('this-weekend').resolve(NOW);
    expect(resolved.getDay()).toBe(6);
    expect(resolved.getDate()).toBe(1);
    expect(resolved.getMonth()).toBe(7);
  });

  /**
   * ⚠️ The bug this table exists to catch.
   *
   * `nextSaturday` is strictly forward-looking, so on a Saturday it returns the
   * Saturday a week later. Someone tapping "This weekend" on a Saturday morning
   * means *today*. Wrong only two days in seven, which is exactly rare enough to
   * survive every manual test.
   */
  it.each([
    ['Saturday', new Date(2026, 7, 1, 10, 0, 0), 1],
    ['Sunday', new Date(2026, 7, 2, 10, 0, 0), 2],
  ])(
    'resolves "This weekend" to today when it is already %s',
    (_day, now, expectedDate) => {
      const resolved = byId('this-weekend').resolve(now);
      expect(resolved.getDate()).toBe(expectedDate);
      expect(resolved.getMonth()).toBe(7);
    },
  );
});

describe('isPresetSelected', () => {
  it('marks the chip whose value is currently chosen', () => {
    const preset = DATE_PRESETS[0];
    const chosen = preset.resolve(NOW).toISOString();
    expect(isPresetSelected(preset, chosen, NOW)).toBe(true);
  });

  it('does not mark a different chip', () => {
    const chosen = DATE_PRESETS[0].resolve(NOW).toISOString();
    expect(isPresetSelected(DATE_PRESETS[2], chosen, NOW)).toBe(false);
  });

  it.each([
    ['nothing chosen', null],
    ['an unparseable value', 'garbage'],
  ])('marks nothing for %s', (_case, value) => {
    expect(isPresetSelected(DATE_PRESETS[0], value, NOW)).toBe(false);
  });
});
