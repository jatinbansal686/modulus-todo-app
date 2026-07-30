import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Info, TriangleAlert } from 'lucide-react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';

/** How loudly the notice should read. */
export type NoticeTone = 'danger' | 'info';

interface Props {
  tone: NoticeTone;
  /** The sentence to show. */
  message: string;
  /**
   * The API's error code, rendered as a small tag beside the message.
   *
   * Shown rather than swallowed on purpose: it is the contract made visible, it
   * makes a screenshot in a bug report actionable, and the brief asks specifically
   * that validation errors surface the server's own code.
   */
  code?: string | null;
  /** Accessibility name for the whole panel. */
  label: string;
}

/**
 * A designed inline message — the app's error and information state.
 *
 * Deliberately not an `Alert.alert()`. A system dialog interrupts, has to be
 * dismissed before the form can be corrected, and cannot be screenshotted as part
 * of the screen it belongs to. This sits in the layout, stays visible while the
 * user fixes the problem, and is styled like the rest of the app.
 */
export function Notice({ tone, message, code, label }: Props) {
  const theme = useTheme();

  const accent = tone === 'danger' ? theme.status.danger : theme.accent;
  const Icon = tone === 'danger' ? TriangleAlert : Info;

  return (
    <View
      // ⚠️ `accessible` is required, not decorative. A `View` is not an
      // accessibility element by default, so without it the icon, the message and
      // the code are announced as three unrelated fragments — and RNTL's `byRole`
      // query, which only matches accessibility elements, cannot find the panel at
      // all. Grouping them is both the correct announcement and what makes the
      // panel assertable.
      accessible
      // A role and a name, so a test can assert the panel appeared without
      // matching on the message copy — which is the part most likely to be edited.
      accessibilityRole="alert"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          // The tone is carried by a left rail rather than a tinted fill: a
          // washed background at this opacity is close to invisible on the light
          // theme's near-white ground.
          borderLeftColor: accent,
          borderColor: theme.border,
        },
      ]}
    >
      <Icon size={16} color={accent} style={styles.icon} />

      <View style={styles.body}>
        <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
        {code ? (
          <Text style={[styles.code, { color: theme.textFaint }]}>{code}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  icon: {
    // Nudged down to sit on the first line's optical centre rather than its box.
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: tokens.spacing[0.5],
  },
  message: {
    ...tokens.typography.caption,
  },
  code: {
    ...tokens.typography.micro,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
