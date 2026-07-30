import React from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render } from '@testing-library/react-native';

import { ThemeProvider } from '@app/providers/theme-provider';
import { createTestStore } from './create-test-store';

import type { AppStore } from '@store/create-store';
import type {
  RenderOptions,
  RenderResult,
} from '@testing-library/react-native';
import type { Metrics } from 'react-native-safe-area-context';
import type { ReactElement, PropsWithChildren } from 'react';

/**
 * Inset metrics for the virtual device under test.
 *
 * `SafeAreaProvider` learns real insets from a native `onLayout`, which never
 * fires in Node — so without these `useSafeAreaInsets()` suspends and any screen
 * padding from it renders nothing at all. Seeding them makes every test run
 * against the same device geometry rather than whatever a zeroed provider implies.
 *
 * Non-zero on purpose: a screen that reads `insets.top` and a screen that ignores
 * it are indistinguishable at zero, so a regression in edge-to-edge padding would
 * pass silently.
 */
const TEST_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 48, left: 0, right: 0, bottom: 24 },
};

/** Options accepted by {@link renderWithProviders}. */
export interface RenderWithProvidersOptions extends RenderOptions {
  /**
   * Store to render against. Defaults to a **fresh** one per call.
   *
   * Pass one only when the test needs to seed state or assert on it afterwards —
   * the returned `store` is the same instance either way.
   */
  store?: AppStore;
}

/** What {@link renderWithProviders} returns: RNTL's result plus the store it used. */
export interface RenderWithProvidersResult extends RenderResult {
  store: AppStore;
}

/**
 * Renders a component inside the app's real providers.
 *
 * ## A fresh store per test, and why that is not a detail
 *
 * The default is a new store for every call. A shared one leaks the RTK Query
 * cache between cases, so a test can pass alone and fail inside the suite purely
 * on ordering — and the failure surfaces as "the second sign-in returned the first
 * test's response", which reads as an app bug rather than a harness bug.
 *
 * ## Why it mirrors `AppProviders` rather than reusing it
 *
 * `AppProviders` imports the store singleton, and constructing that singleton
 * constructs MMKV — a Nitro native module that throws on import in Node. So the
 * provider stack is composed again here around an injected store. The duplication
 * is deliberate and small; the two are worth diffing by eye when either changes.
 *
 * ⚠️ RNTL v14's `render` is **async**. This must be awaited, or assertions run
 * against a tree that has not committed.
 *
 * @param ui The element under test.
 * @param options RNTL render options, plus the store override below.
 * @param options.store Store to render against. Defaults to a fresh one.
 * @returns RNTL's render result, plus the store — for dispatching setup actions
 *   and for asserting on what the component dispatched.
 */
export async function renderWithProviders(
  ui: ReactElement,
  { store = createTestStore(), ...options }: RenderWithProvidersOptions = {},
): Promise<RenderWithProvidersResult> {
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <ReduxProvider store={store}>
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          {/*
            The real ThemeProvider, not a bare context value: it resolves the
            theme from the store's preference slice, so a test renders through
            the same code path the app does.
          */}
          <ThemeProvider>{children}</ThemeProvider>
        </SafeAreaProvider>
      </ReduxProvider>
    );
  }

  const result = await render(ui, { wrapper: Wrapper, ...options });

  return { ...result, store };
}
