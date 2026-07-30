import { createSlice } from '@reduxjs/toolkit';

import { sessionExpired, tokensRefreshed } from '@shared/api/auth-events';

import type { AuthTokens, PublicUser } from '@shared/api/types';
import type { PayloadAction } from '@reduxjs/toolkit';

/**
 * Which of three states the app is in.
 *
 * Three, not a boolean, and the third is the one that earns its place.
 * `react-native-keychain` reads asynchronously, so on a cold start the app genuinely
 * does not yet know whether anyone is signed in. A boolean forces that unknown to be
 * *guessed* as `false`, which renders the Login screen for a moment and then
 * replaces it — a flash of the wrong screen on every launch for a returning user.
 *
 * `bootstrapping` names the unknown instead, and the navigator renders nothing at
 * all while it holds.
 */
export type AuthStatus = 'bootstrapping' | 'authenticated' | 'anonymous';

/**
 * Auth state. **Never persisted.**
 *
 * The access token is here on purpose: it is short-lived, it is what the base query
 * attaches to requests, and keeping it in memory means it cannot be recovered from
 * the device after the process dies. The refresh token is *not* here — it lives in
 * the keystore and never enters Redux, so a state snapshot in a bug report cannot
 * leak a long-lived credential.
 */
export interface AuthState {
  status: AuthStatus;
  /** JWT for the Authorization header, or `null` while unauthenticated. */
  accessToken: string | null;
  /** ISO 8601 absolute expiry, used to refresh proactively rather than on a 401. */
  accessTokenExpiresAt: string | null;
  user: PublicUser | null;
  /**
   * Why the last session ended, if it ended by rejection.
   *
   * Surfaced on the login screen so a user who was signed out mid-session is told
   * why, rather than silently finding themselves back at the start.
   */
  endedReason: string | null;
}

const initialState: AuthState = {
  // Seeded to `bootstrapping`, not `anonymous`. The bootstrap thunk is what moves it.
  status: 'bootstrapping',
  accessToken: null,
  accessTokenExpiresAt: null,
  user: null,
  endedReason: null,
};

/** Applies a token payload to state and marks the session live. */
function acceptTokens(state: AuthState, tokens: AuthTokens): void {
  state.status = 'authenticated';
  state.accessToken = tokens.accessToken;
  state.accessTokenExpiresAt = tokens.accessTokenExpiresAt;
  state.user = tokens.user;
  state.endedReason = null;
}

/** Clears every trace of the session from memory. */
function clearSession(state: AuthState, reason: string | null): void {
  state.status = 'anonymous';
  state.accessToken = null;
  state.accessTokenExpiresAt = null;
  state.user = null;
  state.endedReason = reason;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** A sign-in or sign-up succeeded. */
    signedIn(state, action: PayloadAction<AuthTokens>) {
      acceptTokens(state, action.payload);
    },

    /**
     * The user signed out deliberately.
     *
     * Distinct from {@link sessionExpired}: there is no reason to explain, because
     * they asked for it.
     */
    signedOut(state) {
      clearSession(state, null);
    },

    /**
     * Bootstrap found no stored credential.
     *
     * A separate action from `signedOut` so the login screen can tell "you were
     * never signed in" from "you were signed out", and show a message only for the
     * latter.
     */
    bootstrapFoundNoSession(state) {
      clearSession(state, null);
    },

    /**
     * Bootstrap gave up waiting and is rendering optimistically.
     *
     * A refresh token exists, so we assume the session is good and let the app in
     * while the refresh continues in the background. `accessToken` stays `null` —
     * requests made in this window get a 401 and the re-auth wrapper repairs them,
     * or more usually queue on the mutex the refresh is already holding.
     *
     * Only ever an *upgrade* from `bootstrapping`; if the refresh has already
     * resolved, this must not undo it.
     */
    bootstrapResolvedOptimistically(state) {
      if (state.status === 'bootstrapping') {
        state.status = 'authenticated';
      }
    },
  },

  extraReducers: (builder) => {
    builder
      // Dispatched by the re-auth wrapper and the bootstrap thunk. Handled here
      // rather than imported by them, so `shared` never depends on `features`.
      .addCase(tokensRefreshed, (state, action) => {
        acceptTokens(state, action.payload);
      })
      .addCase(sessionExpired, (state, action) => {
        clearSession(state, action.payload.message);
      });
  },

  selectors: {
    selectAuthStatus: (state) => state.status,
    selectAccessToken: (state) => state.accessToken,
    selectAccessTokenExpiresAt: (state) => state.accessTokenExpiresAt,
    selectCurrentUser: (state) => state.user,
    selectSessionEndedReason: (state) => state.endedReason,
  },
});

export const {
  signedIn,
  signedOut,
  bootstrapFoundNoSession,
  bootstrapResolvedOptimistically,
} = authSlice.actions;

export const {
  selectAuthStatus,
  selectAccessToken,
  selectAccessTokenExpiresAt,
  selectCurrentUser,
  selectSessionEndedReason,
} = authSlice.selectors;

export const authReducer = authSlice.reducer;
export const AUTH_SLICE_NAME = authSlice.name;
