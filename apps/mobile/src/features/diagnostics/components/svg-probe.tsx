import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { SmokeResult } from '../model/smoke';
import type { LayoutChangeEvent } from 'react-native';

/** Deliberately odd size so a measurement of 0 or a default cannot pass by accident. */
const PROBE_SIZE = 13;

/** Sub-pixel tolerance — layout is rounded to the device pixel grid. */
const TOLERANCE = 0.5;

interface Props {
  /** Called once, when layout reports the measured box. */
  onResult: (result: SmokeResult) => void;
}

/**
 * Verifies `react-native-svg` mounts a real native view.
 *
 * A function-style check would only prove the JS module resolved, which it does
 * even when the native side is absent — the failure then appears later as an
 * invisible icon rather than an error. Mounting an `Svg` and measuring it proves
 * the native view manager is registered and laying out.
 *
 * This matters beyond icons: the urgency ring is an SVG arc, and
 * `lucide-react-native` renders every icon in the app through this library.
 */
export function SvgProbe({ onResult }: Props) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, width } = event.nativeEvent.layout;
      const mounted =
        Math.abs(width - PROBE_SIZE) <= TOLERANCE &&
        Math.abs(height - PROBE_SIZE) <= TOLERANCE;

      onResult({
        name: 'react-native-svg',
        ok: mounted,
        detail: mounted
          ? `native Svg view mounted and laid out at ${PROBE_SIZE}×${PROBE_SIZE}`
          : `Svg measured ${width}×${height}, expected ${PROBE_SIZE}×${PROBE_SIZE} — native view manager likely unregistered`,
      });
    },
    [onResult],
  );

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <Svg width={PROBE_SIZE} height={PROBE_SIZE} onLayout={handleLayout}>
        <Circle
          cx={PROBE_SIZE / 2}
          cy={PROBE_SIZE / 2}
          r={PROBE_SIZE / 2}
          fill="#000000"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: -1000,
    alignItems: 'flex-start',
  },
});
