import { createAction } from '@reduxjs/toolkit';

import type { AuthTokens, ErrorCode } from './types';

/**
 * Auth lifecycle events, declared in `shared` and reduced in `features/auth`.
 *
 * ## Why the events live down here
 *
 * The re-auth wrapper has to tell the auth slice that tokens changed or that the
 * session ended. If it imported the slice's action creators directly, `shared` would
 * depend on `features` — inverting the layering — and it would also close an import
 * cycle: slice → api → base-query → slice.
 *
 * Standalone actions break both problems at once. `shared` owns the vocabulary;
 * `features/auth` decides what the events *mean* by handling them in `extraReducers`.
 * Anything else that needs to react to a sign-out later — clearing the RTK Query
 * cache, say — can listen to the same event without the wrapper knowing about it.
 */

/**
 * A refresh succeeded and a new access token is available.
 *
 * Carries the full token payload because the proactive-refresh scheduler needs
 * `accessTokenExpiresAt`, not just the token.
 */
export const tokensRefreshed = createAction<AuthTokens>('auth/tokensRefreshed');

/**
 * The session is over and cannot be repaired.
 *
 * Dispatched only on an explicit rejection from the server — never on a network
 * failure. The `reason` is kept for the login screen, so the user is told *why*
 * they are back there rather than being silently dumped.
 */
export const sessionExpired = createAction<{
  code: ErrorCode | 'NO_REFRESH_TOKEN';
  message: string;
}>('auth/sessionExpired');
