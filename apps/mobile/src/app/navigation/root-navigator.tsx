import React, { useMemo } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthSession } from '@features/auth/model/use-auth-session';
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
          One screen for both states for now. The Login/Register stack and the task
          list replace this in the screens PRs; the Foundation screen exercises the
          API client for either status so the flow is verifiable on device today.
        */}
        <Stack.Screen name="Foundation" component={FoundationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
