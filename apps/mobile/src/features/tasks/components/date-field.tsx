import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { DATE_PRESETS, isPresetSelected } from '../model/date-presets';
import { formatFullDateTime } from '../model/format-dates';

import type { LucideIcon } from 'lucide-react-native';

interface Props {
  /** "Scheduled for" or "Due by" — never both, never generic. */
  label: string;
  /** The distinct icon that makes the two fields tellable apart at a glance. */
  icon: LucideIcon;
  /** Currently selected ISO value, or null. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Injected so the presets and the picker agree on "now". */
  now: Date;
}

/**
 * Date entry as a design problem rather than a picker.
 *
 * ## The problem being solved
 *
 * `@react-native-community/datetimepicker` on Android opens the stock Material
 * date dialog **and then a separate time dialog** — two system modals and roughly
 * five taps, for the single most-used interaction in a to-do app. It also looks
 * nothing like the rest of the app.
 *
 * So the common cases become one tap each: a chip row of relative times, which is
 * what real deadlines almost always are. The native picker is still there behind
 * `Custom…` for the genuine exceptions, because a chip row that cannot express
 * "the 14th at 3pm" would be a downgrade rather than a shortcut.
 *
 * Two-stage on Android by necessity: the platform picker is date-only or
 * time-only, so `Custom…` runs date first and then time, composing the result.
 */
export function DateField({ label, icon: Icon, value, onChange, now }: Props) {
  const theme = useTheme();

  /**
   * Which half of the custom picker is open, if any.
   *
   * `pendingDate` carries the day chosen in stage one into stage two. Without it
   * the time picker would apply its hours to `now` rather than to the date the
   * user just picked — a bug that only shows when the two differ.
   */
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  const selected = value ? new Date(value) : null;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Icon size={14} color={theme.textMuted} />
        <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      </View>

      <View style={styles.chips}>
        {DATE_PRESETS.map((preset) => {
          const active = isPresetSelected(preset, value, now);
          return (
            <Chip
              key={preset.id}
              label={preset.label}
              active={active}
              accessibilityLabel={`${label}: ${preset.label}`}
              onPress={() => onChange(preset.resolve(now).toISOString())}
            />
          );
        })}

        <Chip
          label="Custom…"
          active={false}
          accessibilityLabel={`${label}: pick a custom date`}
          onPress={() => {
            setPendingDate(null);
            setPicking('date');
          }}
        />
      </View>

      {selected ? (
        <View style={styles.selectedRow}>
          <Text style={[styles.selected, { color: theme.text }]}>
            {formatFullDateTime(selected.toISOString())}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            onPress={() => onChange(null)}
            hitSlop={tokens.spacing[3]}
            android_ripple={{ color: theme.accentSoft, borderless: true }}
          >
            <X size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.selected, { color: theme.textFaint }]}>
          Not set
        </Text>
      )}

      {picking === 'date' ? (
        <DateTimePicker
          mode="date"
          value={selected ?? now}
          onChange={(event, picked) => {
            setPicking(null);
            if (event.type !== 'set' || !picked) {
              return;
            }
            // Hand the chosen day to stage two rather than committing it: a date
            // with `now`'s time is almost never what the user meant.
            setPendingDate(picked);
            setPicking('time');
          }}
        />
      ) : null}

      {picking === 'time' ? (
        <DateTimePicker
          mode="time"
          value={pendingDate ?? selected ?? now}
          // 24-hour display follows the device; the *rendered* label elsewhere is
          // always 12-hour, which is a deliberate inconsistency the platform owns.
          is24Hour={false}
          onChange={(event, picked) => {
            setPicking(null);
            if (event.type !== 'set' || !picked || !pendingDate) {
              return;
            }
            const composed = new Date(pendingDate);
            composed.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
            onChange(composed.toISOString());
          }}
        />
      ) : null}
    </View>
  );
}

interface ChipProps {
  label: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

/** A selectable pill. Carries `selected` state so tests and TalkBack can read it. */
function Chip({ label, active, accessibilityLabel, onPress }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={{ color: theme.accentSoft }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? theme.accent : theme.surfaceRaised,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          { color: active ? theme.onAccent : theme.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: tokens.spacing[2],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[1.5],
  },
  label: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
  },
  chip: {
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[1.5],
    borderRadius: tokens.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacing[2],
  },
  selected: {
    ...tokens.typography.caption,
  },
});
