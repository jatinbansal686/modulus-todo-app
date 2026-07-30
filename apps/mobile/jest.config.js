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

  // No `moduleNameMapper` for the @shared/@store/... aliases, on purpose. Jest
  // transforms through babel-jest, which applies babel.config.js, which already
  // contains `babel-plugin-module-resolver` — so aliases are rewritten before
  // Jest's resolver sees them. A mapper here would be a *third* copy of the alias
  // map to keep in sync with tsconfig and babel.
  transformIgnorePatterns: [
    `node_modules/(?!(${PACKAGES_NEEDING_TRANSFORM.join('|')})/)`,
  ],

  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    // Dev-only diagnostics. Its whole purpose is to talk to native modules, which
    // do not exist in Node — covering it would mean mocking the very things it
    // exists to verify.
    '!src/features/diagnostics/**',
  ],
  // Reported, never gated. A coverage threshold fails the build for a reason
  // unrelated to correctness, usually at the worst possible moment.
  coverageReporters: ['text-summary', 'lcov'],
};
