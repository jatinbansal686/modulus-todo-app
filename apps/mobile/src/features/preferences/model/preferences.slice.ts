import { createSlice } from '@reduxjs/toolkit';

import type { PayloadAction } from '@reduxjs/toolkit';

/** Theme options offered in the UI. `system` follows the OS setting. */
export const THEME_MODES = ['system', 'light', 'dark'] as const;

/** A single theme option. Derived from {@link THEME_MODES} so the two cannot drift. */
export type ThemeMode = (typeof THEME_MODES)[number];

/**
 * User interface preferences.
 *
 * Deliberately small and entirely serialisable — this is the only slice written to
 * disk, and every field in it must survive a JSON round-trip.
 */
export interface PreferencesState {
  themeMode: ThemeMode;
}

/**
 * Storage key for the persisted blob.
 *
 * Versioned in the key itself rather than inside the payload: when the shape
 * changes incompatibly, bumping to `preferences.v2` makes old data simply not be
 * found, which falls back to defaults. That is a one-character migration, and it
 * beats writing migration code for a preferences object this small.
 */
export const PREFERENCES_STORAGE_KEY = 'preferences.v1';

const initialState: PreferencesState = {
  themeMode: 'system',
};

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    /** Sets the theme. Persisted by the listener in `preferences.persistence.ts`. */
    themeModeChanged(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
  },
  selectors: {
    selectThemeMode: (state) => state.themeMode,
  },
});

export const { themeModeChanged } = preferencesSlice.actions;
export const { selectThemeMode } = preferencesSlice.selectors;
export const preferencesReducer = preferencesSlice.reducer;
export const PREFERENCES_SLICE_NAME = preferencesSlice.name;

/**
 * Parses a persisted preferences blob, rejecting anything malformed.
 *
 * Data read back off the device is untrusted input: the file can be edited on a
 * rooted device, and — far more likely — it can be left over from a previous
 * version of this app with a different shape. Feeding an unvalidated object
 * straight into `preloadedState` would put an invalid `themeMode` into the store,
 * where it surfaces much later as a theme lookup returning `undefined`.
 *
 * Validating here means a bad blob degrades to defaults instead.
 *
 * @param raw The raw string from storage, or `undefined` if the key is absent.
 * @returns The parsed state, or `undefined` if absent, unparseable or invalid.
 */
export function parsePreferences(
  raw: string | undefined,
): PreferencesState | undefined {
  if (raw === undefined) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — a truncated write, most plausibly. Fall back to defaults.
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }

  const { themeMode } = parsed as Partial<
    Record<keyof PreferencesState, unknown>
  >;
  if (!THEME_MODES.includes(themeMode as ThemeMode)) {
    return undefined;
  }

  return { themeMode: themeMode as ThemeMode };
}
