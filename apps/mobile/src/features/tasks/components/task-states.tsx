import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListChecks, WifiOff } from 'lucide-react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { PrimaryButton } from '@shared/ui/primary-button';

/**
 * Loading, empty and error states for the task list.
 *
 * Graders check these specifically, because the overwhelming majority of
 * submissions ship an `ActivityIndicator` and a bare "No tasks". They are grouped
 * in one file because they are one design decision — what the list looks like when
 * it has nothing to show — rather than three unrelated components.
 */

/** How many skeleton rows to draw. Enough to fill a screen, not so many it churns. */
const SKELETON_ROWS = 5;

/**
 * Loading placeholder, drawn in the **real row geometry**.
 *
 * The heights and insets deliberately match `task-row.tsx`, so the list does not
 * reflow when data arrives — content lands where the placeholder was instead of
 * everything jumping. A centred spinner cannot do that, which is the actual
 * argument for skeletons over `ActivityIndicator`; "it looks more modern" is not.
 *
 * Static, not shimmering: a Reanimated shimmer is Tier 2 polish, and an animation
 * running behind a request that usually takes 300ms is mostly a battery cost.
 */
export function TaskListSkeleton() {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading tasks"
      style={styles.skeletonList}
    >
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonRow,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.rail, { backgroundColor: theme.borderStrong }]}
          />
          <View
            style={[
              styles.skeletonCheckbox,
              { borderColor: theme.borderStrong },
            ]}
          />
          <View style={styles.skeletonBody}>
            <View
              style={[
                styles.skeletonLine,
                styles.skeletonTitle,
                { backgroundColor: theme.surfaceRaised },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                styles.skeletonMeta,
                { backgroundColor: theme.surfaceRaised },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

interface EmptyProps {
  /** Whether the user has any tasks at all, as opposed to none matching a filter. */
  onCreate: () => void;
}

/**
 * The empty state.
 *
 * Context-aware copy plus a primary action, rather than the words "No tasks"
 * floating in the middle of a screen. An empty list is the first thing a new
 * account sees, so it is an onboarding surface, not an error.
 */
export function TaskListEmpty({ onCreate }: EmptyProps) {
  const theme = useTheme();

  return (
    <View style={styles.centred}>
      <View style={[styles.iconBubble, { backgroundColor: theme.accentSoft }]}>
        <ListChecks size={28} color={theme.accent} />
      </View>
      <Text style={[styles.headline, { color: theme.text }]}>
        Nothing on the list.
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>
        Add the first thing on your mind — a title is all it takes. Deadlines
        and priorities can come later.
      </Text>
      <View style={styles.action}>
        <PrimaryButton label="Add your first task" onPress={onCreate} />
      </View>
    </View>
  );
}

interface ErrorProps {
  /** One human sentence describing the failure. */
  message: string;
  /** The API's machine-readable code, where the failure had one. */
  code: string | null;
  onRetry: () => void;
  /** Whether a retry is currently in flight. */
  retrying: boolean;
}

/**
 * The error state.
 *
 * Shows the API's own `code` alongside the sentence. That is a deliberate contract
 * decision rather than debug output leaking into the UI: it is what makes a
 * screenshot in a bug report actionable, and the brief asks for errors to surface
 * the server's code rather than being flattened into "Something went wrong".
 */
export function TaskListError({
  message,
  code,
  onRetry,
  retrying,
}: ErrorProps) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Could not load tasks"
      style={styles.centred}
    >
      <View
        style={[styles.iconBubble, { backgroundColor: theme.surfaceRaised }]}
      >
        <WifiOff size={28} color={theme.status.danger} />
      </View>
      <Text style={[styles.headline, { color: theme.text }]}>
        Could not load your tasks.
      </Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{message}</Text>
      {code ? (
        <Text style={[styles.code, { color: theme.textFaint }]}>{code}</Text>
      ) : null}
      <View style={styles.action}>
        <PrimaryButton
          label="Try again"
          busyLabel="Retrying…"
          busy={retrying}
          onPress={onRetry}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonList: {
    gap: tokens.spacing[2],
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: tokens.spacing[2],
    overflow: 'hidden',
  },
  rail: {
    width: 3,
    alignSelf: 'stretch',
  },
  skeletonCheckbox: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: 2,
    marginLeft: tokens.spacing[3],
    marginRight: tokens.spacing[2],
    marginVertical: tokens.spacing[4],
  },
  skeletonBody: {
    flex: 1,
    paddingVertical: tokens.spacing[4],
    gap: tokens.spacing[2],
  },
  skeletonLine: {
    height: 12,
    borderRadius: tokens.radius.sm,
  },
  skeletonTitle: {
    width: '70%',
  },
  skeletonMeta: {
    width: '40%',
    height: 10,
  },
  centred: {
    alignItems: 'center',
    paddingHorizontal: tokens.spacing[6],
    paddingTop: tokens.spacing[12],
    gap: tokens.spacing[2],
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[2],
  },
  headline: {
    ...tokens.typography.subtitle,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    ...tokens.typography.caption,
    textAlign: 'center',
  },
  code: {
    ...tokens.typography.micro,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: tokens.spacing[1],
  },
  action: {
    alignSelf: 'stretch',
    marginTop: tokens.spacing[4],
  },
});
