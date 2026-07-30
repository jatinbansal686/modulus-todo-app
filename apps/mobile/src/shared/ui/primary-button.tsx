import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';

interface Props {
  /** The action, in the imperative. Doubles as the accessibility name. */
  label: string;
  /** Replaces the visible text while `busy`. Falls back to `label`. */
  busyLabel?: string;
  /** A request is in flight: shows a spinner and blocks a second submit. */
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * The one filled, full-width action on a screen.
 *
 * ## Why `accessibilityLabel` stays `label` even while busy
 *
 * The visible text changes to `busyLabel` ("Signing in…") because a button that
 * looks identical before and after a tap reads as broken on a cold API that can
 * take a minute to answer. The *accessibility* name deliberately does not change:
 * a test — and a screen-reader user rebuilding their mental map — should be able to
 * find the same control throughout, and `accessibilityState.busy` is the channel
 * that already means "this is working". Swapping the name instead makes the control
 * vanish and a differently-named one appear.
 */
export function PrimaryButton({
  label,
  busyLabel,
  busy = false,
  disabled = false,
  onPress,
}: Props) {
  const theme = useTheme();

  // Busy blocks input as firmly as `disabled` does. Without this, a double tap on a
  // slow connection submits twice — on the register screen that is a duplicate-email
  // error against the account you just successfully created.
  const inert = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy }}
      disabled={inert}
      onPress={onPress}
      /*
       * ⚠️ Press feedback is a native ripple, and the `style` prop is a plain
       * array — **never** `Pressable`'s `style={({ pressed }) => ...}` callback.
       *
       * Under NativeWind's JSX runtime the callback form is silently discarded:
       * the button then renders with no height, no radius, no background and
       * left-aligned text, while every unit test still passes. Found on device,
       * confirmed against `uiautomator dump` — the button measured 63px tall
       * instead of 52dp with its label flush left.
       *
       * This is the same family as css-interop #1781 (the boundary rule in
       * docs/ui-spec.md §8), in a variant the scaffold's probe did not cover:
       * that probe passed a style *object*, which works fine. `primary-button`
       * has a regression test pinning the resolved style so this cannot return
       * silently.
       */
      android_ripple={inert ? undefined : { color: theme.onAccent }}
      style={[
        styles.button,
        { backgroundColor: inert ? theme.surfaceRaised : theme.accent },
      ]}
    >
      <View style={styles.content}>
        {busy ? (
          <ActivityIndicator size="small" color={theme.textMuted} />
        ) : null}
        <Text
          style={[
            styles.label,
            { color: inert ? theme.textFaint : theme.onAccent },
          ]}
        >
          {busy ? (busyLabel ?? label) : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: tokens.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  label: {
    ...tokens.typography.body,
    fontWeight: '700',
  },
});
