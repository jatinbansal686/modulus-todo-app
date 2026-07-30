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
    /*
     * ⚠️ Returns `null`, not `void`.
     *
     * RTK Query validates a `queryFn`'s result and rejects `{ data: undefined }`
     * outright — "returned an object containing neither a valid `error` and
     * `result`". With `<void, void>` the only expressible success value is
     * `undefined`, so every sign-out logged an error and resolved as a *failed*
     * mutation, even though the sign-out itself had completely succeeded.
     *
     * It went unnoticed because nothing reads the result: the session clears
     * either way. It surfaced on device as a red LogBox on every sign-out.
     * `null` is a defined value, so the mutation resolves as the success it is.
     */
    logout: builder.mutation<null, void>({
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

        return { data: null };
      },

      /**
       * Drops every cached response, once the sign-out has settled.
       *
       * Without the reset, the next user to sign in on this device briefly sees
       * the previous user's tasks from cache.
       *
       * ⚠️ It has to happen **here** rather than inside `queryFn`, and the reason
       * is not stylistic. `resetApiState()` tears down every in-flight request —
       * including the logout mutation that dispatched it. Called from inside
       * `queryFn`, the mutation aborts itself and resolves as
       * `{ error: { name: 'AbortError' } }`: a sign-out that fully succeeded,
       * reported as a failure. Awaiting `queryFulfilled` first means the mutation
       * has already settled, so there is nothing left to abort.
       */
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
        } finally {
          // `finally`, not the success path: a sign-out that failed still cleared
          // the keystore and the session, so leaving the cache populated would
          // strand the previous user's data on the device.
          dispatch(api.util.resetApiState());
        }
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
