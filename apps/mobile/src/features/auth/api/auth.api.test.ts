import { createMemorySecretStore } from '@shared/lib/keychain/memory-secret-store';
import { createTestStore } from '@shared/test/create-test-store';
import { jsonResponse, stubFetch } from '@shared/test/fetch-stub';
import { settleReduxBatching } from '@shared/test/flush';
import { authApi } from './auth.api';

import type { FetchStub } from '@shared/test/fetch-stub';

let stub: FetchStub;

afterEach(() => {
  stub.restore();
});

// See `settleReduxBatching`: dispatching `initiate()` straight at a store leaves
// Redux's batching timers to fire after Jest tears the environment down.
afterAll(settleReduxBatching);

describe('logout', () => {
  /**
   * ⚠️ Regression test for a bug that was invisible from the UI.
   *
   * `logout` was declared `mutation<void, void>` and returned `{ data: undefined }`.
   * RTK Query validates a `queryFn`'s result and **rejects** an undefined `data`,
   * so every sign-out resolved as a *failed* mutation and logged an error — while
   * the sign-out itself worked perfectly, because nothing reads the result and the
   * session is cleared by the dispatches either way.
   *
   * That combination is why it survived: correct behaviour, wrong result shape,
   * no test looking at it. On device it showed up as a red LogBox on every
   * sign-out. Asserting the *result* is the only thing that catches it.
   */
  it('resolves as a success, not a rejected mutation', async () => {
    stub = stubFetch(() => jsonResponse(200, { revoked: true }));
    const secretStore = createMemorySecretStore('stored-refresh-token');
    const store = createTestStore({ secretStore });

    const result = await store.dispatch(authApi.endpoints.logout.initiate());

    expect('error' in result).toBe(false);
    expect(result.data).toBeNull();
  });

  it('revokes server-side, clears the keystore and marks the session over', async () => {
    stub = stubFetch(() => jsonResponse(200, { revoked: true }));
    const secretStore = createMemorySecretStore('stored-refresh-token');
    const store = createTestStore({ secretStore });

    await store.dispatch(authApi.endpoints.logout.initiate());

    // The refresh token is presented in the body so the server can revoke it —
    // sign-out has to be more than a local state change, or the token stays
    // valid for its full TTL.
    const [call] = stub.callsTo('/auth/logout');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ refreshToken: 'stored-refresh-token' });

    await expect(secretStore.getRefreshToken()).resolves.toBeNull();
    expect(store.getState().auth.status).toBe('anonymous');

    // The cache is emptied, so the next user to sign in on this device cannot
    // briefly see the previous user's tasks. Asserted rather than assumed: the
    // reset had to move out of `queryFn` to stop it aborting its own mutation,
    // and a move like that is exactly where a behaviour quietly gets dropped.
    const cache = store.getState().api;
    expect(Object.keys(cache.queries)).toHaveLength(0);
    expect(Object.keys(cache.mutations)).toHaveLength(0);
  });

  it('still signs out locally when the server cannot be reached', async () => {
    // An offline device. The user tapped "sign out" and must end up signed out on
    // this device regardless; the token expires on its own TTL.
    stub = stubFetch(() => {
      throw new Error('Network request failed');
    });
    const secretStore = createMemorySecretStore('stored-refresh-token');
    const store = createTestStore({ secretStore });

    const result = await store.dispatch(authApi.endpoints.logout.initiate());

    expect('error' in result).toBe(false);
    await expect(secretStore.getRefreshToken()).resolves.toBeNull();
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('skips the network entirely when there is no stored token', async () => {
    stub = stubFetch(() => jsonResponse(200, {}));
    const store = createTestStore({ secretStore: createMemorySecretStore() });

    await store.dispatch(authApi.endpoints.logout.initiate());

    expect(stub.callsTo('/auth/logout')).toHaveLength(0);
    expect(store.getState().auth.status).toBe('anonymous');
  });
});
