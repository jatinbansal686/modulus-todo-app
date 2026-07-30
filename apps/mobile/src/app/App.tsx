import React from 'react';

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
 *
 * The boot splash is dismissed by `useAuthSession` inside the navigator, once the
 * auth bootstrap has decided which stack to show — not here on first frame.
 */
export default function App() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
