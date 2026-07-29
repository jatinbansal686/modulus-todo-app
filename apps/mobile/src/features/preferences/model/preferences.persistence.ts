import {
  PREFERENCES_SLICE_NAME,
  PREFERENCES_STORAGE_KEY,
  themeModeChanged,
} from './preferences.slice';

import type { KeyValueStorage } from '@shared/lib/storage/types';
import type { PreferencesState } from './preferences.slice';
import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';

/**
 * Preference persistence, as ~20 lines of listener middleware.
 *
 * ## Why not `redux-persist`
 *
 * `redux-persist` published its last release in 2019 and its last commit in 2021,
 * and the Redux team has said it will not be maintained. It also solves a much
 * bigger problem than we have: rehydrating an arbitrary state tree asynchronously,
 * with transforms and migrations and a `PersistGate`. We persist one string.
 *
 * The RTK Query cache is deliberately **not** persisted, per Redux's own guidance —
 * a stale cache restored from disk is worse than a refetch.
 *
 * ## Why there is no rehydration action
 *
 * MMKV reads are *synchronous*, so the persisted state is available before
 * `configureStore` is called and is passed straight in as `preloadedState`. There
 * is no hydrate action, no loading flag, and no flash of the wrong theme.
 *
 * This is worth contrasting with auth: `react-native-keychain` returns a **Promise**,
 * so the signed-in/signed-out decision genuinely cannot be made synchronously and
 * does need an explicit bootstrap gate. Same app, two storage mechanisms, two
 * different answers — driven by whether the read is synchronous, not by taste.
 */

/** The subset of state this module reads. Keeps it independent of the root store type. */
interface PreferencesRootState {
  [PREFERENCES_SLICE_NAME]: PreferencesState;
}

/**
 * Registers the write-through listener that mirrors preferences to storage.
 *
 * Listens on the specific preference actions rather than on every dispatch: a
 * predicate that ran on all actions would serialise and write on every keystroke
 * in the composer, which is a synchronous disk write per character.
 *
 * @param listener The store's listener middleware instance.
 * @param storage Where to write. Injected so tests can pass an in-memory implementation.
 */
export function registerPreferencePersistence(
  listener: ListenerMiddlewareInstance,
  storage: KeyValueStorage,
): void {
  listener.startListening({
    matcher: themeModeChanged.match,
    effect: (_action, api) => {
      const state = api.getState() as PreferencesRootState;
      storage.set(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(state[PREFERENCES_SLICE_NAME]),
      );
    },
  });
}
