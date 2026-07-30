import React, { forwardRef, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';

import type { TextInputProps } from 'react-native';

/** Everything a `TextInput` takes, plus the chrome around it. */
export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  /** Visible label, and the accessibility name the tests look the field up by. */
  label: string;
  /** Validation message. Its presence is what puts the field in its error state. */
  error?: string;
  /** Always-visible helper text, shown when there is no error to show instead. */
  hint?: string;
  /**
   * Render a show/hide toggle and start obscured.
   *
   * Preferred over setting `secureTextEntry` directly, which gives a password field
   * with no way to check what was typed — on a phone keyboard, the most common
   * reason a correct password gets typed wrong.
   */
  secure?: boolean;
}

/**
 * A labelled text input with validation state.
 *
 * ## Accessibility is not decoration here
 *
 * RNTL v14 exposes **host elements only** and removed `UNSAFE_getByType` /
 * `UNSAFE_getByProps`. Without the `accessibilityLabel` below, no component test
 * could locate this field at all — so the label is a testing requirement first and
 * a screen-reader affordance second. The same is true of the toggle's button role.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  // Named (rather than an anonymous arrow) so React DevTools and RNTL's tree dumps
  // show something better than `ForwardRef`. Suffixed to avoid shadowing the const.
  function TextFieldImpl(
    { label, error, hint, secure = false, ...inputProps },
    ref,
  ) {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);

    const invalid = Boolean(error);

    // Focus and error both speak through the border, and error outranks focus: a
    // field you are typing into that is also wrong must not look merely focused.
    const borderColor = invalid
      ? theme.status.danger
      : focused
        ? theme.accent
        : theme.borderStrong;

    const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
      (event) => {
        setFocused(true);
        inputProps.onFocus?.(event);
      },
      [inputProps],
    );

    const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
      (event) => {
        setFocused(false);
        inputProps.onBlur?.(event);
      },
      [inputProps],
    );

    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>

        <View
          style={[
            styles.inputRow,
            // A heavier ring only while focused or wrong. Cheaper than a shadow,
            // invisible when it should be, and it survives the near-black ground
            // where an Android elevation shadow would not.
            focused || invalid
              ? styles.inputRowEmphasised
              : styles.inputRowResting,
            { backgroundColor: theme.surfaceRaised, borderColor },
          ]}
        >
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            placeholderTextColor={theme.textFaint}
            // `secure` starts obscured; the toggle below is what reveals it.
            secureTextEntry={secure && !revealed}
            style={[styles.input, { color: theme.text }]}
            {...inputProps}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />

          {secure ? (
            <Pressable
              accessibilityRole="button"
              // The label states what the action *does*, not what the field is
              // currently showing — the two read identically in a list of
              // accessibility labels and only one of them is actionable.
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              onPress={() => setRevealed((current) => !current)}
              // Widen the touch target past the icon's own 18px, which is under
              // the 44px minimum on its own.
              hitSlop={tokens.spacing[3]}
              style={styles.reveal}
            >
              {revealed ? (
                <EyeOff size={18} color={theme.textMuted} />
              ) : (
                <Eye size={18} color={theme.textMuted} />
              )}
            </Pressable>
          ) : null}
        </View>

        {invalid ? (
          <Text
            // Announces the message when it appears, rather than leaving a
            // screen-reader user to discover the field is now invalid.
            accessibilityLiveRegion="polite"
            style={[styles.message, { color: theme.status.danger }]}
          >
            {error}
          </Text>
        ) : hint ? (
          <Text style={[styles.message, { color: theme.textFaint }]}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing[1.5],
  },
  label: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[3],
  },
  inputRowResting: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputRowEmphasised: {
    borderWidth: 1.5,
  },
  input: {
    ...tokens.typography.body,
    flex: 1,
    // A fixed height rather than vertical padding: Android sizes a TextInput from
    // its font metrics, so padding alone leaves the two fields visibly different
    // heights once one of them is a password field.
    height: 48,
    padding: 0,
  },
  reveal: {
    paddingLeft: tokens.spacing[2],
  },
  message: {
    ...tokens.typography.caption,
  },
});
