import { fetchBaseQuery } from '@reduxjs/toolkit/query';

import { API_URL, REQUEST_TIMEOUT_MS } from '../config/env';
import { sessionExpired, tokensRefreshed } from './auth-events';
import { createFetchWithTimeout } from './fetch-with-timeout';
import { refreshSession } from './refresh-session';
import { getThunkExtra } from './thunk-extra';
import { RECOVERABLE_AUTH_CODES, TERMINAL_AUTH_CODES } from './types';

import type { SecretStore } from '../lib/keychain/types';
import type { ErrorCode } from './types';
import type {
  BaseQueryApi,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query';

/**
 * The slice of state this module reads, described structurally.
 *
 * Deliberately not `RootState`: importing that from `store/` would make `shared`
 * depend on the composition root. All this needs to know is that there is an access
 * token somewhere, and a narrow structural type says exactly that.
 */
interface AccessTokenState {
  auth: { accessToken: string | null };
}

/**
 * The plain transport. Adds the bearer token and nothing else.
 *
 * Used directly for the retry, so a retry cannot re-enter the re-auth logic.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  // Timeout via `fetchFn` rather than the `timeout` option — see
  // `fetch-with-timeout.ts` for why RTK's own implementation leaks a timer.
  fetchFn: createFetchWithTimeout(REQUEST_TIMEOUT_MS),
  prepareHeaders: (headers, { getState }) => {
    // The access token lives in Redux — in memory, never written to disk, gone when
    // the process dies. The *refresh* token is the one in the keystore. Reading the
    // access token from state here is what makes the auth integration legible: there
    // is one place tokens are attached to requests.
    const { auth } = getState() as AccessTokenState;
    if (auth.accessToken) {
      headers.set('Authorization', `Bearer ${auth.accessToken}`);
    }
    return headers;
  },
});

/**
 * Extracts the API's auth sub-code from a failed request.
 *
 * @returns The code, or `null` if this was not a 401 carrying one.
 */
function authCodeOf(error: FetchBaseQueryError | undefined): ErrorCode | null {
  if (!error || error.status !== 401) {
    return null;
  }
  if (typeof error.data !== 'object' || error.data === null) {
    return null;
  }
  const code = (error.data as { code?: unknown }).code;
  return typeof code === 'string' ? (code as ErrorCode) : null;
}

/** Clears the keystore and announces that the session is over. */
async function endSession(
  api: BaseQueryApi,
  secretStore: SecretStore,
  code: ErrorCode | 'NO_REFRESH_TOKEN',
  message: string,
): Promise<void> {
  // Keystore first: if the dispatch below somehow throws, the worst outcome should
  // be a signed-out UI with no credential left behind, not the reverse.
  await secretStore.clearRefreshToken();
  api.dispatch(sessionExpired({ code, message }));
}

/**
 * The transport for every request in the app: `fetchBaseQuery` plus a
 * mutex-serialised `401 → refresh → retry`.
 *
 * ## Why a mutex
 *
 * A screen typically fires several queries at once. When the access token expires,
 * *all* of them come back 401 at roughly the same moment. Without coordination each
 * one starts its own refresh, so N parallel requests produce N refreshes — and once
 * token rotation is enabled, the second refresh to arrive is a *reuse* of an
 * already-rotated token, which the server correctly treats as theft and responds to
 * by revoking the whole family. The client would log the user out by trying too hard
 * to keep them logged in.
 *
 * The mutex makes that impossible: exactly one refresh runs, and everyone else waits
 * for it and then retries with the token it produced.
 *
 * ## The four things the documented pattern does not handle
 *
 * RTK's own `async-mutex` recipe covers `waitForUnlock` → `acquire` → refresh →
 * retry. Four additions, each earned:
 *
 * 1. **The refresh bypasses this wrapper entirely.** It goes through
 *    {@link refreshSession}, a plain `fetch`. Routing the repair through the thing
 *    being repaired recurses until the stack gives out.
 * 2. **`release()` is in a `finally`.** A refresh that throws while holding the lock
 *    would deadlock every subsequent request for the life of the process — the app
 *    would appear to hang rather than to fail.
 * 3. **It branches on the auth sub-code, not the bare status.** `AUTH_TOKEN_EXPIRED`
 *    is repairable; `AUTH_TOKEN_INVALID` is not; `AUTH_CREDENTIALS_INVALID` is just a
 *    wrong password on the login screen and must pass straight through untouched.
 *    Treating all 401s alike gives you either an infinite refresh loop or spurious
 *    sign-outs.
 * 4. **A failed refresh only ends the session when the server actually said so.**
 *    Offline, timed out, or 429 leaves the session intact — see {@link refreshSession}.
 *
 * ## Why the retry lives here and not in an endpoint
 *
 * Because the retry happens *inside* the base query, one logical request stays one
 * logical request: a mutation's `onQueryStarted` runs once, so an optimistic cache
 * patch is applied once and `queryFulfilled` resolves after the retry. Retrying by
 * re-initiating the endpoint would re-run that lifecycle, reverting and re-applying
 * the patch — a visible flicker of the pre-optimistic state on every token refresh.
 */
export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const { secretStore, refreshMutex } = getThunkExtra(api.extra);

  // Queue behind an in-flight refresh *without* taking the lock. A request that
  // starts mid-refresh would otherwise be sent with the token that is currently
  // being replaced, come back 401, and need a second round trip.
  await refreshMutex.waitForUnlock();

  const result = await rawBaseQuery(args, api, extraOptions);

  const code = authCodeOf(result.error);
  if (code === null) {
    // Either it succeeded, or it failed for a reason that is not ours to fix.
    return result;
  }

  if (!RECOVERABLE_AUTH_CODES.includes(code)) {
    if (TERMINAL_AUTH_CODES.includes(code)) {
      await endSession(api, secretStore, code, 'Your session has ended.');
    }
    // AUTH_CREDENTIALS_INVALID lands here and is returned untouched — the login
    // screen needs to render "wrong email or password", not be silently retried.
    return result;
  }

  if (refreshMutex.isLocked()) {
    // Someone else is already refreshing. Wait for their result, then retry once
    // with whatever token they obtained. No second refresh.
    await refreshMutex.waitForUnlock();
    return rawBaseQuery(args, api, extraOptions);
  }

  const release = await refreshMutex.acquire();
  try {
    const refreshToken = await secretStore.getRefreshToken();
    if (!refreshToken) {
      // Nothing to refresh with. Not an error worth retrying — the user is signed
      // out and simply does not know it yet.
      await endSession(
        api,
        secretStore,
        'NO_REFRESH_TOKEN',
        'Please sign in again.',
      );
      return result;
    }

    const outcome = await refreshSession(refreshToken);

    switch (outcome.kind) {
      case 'refreshed':
        // The server echoes the same refresh token back rather than rotating it, so
        // there is deliberately no keystore write here — that would be a disk write
        // per refresh, roughly a hundred a day, for a value that did not change.
        api.dispatch(tokensRefreshed(outcome.tokens));
        break;

      case 'rejected':
        await endSession(api, secretStore, outcome.code, outcome.message);
        return result;

      case 'unavailable':
        // Keep the session and surface the *original* error. The user sees a network
        // problem, which is what actually happened, and stays signed in.
        return result;
    }
  } finally {
    // See point 2 above. This is the line that keeps a thrown refresh from wedging
    // the app permanently.
    release();
  }

  // Released before retrying, so the requests queued on `waitForUnlock` above are
  // free to proceed with the new token rather than serialising behind this one.
  return rawBaseQuery(args, api, extraOptions);
};
