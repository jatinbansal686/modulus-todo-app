const tokens = require('./src/shared/theme/tokens');

/**
 * Tailwind is configured *from* the design tokens, never alongside them.
 *
 * `src/shared/theme/tokens.js` is the single source of truth; this file adapts it
 * into Tailwind's vocabulary. The alternative — a palette here and a matching one
 * in TypeScript — drifts the moment anyone tweaks a colour, and the drift is
 * invisible until a screenshot looks wrong.
 *
 * @see ./src/shared/theme/tokens.js
 * @see ../../docs/ui-spec.md
 */

/** Tailwind wants dimensions as CSS-ish strings; the tokens are plain numbers. */
const toPx = (table) =>
  Object.fromEntries(
    Object.entries(table).map(([key, value]) => [key, `${value}px`]),
  );

/** Tailwind's fontSize shape is `[size, { lineHeight }]`. */
const toFontSizes = (table) =>
  Object.fromEntries(
    Object.entries(table).map(([key, { fontSize, lineHeight }]) => [
      key,
      [`${fontSize}px`, { lineHeight: `${lineHeight}px` }],
    ]),
  );

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        neutral: tokens.neutral,
        accent: tokens.accent,
        // Lower-cased so the class reads `bg-priority-urgent`; the TS side keeps
        // the API's upper-case enum values.
        priority: Object.fromEntries(
          Object.entries(tokens.priority).map(([key, value]) => [
            key.toLowerCase(),
            value,
          ]),
        ),
        ...tokens.status,
      },
      // Restating these overrides Tailwind's defaults with identical values (its
      // `4` is 1rem, which NativeWind resolves to 16px). Explicit px keeps the
      // Tailwind classes and the StyleSheet objects provably in step rather than
      // coincidentally in agreement.
      spacing: toPx(tokens.spacing),
      borderRadius: toPx(tokens.radius),
      fontSize: toFontSizes(tokens.typography),
    },
  },
  plugins: [],
};
