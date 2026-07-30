import type { SecretStore } from '../lib/keychain/types';
import type { Mutex } from 'async-mutex';

/**
 * Dependencies handed to thunks and to the base query as RTK's `extraArgument`.
 *
 * This is how the re-auth wrapper reaches the keystore without importing a native
 * module: `fetchBaseQuery` exposes `api.extra`, so injecting here keeps
 * `base-query.ts` importable from a Jest test.
 */
export interface AppThunkExtra {
  /** Where the refresh token lives. */
  secretStore: SecretStore;
  /**
   * Serialises session refreshes.
   *
   * Owned by the store rather than declared as a module-level singleton, for two
   * reasons. Tests build a fresh store per case, and a shared mutex left locked by
   * one test would deadlock every test after it. And conceptually the lock guards
   * *this session*, which is per-store state, not per-process state.
   *
   * Shared deliberately between the 401 wrapper and the bootstrap thunk: bootstrap
   * holds it while it refreshes, so any request fired during the optimistic-render
   * window queues behind it instead of racing it with a stale token.
   */
  refreshMutex: Mutex;
}

/**
 * Narrows RTK's `unknown`-typed `extra` to {@link AppThunkExtra}.
 *
 * @param extra The `extra` from a thunk API or `BaseQueryApi`.
 * @returns The typed dependencies.
 * @throws {Error} If the store was built without them — a wiring mistake that would
 *   otherwise present as "refresh silently never happens", which is far harder to
 *   diagnose than an immediate throw on the first request.
 */
export function getThunkExtra(extra: unknown): AppThunkExtra {
  const candidate = extra as Partial<AppThunkExtra> | undefined;

  if (!candidate?.secretStore || !candidate.refreshMutex) {
    throw new Error(
      'Store is missing its thunk extraArgument (secretStore, refreshMutex). ' +
        'Build it with createAppStore() rather than configureStore() directly.',
    );
  }

  return candidate as AppThunkExtra;
}
