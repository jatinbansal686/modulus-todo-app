import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Peak horizontal travel, in px. Enough to read as a refusal, not as a glitch. */
const AMPLITUDE = 9;

/** Per-leg duration. Six legs ≈ 300ms total — under the ~400ms "instant" threshold. */
const LEG_MS = 50;

/** What {@link useShake} hands back. */
export interface Shake {
  /**
   * Spread onto an `Animated.View`.
   *
   * ⚠️ Per the styling boundary rule, the node carrying this must use plain
   * `StyleSheet` objects and **no** `className`. Mixing NativeWind and animated
   * styles on one node is the shape that trips css-interop #1781.
   *
   * @see docs/ui-spec.md §8
   */
  style: ReturnType<typeof useAnimatedStyle>;
  /** Runs the animation. Safe to call repeatedly; a new call restarts it. */
  shake: () => void;
}

/**
 * A horizontal shake, for when a submission is rejected.
 *
 * The error text below the form says *what* went wrong; this says *that* something
 * did, in the same instant and without needing to be read. On a form whose failure
 * message renders below the fold of a keyboard-covered screen, that is the
 * difference between "nothing happened when I tapped" and "it tried and it failed".
 *
 * @returns An animated style to spread, and the trigger to call on failure.
 */
export function useShake(): Shake {
  const offset = useSharedValue(0);

  // Honours the OS "remove animations" setting. Users who enable it frequently do
  // so for vestibular reasons, and a shake is precisely the motion that provokes
  // that — while the error text it accompanies conveys the same information anyway.
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const shake = useCallback(() => {
    if (reducedMotion) {
      return;
    }

    // Decaying, and it ends at exactly 0. A constant-amplitude shake reads as
    // mechanical, and one that ends mid-swing leaves the card permanently a few
    // pixels off-centre — visible against the screen edge on the very next render.
    offset.value = withSequence(
      withTiming(-AMPLITUDE, { duration: LEG_MS }),
      withTiming(AMPLITUDE, { duration: LEG_MS }),
      withTiming(-AMPLITUDE * 0.6, { duration: LEG_MS }),
      withTiming(AMPLITUDE * 0.6, { duration: LEG_MS }),
      withTiming(-AMPLITUDE * 0.25, { duration: LEG_MS }),
      withTiming(0, { duration: LEG_MS }),
    );
  }, [offset, reducedMotion]);

  return { style, shake };
}
