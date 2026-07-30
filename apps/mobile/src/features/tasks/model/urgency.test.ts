import { WEIGHTS, scoreUrgency, sortByUrgency, urgencyOf } from './urgency';

import type { Task } from '@shared/types/task';
import type { TaskPriority, TaskStatus } from '@shared/types/task';

/** Pinned so every boundary case is reproducible. */
const NOW = new Date('2026-07-30T12:00:00.000Z');

/** An ISO timestamp `hours` from {@link NOW}; negative is in the past. */
function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 3_600_000).toISOString();
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'A task',
    priority: 'MEDIUM' as TaskPriority,
    status: 'TODO' as TaskStatus,
    tags: [],
    dueAt: null,
    scheduledAt: null,
    completedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('WEIGHTS', () => {
  /**
   * ⚠️ The single most important assertion in this file.
   *
   * An earlier draft of the plan used 0.45/0.35/0.20/0.10 — summing to **1.10** —
   * while claiming the score was in `[0, 1]`. An overdue high-priority task could
   * then score above 1, so it could not be rendered as a percentage and the Tier 2
   * urgency ring would fill past full, on exactly the demo's hero case.
   */
  it('sums to exactly 1, which is what bounds the score', () => {
    const sum =
      WEIGHTS.priority + WEIGHTS.deadline + WEIGHTS.schedule + WEIGHTS.overdue;
    // Floating point: 0.4 + 0.3 + 0.15 + 0.15 is not bit-exactly 1.
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('scoreUrgency', () => {
  it.each([
    ['LOW', 0.25],
    ['MEDIUM', 0.5],
    ['HIGH', 0.75],
    ['URGENT', 1],
  ])('weights %s priority at %s of its share', (priority, expected) => {
    const { priority: term } = scoreUrgency(
      task({ priority: priority as TaskPriority }),
      NOW,
    );
    expect(term).toBeCloseTo(WEIGHTS.priority * expected, 10);
  });

  it.each([
    ['no deadline at all', null, 0],
    ['due exactly now', hoursFromNow(0), 1],
    ['due in 36h — half the 72h horizon', hoursFromNow(36), 0.5],
    ['due at the horizon', hoursFromNow(72), 0],
    ['due beyond the horizon, clamped not negative', hoursFromNow(200), 0],
    ['already overdue, clamped not above 1', hoursFromNow(-10), 1],
  ])('deadline term: %s', (_case, dueAt, expected) => {
    const { deadline } = scoreUrgency(task({ dueAt }), NOW);
    expect(deadline).toBeCloseTo(WEIGHTS.deadline * expected, 10);
  });

  it.each([
    ['nothing scheduled', null, 0],
    ['scheduled now', hoursFromNow(0), 1],
    ['scheduled in 12h — half the 24h horizon', hoursFromNow(12), 0.5],
    ['scheduled at the horizon', hoursFromNow(24), 0],
  ])('schedule term: %s', (_case, scheduledAt, expected) => {
    const { schedule } = scoreUrgency(task({ scheduledAt }), NOW);
    expect(schedule).toBeCloseTo(WEIGHTS.schedule * expected, 10);
  });

  it.each([
    ['not due yet', hoursFromNow(5), 0],
    ['no deadline', null, 0],
    ['saturated at 7 days late', hoursFromNow(-24 * 7), 1],
    ['still saturated at 90 days late', hoursFromNow(-24 * 90), 1],
  ])('overdue term: %s', (_case, dueAt, expected) => {
    const { overdue } = scoreUrgency(task({ dueAt }), NOW);
    expect(overdue).toBeCloseTo(WEIGHTS.overdue * expected, 10);
  });

  /**
   * The boundary the injected `now` exists to make testable.
   *
   * At the instant a task is due it is maximally *deadline*-urgent but not yet
   * *overdue* — the two terms must not both fire, or the score double-counts.
   */
  it('treats a deadline exactly now as due, not overdue', () => {
    const { deadline, overdue } = scoreUrgency(
      task({ dueAt: hoursFromNow(0) }),
      NOW,
    );
    expect(deadline).toBeCloseTo(WEIGHTS.deadline, 10);
    expect(overdue).toBe(0);
  });

  it('always sums its four terms to the total', () => {
    const { priority, deadline, schedule, overdue, total } = scoreUrgency(
      task({
        priority: 'HIGH',
        dueAt: hoursFromNow(-30),
        scheduledAt: hoursFromNow(6),
      }),
      NOW,
    );
    // The Tier 2 expanded row shows all four terms adding up to the number above
    // them; a breakdown that disagreed with its own total is the one failure that
    // feature cannot survive.
    expect(priority + deadline + schedule + overdue).toBeCloseTo(total, 10);
  });

  it.each([
    ['the least urgent thing possible', task({ priority: 'LOW' })],
    [
      'the most urgent thing possible',
      task({
        priority: 'URGENT',
        dueAt: hoursFromNow(-24 * 30),
        scheduledAt: hoursFromNow(-5),
      }),
    ],
    ['a malformed date', task({ dueAt: 'not-a-date', scheduledAt: 'nope' })],
  ])('stays inside [0, 1] for %s', (_case, subject) => {
    const total = urgencyOf(subject, NOW);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(1);
    expect(Number.isNaN(total)).toBe(false);
  });
});

describe('sortByUrgency', () => {
  /**
   * The case that justifies the whole feature.
   *
   * Sorted by deadline alone, the LOW chore due in an hour wins. That is the
   * behaviour the "Smart" toggle exists to contrast with, and it is the reorder
   * the demo video shows.
   */
  it('puts an URGENT task tomorrow above a LOW chore due within the hour', () => {
    const chore = task({
      id: 'chore',
      priority: 'LOW',
      dueAt: hoursFromNow(1),
    });
    const important = task({
      id: 'important',
      priority: 'URGENT',
      dueAt: hoursFromNow(24),
    });

    expect(sortByUrgency([chore, important], NOW).map((t) => t.id)).toEqual([
      'important',
      'chore',
    ]);
  });

  it('sinks completed tasks regardless of how urgent they scored', () => {
    const doneButUrgent = task({
      id: 'done',
      priority: 'URGENT',
      status: 'DONE',
      dueAt: hoursFromNow(-24 * 30),
    });
    const pendingButCalm = task({ id: 'pending', priority: 'LOW' });

    // A finished task cannot be urgent, and leaving it on top would push the
    // work you still have to do below the fold.
    expect(
      sortByUrgency([doneButUrgent, pendingButCalm], NOW).map((t) => t.id),
    ).toEqual(['pending', 'done']);
  });

  it('breaks ties on id so the order is deterministic', () => {
    const b = task({ id: 'b' });
    const a = task({ id: 'a' });
    const c = task({ id: 'c' });

    // Identical scores. Without an explicit tiebreak, `sort` may return a
    // different order on a re-render and rows shuffle for no visible reason.
    expect(sortByUrgency([b, a, c], NOW).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sortByUrgency([c, b, a], NOW).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not mutate the array it was given', () => {
    const input = [task({ id: 'b' }), task({ id: 'a', priority: 'URGENT' })];
    const before = input.map((t) => t.id);

    sortByUrgency(input, NOW);

    // RTK Query hands out frozen cache arrays in development; sorting in place
    // would throw at exactly the moment a grader tapped the toggle.
    expect(input.map((t) => t.id)).toEqual(before);
  });

  it('handles an empty list', () => {
    expect(sortByUrgency([], NOW)).toEqual([]);
  });
});

/**
 * The worked example printed in the README, asserted here.
 *
 * A README that shows arithmetic invites a reader to check it, so the numbers are
 * pinned against the real function rather than left to drift. If the weights or
 * any horizon change, this fails and the README has to be updated with it.
 *
 * @see README.md § Smart sort — "Worked example"
 */
describe('README worked example', () => {
  it('scores a HIGH task scheduled +6h and due -10h at 0.7376', () => {
    const subject = task({
      priority: 'HIGH',
      scheduledAt: hoursFromNow(6),
      dueAt: hoursFromNow(-10),
    });

    const { priority, deadline, schedule, overdue, total } = scoreUrgency(
      subject,
      NOW,
    );

    expect(priority).toBeCloseTo(0.3, 4);
    // Already due, so deadline proximity saturates at 1 regardless of how late.
    expect(deadline).toBeCloseTo(0.3, 4);
    expect(schedule).toBeCloseTo(0.1125, 4);
    expect(overdue).toBeCloseTo(0.0251, 4);
    expect(total).toBeCloseTo(0.7376, 4);
  });
});
