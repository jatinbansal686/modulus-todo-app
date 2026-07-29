import React from 'react';
import { useColorScheme } from 'react-native';

import { selectThemeMode } from '@features/preferences/model/preferences.slice';
import { themes } from '@shared/theme';
import { ThemeContext } from '@shared/theme/theme-context';
import { useAppSelector } from '@store/hooks';

import type { ColorScheme } from '@shared/theme';
import type { PropsWithChildren } from 'react';

/**
 * Resolves the user's theme preference into a concrete {@link Theme} and provides it.
 *
 * Lives in the `app` layer because it is the one place allowed to see both
 * `features` (the preference) and `shared` (the palette) — see the note in
 * `shared/theme/theme-context.ts` for why the context itself lives lower down.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const themeMode = useAppSelector(selectThemeMode);
  const systemScheme = useColorScheme();

  // `useColorScheme()` is wider than it looks: besides 'light' and 'dark' it can
  // return null (before the OS has reported) *and* the literal 'unspecified'. A
  // `?? 'dark'` would let 'unspecified' through as a scheme name and index the
  // theme map with a missing key — so the two valid values are matched explicitly.
  //
  // The ambiguous case falls back to dark rather than light so it lands on the
  // app's primary look instead of flashing white on a device that was never going
  // to be light.
  const resolvedScheme: ColorScheme =
    themeMode === 'system'
      ? systemScheme === 'light' || systemScheme === 'dark'
        ? systemScheme
        : 'dark'
      : themeMode;

  const theme = themes[resolvedScheme];

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}
