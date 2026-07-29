import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { nativeSmokeChecks } from '../model/checks';
import { formatSmokeSummary, runSmokeChecks } from '../model/smoke';
import { NativeWindProbe } from './nativewind-probe';
import { SvgProbe } from './svg-probe';

import type { SmokeResult } from '../model/smoke';

/**
 * Checks that can only be answered by rendering.
 *
 * Some libraries cannot be verified by calling a function: proving a style was
 * honoured, or that a native view actually mounts, requires measuring real layout.
 * These report asynchronously through `onResult`, and the panel waits for all of
 * them before publishing its summary — so adding a probe here is the only change
 * needed to include it in the verdict.
 */
const RENDER_PROBES = [NativeWindProbe, SvgProbe];

/**
 * Renders the native-module smoke checks as a live pass/fail list.
 *
 * `__DEV__`-only. Its job is to turn "the app is blank" into "react-native-mmkv
 * failed: Failed to get NitroModules" without anyone opening logcat.
 */
export function SmokePanel() {
  const theme = useTheme();
  const [checkResults, setCheckResults] = useState<SmokeResult[] | null>(null);
  // Render-probe results arrive one at a time, keyed by name so a probe whose
  // `onLayout` fires twice cannot contribute two rows.
  const [probeResults, setProbeResults] = useState<Record<string, SmokeResult>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;

    void runSmokeChecks(nativeSmokeChecks).then((next) => {
      // Fast Refresh unmounts aggressively during development; without this the
      // async checks would set state on an unmounted component.
      if (!cancelled) {
        setCheckResults(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the first result per probe. `onLayout` fires again on rotation or
  // re-layout, and a later report would otherwise overwrite or duplicate a row.
  const handleProbeResult = useCallback((result: SmokeResult) => {
    setProbeResults((current) =>
      current[result.name] ? current : { ...current, [result.name]: result },
    );
  }, []);

  const results = useMemo(() => {
    const reported = Object.values(probeResults);
    // Publish only when everything has reported, so a partial run is never
    // mistaken for a complete pass.
    if (!checkResults || reported.length < RENDER_PROBES.length) {
      return null;
    }
    return [...checkResults, ...reported];
  }, [checkResults, probeResults]);

  useEffect(() => {
    // Emitted only once every check has reported, so the single greppable line the
    // build harness watches for always describes a complete run.
    if (results) {
      console.log(formatSmokeSummary(results));
    }
  }, [results]);

  if (!results) {
    return (
      <View style={styles.loading}>
        {RENDER_PROBES.map((Probe) => (
          <Probe key={Probe.name} onResult={handleProbeResult} />
        ))}
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const passed = results.filter((result) => result.ok).length;
  const allPassed = passed === results.length;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={formatSmokeSummary(results)}
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.heading, { color: theme.text }]}>
          Native modules
        </Text>
        <Text
          style={[
            styles.count,
            { color: allPassed ? theme.status.success : theme.status.danger },
          ]}
        >
          {passed}/{results.length}
        </Text>
      </View>

      {results.map((result) => (
        <View key={result.name} style={styles.row}>
          <Text
            style={[
              styles.mark,
              { color: result.ok ? theme.status.success : theme.status.danger },
            ]}
          >
            {result.ok ? '✓' : '✕'}
          </Text>
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: theme.text }]}>
              {result.name}
            </Text>
            <Text style={[styles.detail, { color: theme.textMuted }]}>
              {result.detail}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: tokens.spacing[6],
  },
  container: {
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: tokens.spacing[4],
    gap: tokens.spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    ...tokens.typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  count: {
    ...tokens.typography.caption,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
    alignItems: 'flex-start',
  },
  mark: {
    ...tokens.typography.body,
    lineHeight: 20,
    width: 16,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  detail: {
    ...tokens.typography.micro,
  },
});
