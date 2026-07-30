import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Notice } from '@shared/ui/notice';
import { PrimaryButton } from '@shared/ui/primary-button';
import { TextField } from '@shared/ui/text-field';
import { useShake } from '@shared/ui/use-shake';
import { useAppSelector } from '@store/hooks';
import { useLoginMutation } from '../api/auth.api';
import { AuthScreenLayout } from '../components/auth-screen-layout';
import { AuthSwitchLink } from '../components/auth-switch-link';
import { describeAuthError } from '../lib/describe-auth-error';
import { loginSchema } from '../model/auth.schemas';
import { selectSessionEndedReason } from '../model/auth.slice';

import type { DisplayableError } from '../lib/describe-auth-error';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * Only the one navigator capability this screen uses.
 *
 * Narrower than the full `NativeStackScreenProps` on purpose: it documents the
 * screen's actual coupling to navigation, and it means a component test injects
 * `{ navigate: jest.fn() }` rather than constructing — or casting its way to — a
 * whole navigation object it never exercises.
 */
interface Props {
  navigation: Pick<
    NativeStackNavigationProp<RootStackParamList, 'Login'>,
    'navigate'
  >;
}

/**
 * Sign-in screen.
 *
 * ## What happens on success: nothing, here
 *
 * There is deliberately no `navigate` call after a successful login. The mutation
 * writes the refresh token to the keystore and dispatches `signedIn`, the auth
 * status becomes `authenticated`, and the root navigator swaps the entire stack
 * out from under this screen. Navigating instead would leave the auth screens on
 * the back stack, one gesture away from a signed-in user.
 *
 * @see app/navigation/root-navigator.tsx
 */
export function LoginScreen({ navigation }: Props) {
  const [login, { isLoading }] = useLoginMutation();
  const { style: cardStyle, shake } = useShake();

  // Why the last session ended, if it ended by rejection. A user whose refresh
  // token was revoked mid-session arrives here with no idea why, and "you were
  // signed out because X" is the difference between a bug and an explanation.
  const endedReason = useAppSelector(selectSessionEndedReason);

  const [failure, setFailure] = useState<DisplayableError | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    // Validate a field once it has been visited, then live as it is corrected.
    // `onChange` would flag "not a valid email" on the first keystroke, which is
    // both true and useless; `onSubmit` alone makes the user tap to find out.
    mode: 'onTouched',
  });

  const submit = handleSubmit(async (values) => {
    // Clear the previous failure so a second attempt cannot leave a stale message
    // sitting above a form that is now in flight.
    setFailure(null);

    const result = await login(values);

    if ('error' in result) {
      setFailure(describeAuthError(result.error));
      shake();
    }
  });

  return (
    <AuthScreenLayout
      title="Welcome back."
      subtitle="Sign in to pick up where you left off."
      cardStyle={cardStyle}
      footer={
        <AuthSwitchLink
          prompt="No account yet?"
          action="Create one"
          onPress={() => navigation.navigate('Register')}
        />
      }
    >
      {/*
        The session-ended notice outranks nothing — it is informational, and it
        coexists with a failure below it if the user then mistypes their password.
      */}
      {endedReason ? (
        <Notice
          tone="info"
          label="Session ended"
          message={`You were signed out: ${endedReason}`}
        />
      ) : null}

      {failure ? (
        <Notice
          tone="danger"
          label="Sign-in failed"
          message={failure.message}
          code={failure.code}
        />
      ) : null}

      <View>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              placeholder="you@example.com"
              // `autoCapitalize="none"` is not cosmetic on Android: the keyboard
              // capitalises the first letter by default, and while the API
              // lowercases on receipt, the user watching "Demo@…" appear has no
              // way to know that.
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              // `submitBehavior="submit"` keeps focus so the handler can move it
              // on; the default blurs first and the keyboard flickers shut.
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />
      </View>

      <View>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              ref={passwordRef}
              label="Password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              placeholder="Your password"
              secure
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => {
                void submit();
              }}
            />
          )}
        />
      </View>

      <PrimaryButton
        label="Sign in"
        busyLabel="Signing in…"
        busy={isLoading}
        onPress={() => {
          void submit();
        }}
      />
    </AuthScreenLayout>
  );
}
