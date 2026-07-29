import React from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  THEME_MODES,
  selectThemeMode,
  themeModeChanged,
} from '@features/preferences/model/preferences.slice';
import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { SmokePanel } from '../components/smoke-panel';

import type { TaskPriority } from '@shared/types/task';

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/**
 * Foundation screen — the visible proof that the native stack, the store and the
 * design tokens all work together.
 *
 * This is scaffolding, not product: the task list replaces it once the API client
 * and auth land. It earns its place in this PR by exercising every piece of the
 * foundation in a way a screenshot can verify — theme preference round-trips
 * through MMKV, tokens render, and every native module reports in.
 */
export function FoundationScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector(selectThemeMode);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/*
        Edge-to-edge is mandatory on API 36, so the app draws behind the status
        bar and we only control the icon colour. `translucent` plus a transparent
        background is the combination that does not fight the system.
      */}
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            // Padding comes from the live insets, never from a hardcoded status
            // bar height and never from the deprecated `SafeAreaView`.
            paddingTop: insets.top + tokens.spacing[4],
            paddingBottom: insets.bottom + tokens.spacing[8],
          },
        ]}
      >
        <View style={styles.headerBlock}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>
            Modulus To-Do
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>Foundation</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Native stack, store and design tokens, verified on device.
          </Text>
        </View>

        <SmokePanel />

        <Section title="Theme" theme={theme}>
          <View style={styles.segmented}>
            {THEME_MODES.map((mode) => {
              const selected = mode === themeMode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Use ${mode} theme`}
                  onPress={() => dispatch(themeModeChanged(mode))}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: selected
                        ? theme.accent
                        : theme.surfaceRaised,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: selected ? theme.onAccent : theme.textMuted },
                    ]}
                  >
                    {mode}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: theme.textFaint }]}>
            Persisted to MMKV. Force-quit and relaunch — it survives.
          </Text>
        </Section>

        <Section title="Priority ramp" theme={theme}>
          <View style={styles.swatchRow}>
            {PRIORITIES.map((priority) => (
              <View key={priority} style={styles.swatchCell}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: theme.priority[priority] },
                  ]}
                />
                <Text style={[styles.swatchLabel, { color: theme.textMuted }]}>
                  {priority}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[styles.hint, { color: theme.textFaint }]}>
            A hue walk, not traffic lights — so &quot;urgent&quot; never shares
            a colour with &quot;error&quot;.
          </Text>
        </Section>

        <Section title="Type scale" theme={theme}>
          <Text style={[tokens.typography.title, { color: theme.text }]}>
            Title 25
          </Text>
          <Text style={[tokens.typography.subtitle, { color: theme.text }]}>
            Subtitle 20
          </Text>
          <Text style={[tokens.typography.body, { color: theme.text }]}>
            Body 16 — the reading size for task titles.
          </Text>
          <Text style={[tokens.typography.caption, { color: theme.textMuted }]}>
            Caption 13 — metadata and timestamps.
          </Text>
        </Section>
      </ScrollView>
    </View>
  );
}

/** A titled block. Local to this screen — the real UI kit arrives with the task list. */
function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing[4],
    gap: tokens.spacing[4],
  },
  headerBlock: {
    gap: tokens.spacing[1],
  },
  eyebrow: {
    ...tokens.typography.caption,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    ...tokens.typography.display,
    fontWeight: '700',
  },
  subtitle: {
    ...tokens.typography.body,
  },
  section: {
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing[4],
    gap: tokens.spacing[3],
  },
  sectionTitle: {
    ...tokens.typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  segment: {
    flex: 1,
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  segmentLabel: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  hint: {
    ...tokens.typography.micro,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  swatchCell: {
    flex: 1,
    gap: tokens.spacing[1],
    alignItems: 'center',
  },
  swatch: {
    height: 40,
    width: '100%',
    borderRadius: tokens.radius.sm,
  },
  swatchLabel: {
    ...tokens.typography.micro,
    fontWeight: '600',
  },
});
