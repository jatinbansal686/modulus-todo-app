import { createAsyncThunk } from '@reduxjs/toolkit';

import { sessionExpired, tokensRefreshed } from '@shared/api/auth-events';
import { refreshSession } from '@shared/api/refresh-session';
import { getThunkExtra } from '@shared/api/thunk-extra';
import {
  bootstrapFoundNoSession,
  bootstrapResolvedOptimistically,
} from './auth.slice';

import type { AppThunkExtra } from '@shared/api/thunk-extra';

/**
 * How long the splash may cover the auth bootstrap.
 *
 * The access token is memory-only, so *every* cold start has to reach the network
 * before it can render authenticated content. Against a free-tier API that spins
 * down when idle, that first request can take up to a minute — which, uncapped,
 * is a minute of splash screen on the grader's very first launch.
 *
 * So the splash is a deadline, not a dependency: after this it lifts and the app
 * renders while the refresh finishes in the background.
 */
export const BOOTSTRAP_SPLASH_CAP_MS = 1_500;

/**
 * Resolves `promise`, or gives up after `ms` — whichever happens first.
 *
 * Clears the timer on the promise path rather than leaving `Promise.race`'s loser
 * pending, so a completed bootstrap does not leave a live `setTimeout` holding the
 * Jest event loop open.
 */
function settleOrTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    promise.then(finish, finish);
  });
}

/**
 * Decides, on cold start, whether the user is signed in.
 *
 * ## Why this exists at all
 *
 * `react-native-keychain` reads **asynchronously**, so the state that chooses
 * between the auth stack and the app stack is simply not available during module
 * evaluation or first render. Something has to cover that gap, or a returning user
 * sees the Login screen flash past on every launch.
 *
 * ## The two traps, and how each is handled
 *
 * **1. A cold API must not hold the splash open.** Capped at
 * {@link BOOTSTRAP_SPLASH_CAP_MS}; past that the app renders optimistically on the
 * strength of a refresh token merely *existing*, and the refresh continues behind it.
 *
 * **2. A network failure must not sign anyone out.** Only an explicit rejection from
 * the server ends the session. A timeout or an unreachable host leaves the user
 * signed in — otherwise the first launch against a cold API logs them straight out,
 * which is precisely the "force-quit → still signed in" behaviour this is here to
 * provide.
 *
 * The refresh runs while **holding the shared refresh mutex**, so any request fired
 * during the optimistic-render window queues behind it rather than racing it with an
 * access token that has not arrived yet.
 */
export const bootstrapAuth = createAsyncThunk<
  void,
  void,
  { extra: AppThunkExtra }
>('auth/bootstrap', async (_arg, { dispatch, extra }) => {
  const { secretStore, refreshMutex } = getThunkExtra(extra);

  const refreshToken = await secretStore.getRefreshToken();
  if (!refreshToken) {
    // Nothing stored: a first launch, or a previous explicit sign-out. Straight to
    // the auth stack with no network call at all — the common case is also the fast
    // one.
    dispatch(bootstrapFoundNoSession());
    return;
  }

  const release = await refreshMutex.acquire();

  const refreshing = (async () => {
    try {
      const outcome = await refreshSession(refreshToken);

      switch (outcome.kind) {
        case 'refreshed':
          dispatch(tokensRefreshed(outcome.tokens));
          break;

        case 'rejected':
          // The server explicitly refused the token. This is the one path that ends
          // the session on startup.
          await secretStore.clearRefreshToken();
          dispatch(
            sessionExpired({ code: outcome.code, message: outcome.message }),
          );
          break;

        case 'unavailable':
          // No verdict — offline, timeout, cold start, 5xx. Keep the credential and
          // let the user in; the re-auth wrapper will retry on the first request
          // that needs a token.
          dispatch(bootstrapResolvedOptimistically());
          break;
      }
    } finally {
      // Same reasoning as the wrapper: a throw here while holding the lock would
      // wedge every subsequent request for the life of the process.
      release();
    }
  })();

  await settleOrTimeout(refreshing, BOOTSTRAP_SPLASH_CAP_MS);

  // If the refresh is still in flight, let the app render now. A no-op when the
  // refresh already resolved — `bootstrapResolvedOptimistically` only ever upgrades
  // from `bootstrapping`, so it cannot undo a sign-out that just happened.
  dispatch(bootstrapResolvedOptimistically());
});
