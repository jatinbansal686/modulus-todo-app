import React, { useEffect } from 'react';
import BootSplash from 'react-native-bootsplash';

// Must be imported exactly once, at the root. This is what loads the Tailwind
// output that react-native-css-interop turns into real styles; without it every
// `className` in the app silently resolves to nothing.
import '../../global.css';

import { RootNavigator } from './navigation/root-navigator';
import { AppProviders } from './providers/app-providers';
import { assertProductionUrlConfigured } from '@shared/config/env';

// Runs once at module evaluation, before the first render. A release build whose
// API URL was never substituted fails here — loudly, on launch — instead of
// installing cleanly and then failing every request on the grader's device.
assertProductionUrlConfigured();

/**
 * Application root.
 *
 * Deliberately thin: providers in one place, navigation in another, and nothing
 * else. Everything that could go here instead goes in a provider, so the order
 * dependencies between them stay visible in a single file.
 */
export default function App() {
  useEffect(() => {
    /*
     * Dismiss the native splash once the first React frame is up.
     *
     * ⚠️ Interim. The splash exists to cover the auth bootstrap — reading the
     * refresh token out of the Keychain is a Promise, so the signed-in/signed-out
     * decision is not available synchronously, and hiding the splash before it
     * resolves is what produces a visible flash of the Login screen on every cold
     * start. The API client PR replaces this unconditional hide with one that
     * waits on that bootstrap, capped at ~1.5s so a cold server cannot hold the
     * user on a splash screen indefinitely.
     *
     * Until then this must stay: bootsplash holds the splash until something
     * hides it, so without this call the app never renders at all.
     */
    void BootSplash.hide({ fade: true });
  }, []);

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
