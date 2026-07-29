import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
} from '@reduxjs/toolkit';

import { registerPreferencePersistence } from '@features/preferences/model/preferences.persistence';
import {
  PREFERENCES_SLICE_NAME,
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  preferencesReducer,
} from '@features/preferences/model/preferences.slice';

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
  [PREFERENCES_SLICE_NAME]: preferencesReducer,
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
}

/**
 * Builds a fully wired store.
 *
 * A factory rather than a module-level singleton for two reasons. It keeps the
 * native storage dependency out of this module (see above), and it lets every test
 * construct a **fresh** store — a shared store leaks state between tests, and once
 * RTK Query arrives in the next PR it would leak the request cache too, which is
 * the classic "passes alone, fails in the suite" flake.
 *
 * @returns A configured store. The app's singleton lives in `./index.ts`.
 */
export function createAppStore({ storage }: CreateAppStoreOptions) {
  const listenerMiddleware = createListenerMiddleware();
  registerPreferencePersistence(listenerMiddleware, storage);

  // Read persisted preferences *before* the store exists and seed them as
  // preloadedState. MMKV is synchronous, so this costs nothing and means the very
  // first render already has the user's theme — no rehydration action, no flash of
  // the wrong scheme on cold start.
  const persistedPreferences = parsePreferences(
    storage.getString(PREFERENCES_STORAGE_KEY),
  );

  return configureStore({
    reducer: rootReducer,
    preloadedState: persistedPreferences
      ? { [PREFERENCES_SLICE_NAME]: persistedPreferences }
      : undefined,
    // `prepend`, not `concat`: the listener middleware must observe actions before
    // they reach the reducers' downstream middleware so its effects run against
    // already-updated state.
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(listenerMiddleware.middleware),
  });
}

/** The store type, for `useStore` and for passing a store around in tests. */
export type AppStore = ReturnType<typeof createAppStore>;

/** The shape of the whole state tree. Derived from the reducer, not the store. */
export type RootState = ReturnType<typeof rootReducer>;

/** Dispatch, typed so thunks and RTK Query actions are accepted. */
export type AppDispatch = AppStore['dispatch'];
