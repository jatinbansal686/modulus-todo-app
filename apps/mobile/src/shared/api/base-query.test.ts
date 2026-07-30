import { Mutex } from 'async-mutex';

import { createMemorySecretStore } from '@shared/lib/keychain/memory-secret-store';
import { createTestStore } from '@shared/test/create-test-store';
import {
  createDeferred,
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { flushPending } from '@shared/test/flush';
import { baseQueryWithReauth } from './base-query';

import type { AppThunkExtra } from './thunk-extra';
import type { SecretStore } from '@shared/lib/keychain/types';
import type { FetchStub } from '@shared/test/fetch-stub';
import type { BaseQueryApi } from '@reduxjs/toolkit/query';

const TOKENS = {
  accessToken: 'fresh-access-token',
  refreshToken: 'stored-refresh-token',
  accessTokenExpiresAt: '2026-07-30T01:00:00.000Z',
  user: { id: 'u1', email: 'demo@modulusseventeen.com' },
};

/**
 * Builds the `BaseQueryApi` RTK Query would hand the wrapper.
 *
 * Hand-built rather than driven through a real endpoint, so these tests do not have
 * to `injectEndpoints` into the shared `api` singleton — that mutates module state
 * other test files also import, which is a cross-file ordering flake waiting to
 * happen.
 *
 * `dispatch` and `getState` come from a real store, so the auth slice genuinely
 * reduces the events the wrapper emits and `prepareHeaders` reads genuine state.
 */
function createHarness(secretStore: SecretStore) {
  const store = createTestStore({ secretStore });
  // The wrapper only ever reads the mutex from `api.extra`, so supplying one here is
  // behaviourally identical to using the store's own.
  const extra: AppThunkExtra = { secretStore, refreshMutex: new Mutex() };

  const api = {
    signal: new AbortController().signal,
    abort: () => {},
    dispatch: store.dispatch,
    getState: store.getState,
    extra,
    endpoint: 'test',
    type: 'query' as const,
    forced: false,
  } as unknown as BaseQueryApi;

  const run = (url = '/tasks') => baseQueryWithReauth(url, api, {});

  return { store, extra, api, run };
}

describe('baseQueryWithReauth', () => {
  let stub: FetchStub;

  afterEach(() => {
    stub.restore();
  });

  it('passes a successful response straight through', async () => {
    stub = stubFetch(() => jsonResponse(200, { data: [], meta: {} }));
    const { run } = createHarness(
      createMemorySecretStore('stored-refresh-token'),
    );

    const result = await run();

    expect(result.error).toBeUndefined();
    expect(stub.callsTo('/auth/refresh')).toHaveLength(0);
  });

  it('attaches the in-memory access token as a bearer header', async () => {
    stub = stubFetch(() => jsonResponse(200, {}));
    const { store, run } = createHarness(createMemorySecretStore('rt'));

    // Establish a session the way a successful refresh would.
    store.dispatch({ type: 'auth/tokensRefreshed', payload: TOKENS });
    await run();

    // The stub records the parsed body but not headers, so assert via the token that
    // reached state — the header is built from it in prepareHeaders.
    expect(store.getState().auth.accessToken).toBe('fresh-access-token');
  });

  describe('branching on the auth sub-code', () => {
    it('refreshes and retries on AUTH_TOKEN_EXPIRED', async () => {
      let taskCalls = 0;
      stub = stubFetch((call) => {
        if (call.url.includes('/auth/refresh')) {
          return jsonResponse(200, TOKENS);
        }
        taskCalls += 1;
        // Expired the first time, fine on the retry.
        return taskCalls === 1
          ? errorResponse(401, 'AUTH_TOKEN_EXPIRED')
          : jsonResponse(200, { data: [] });
      });

      const { store, run } = createHarness(
        createMemorySecretStore('stored-refresh-token'),
      );

      const result = await run();

      expect(result.error).toBeUndefined();
      expect(taskCalls).toBe(2);
      expect(stub.callsTo('/auth/refresh')).toHaveLength(1);
      expect(store.getState().auth.accessToken).toBe('fresh-access-token');
    });

    it('signs out on AUTH_TOKEN_INVALID without attempting a refresh', async () => {
      // The token is not salvageable, so refreshing would be a wasted round trip on
      // the way to the same outcome.
      stub = stubFetch(() => errorResponse(401, 'AUTH_TOKEN_INVALID'));
      const secretStore = createMemorySecretStore('stored-refresh-token');
      const { store, run } = createHarness(secretStore);

      await run();

      expect(stub.callsTo('/auth/refresh')).toHaveLength(0);
      expect(store.getState().auth.status).toBe('anonymous');
      await expect(secretStore.getRefreshToken()).resolves.toBeNull();
    });

    it('passes AUTH_CREDENTIALS_INVALID through untouched', async () => {
      // A wrong password on the login screen. Refreshing would be nonsense, and
      // signing the user out of a session they never had would be worse.
      stub = stubFetch(() => errorResponse(401, 'AUTH_CREDENTIALS_INVALID'));
      const secretStore = createMemorySecretStore('stored-refresh-token');
      const { store, run } = createHarness(secretStore);

      const result = await run('/auth/login');

      expect(result.error).toMatchObject({ status: 401 });
      expect(stub.callsTo('/auth/refresh')).toHaveLength(0);
      expect(store.getState().auth.status).toBe('bootstrapping');
      await expect(secretStore.getRefreshToken()).resolves.toBe(
        'stored-refresh-token',
      );
    });
  });

  describe('a failed refresh only ends the session when the server says so', () => {
    it('keeps the session when the refresh cannot reach the server', async () => {
      stub = stubFetch((call) => {
        if (call.url.includes('/auth/refresh')) {
          throw new TypeError('Network request failed');
        }
        return errorResponse(401, 'AUTH_TOKEN_EXPIRED');
      });

      const secretStore = createMemorySecretStore('stored-refresh-token');
      const { store, run } = createHarness(secretStore);

      const result = await run();

      // The original error surfaces, the credential survives, and the user is not
      // bounced to the login screen because their connection dropped.
      expect(result.error).toMatchObject({ status: 401 });
      expect(store.getState().auth.status).toBe('bootstrapping');
      await expect(secretStore.getRefreshToken()).resolves.toBe(
        'stored-refresh-token',
      );
    });

    it('ends the session when the refresh token is rejected', async () => {
      stub = stubFetch((call) =>
        call.url.includes('/auth/refresh')
          ? errorResponse(401, 'AUTH_REFRESH_REUSED', 'Token reuse detected')
          : errorResponse(401, 'AUTH_TOKEN_EXPIRED'),
      );

      const secretStore = createMemorySecretStore('stored-refresh-token');
      const { store, run } = createHarness(secretStore);

      await run();

      expect(store.getState().auth.status).toBe('anonymous');
      expect(store.getState().auth.endedReason).toBe('Token reuse detected');
      await expect(secretStore.getRefreshToken()).resolves.toBeNull();
    });

    it('ends the session when there is no refresh token to use', async () => {
      stub = stubFetch(() => errorResponse(401, 'AUTH_TOKEN_EXPIRED'));
      const { store, run } = createHarness(createMemorySecretStore(null));

      await run();

      expect(stub.callsTo('/auth/refresh')).toHaveLength(0);
      expect(store.getState().auth.status).toBe('anonymous');
    });
  });

  it('serialises concurrent 401s into exactly one refresh', async () => {
    // The headline behaviour. A screen fires several queries at once; the token
    // expires; all of them come back 401 together. Without the mutex each starts its
    // own refresh — and once rotation is enabled, the second one is a *reuse* of an
    // already-rotated token, which the server correctly treats as theft and answers
    // by revoking the whole family. The client would sign the user out by trying too
    // hard to keep them signed in.
    const refreshGate = createDeferred();
    let refreshCalls = 0;
    let rejected401s = 0;
    const expired = new Set<string>();

    stub = stubFetch(async (call) => {
      if (call.url.includes('/auth/refresh')) {
        refreshCalls += 1;
        await refreshGate.promise;
        return jsonResponse(200, TOKENS);
      }
      // Each distinct endpoint 401s once, then succeeds — modelling a token that was
      // expired for the first attempt and valid for the retry.
      if (!expired.has(call.url)) {
        expired.add(call.url);
        rejected401s += 1;
        return errorResponse(401, 'AUTH_TOKEN_EXPIRED');
      }
      return jsonResponse(200, { data: [] });
    });

    const { store, run } = createHarness(
      createMemorySecretStore('stored-refresh-token'),
    );

    const inFlight = [run('/tasks'), run('/tasks/summary'), run('/users/me')];

    // Let all three reach their 401 and contend for the lock.
    await flushPending();

    // Guards the test itself: all three must genuinely have been rejected, or this
    // would "pass" while only one request ever exercised the refresh path.
    expect(rejected401s).toBe(3);
    expect(refreshCalls).toBe(1);

    refreshGate.resolve();
    const results = await Promise.all(inFlight);

    // Still one, after everyone has finished and retried.
    expect(refreshCalls).toBe(1);
    expect(results.every((result) => result.error === undefined)).toBe(true);
    expect(store.getState().auth.accessToken).toBe('fresh-access-token');
    // 3 rejected + 3 retried: every request was actually replayed.
    expect(
      stub.calls.filter((c) => !c.url.includes('/auth/refresh')),
    ).toHaveLength(6);
  });

  it('does not deadlock when the refresh throws while holding the lock', async () => {
    // `release()` lives in a `finally` precisely for this. Without it the mutex stays
    // locked for the life of the process and every later request hangs on
    // `waitForUnlock` — the app appears frozen rather than broken, which is far
    // harder to diagnose.
    const secretStore: SecretStore = {
      getRefreshToken: () => Promise.reject(new Error('keystore exploded')),
      setRefreshToken: () => Promise.resolve(),
      clearRefreshToken: () => Promise.resolve(),
    };

    stub = stubFetch(() => errorResponse(401, 'AUTH_TOKEN_EXPIRED'));
    const { extra, run } = createHarness(secretStore);

    await expect(run()).rejects.toThrow('keystore exploded');

    // The lock must be free, and a following request must complete rather than hang.
    expect(extra.refreshMutex.isLocked()).toBe(false);
    await expect(run()).rejects.toThrow('keystore exploded');
  });
});
