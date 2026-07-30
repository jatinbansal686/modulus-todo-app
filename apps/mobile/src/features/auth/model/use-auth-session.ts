import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import BootSplash from 'react-native-bootsplash';

import { useAppDispatch, useAppSelector } from '@store/hooks';
import { bootstrapAuth } from './bootstrap-auth';
import { selectAuthStatus } from './auth.slice';
import { refreshIfExpiring } from './proactive-refresh';

import type { AuthStatus } from './auth.slice';
import type { AppStateStatus } from 'react-native';

/**
 * Drives the session lifecycle and reports the current auth status.
 *
 * Three responsibilities, all of which have to happen exactly once at the root:
 * kick off the bootstrap, dismiss the splash when it resolves, and refresh
 * proactively whenever the app returns to the foreground.
 *
 * @returns The current {@link AuthStatus}, for the navigator to switch on.
 */
export function useAuthSession(): AuthStatus {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);

  useEffect(() => {
    void dispatch(bootstrapAuth());
  }, [dispatch]);

  // Hiding the splash is idempotent in bootsplash itself, but a ref keeps this from
  // being attempted on every status change for no reason.
  const splashHidden = useRef(false);
  useEffect(() => {
    if (status === 'bootstrapping' || splashHidden.current) {
      return;
    }
    splashHidden.current = true;

    // The splash covers the bootstrap, so it lifts the moment the auth question is
    // answered — either way. Hiding it earlier would show whichever screen the
    // navigator happened to be rendering and then swap it.
    void BootSplash.hide({ fade: true });
  }, [status]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        // Only on the transition *into* the foreground. 'inactive' fires for
        // transient interruptions — a notification shade, a permission dialog —
        // where nothing has had time to expire.
        if (next === 'active') {
          void dispatch(refreshIfExpiring());
        }
      },
    );

    return () => subscription.remove();
  }, [dispatch]);

  return status;
}
