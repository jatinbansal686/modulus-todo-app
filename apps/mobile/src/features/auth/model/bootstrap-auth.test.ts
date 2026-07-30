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
import { BOOTSTRAP_SPLASH_CAP_MS, bootstrapAuth } from './bootstrap-auth';

import type { FetchStub } from '@shared/test/fetch-stub';

const TOKENS = {
  accessToken: 'fresh-access-token',
  refreshToken: 'stored-refresh-token',
  accessTokenExpiresAt: '2026-07-30T01:00:00.000Z',
  user: { id: 'u1', email: 'demo@modulusseventeen.com' },
};

describe('bootstrapAuth', () => {
  let stub: FetchStub;

  afterEach(() => {
    stub?.restore();
  });

  it('goes straight to anonymous with no stored token and no network call', async () => {
    // First launch, or a previous explicit sign-out. The common case should also be
    // the fast one — there is nothing to ask the server about.
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const store = createTestStore({
      secretStore: createMemorySecretStore(null),
    });

    await store.dispatch(bootstrapAuth());

    expect(store.getState().auth.status).toBe('anonymous');
    expect(stub.calls).toHaveLength(0);
  });

  it('signs the user in when the stored token still works', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const store = createTestStore({
      secretStore: createMemorySecretStore('stored-refresh-token'),
    });

    await store.dispatch(bootstrapAuth());

    const { auth } = store.getState();
    expect(auth.status).toBe('authenticated');
    expect(auth.accessToken).toBe('fresh-access-token');
    expect(auth.user?.email).toBe('demo@modulusseventeen.com');
  });

  it('signs the user out when the server rejects the stored token', async () => {
    stub = stubFetch(() =>
      errorResponse(401, 'AUTH_TOKEN_INVALID', 'Refresh token is invalid'),
    );
    const secretStore = createMemorySecretStore('revoked-token');
    const store = createTestStore({ secretStore });

    await store.dispatch(bootstrapAuth());

    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().auth.endedReason).toBe('Refresh token is invalid');
    // The dead credential must not be left on the device to be retried forever.
    await expect(secretStore.getRefreshToken()).resolves.toBeNull();
  });

  it('keeps the user signed in when the API is unreachable', async () => {
    // The behaviour the whole three-state machine exists for. Signing out here would
    // mean a cold-starting API logs the user out on their first launch — and would
    // break "force-quit → still signed in" on exactly the demo the seed exists for.
    stub = stubFetch(() => {
      throw new TypeError('Network request failed');
    });
    const secretStore = createMemorySecretStore('stored-refresh-token');
    const store = createTestStore({ secretStore });

    await store.dispatch(bootstrapAuth());

    expect(store.getState().auth.status).toBe('authenticated');
    // No access token yet — the re-auth wrapper obtains one on the first request
    // that needs it.
    expect(store.getState().auth.accessToken).toBeNull();
    await expect(secretStore.getRefreshToken()).resolves.toBe(
      'stored-refresh-token',
    );
  });

  it(
    'stops waiting after the cap and lets the app render',
    async () => {
      // A cold free-tier instance can take up to a minute to answer. Uncapped, that is
      // a minute of splash screen on the grader's first launch.
      const gate = createDeferred();
      stub = stubFetch(async () => {
        await gate.promise;
        return jsonResponse(200, TOKENS);
      });

      const store = createTestStore({
        secretStore: createMemorySecretStore('stored-refresh-token'),
      });

      const bootstrapping = store.dispatch(bootstrapAuth());

      // Still undecided while the refresh is in flight and under the cap.
      await flushPending();
      expect(store.getState().auth.status).toBe('bootstrapping');

      // The thunk resolves on the cap rather than on the request.
      await bootstrapping;
      expect(store.getState().auth.status).toBe('authenticated');
      expect(store.getState().auth.accessToken).toBeNull();

      // ...and the refresh, still running, upgrades the session when it lands.
      gate.resolve();
      await flushPending();
      expect(store.getState().auth.accessToken).toBe('fresh-access-token');
    },
    BOOTSTRAP_SPLASH_CAP_MS + 4_000,
  );

  it(
    'holds the shared refresh mutex for the duration of the refresh',
    async () => {
      // This is what makes the optimistic-render window safe: any request fired while
      // the app is rendering without an access token queues on this lock instead of
      // racing the refresh and taking a needless 401.
      const gate = createDeferred();
      stub = stubFetch(async () => {
        await gate.promise;
        return jsonResponse(200, TOKENS);
      });

      // The same mutex object the store hands its thunks, so this asserts against the
      // real lock rather than a copy that happens to behave similarly.
      const refreshMutex = new Mutex();
      const store = createTestStore({
        secretStore: createMemorySecretStore('stored-refresh-token'),
        refreshMutex,
      });

      const bootstrapping = store.dispatch(bootstrapAuth());
      await flushPending();

      expect(refreshMutex.isLocked()).toBe(true);

      gate.resolve();
      await bootstrapping;
      await flushPending();

      // Released — a lock left held would wedge every subsequent request for the life
      // of the process, and the app would look frozen rather than broken.
      expect(refreshMutex.isLocked()).toBe(false);
      expect(store.getState().auth.accessToken).toBe('fresh-access-token');
    },
    BOOTSTRAP_SPLASH_CAP_MS + 4_000,
  );
});
