import { api } from '@shared/api/api';
import { getThunkExtra } from '@shared/api/thunk-extra';
import { signedIn, signedOut } from '../model/auth.slice';

import type {
  AuthTokens,
  LoginRequest,
  RegisterRequest,
} from '@shared/api/types';

/**
 * Auth endpoints.
 *
 * `refresh` is deliberately **absent**. It is not an RTK Query endpoint at all —
 * see `shared/api/refresh-session.ts` for why the token exchange must sit outside
 * the transport it repairs.
 *
 * Both `login` and `register` persist the refresh token to the keystore inside
 * `onQueryStarted` rather than leaving that to the screens. Two screens calling two
 * mutations is two chances to forget, and forgetting means the user is signed in
 * until they close the app and then mysteriously is not.
 */
export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthTokens, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled, extra }) => {
        await completeSignIn(queryFulfilled, dispatch, extra);
      },
    }),

    /**
     * Registration signs the user straight in — the API returns tokens, so there is
     * no "now please log in" step to fail at.
     */
    register: builder.mutation<AuthTokens, RegisterRequest>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
      onQueryStarted: async (_arg, { dispatch, queryFulfilled, extra }) => {
        await completeSignIn(queryFulfilled, dispatch, extra);
      },
    }),

    /**
     * Signs out, revoking the refresh token server-side.
     *
     * The endpoint is unauthenticated and idempotent by design, so this still works
     * when the access token has already expired — which is exactly when a user is
     * most likely to be reaching for "sign out".
     */
    logout: builder.mutation<void, void>({
      queryFn: async (_arg, queryApi, _extraOptions, baseQuery) => {
        const { secretStore } = getThunkExtra(queryApi.extra);
        const refreshToken = await secretStore.getRefreshToken();

        // Best-effort server-side revocation. The local sign-out below happens
        // regardless: a user who taps "sign out" on a flaky connection must still
        // end up signed out on this device. The token expires on its own TTL.
        if (refreshToken) {
          await baseQuery({
            url: '/auth/logout',
            method: 'POST',
            body: { refreshToken },
          });
        }

        await secretStore.clearRefreshToken();
        queryApi.dispatch(signedOut());

        // Drop every cached response. Without this, the next user to sign in on this
        // device briefly sees the previous user's tasks from cache.
        queryApi.dispatch(api.util.resetApiState());

        return { data: undefined };
      },
    }),
  }),
});

/**
 * Shared success path for `login` and `register`.
 *
 * Waits for the mutation, writes the refresh token to the keystore, then marks the
 * session live. Keystore first, deliberately: if the write fails, the session must
 * not be reported as established — otherwise the user appears signed in and is
 * silently signed out on the next cold start, with nothing to explain it.
 */
async function completeSignIn(
  queryFulfilled: Promise<{ data: AuthTokens }>,
  dispatch: (action: unknown) => unknown,
  extra: unknown,
): Promise<void> {
  try {
    const { data } = await queryFulfilled;
    const { secretStore } = getThunkExtra(extra);

    await secretStore.setRefreshToken(data.refreshToken);
    dispatch(signedIn(data));
  } catch {
    // A rejected mutation is already surfaced to the screen through the hook's
    // `error`; swallowing it here only stops it becoming an unhandled rejection.
  }
}

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } =
  authApi;
