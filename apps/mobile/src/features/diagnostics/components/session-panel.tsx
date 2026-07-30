import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLogoutMutation } from '@features/auth/api/auth.api';
import {
  selectAccessToken,
  selectAccessTokenExpiresAt,
  selectAuthStatus,
  selectCurrentUser,
  selectSessionEndedReason,
} from '@features/auth/model/auth.slice';
import { refreshIfExpiring } from '@features/auth/model/proactive-refresh';
import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { useAppDispatch, useAppSelector } from '@store/hooks';

/**
 * Live view of the auth session, with buttons to drive it.
 *
 * `__DEV__` scaffolding. Its "Sign in (demo)" button is **gone**: this panel only
 * renders on the Foundation screen, the Foundation screen only mounts when the
 * status is already `authenticated`, and the real Login screen now covers that
 * path anyway — so the button had become permanently disabled UI.
 *
 * What remains earns its place until the next PR: signing out is the only way to
 * exercise the navigator's stack swap back to the auth screens on a device, and
 * the real sign-out affordance lands in the task-list header. This panel goes with
 * it.
 */
export function SessionPanel() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectCurrentUser);
  const accessToken = useAppSelector(selectAccessToken);
  const expiresAt = useAppSelector(selectAccessTokenExpiresAt);
  const endedReason = useAppSelector(selectSessionEndedReason);

  const [logout, logoutState] = useLogoutMutation();
  const [note, setNote] = useState<string | null>(null);

  const busy = logoutState.isLoading;

  const rows: Array<[string, string]> = [
    ['status', status],
    ['user', user?.email ?? '—'],
    [
      'access token',
      accessToken ? `present (…${accessToken.slice(-6)})` : 'none',
    ],
    ['expires', expiresAt ? new Date(expiresAt).toLocaleTimeString() : '—'],
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.heading, { color: theme.text }]}>Session</Text>

      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {label}
          </Text>
          <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}

      {endedReason ? (
        <Text style={[styles.note, { color: theme.status.warning }]}>
          Session ended: {endedReason}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Action
          label="Force refresh"
          disabled={busy || status !== 'authenticated'}
          onPress={async () => {
            setNote(null);
            await dispatch(refreshIfExpiring());
            setNote('proactive refresh attempted (no-op unless near expiry)');
          }}
        />
        <Action
          label="Sign out"
          disabled={busy || status !== 'authenticated'}
          onPress={async () => {
            setNote(null);
            await logout();
            setNote('signed out — keystore cleared, cache reset');
          }}
        />
      </View>

      {note ? (
        <Text style={[styles.note, { color: theme.textMuted }]}>{note}</Text>
      ) : null}
    </View>
  );
}

/** A labelled button. Carries a role and label so RNTL can find it by name. */
function Action({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void | Promise<void>;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        void onPress();
      }}
      style={[
        styles.action,
        {
          backgroundColor: disabled ? theme.surfaceRaised : theme.accent,
          borderColor: disabled ? theme.border : theme.accent,
        },
      ]}
    >
      <Text
        style={[
          styles.actionLabel,
          { color: disabled ? theme.textFaint : theme.onAccent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing[4],
    gap: tokens.spacing[2],
  },
  heading: {
    ...tokens.typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: tokens.spacing[1],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.spacing[3],
  },
  label: {
    ...tokens.typography.micro,
  },
  value: {
    ...tokens.typography.micro,
    fontWeight: '600',
    flexShrink: 1,
  },
  actions: {
    gap: tokens.spacing[2],
    marginTop: tokens.spacing[2],
  },
  action: {
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  actionLabel: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  note: {
    ...tokens.typography.micro,
  },
});
