import { createContext, useContext } from 'react';

import { darkTheme } from './index';

import type { Theme } from './index';

/**
 * Carries the resolved {@link Theme} down the tree.
 *
 * ## Why the context lives in `shared` but the provider lives in `app`
 *
 * Under feature-sliced layering, `shared` is the bottom layer and may not import
 * from `features`. Resolving the active theme needs the user's *preference*, which
 * is feature state — so if `useTheme()` read the Redux selector directly, `shared`
 * would depend on `features/preferences` and the layering would invert.
 *
 * Splitting it fixes that cleanly: this module knows only "there is a Theme in
 * context", and `app/providers/theme-provider.tsx` — which sits above both layers
 * and is allowed to see everything — does the actual resolving.
 *
 * The practical payoff is that any component can be rendered in a test by wrapping
 * it in a bare `ThemeContext.Provider`, with no store at all.
 */
export const ThemeContext = createContext<Theme>(darkTheme);

/**
 * Reads the active theme.
 *
 * Falls back to the dark theme when no provider is present, so a component rendered
 * bare in a test gets real colours rather than crashing on `undefined.text`.
 *
 * @returns The theme for the current colour scheme.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
