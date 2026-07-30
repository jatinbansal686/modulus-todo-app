import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  useLoginMutation,
  useLogoutMutation,
} from '@features/auth/api/auth.api';
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
 * The seeded demo account, which `POST /demo/reset` (re)creates on the API.
 *
 * Hardcoded here because this panel is `__DEV__` diagnostics, not a login screen —
 * the point is to exercise the API client in one tap without typing credentials on
 * an emulator keyboard.
 */
const DEMO_EMAIL = 'demo@modulusseventeen.com';
const DEMO_PASSWORD = 'ModulusDemo2026!';

/** Renders an RTK Query error as something readable, including the API's `code`. */
function describeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Unknown error';
  }
  const candidate = error as {
    status?: unknown;
    data?: { code?: string; message?: string };
    error?: string;
  };

  if (candidate.data?.code) {
    return `${candidate.data.code}: ${candidate.data.message ?? ''}`.trim();
  }
  // `FETCH_ERROR` and friends carry the reason on `error` rather than `data` — this
  // is the shape a genuinely offline device produces.
  return candidate.error ?? `HTTP ${String(candidate.status)}`;
}

/**
 * Live view of the auth session, with buttons to drive it.
 *
 * `__DEV__` scaffolding, replaced by the real Login screen and task list. It exists
 * because the API client is otherwise unobservable: without a way to sign in, the
 * re-auth wrapper and the bootstrap gate could only be tested in Jest, and "it
 * compiles and the unit tests pass" is not the same as "it talks to the API".
 */
export function SessionPanel() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectCurrentUser);
  const accessToken = useAppSelector(selectAccessToken);
  const expiresAt = useAppSelector(selectAccessTokenExpiresAt);
  const endedReason = useAppSelector(selectSessionEndedReason);

  const [login, loginState] = useLoginMutation();
  const [logout, logoutState] = useLogoutMutation();
  const [note, setNote] = useState<string | null>(null);

  const busy = loginState.isLoading || logoutState.isLoading;

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
          label="Sign in (demo)"
          disabled={busy || status === 'authenticated'}
          onPress={async () => {
            setNote(null);
            const result = await login({
              email: DEMO_EMAIL,
              password: DEMO_PASSWORD,
            });
            setNote(
              'error' in result
                ? describeError(result.error)
                : 'signed in — refresh token written to keystore',
            );
          }}
        />
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
