import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';

interface Props {
  /** The lead-in, in muted text. */
  prompt: string;
  /** The tappable part, in the accent colour. Also the accessibility name. */
  action: string;
  onPress: () => void;
}

/**
 * The "no account yet?" / "already registered?" switch between auth screens.
 *
 * One `Pressable` wrapping both halves rather than a bare word: the touch target
 * is then the whole line instead of a single accent-coloured word, and the
 * accessibility name is the action alone ("Create an account") rather than the
 * whole sentence, which is what a screen-reader user navigating by control would
 * otherwise hear.
 */
export function AuthSwitchLink({ prompt, action, onPress }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action}
      onPress={onPress}
      hitSlop={tokens.spacing[2]}
      // Plain style, native ripple — see the note in `primary-button.tsx` for why
      // `Pressable`'s `style={({ pressed }) => ...}` callback cannot be used here.
      android_ripple={{ color: theme.accentSoft, borderless: true }}
      style={styles.pressable}
    >
      <Text style={[styles.text, { color: theme.textMuted }]}>
        {prompt}{' '}
        <Text style={[styles.action, { color: theme.accent }]}>{action}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    paddingVertical: tokens.spacing[2],
  },
  text: {
    ...tokens.typography.caption,
    textAlign: 'center',
  },
  action: {
    fontWeight: '700',
  },
});
