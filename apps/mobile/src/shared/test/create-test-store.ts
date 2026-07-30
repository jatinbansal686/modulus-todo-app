import { createMemorySecretStore } from '@shared/lib/keychain/memory-secret-store';
import { createMemoryStorage } from '@shared/lib/storage/memory-storage';
import { createAppStore } from '@store/create-store';

import type { CreateAppStoreOptions } from '@store/create-store';

/**
 * Builds a store wired entirely to in-memory fakes.
 *
 * Every test gets a **fresh** store, which matters more than it looks: a shared one
 * leaks the RTK Query cache between cases, so a test can pass alone and fail in the
 * suite depending purely on ordering.
 *
 * The defaults are the empty case — no preferences, no stored session — so a test
 * that cares about neither says nothing about either, and a test that does overrides
 * only the one it needs.
 *
 * @param overrides Replace either backing store, e.g. to seed a stored refresh token.
 * @returns A store built with `createAppStore`, not a hand-rolled imitation of it —
 *   so the middleware, the injected dependencies and the preloaded state are the
 *   real ones.
 */
export function createTestStore(
  overrides: Partial<CreateAppStoreOptions> = {},
) {
  return createAppStore({
    storage: createMemoryStorage(),
    secretStore: createMemorySecretStore(),
    ...overrides,
  });
}
