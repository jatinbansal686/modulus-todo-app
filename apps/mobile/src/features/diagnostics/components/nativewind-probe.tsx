import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SmokeResult } from '../model/smoke';
import type { LayoutChangeEvent } from 'react-native';

/** Height requested via a plain `StyleSheet` style. */
const PROBE_HEIGHT = 24;

/**
 * Width requested via a Tailwind class.
 *
 * A deliberately arbitrary arbitrary-value class (`w-[37px]`). Using a stock class
 * like `w-16` would be a weaker test, because Tailwind's default `w-16` is 64px —
 * the same value our own token scale produces — so it could not distinguish a
 * working pipeline from a coincidence. 37 is a number nothing else in the app
 * yields, and it only appears if Tailwind actually compiled the class.
 */
const PROBE_WIDTH = 37;

/** Sub-pixel tolerance — layout is rounded to the device pixel grid. */
const TOLERANCE = 0.5;

interface Props {
  /** Called once, when layout reports the measured box. */
  onResult: (result: SmokeResult) => void;
}

/**
 * Verifies the NativeWind ⇄ `StyleSheet` boundary that the whole styling approach
 * depends on.
 *
 * ## What is being tested
 *
 * NativeWind re-points the automatic JSX runtime at `react-native-css-interop`, so
 * *every* element in the app is constructed by NativeWind's runtime rather than
 * React's. Issue **#1781** — a regression introduced in 4.2.3, and our pin is
 * 4.2.6 — reports that plain `StyleSheet` styles passed via `style` are silently
 * dropped on RN primitives routed through that runtime.
 *
 * That matters more than an ordinary upstream bug, because plain `StyleSheet` is
 * the documented escape hatch for everything animated (Reanimated cannot read
 * Tailwind classes). If the escape hatch is broken, the boundary rule in
 * `docs/ui-spec.md` does not hold.
 *
 * ## Why it asserts *both* dimensions
 *
 * Checking only that the `StyleSheet` height applied would pass just as happily
 * when NativeWind is doing nothing at all — a missing `input` in metro.config.js,
 * say, leaves every class inert, and the StyleSheet style then applies for the
 * boring reason that nothing is intercepting it. So the element takes its **width
 * from a Tailwind class** and its **height from a StyleSheet style**, and both are
 * measured. One number proves the pipeline runs; the other proves it does not eat
 * the escape hatch.
 *
 * Rendered off-screen, so it is a test rather than a UI element.
 */
export function NativeWindProbe({ onResult }: Props) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, width } = event.nativeEvent.layout;
      const styleSheetApplied = Math.abs(height - PROBE_HEIGHT) <= TOLERANCE;
      const classNameApplied = Math.abs(width - PROBE_WIDTH) <= TOLERANCE;

      const problems: string[] = [];
      if (!classNameApplied) {
        problems.push(
          `Tailwind class did not apply — width ${width}px, expected ${PROBE_WIDTH}px. ` +
            'Check `input: "./global.css"` in metro.config.js and that global.css is imported at the app root.',
        );
      }
      if (!styleSheetApplied) {
        problems.push(
          `StyleSheet style was DROPPED — height ${height}px, expected ${PROBE_HEIGHT}px. ` +
            'css-interop #1781 is live: drop the NativeWind JSX runtime or pin nativewind@4.2.1.',
        );
      }

      onResult({
        name: 'nativewind × StyleSheet (css-interop #1781)',
        ok: problems.length === 0,
        detail:
          problems.length === 0
            ? `class ${PROBE_WIDTH}px wide + StyleSheet ${PROBE_HEIGHT}px tall both applied`
            : problems.join(' | '),
      });
    },
    [onResult],
  );

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View className="w-[37px]" style={styles.probe} onLayout={handleLayout} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Positioned out of view rather than conditionally rendered: the element has to
  // actually lay out for onLayout to fire, and `display: none` would not.
  //
  // `alignItems: 'flex-start'` is load-bearing — it stops the child from being
  // stretched to the parent's width, so an unstyled child measures 0 and the
  // width assertion can actually fail when NativeWind is inert.
  offscreen: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    top: -1000,
    alignItems: 'flex-start',
  },
  probe: {
    height: PROBE_HEIGHT,
  },
});
