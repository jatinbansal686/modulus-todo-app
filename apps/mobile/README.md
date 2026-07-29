# `apps/mobile` — React Native CLI + TypeScript

Android to-do client for the NestJS API in `../api`.

## Commands

```bash
npm start              # Metro
npm run android        # build, install and launch on a connected device/emulator
npm run lint           # ESLint 9 (flat config)
npm run typecheck      # tsc --noEmit
npm test               # Jest
npm run generate-icons # regenerate launcher icons from assets/logo.svg
```

The emulator cannot reach `localhost` — inside the AVD that address is the
emulator itself. The API is at `10.0.2.2:3000` (handled in
`src/shared/config/env.ts`); on a physical device use
`adb reverse tcp:3000 tcp:3000`.

## Layout

Feature-sliced, so "add a feature" means "add one folder":

```
src/
├── app/          providers, navigation, the App root
├── features/     preferences · diagnostics  (auth, tasks to follow)
├── shared/       theme · lib · config · types      — depends on nothing above
└── store/        Redux store factory and typed hooks
```

Imports across layers use aliases (`@app`, `@features`, `@shared`, `@store`);
imports _within_ a module stay relative. That way an import line shows when it
crosses an architectural boundary — `shared` reaching up into `features` is
visible at the point it happens.

⚠️ The alias map exists in **two** places that must stay identical:
`compilerOptions.paths` in `tsconfig.json` and `module-resolver` in
`babel.config.js`. Metro does not read `tsconfig` paths at all, so editing one
without the other gives either a red squiggle on working code or a runtime
resolution failure on code that typechecks.

## Styling

**NativeWind for static layout and theme; plain `StyleSheet` for anything
animated.** Not a preference — see §8 of [`docs/ui-spec.md`](../../docs/ui-spec.md).

All colours, spacing, radii and type sizes come from **one** file,
`src/shared/theme/tokens.js`. `tailwind.config.js` imports it, and
`src/shared/theme/index.ts` re-exports it with types plus the semantic light/dark
themes. Components read the semantic theme (`theme.accent`), never the raw ramps.

## The native smoke panel

`src/features/diagnostics` renders one row per native module with a live
pass/fail assertion, and logs a single line — `SMOKE: 9/9 passed` — to logcat.

It exists because installing nine native modules and then building gives no
bisect: a failure surfaces as a blank screen with a stack trace pointing into the
bridge. Each check calls into its library for real (an actual MMKV write/read, an
actual Keychain round-trip) rather than checking that an import is truthy, since a
missing native module usually still yields a JS object.

It is `__DEV__` scaffolding and is replaced by the task list.

## Testing

Native modules do not exist in Node, and MMKV initialises through Nitro at
_import_ time — so any test reaching the store singleton would throw while the
module graph is still loading. Two defences:

1. `createAppStore({ storage })` takes its storage as a parameter, so tests inject
   `createMemoryStorage()` and never touch MMKV. Import `@store/create-store`,
   never `@store`.
2. `jest.setup.js` mocks MMKV, Keychain and Nitro as a second layer.

`jest.config.js` extends `transformIgnorePatterns` for packages that publish
untranspiled ESM — including `react-native-worklets` (split out of Reanimated 4)
and `immer`, whose `exports` map has a `react-native` condition pointing at ESM.

## Release signing

`android/app/keystore.properties` and `android/app/release.keystore` are
**gitignored**. When absent — a fresh clone, or CI — `assembleRelease` falls back
to debug signing so the release variant still compiles. The APK that ships is
built on the machine holding the keystore; `./gradlew signingReport` shows which
key was used.
