import type { SecretStore } from './types';

/**
 * An in-memory {@link SecretStore} for tests.
 *
 * Each call returns an independent store, so a test that signs in cannot leak a
 * session into whichever test runs next.
 *
 * Kept genuinely asynchronous — the methods return promises rather than resolved
 * values wrapped at the call site — because the whole reason the app needs a
 * bootstrap gate is that reading this is async. A synchronous fake would make tests
 * pass against ordering the real keystore does not permit.
 *
 * @param initialToken Seeds a stored token, modelling an app relaunched while signed in.
 * @returns A fresh, isolated secret store.
 */
export function createMemorySecretStore(
  initialToken: string | null = null,
): SecretStore {
  let token = initialToken;

  return {
    getRefreshToken() {
      return Promise.resolve(token);
    },
    setRefreshToken(next) {
      token = next;
      return Promise.resolve();
    },
    clearRefreshToken() {
      token = null;
      return Promise.resolve();
    },
  };
}
