import React from 'react';
import { StyleSheet } from 'react-native';
import { screen, userEvent } from '@testing-library/react-native';

import { themeModeChanged } from '@features/preferences/model/preferences.slice';
import { darkTheme } from '@shared/theme';
import { createTestStore } from '@shared/test/create-test-store';
import { renderWithProviders } from '@shared/test/render-with-providers';
import { PrimaryButton } from './primary-button';

import type { ReactElement } from 'react';

/**
 * Renders with the dark theme pinned.
 *
 * Without this the provider resolves through `useColorScheme()`, whose Jest mock
 * reports `light` — so the assertions below would be pinned to a React Native
 * implementation detail rather than to anything this component decides.
 */
async function renderDark(ui: ReactElement) {
  const store = createTestStore();
  store.dispatch(themeModeChanged('dark'));
  return renderWithProviders(ui, { store });
}

/** The button's resolved style, flattened the way the renderer would. */
function buttonStyle() {
  const button = screen.getByRole('button', { name: 'Sign in' });
  return StyleSheet.flatten(button.props.style) as Record<string, unknown>;
}

describe('PrimaryButton', () => {
  /**
   * Pins the button's geometry and fill.
   *
   * ⚠️ **This does not guard the bug that motivated it, and saying so matters.**
   * The button originally used `Pressable`'s documented
   * `style={({ pressed }) => [...]}` callback, which NativeWind silently discards
   * under Metro — on device it rendered with no height, no radius, no background
   * and its label flush left.
   *
   * Reintroducing that form was mutation-tested against this file: the suite
   * stays **green**. Jest never imports `global.css`, so css-interop stays in
   * passthrough and resolves the callback correctly. A test in Node structurally
   * cannot see the difference.
   *
   * The actual guard is the `no-restricted-syntax` rule in `eslint.config.js`,
   * which is static and therefore immune to that asymmetry. What this test still
   * earns is narrower and worth keeping: it catches the ordinary regressions —
   * a dropped token, a changed height, an inert fill on an enabled button.
   *
   * @see docs/ui-spec.md §8 — the styling boundary rule this belongs to.
   */
  it('resolves its geometry and the accent fill', async () => {
    await renderDark(<PrimaryButton label="Sign in" onPress={jest.fn()} />);

    const style = buttonStyle();
    expect(style.height).toBe(52);
    expect(style.borderRadius).toBe(12);
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('center');
    // The accent fill, not the inert surface.
    expect(style.backgroundColor).toBe(darkTheme.accent);
  });

  it('renders inert and refuses presses while busy', async () => {
    const onPress = jest.fn();
    await renderDark(
      <PrimaryButton
        label="Sign in"
        busyLabel="Signing in…"
        busy
        onPress={onPress}
      />,
    );

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState.busy).toBe(true);
    // The fill drops back to the inert surface so the state is visible, not only
    // announced.
    expect(buttonStyle().backgroundColor).toBe(darkTheme.surfaceRaised);

    const user = userEvent.setup();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps its accessibility name stable while the visible label changes', async () => {
    await renderDark(
      <PrimaryButton
        label="Sign in"
        busyLabel="Signing in…"
        busy
        onPress={jest.fn()}
      />,
    );

    // The visible text reports progress...
    expect(screen.getByText('Signing in…')).toBeTruthy();
    // ...while the control keeps the same name, so a screen-reader user's mental
    // map — and every test that finds it — survives the state change.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
