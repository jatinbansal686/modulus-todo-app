/**
 * Semantic theme layer.
 *
 * `tokens.js` holds raw values ("what colours exist"); this module holds meaning
 * ("what the app calls the thing you put text on"). Components should read from
 * here, never from the raw ramps, so a palette change is a one-line edit rather
 * than a search-and-replace across screens.
 *
 * Types are inferred from `tokens.js` by `allowJs` — there is deliberately no
 * hand-written `.d.ts`, because a hand-written one is free to drift from the
 * values it claims to describe.
 */
import tokens from './tokens';

import type { TaskPriority } from '../types/task';

export { tokens };

/** Which of the two palettes is active. */
export type ColorScheme = 'light' | 'dark';

/**
 * The contract every screen codes against.
 *
 * Both themes below satisfy this, so a component can take a `Theme` and be
 * guaranteed the key it wants exists in light and dark alike — the failure mode
 * where a colour is only defined in dark mode becomes a compile error.
 */
export interface Theme {
  scheme: ColorScheme;

  /** Page background — the lowest elevation level. */
  bg: string;
  /** A card or row sitting on the background. */
  surface: string;
  /** A surface on a surface: composer fields, pressed rows. */
  surfaceRaised: string;
  /** Highest level: menus, dialogs, snackbars. */
  surfaceOverlay: string;

  /** Hairline separators. */
  border: string;
  /** Borders that must survive on a raised surface — inputs, focus rings. */
  borderStrong: string;

  /** Primary reading colour. */
  text: string;
  /** Secondary copy: metadata, timestamps, helper text. */
  textMuted: string;
  /** Tertiary copy: placeholders, disabled labels. */
  textFaint: string;

  /** The single cool accent, at the step that survives this scheme's ground. */
  accent: string;
  /** A low-alpha-feeling accent wash for chips and selected states. */
  accentSoft: string;
  /** Text/iconography placed *on* an accent fill. */
  onAccent: string;

  /** Priority ramp — hue walk, not traffic lights. Same in both schemes. */
  priority: Record<TaskPriority, string>;

  /** Semantic feedback colours. Deliberately separate from `priority`. */
  status: typeof tokens.status;

  /**
   * Stops for the continuous urgency rail and ring, ready to hand straight to
   * Reanimated's `interpolateColor(score, inputRange, outputRange)`.
   */
  urgency: typeof tokens.urgency;
}

/**
 * Dark theme — the app's primary look, and the one the screenshots lead with.
 *
 * Surfaces climb the `elevation.dark` tint ramp rather than casting shadows:
 * an Android elevation shadow is essentially invisible against `#0B0F14`.
 */
export const darkTheme: Theme = {
  scheme: 'dark',

  bg: tokens.elevation.dark[0],
  surface: tokens.elevation.dark[1],
  surfaceRaised: tokens.elevation.dark[2],
  surfaceOverlay: tokens.elevation.dark[3],

  border: tokens.neutral[800],
  borderStrong: tokens.neutral[700],

  text: '#E8EDF4',
  textMuted: tokens.neutral[400],
  textFaint: tokens.neutral[500],

  accent: tokens.accent[400],
  accentSoft: tokens.accent[900],
  onAccent: tokens.neutral[950],

  priority: tokens.priority,
  status: tokens.status,
  urgency: tokens.urgency,
};

/**
 * Light theme.
 *
 * Note the ground is `#FAFAF9` while cards are pure white — the inverse of the
 * dark scheme, where the ground is darkest. Elevation reads as "closer to white"
 * in light and "closer to blue-grey" in dark; in both cases it is tint, not shadow.
 */
export const lightTheme: Theme = {
  scheme: 'light',

  bg: tokens.elevation.light[0],
  surface: tokens.elevation.light[1],
  surfaceRaised: tokens.elevation.light[2],
  surfaceOverlay: tokens.elevation.light[3],

  border: tokens.neutral[200],
  borderStrong: tokens.neutral[300],

  text: '#0F1720',
  textMuted: tokens.neutral[600],
  textFaint: tokens.neutral[500],

  accent: tokens.accent[500],
  accentSoft: tokens.accent[50],
  onAccent: tokens.neutral[0],

  priority: tokens.priority,
  status: tokens.status,
  urgency: tokens.urgency,
};

/** Look up a theme by scheme name. */
export const themes: Record<ColorScheme, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};
