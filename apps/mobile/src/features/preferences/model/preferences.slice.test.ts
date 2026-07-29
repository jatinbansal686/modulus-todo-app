import {
  parsePreferences,
  preferencesReducer,
  themeModeChanged,
} from './preferences.slice';

import type { PreferencesState } from './preferences.slice';

describe('parsePreferences', () => {
  // Table-driven: every one of these is a real shape that can arrive off a device
  // — an absent key on first launch, a truncated write, or a blob left by an
  // earlier version of the app with a field this build no longer understands.
  const rejected: ReadonlyArray<[string, string | undefined]> = [
    ['an absent key', undefined],
    ['malformed JSON', '{"themeMode":'],
    ['a JSON primitive', '"dark"'],
    ['null', 'null'],
    ['an object with no themeMode', '{}'],
    ['an unknown themeMode', '{"themeMode":"solarized"}'],
    ['a non-string themeMode', '{"themeMode":3}'],
  ];

  it.each(rejected)('falls back to defaults for %s', (_label, raw) => {
    expect(parsePreferences(raw)).toBeUndefined();
  });

  it.each(['system', 'light', 'dark'])('accepts themeMode %s', (mode) => {
    expect(parsePreferences(JSON.stringify({ themeMode: mode }))).toEqual({
      themeMode: mode,
    });
  });

  it('drops unknown fields rather than passing them into the store', () => {
    // Forward-compatibility: a newer build may have written extra keys. They must
    // not survive into state, where they would be read as valid preferences.
    const parsed = parsePreferences(
      '{"themeMode":"dark","sortMode":"smart","rogue":true}',
    );

    expect(parsed).toEqual({ themeMode: 'dark' });
  });
});

describe('preferencesReducer', () => {
  it('defaults to following the system theme', () => {
    const state: PreferencesState = preferencesReducer(undefined, {
      type: '@@INIT',
    });

    expect(state.themeMode).toBe('system');
  });

  it('records an explicit theme choice', () => {
    const state = preferencesReducer(undefined, themeModeChanged('dark'));

    expect(state.themeMode).toBe('dark');
  });
});
