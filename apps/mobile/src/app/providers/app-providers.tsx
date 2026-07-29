import React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import { store } from '@store';
import { ThemeProvider } from './theme-provider';

import type { PropsWithChildren } from 'react';

/**
 * Every app-wide provider, in the one order that works.
 *
 * `ReduxProvider` must be outermost because `ThemeProvider` reads the theme
 * preference out of the store. `SafeAreaProvider` sits between them so insets are
 * available to everything below, including the theme-aware chrome.
 *
 * ⚠️ Importing this module constructs the store, and therefore MMKV. It is the
 * app's composition root; tests should compose providers themselves around a
 * store built with `createMemoryStorage()`.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ReduxProvider store={store}>
      {/*
        `initialWindowMetrics` is the synchronously-read inset snapshot. Passing it
        lets the first frame render with correct padding instead of rendering at
        zero insets and then jumping once the native module reports back — which,
        under the mandatory edge-to-edge on API 36, is a visible jolt of the header
        out from under the status bar.
      */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>{children}</ThemeProvider>
      </SafeAreaProvider>
    </ReduxProvider>
  );
}
