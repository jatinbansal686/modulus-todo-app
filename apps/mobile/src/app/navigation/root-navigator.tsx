import React, { useMemo } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { FoundationScreen } from '@features/diagnostics/screens/foundation-screen';
import { useTheme } from '@shared/theme/theme-context';

import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * The app's navigation tree.
 *
 * Currently one screen. The auth/app split — swapping the whole stack on the auth
 * state machine rather than navigating between them — arrives with the auth PR;
 * doing it that way means a signed-out user has no back stack leading into the app.
 */
export function RootNavigator() {
  const theme = useTheme();

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

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Foundation" component={FoundationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
