import {
  PROACTIVE_REFRESH_MARGIN_MS,
  shouldRefreshNow,
} from './proactive-refresh';

describe('shouldRefreshNow', () => {
  const NOW = Date.parse('2026-07-30T12:00:00.000Z');

  /** Builds an ISO expiry `offsetMs` from `NOW`. */
  const expiryAt = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

  it('does not refresh a token with plenty of life left', () => {
    expect(shouldRefreshNow(expiryAt(10 * 60_000), NOW)).toBe(false);
  });

  it('refreshes a token inside the margin', () => {
    expect(
      shouldRefreshNow(expiryAt(PROACTIVE_REFRESH_MARGIN_MS / 2), NOW),
    ).toBe(true);
  });

  it('refreshes exactly at the margin boundary', () => {
    // Inclusive on purpose: a token expiring in precisely the margin will have
    // expired by the time the round trip completes.
    expect(shouldRefreshNow(expiryAt(PROACTIVE_REFRESH_MARGIN_MS), NOW)).toBe(
      true,
    );
  });

  it('does not refresh one millisecond outside the margin', () => {
    expect(
      shouldRefreshNow(expiryAt(PROACTIVE_REFRESH_MARGIN_MS + 1), NOW),
    ).toBe(false);
  });

  it('refreshes an already-expired token', () => {
    expect(shouldRefreshNow(expiryAt(-60_000), NOW)).toBe(true);
  });

  it('does nothing when there is no expiry to reason about', () => {
    // Signed out, or mid-optimistic-bootstrap. The wrapper handles those on demand;
    // guessing here would fire a refresh on every foreground for a signed-out user.
    expect(shouldRefreshNow(null, NOW)).toBe(false);
  });

  it('treats an unparseable expiry as due rather than ignoring it', () => {
    // Failing open costs one unnecessary refresh. Failing closed would silently
    // disable proactive refreshing altogether, which is much harder to notice.
    expect(shouldRefreshNow('not a date', NOW)).toBe(true);
  });
});
