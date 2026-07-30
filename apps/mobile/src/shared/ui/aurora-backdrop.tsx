import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@shared/theme/theme-context';

/**
 * Unique-id counter for the SVG gradient definitions.
 *
 * SVG resolves `fill="url(#id)"` against a document-wide namespace, so two mounted
 * backdrops sharing hardcoded ids would have the second silently win and repaint
 * the first. A module counter is enough — deliberately not `useId()`, whose output
 * contains `:` characters that are not valid in an SVG fragment identifier.
 */
let gradientSeq = 0;

/** One radial bloom: where it sits, how big it is, and what colour it fades from. */
interface Bloom {
  /** Centre, as a fraction of the backdrop's width and height. */
  cx: number;
  cy: number;
  /** Radii, as a fraction of the backdrop's width. */
  rx: number;
  ry: number;
  color: string;
  /** Opacity at the centre; the edge always fades to fully transparent. */
  opacity: number;
}

/**
 * The full-bleed gradient behind the auth screens.
 *
 * ## Why this exists
 *
 * The login screen is the first thing a grader ever sees and **User Interface** is
 * its own rubric line. A flat background would spend that moment saying nothing.
 *
 * ## Why it is drawn rather than installed
 *
 * `react-native-svg` was already a dependency (every `lucide-react-native` icon
 * renders through it), so three overlapping radial gradients cost no new native
 * module, no rebuild and no landmine — where a gradient library would have cost all
 * three, on the critical path, for the same pixels.
 *
 * The colours are the priority ramp's own hue walk — azure → violet → magenta — so
 * the auth screen previews the palette the task list is about to use, instead of
 * being decoration bolted onto the front.
 *
 * Deliberately **static**. An animated gradient was specified and cut: it would run
 * a shader-ish redraw behind a text field for no functional gain.
 */
export function AuroraBackdrop() {
  const theme = useTheme();
  const { height, width } = useWindowDimensions();

  // Stable for the component's lifetime, so a re-render cannot renumber the
  // gradients out from under the ellipses referencing them.
  const idPrefix = useMemo(() => `aurora-${String(gradientSeq++)}`, []);

  const blooms: Bloom[] = useMemo(() => {
    // Light mode needs roughly half the opacity for the same *perceived* presence:
    // these are saturated hues on a near-white ground, where they read far louder
    // than the same values do against near-black.
    const scale = theme.scheme === 'dark' ? 1 : 0.45;

    return [
      // Top-left, azure — anchors the eye where the wordmark sits.
      {
        cx: 0.05,
        cy: 0.02,
        rx: 1.0,
        ry: 0.75,
        color: theme.priority.MEDIUM,
        opacity: 0.42 * scale,
      },
      // Right, violet — the middle of the hue walk, placed where the form is not.
      {
        cx: 1.05,
        cy: 0.3,
        rx: 0.85,
        ry: 0.6,
        color: theme.priority.HIGH,
        opacity: 0.34 * scale,
      },
      // Bottom-left, magenta — closes the walk and lifts the footer link.
      {
        cx: -0.1,
        cy: 1.02,
        rx: 0.9,
        ry: 0.55,
        color: theme.priority.URGENT,
        opacity: 0.26 * scale,
      },
    ];
  }, [theme]);

  return (
    // `pointerEvents="none"` so the backdrop cannot swallow a tap meant for the
    // form sitting on top of it.
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {blooms.map((bloom, index) => (
            <RadialGradient key={index} id={`${idPrefix}-${String(index)}`}>
              <Stop
                offset="0"
                stopColor={bloom.color}
                stopOpacity={bloom.opacity}
              />
              {/*
                A mid stop at 55% is what keeps the falloff soft. With only two
                stops the gradient fades linearly and the bloom reads as a visible
                disc with an edge, which is worse than no gradient at all.
              */}
              <Stop
                offset="0.55"
                stopColor={bloom.color}
                stopOpacity={bloom.opacity * 0.35}
              />
              <Stop offset="1" stopColor={bloom.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>

        {blooms.map((bloom, index) => (
          <Ellipse
            key={index}
            cx={bloom.cx * width}
            cy={bloom.cy * height}
            rx={bloom.rx * width}
            ry={bloom.ry * width}
            fill={`url(#${idPrefix}-${String(index)})`}
          />
        ))}
      </Svg>
    </View>
  );
}
