import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import BootSplash from 'react-native-bootsplash';
import * as Keychain from 'react-native-keychain';
import { createMMKV } from 'react-native-mmkv';
import {
  executeOnUIRuntimeSync,
  isWorkletFunction,
  makeMutable,
} from 'react-native-reanimated';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { screensEnabled } from 'react-native-screens';

import type { SmokeCheck } from './smoke';

/**
 * One assertion per native module.
 *
 * Each check calls into the library for real rather than asserting that an import
 * is truthy — a missing native module frequently still yields a JS object, so
 * `typeof x === 'object'` passes while the thing is comprehensively broken.
 *
 * Grows as libraries are added; the order matches the order they were installed,
 * which is also the order in which a bisect would walk them.
 */
export const nativeSmokeChecks: readonly SmokeCheck[] = [
  {
    name: 'react-native-safe-area-context',
    run: () => {
      const metrics = initialWindowMetrics;
      if (!metrics) {
        throw new Error(
          'initialWindowMetrics is null — the native module reported no insets',
        );
      }

      // This doubles as the edge-to-edge assertion. Under edge-to-edge the app
      // draws behind the status bar, so the top inset is the status bar's height.
      // If the window were still being inset by the system, this would be 0 — so a
      // non-zero value proves both that safe-area-context works *and* that
      // edge-to-edge is actually in force.
      if (metrics.insets.top <= 0) {
        throw new Error(
          `top inset is ${metrics.insets.top} — expected a positive value under edge-to-edge`,
        );
      }

      return `insets top ${Math.round(metrics.insets.top)} / bottom ${Math.round(
        metrics.insets.bottom,
      )}`;
    },
  },
  {
    name: 'react-native-screens',
    run: () => {
      if (!screensEnabled()) {
        throw new Error(
          'screensEnabled() is false — navigation would fall back to plain Views',
        );
      }
      return 'native screen containers active';
    },
  },
  {
    // The highest-risk dependency in the app. react-native-mmkv declares
    // react-native-nitro-modules as a `*` peer with no runtime dependency on it,
    // so an unpinned install resolves the newest nitro (0.36.x) while MMKV's
    // Nitrogen-generated bridge was compiled against 0.35 — which surfaces as
    // CMake failures or a runtime "Failed to get NitroModules" crash.
    //
    // A write/read round-trip is the assertion, not a truthiness check on the
    // import: the JS surface resolves fine even when the native side is broken.
    //
    // Note `createMMKV(...)`, not `new MMKV(...)` — v4 exports `MMKV` as a *type*
    // only. Constructing it throws "undefined cannot be used as a constructor",
    // which is precisely how this check earned its keep on the first run.
    name: 'react-native-mmkv + nitro-modules',
    run: () => {
      const probe = createMMKV({ id: 'modulus-todo.smoke' });
      const key = 'probe';
      // Varies per run, so a cached or stale read fails rather than passing.
      const written = `probe-${Date.now()}`;

      probe.set(key, written);
      const read = probe.getString(key);
      probe.remove(key);

      if (read !== written) {
        throw new Error(`wrote "${written}" but read back "${String(read)}"`);
      }
      return 'native write/read round-trip ok';
    },
  },
  {
    // The refresh token will live here, so this has to work. The package is the
    // least healthy dependency in the app — no release in 16 months and 177 open
    // issues — which is exactly why it gets a real round-trip through the Android
    // Keystore now rather than a discovery during the auth PR.
    //
    // Uses a dedicated `service` so it can never collide with, or clobber, the
    // real credential the auth flow stores under the default service.
    name: 'react-native-keychain',
    run: async () => {
      const service = 'modulus-todo.smoke';
      const secret = `secret-${Date.now()}`;

      await Keychain.setGenericPassword('probe', secret, { service });
      const credentials = await Keychain.getGenericPassword({ service });
      await Keychain.resetGenericPassword({ service });

      if (!credentials) {
        throw new Error(
          'getGenericPassword returned false — nothing was persisted',
        );
      }
      if (credentials.password !== secret) {
        throw new Error(
          `stored "${secret}" but read back "${credentials.password}"`,
        );
      }

      // Worth surfacing: SECURE_HARDWARE means the key is held in the TEE/StrongBox
      // rather than merely in software, which is the difference between "encrypted"
      // and "encrypted by something an attacker with the file cannot extract".
      const level = await Keychain.getSecurityLevel();
      return `keystore round-trip ok (${level ?? 'security level unreported'})`;
    },
  },
  {
    // Two distinct failure modes, two assertions.
    //
    // 1. The Babel plugin. Reanimated 4 moved it to `react-native-worklets/plugin`
    //    and it must be LAST in babel.config.js. When it is missing or misordered
    //    nothing errors — the 'worklet' directive is simply an ignored string
    //    literal, the function runs on the JS thread, and animations are merely
    //    janky. `isWorkletFunction` is the library's own way to detect that.
    //
    // 2. The UI runtime itself, exercised synchronously so a failure is a throw
    //    here rather than silence on another thread.
    name: 'react-native-reanimated + worklets',
    run: () => {
      const probe = () => {
        'worklet';
        return 42;
      };

      if (!isWorkletFunction(probe)) {
        throw new Error(
          "the 'worklet' directive was not transformed — is " +
            "'react-native-worklets/plugin' present and LAST in babel.config.js?",
        );
      }

      const shared = makeMutable(0);
      // Runs on the UI runtime and blocks until it returns, so this proves the
      // worklet actually executed there rather than being silently skipped.
      const fromUiThread = executeOnUIRuntimeSync(() => {
        'worklet';
        shared.value = 42;
        return shared.value;
      })();

      if (fromUiThread !== 42) {
        throw new Error(
          `UI runtime returned ${String(fromUiThread)}, expected 42`,
        );
      }

      return 'worklet transformed and executed on the UI runtime';
    },
  },
  {
    // Deliberately does not *open* the dialog: a smoke check that hijacks the
    // screen every launch is worse than the bug it guards against. The imperative
    // Android API is attached by the native module, so its presence is the signal
    // that autolinking wired the module up.
    name: '@react-native-community/datetimepicker',
    run: () => {
      if (typeof DateTimePickerAndroid.open !== 'function') {
        throw new Error(
          'DateTimePickerAndroid.open is missing — the native module did not link',
        );
      }
      return 'android imperative picker API present';
    },
  },
  {
    // `isVisible()` crosses the bridge and reads real activity state, so it fails
    // if the native side is unlinked or if MainActivity never called
    // `RNBootSplash.init` — the latter being a silent misconfiguration that
    // otherwise shows up only as a white flash on cold start.
    name: 'react-native-bootsplash',
    run: async () => {
      const visible = await BootSplash.isVisible();
      return `native splash queried (visible: ${String(visible)})`;
    },
  },
];
