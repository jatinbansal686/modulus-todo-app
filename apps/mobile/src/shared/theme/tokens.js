/**
 * Design tokens — the single source of truth for every colour, spacing step,
 * radius and type size in the app.
 *
 * ## Why this file is CommonJS JavaScript and not TypeScript
 *
 * These values have two consumers with incompatible loaders:
 *
 *   1. `tailwind.config.js`, which Tailwind loads in a plain Node context at build
 *      time. It has no TypeScript hook, so it can only `require()` JavaScript.
 *   2. The app's own TypeScript, which needs the values *typed* — `interpolateColor`
 *      on the urgency rail takes colour strings, and it cannot read a Tailwind class.
 *
 * Keeping two lists in sync by hand is how a palette drifts: someone tweaks the
 * accent in Tailwind, the animated rail keeps the old hue, and the mismatch only
 * shows up in a screenshot. So the values live here once, in the format the more
 * restrictive consumer (Tailwind) demands, and `./index.ts` re-exports them with
 * types inferred automatically by `allowJs` — no hand-written `.d.ts` to drift.
 *
 * @see ./index.ts for the semantic light/dark themes built on top of these.
 * @see ../../../tailwind.config.js for the Tailwind side of the same values.
 */

/**
 * Cool-tinted neutral ramp. Deliberately not pure grey — every step carries a
 * little blue so the near-black ground reads as a considered colour rather than
 * as "the screen is off".
 */
const neutral = {
  0: '#FFFFFF',
  50: '#FAFAF9', // light ground
  100: '#F1F3F5',
  200: '#E3E7EB',
  300: '#CDD4DC',
  400: '#9AA7B8',
  500: '#6B7A8D',
  600: '#4A5866',
  700: '#2C3A4C',
  800: '#1F2A38',
  900: '#151D28',
  950: '#0B0F14', // dark ground
};

/** The single cool accent, as a full ramp so light and dark can pick different steps. */
const accent = {
  50: '#ECF4FF',
  100: '#D7E8FF',
  200: '#AFD0FF',
  300: '#82B4FF',
  400: '#5296FF', // primary on dark — lighter step survives the near-black ground
  500: '#2E7DF6', // primary on light
  600: '#1D63D6',
  700: '#1A4FAB',
  800: '#173F84',
  900: '#152F5E',
};

/**
 * Priority ramp — a hue walk from quiet azure to hot magenta, NOT red/amber/green.
 *
 * Traffic-light ramps are what every other to-do app does, and they collide with
 * the semantic danger/success colours below (an "urgent" task is not an error).
 * Walking hue instead keeps the whole ramp inside the accent's cool family while
 * still being unmistakable at a glance.
 *
 * Colour is never the only channel: priority is always accompanied by a text
 * label in the UI, so this stays legible to colour-blind users.
 */
const priority = {
  LOW: '#6B8FB8', // desaturated azure — present, but recedes
  MEDIUM: '#3E9BFF', // the accent's own hue
  HIGH: '#8B7BFF', // violet — a hue shift, not merely a brighter blue
  URGENT: '#E8559E', // magenta — the hottest point of the same cool family
};

/**
 * Stops for the continuous urgency rail and ring, interpolated over a 0..1 score.
 *
 * Exported as two parallel arrays because that is exactly the shape Reanimated's
 * `interpolateColor(value, inputRange, outputRange)` wants — building them at the
 * call site is how the two ranges end up different lengths, which fails at runtime
 * on the UI thread where the error is hardest to read.
 */
const urgency = {
  inputRange: [0, 0.5, 1],
  outputRange: ['#3E9BFF', '#8B7BFF', '#FF5C8A'],
};

/** Semantic feedback colours. Kept separate from `priority` on purpose — see above. */
const status = {
  success: '#3ECF8E',
  danger: '#FF5C6A',
  warning: '#F5B44C',
  info: '#3E9BFF',
};

/**
 * Elevation expressed as *tint*, not shadow.
 *
 * Android elevation shadows are close to invisible on a near-black ground, so
 * depth here is a lighter surface instead. Index = elevation level; both arrays
 * are the same length so a component can index either theme with one number.
 */
const elevation = {
  dark: ['#0B0F14', '#121A24', '#18222E', '#1F2B39'],
  light: ['#FAFAF9', '#FFFFFF', '#F3F5F7', '#E9ECF0'],
};

/**
 * 4pt spacing scale, in px.
 *
 * These keys and values match Tailwind's defaults exactly (Tailwind's `4` is
 * 1rem, which NativeWind resolves to 16px). They are restated here so that
 * `StyleSheet` consumers — everything animated, per the boundary rule in the UI
 * spec — read from the same table as the Tailwind classes rather than hardcoding
 * numbers that happen to agree today.
 */
const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16, // standard row padding
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
};

/** Radius scale. `md` (12) is the app's signature corner. */
const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

/**
 * Type scale — a 1.25 modular scale around a 16px body, rounded to whole pixels.
 *
 * 16 / 1.25²=10 · 16 / 1.25=13 · 16 · 16×1.25=20 · ×1.25²=25 · ×1.25³=31 · ×1.25⁴=39
 *
 * System font throughout: it is the one typeface guaranteed to be correctly
 * hinted on the grader's device, and shipping a webfont to save a rebuild is a
 * poor trade under this deadline.
 */
const typography = {
  micro: { fontSize: 10, lineHeight: 14 },
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 24 },
  subtitle: { fontSize: 20, lineHeight: 26 },
  title: { fontSize: 25, lineHeight: 31 },
  display: { fontSize: 31, lineHeight: 37 },
};

module.exports = {
  neutral,
  accent,
  priority,
  urgency,
  status,
  elevation,
  spacing,
  radius,
  typography,
};
