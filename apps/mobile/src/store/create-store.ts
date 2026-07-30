import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
} from '@reduxjs/toolkit';
import { Mutex } from 'async-mutex';

import { AUTH_SLICE_NAME, authReducer } from '@features/auth/model/auth.slice';
import { registerPreferencePersistence } from '@features/preferences/model/preferences.persistence';
import {
  PREFERENCES_SLICE_NAME,
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  preferencesReducer,
} from '@features/preferences/model/preferences.slice';
import { api } from '@shared/api/api';

import type { AppThunkExtra } from '@shared/api/thunk-extra';
import type { SecretStore } from '@shared/lib/keychain/types';
import type { KeyValueStorage } from '@shared/lib/storage/types';

/**
 * The root reducer.
 *
 * Declared separately from `configureStore` so `RootState` can be derived from it
 * with `ReturnType`. Deriving the type from the *store* instead would make
 * `RootState` depend on the middleware configuration, which drags the storage
 * dependency into a type that half the app imports.
 */
const rootReducer = combineReducers({
  [AUTH_SLICE_NAME]: authReducer,
  [PREFERENCES_SLICE_NAME]: preferencesReducer,
  [api.reducerPath]: api.reducer,
});

/** Dependencies {@link createAppStore} needs from the caller. */
export interface CreateAppStoreOptions {
  /**
   * Where preferences are persisted.
   *
   * Injected rather than imported so that this module never touches MMKV, and can
   * therefore be imported from a Jest test without Nitro's native initialiser
   * running in a Node process. See `shared/lib/storage/types.ts`.
   */
  storage: KeyValueStorage;
  /**
   * Where the refresh token is kept.
   *
   * Injected for the same reason, and reachable from the base query as
   * `api.extra` — which is how the re-auth wrapper reads the keystore without
   * importing a native module.
   */
  secretStore: SecretStore;
  /**
   * Lock serialising session refreshes. Defaults to a fresh one per store.
   *
   * Accepting it here rather than only creating it internally lets a test assert on
   * the *same* lock the store hands its thunks — which is the only way to verify the
   * claim that bootstrap and the 401 wrapper genuinely share one.
   */
  refreshMutex?: Mutex;
}

/**
 * Builds a fully wired store.
 *
 * A factory rather than a module-level singleton for two reasons. It keeps the
 * native storage dependencies out of this module (see above), and it lets every test
 * construct a **fresh** store — a shared store leaks state between tests, including
 * the RTK Query cache, which is the classic "passes alone, fails in the suite" flake.
 *
 * @returns A configured store. The app's singleton lives in `./index.ts`.
 */
export function createAppStore({
  storage,
  secretStore,
  refreshMutex = new Mutex(),
}: CreateAppStoreOptions) {
  const listenerMiddleware = createListenerMiddleware();
  registerPreferencePersistence(listenerMiddleware, storage);

  // Read persisted preferences *before* the store exists and seed them as
  // preloadedState. MMKV is synchronous, so this costs nothing and means the very
  // first render already has the user's theme — no rehydration action, no flash of
  // the wrong scheme on cold start.
  const persistedPreferences = parsePreferences(
    storage.getString(PREFERENCES_STORAGE_KEY),
  );

  // One mutex per store by default: see the note on AppThunkExtra for why this is
  // not a module-level singleton.
  const extra: AppThunkExtra = { secretStore, refreshMutex };

  return configureStore({
    reducer: rootReducer,
    preloadedState: persistedPreferences
      ? { [PREFERENCES_SLICE_NAME]: persistedPreferences }
      : undefined,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        // Reaches the base query as `api.extra` and thunks as their third argument.
        thunk: { extraArgument: extra },
      })
        // `prepend`, not `concat`: the listener middleware must observe actions
        // before they reach the reducers' downstream middleware so its effects run
        // against already-updated state.
        .prepend(listenerMiddleware.middleware)
        // RTK Query's middleware must come after the defaults — it relies on thunk
        // being in place — and is required for caching, invalidation and polling.
        .concat(api.middleware),
  });
}

/** The store type, for `useStore` and for passing a store around in tests. */
export type AppStore = ReturnType<typeof createAppStore>;

/** The shape of the whole state tree. Derived from the reducer, not the store. */
export type RootState = ReturnType<typeof rootReducer>;

/** Dispatch, typed so thunks and RTK Query actions are accepted. */
export type AppDispatch = AppStore['dispatch'];
