import React, { useMemo } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthSession } from '@features/auth/model/use-auth-session';
import { LoginScreen } from '@features/auth/screens/login-screen';
import { RegisterScreen } from '@features/auth/screens/register-screen';
import { FoundationScreen } from '@features/diagnostics/screens/foundation-screen';
import { useTheme } from '@shared/theme/theme-context';

import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The app's navigation tree.
 *
 * The auth state machine chooses the whole stack rather than navigating between
 * screens: a signed-out user then has no back stack leading into the app, and a
 * sign-out cannot leave an authenticated screen one gesture away.
 *
 * While `status` is `bootstrapping` this renders nothing at all — the native splash
 * is still up, and mounting a navigator underneath it only to replace it a moment
 * later is what produces the flash of the wrong screen this design exists to avoid.
 */
export function RootNavigator() {
  const theme = useTheme();
  const status = useAuthSession();

  // React Navigation keeps its own theme, which paints the container background
  // and the native stack's transition backdrop. Left at its default it is white,
  // which shows up as a white flash behind every push on the dark theme. Mapping
  // our tokens onto it is what makes transitions look intentional.
  const navigationTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme.scheme === 'dark',
      colors: {
        ...base.colors,
        primary: theme.accent,
        background: theme.bg,
        card: theme.surface,
        text: theme.text,
        border: theme.border,
        notification: theme.status.danger,
      },
    };
  }, [theme]);

  if (status === 'bootstrapping') {
    return null;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        {/*
          ⚠️ Two mutually exclusive groups, chosen by auth status — never a
          `navigate()` between them.

          This is the whole reason the auth flow cannot leak. When `status` flips,
          React Navigation unmounts one group and mounts the other, so after a
          sign-out there is no history entry pointing back into the app and after a
          sign-in the login screen is not one back-gesture away. Reaching the same
          effect with `navigate('TaskList')` would leave both on the stack and make
          the back button a security question.

          It is also why neither auth screen navigates on success: they have
          nowhere to go. Dispatching `signedIn` is the navigation.
        */}
        {status === 'authenticated' ? (
          <Stack.Group>
            {/*
              Still the Foundation screen. The task list replaces it in the next
              PR; keeping it here means the signed-in half of this swap is
              verifiable on device today rather than on trust.
            */}
            <Stack.Screen name="Foundation" component={FoundationScreen} />
          </Stack.Group>
        ) : (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
