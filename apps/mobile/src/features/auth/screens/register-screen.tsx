import React, { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Notice } from '@shared/ui/notice';
import { PrimaryButton } from '@shared/ui/primary-button';
import { TextField } from '@shared/ui/text-field';
import { useShake } from '@shared/ui/use-shake';
import { useRegisterMutation } from '../api/auth.api';
import { AuthScreenLayout } from '../components/auth-screen-layout';
import { AuthSwitchLink } from '../components/auth-switch-link';
import { describeAuthError } from '../lib/describe-auth-error';
import { registerSchema } from '../model/auth.schemas';

import type { DisplayableError } from '../lib/describe-auth-error';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/** See the note on the equivalent type in `login-screen.tsx`. */
interface Props {
  navigation: Pick<
    NativeStackNavigationProp<RootStackParamList, 'Register'>,
    'navigate'
  >;
}

/**
 * Registration screen.
 *
 * Registering **signs the user straight in** — the API returns the same token pair
 * as login, so there is no "account created, now please sign in" step. That is one
 * fewer screen transition, one fewer failure mode, and it removes the worst
 * outcome in the flow: an account that exists but whose owner is looking at a
 * login form wondering whether it worked.
 *
 * As on the login screen, success navigates nowhere. The root navigator swaps the
 * stack when the auth status changes.
 */
export function RegisterScreen({ navigation }: Props) {
  const [register, { isLoading }] = useRegisterMutation();
  const { style: cardStyle, shake } = useShake();

  const [failure, setFailure] = useState<DisplayableError | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', displayName: '' },
    mode: 'onTouched',
  });

  const submit = handleSubmit(async (values) => {
    setFailure(null);

    // `values` is the schema's *output*, so `displayName` has already been
    // normalised from `''` to `undefined` and `JSON.stringify` will drop the key
    // entirely. That matters because the API runs `forbidNonWhitelisted: true`.
    const result = await register(values);

    if ('error' in result) {
      setFailure(describeAuthError(result.error));
      shake();
    }
  });

  return (
    <AuthScreenLayout
      title="Get started."
      subtitle="Create an account and your first task is one tap away."
      cardStyle={cardStyle}
      footer={
        <AuthSwitchLink
          prompt="Already have an account?"
          action="Sign in"
          onPress={() => navigation.navigate('Login')}
        />
      }
    >
      {failure ? (
        <Notice
          tone="danger"
          label="Sign-up failed"
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
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
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
              // The rule is stated up front rather than only on rejection. A
              // password manager generates before it is told the constraint, and
              // "at least 8 characters" after the fact is a wasted round trip.
              hint="At least 8 characters."
              placeholder="Choose a password"
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => displayNameRef.current?.focus()}
            />
          )}
        />
      </View>

      <View>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              ref={displayNameRef}
              // "Optional" is in the label rather than only in a hint, so it is
              // read out as part of the field's accessibility name and cannot be
              // missed by someone scanning the form.
              label="Display name (optional)"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.displayName?.message}
              placeholder="What should we call you?"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="go"
              onSubmitEditing={() => {
                void submit();
              }}
            />
          )}
        />
      </View>

      <PrimaryButton
        label="Create account"
        busyLabel="Creating account…"
        busy={isLoading}
        onPress={() => {
          void submit();
        }}
      />
    </AuthScreenLayout>
  );
}
