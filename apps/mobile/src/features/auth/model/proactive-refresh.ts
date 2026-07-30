import { createAsyncThunk } from '@reduxjs/toolkit';

import { sessionExpired, tokensRefreshed } from '@shared/api/auth-events';
import { refreshSession } from '@shared/api/refresh-session';
import { getThunkExtra } from '@shared/api/thunk-extra';

import type { AppThunkExtra } from '@shared/api/thunk-extra';

/**
 * How close to expiry counts as "about to expire".
 *
 * Sized against the round trip, not the token lifetime: the point is to refresh
 * while the user is still looking at a loading state they expect, rather than
 * mid-interaction. Access tokens last 15 minutes, so a 60-second margin refreshes
 * roughly one resume in fifteen — not on every foreground.
 */
export const PROACTIVE_REFRESH_MARGIN_MS = 60_000;

/**
 * Whether the access token is expired or close enough that the next request would
 * probably fail.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, so the boundary
 * cases are testable without freezing the clock globally.
 *
 * @param expiresAt ISO 8601 expiry from the API, or `null` when there is no token.
 * @param now Current time in epoch milliseconds.
 * @returns `true` if a refresh should be attempted now.
 */
export function shouldRefreshNow(
  expiresAt: string | null,
  now: number,
): boolean {
  if (!expiresAt) {
    // No token and no expiry: either signed out, or mid-optimistic-bootstrap. Either
    // way there is nothing to refresh *proactively* — the wrapper handles it on demand.
    return false;
  }

  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    // A malformed timestamp should not silently disable refreshing. Treat it as due;
    // the worst case is one unnecessary refresh.
    return true;
  }

  return expiry - now <= PROACTIVE_REFRESH_MARGIN_MS;
}

/** Minimal structural view of the state this module reads. */
interface AuthExpiryState {
  auth: { accessTokenExpiresAt: string | null; status: string };
}

/**
 * Refreshes the access token ahead of expiry.
 *
 * ## Why bother, when the wrapper already handles 401s
 *
 * Because of what the user sees. An app resumed after twenty minutes in the
 * background has a dead access token, so the first thing it does is fire its queries,
 * get 401s, refresh, and retry — correct, but the user watches a spinner for two
 * round trips on a screen they expected to be instant. Refreshing on resume turns
 * that into one round trip that happens before they have finished looking at the
 * screen.
 *
 * Takes the same mutex as the wrapper, so a proactive refresh and a 401-driven one
 * can never run at once.
 */
export const refreshIfExpiring = createAsyncThunk<
  void,
  void,
  { extra: AppThunkExtra; state: AuthExpiryState }
>('auth/refreshIfExpiring', async (_arg, { dispatch, getState, extra }) => {
  const { secretStore, refreshMutex } = getThunkExtra(extra);
  const { auth } = getState();

  if (auth.status !== 'authenticated') {
    return;
  }
  if (!shouldRefreshNow(auth.accessTokenExpiresAt, Date.now())) {
    return;
  }
  if (refreshMutex.isLocked()) {
    // A refresh is already running — either the bootstrap's or a 401-driven one.
    // Adding another would be the exact duplication the mutex exists to prevent.
    return;
  }

  const refreshToken = await secretStore.getRefreshToken();
  if (!refreshToken) {
    return;
  }

  const release = await refreshMutex.acquire();
  try {
    const outcome = await refreshSession(refreshToken);

    if (outcome.kind === 'refreshed') {
      dispatch(tokensRefreshed(outcome.tokens));
    } else if (outcome.kind === 'rejected') {
      await secretStore.clearRefreshToken();
      dispatch(
        sessionExpired({ code: outcome.code, message: outcome.message }),
      );
    }
    // 'unavailable' is deliberately ignored. This is an optimisation, not a
    // requirement: if the network is down there is nothing to do, and the next real
    // request will surface the problem in a context the user can make sense of.
  } finally {
    release();
  }
});
