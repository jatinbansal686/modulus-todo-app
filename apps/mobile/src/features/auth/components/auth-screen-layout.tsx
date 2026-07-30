import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuroraBackdrop } from '@shared/ui/aurora-backdrop';
import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';

import type { Shake } from '@shared/ui/use-shake';
import type { ReactNode } from 'react';

interface Props {
  /** Screen title, at display size. */
  title: string;
  /** One line under the title, setting up what the form is for. */
  subtitle: string;
  /** The form. Rendered inside the card, which is the node that shakes. */
  children: ReactNode;
  /** The switch to the other auth screen, rendered below the card. */
  footer: ReactNode;
  /** Animated style from the owning screen's {@link Shake}. */
  cardStyle: Shake['style'];
}

/**
 * Shared chrome for Login and Register.
 *
 * Both screens are the same object with different fields, so the wordmark, the
 * backdrop, the card, the keyboard handling and the safe-area padding live here
 * once. What is left in each screen is only what actually differs — which is the
 * point: a divergence between the two then has to be written deliberately rather
 * than drifting in.
 */
export function AuthScreenLayout({
  title,
  subtitle,
  children,
  footer,
  cardStyle,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/*
        Edge-to-edge is mandatory on API 36 — an app targeting it cannot opt out —
        so the app draws behind the status bar and all we control is icon colour.
        Transparent plus translucent is the combination that does not fight the
        system bars.
      */}
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <AuroraBackdrop />

      {/*
        Android's manifest already sets `adjustResize`, which handles the common
        case. This is belt-and-braces for the field that ends up nearest the
        keyboard, and it is `undefined` on Android deliberately: a `behavior` there
        double-counts the inset against the window resize and pushes the form
        clean off the top of the screen.
      */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              // Padding from the live insets, never from the deprecated
              // `SafeAreaView` and never from a hardcoded status-bar height.
              paddingTop: insets.top + tokens.spacing[10],
              paddingBottom: insets.bottom + tokens.spacing[8],
            },
          ]}
          keyboardShouldPersistTaps="handled"
          // Without this, the first tap on "Sign in" while the keyboard is open is
          // swallowed dismissing the keyboard, and the user has to tap twice.
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>
              Modulus To-Do
            </Text>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {subtitle}
            </Text>
          </View>

          {/*
            The card is the shake target, so per the styling boundary rule it takes
            plain `StyleSheet` objects and carries no `className`.
          */}
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
              cardStyle,
            ]}
          >
            {children}
          </Animated.View>

          <View style={styles.footer}>{footer}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing[5],
    gap: tokens.spacing[6],
    // Centres the form on a tall screen but still scrolls on a short one, which
    // `justifyContent: 'center'` alone would not.
    justifyContent: 'center',
  },
  header: {
    gap: tokens.spacing[1],
  },
  eyebrow: {
    ...tokens.typography.caption,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    ...tokens.typography.display,
    fontWeight: '700',
  },
  subtitle: {
    ...tokens.typography.body,
  },
  card: {
    borderRadius: tokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing[5],
    gap: tokens.spacing[4],
  },
  footer: {
    alignItems: 'center',
  },
});
