/**
 * Jest configuration.
 *
 * Two things here are not boilerplate: `transformIgnorePatterns`, and the
 * deliberate *absence* of a `moduleNameMapper` for the path aliases.
 */

/**
 * Packages shipped as untranspiled ESM/Flow that Babel must therefore process.
 *
 * `node_modules` is excluded from transformation by default, which is right for
 * almost everything and wrong for React Native's ecosystem — these publish source
 * rather than compiled CommonJS, so Jest fails on the first import with
 * `SyntaxError: Cannot use import statement outside a module`.
 *
 * ⚠️ `react-native-worklets` is the entry people miss. Reanimated 4 split it into
 * its own package, so a list copied from a Reanimated-3 project omits it and every
 * test touching an animated component fails to parse — with an error that names
 * Reanimated rather than worklets.
 *
 * ⚠️ `immer` and `react-redux` are here for a subtler reason, and neither is React
 * Native. Both publish an `exports` map with a dedicated `"react-native"` condition
 * that resolves to a `*.legacy-esm.js` bundle. Metro handles that happily; Jest,
 * resolving under the same condition via the RN preset, gets `import`/`export` and
 * throws `SyntaxError: Cannot use import statement outside a module` — while the
 * stack blames whichever slice imported Redux first.
 *
 * Checked across the whole Redux family: only these two do it. `@reduxjs/toolkit`,
 * `redux`, `reselect` and `redux-thunk` all resolve to CommonJS and must NOT be
 * added — transforming them is wasted work on every test run.
 */
const PACKAGES_NEEDING_TRANSFORM = [
  '@react-native',
  '@react-native-community',
  '@react-navigation',
  '@shopify/flash-list',
  'immer',
  'lucide-react-native',
  'nativewind',
  'react-native',
  'react-redux',
  'react-native-css-interop',
  'react-native-keychain',
  'react-native-mmkv',
  'react-native-nitro-modules',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-worklets',
];

module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],

  /*
   * Reanimated 4's worklets runtime, resolved the way it expects under Jest.
   *
   * ⚠️ Without this, *importing* `react-native-reanimated` throws
   * `TypeError: Cannot read properties of undefined (reading 'loadUnpackersWithCode')`
   * before a single assertion runs — so every test of a screen that animates dies
   * at module load, blaming a file nobody wrote.
   *
   * The cause is the platform-extension split: `NativeWorklets.native.ts` reaches
   * straight for the TurboModule, which does not exist in Node. This resolver —
   * shipped by `react-native-worklets` itself for exactly this — drops the
   * `.native` extensions inside that package so Jest picks up the plain
   * `NativeWorklets.ts` stub instead.
   *
   * Deliberately chosen over `jest.mock('react-native-reanimated', ...)` with the
   * bundled `mock.js`: that replaces the whole library, so `useAnimatedStyle`
   * returns nothing and an animated component's real code path is never executed.
   * A test that renders a screen would then be proving the mock works.
   */
  resolver: 'react-native-worklets/jest/resolver.js',

  // No `moduleNameMapper` for the @shared/@store/... aliases, on purpose. Jest
  // transforms through babel-jest, which applies babel.config.js, which already
  // contains `babel-plugin-module-resolver` — so aliases are rewritten before
  // Jest's resolver sees them. A mapper here would be a *third* copy of the alias
  // map to keep in sync with tsconfig and babel.
  transformIgnorePatterns: [
    `node_modules/(?!(${PACKAGES_NEEDING_TRANSFORM.join('|')})/)`,
  ],

  /*
   * Also transform `.mjs`, which the React Native preset does not.
   *
   * Its transform is keyed `^.+\.(js|ts|tsx)$`, so a `.mjs` file matches nothing
   * and is handed to Jest verbatim — `SyntaxError: Unexpected token 'export'`,
   * regardless of what `transformIgnorePatterns` says. The two settings answer
   * different questions ("should this be transformed?" versus "with what?") and
   * only the first one is usually the culprit, which makes this a confusing hour.
   *
   * `lucide-react-native` is the package that needs it: its `exports` map has a
   * dedicated `"react-native"` condition pointing at an ESM `.mjs` bundle. Jest
   * resolves under that condition via the RN preset and gets ESM.
   *
   * Merged with the preset's transform rather than replacing it — Jest treats
   * `transform` and `moduleNameMapper` as special cases and merges both.
   *
   * The alternative, mocking the icon set, was rejected: every icon renders
   * through `react-native-svg`, so mocking it would quietly stop testing that
   * icons mount at all.
   */
  transform: {
    '^.+\\.mjs$': 'babel-jest',
  },

  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Reported, never gated. A coverage threshold fails the build for a reason
  // unrelated to correctness, usually at the worst possible moment.
  coverageReporters: ['text-summary', 'lcov'],
};
