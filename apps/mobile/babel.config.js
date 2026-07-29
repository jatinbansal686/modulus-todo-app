module.exports = {
  presets: [
    'module:@react-native/babel-preset',

    /*
     * NativeWind's preset. It does three things, and the third is easy to miss:
     *   1. runs the css-interop Babel plugin,
     *   2. re-points the automatic JSX runtime at `react-native-css-interop`,
     *   3. appends `react-native-worklets/plugin` — Reanimated 4's plugin — LAST.
     *
     * Because of (3) the worklets plugin is deliberately NOT listed in `plugins`
     * below: listing it in both places applies it twice. The smoke panel's
     * reanimated check asserts a `'worklet'` function is still transformed, so if
     * this arrangement ever stops supplying the plugin, that check fails loudly
     * rather than animations quietly dropping to the JS thread.
     *
     * (2) is also what makes the styling boundary rule in docs/ui-spec.md
     * necessary — see the note there on css-interop #1781.
     */
    'nativewind/babel',
  ],
  plugins: [
    /*
     * Path aliases.
     *
     * These MUST mirror `compilerOptions.paths` in tsconfig.json exactly. Metro
     * does not read tsconfig `paths` at all — TypeScript would resolve `@shared/x`
     * happily while the bundler failed to find the module at runtime, so the two
     * maps are two halves of one setting and any drift produces a "module not
     * found" in a file that typechecks clean.
     *
     * Layer-named aliases rather than a single `@/`: an import line then shows
     * which architectural layer it crosses, so `shared` reaching up into
     * `features` is visible at the point it happens.
     */
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@app': './src/app',
          '@features': './src/features',
          '@shared': './src/shared',
          '@store': './src/store',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
  ],
};
