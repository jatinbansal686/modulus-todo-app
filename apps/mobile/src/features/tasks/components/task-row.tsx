import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarClock, Check, Flag, Trash2 } from 'lucide-react-native';

import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { TaskStatus } from '@shared/types/task';
import { describeDue, describeScheduled } from '../model/format-dates';

import type { Task } from '@shared/types/task';

interface Props {
  task: Task;
  /** The current time, passed down so a list of rows agrees on "now". */
  now: Date;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * One task in the list.
 *
 * Three affordances, all reachable without a gesture anyone has to discover:
 * the checkbox completes, the body opens the composer in edit mode, and the
 * trailing bin deletes behind a confirmation. Swipe actions are a Tier 2 addition
 * *on top* of these, never a replacement — a destructive action that exists only
 * as an undiscoverable gesture is not an affordance.
 *
 * `memo` because FlashList recycles aggressively and every row re-renders on any
 * list change otherwise; the props are primitives and stable callbacks.
 */
export const TaskRow = memo(function TaskRowImpl({
  task,
  now,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const theme = useTheme();

  const done = task.status === TaskStatus.DONE;
  const due = describeDue(task.dueAt, now);
  const scheduled = describeScheduled(task.scheduledAt, now);
  const priorityColor = theme.priority[task.priority];

  /**
   * A finished task is never late.
   *
   * ⚠️ Found on device, not in a test. `describeDue` answers "is this deadline in
   * the past", which is all it can know from a date — so a completed task whose
   * deadline has passed came back `overdue: true` and rendered "Overdue by 3
   * days" in alarm red *next to its own DONE pill*. It reads as a demand to do
   * something already done.
   *
   * Status is the row's concern rather than the formatter's: the date really is
   * in the past, and a `dueAt`-only function has no business knowing about
   * `status`. So the suppression lives here.
   */
  const late = due?.overdueText != null && !done;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {/*
        The priority rail. A continuous urgency rail replaces this in Tier 2; the
        3px geometry is already correct so that upgrade is a colour change rather
        than a layout change.
      */}
      <View style={[styles.rail, { backgroundColor: priorityColor }]} />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        // Names the task, not the control: a screen-reader user hearing "checkbox,
        // checked" ten times learns nothing about which task they are on.
        accessibilityLabel={
          done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`
        }
        onPress={() => onToggle(task)}
        hitSlop={tokens.spacing[2]}
        android_ripple={{ color: theme.accentSoft, borderless: true }}
        style={styles.checkboxHit}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: done ? theme.accent : theme.borderStrong },
            // Only filled when checked; an unchecked box keeps the row's own
            // background rather than painting a literal over it.
            done && { backgroundColor: theme.accent },
          ]}
        >
          {done ? (
            <Check size={14} color={theme.onAccent} strokeWidth={3} />
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit "${task.title}"`}
        onPress={() => onEdit(task)}
        android_ripple={{ color: theme.accentSoft }}
        style={styles.body}
      >
        <View style={styles.titleRow}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              { color: done ? theme.textFaint : theme.text },
              // Strikethrough plus the pill below, so "view a list of tasks with
              // their status" is literally visible rather than implied by a tick.
              done && styles.titleDone,
            ]}
          >
            {task.title}
          </Text>

          <View
            style={[styles.priorityPill, { backgroundColor: priorityColor }]}
          >
            {/*
              The priority is always spelled out, never colour alone — the ramp is
              a hue walk and must stay legible to a colour-blind reader and in a
              greyscale screenshot.
            */}
            <Text style={[styles.priorityText, { color: theme.onAccent }]}>
              {task.priority}
            </Text>
          </View>
        </View>

        {task.description ? (
          <Text
            numberOfLines={1}
            style={[styles.description, { color: theme.textMuted }]}
          >
            {task.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {done ? (
            <View
              style={[styles.statusPill, { backgroundColor: theme.accentSoft }]}
            >
              <Text style={[styles.statusText, { color: theme.accent }]}>
                DONE
              </Text>
            </View>
          ) : null}

          {/*
            ⚠️ The countdown is derived from `dueAt` only, never `scheduledAt`, and
            the two carry different icons and different words. The brief names
            "date-time" and "deadline" separately and users conflate them; the row
            answers that in the labels rather than hoping.
          */}
          {due ? (
            <View style={styles.meta}>
              <Flag
                size={12}
                color={late ? theme.status.danger : theme.textMuted}
              />
              <Text
                style={[
                  styles.metaText,
                  { color: late ? theme.status.danger : theme.textMuted },
                  late && styles.metaUrgent,
                ]}
              >
                {/*
                  A completed task keeps its deadline visible but drops the
                  lateness — the date is still worth seeing, the reprimand is
                  not. `text` is always the neutral date, so this cannot produce
                  "Due by Overdue by 3 days".
                */}
                {late ? due.overdueText : `Due by ${due.text}`}
              </Text>
            </View>
          ) : null}

          {scheduled ? (
            <View style={styles.meta}>
              <CalendarClock size={12} color={theme.textFaint} />
              <Text style={[styles.metaText, { color: theme.textFaint }]}>
                Scheduled for {scheduled}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete "${task.title}"`}
        onPress={() => onDelete(task)}
        hitSlop={tokens.spacing[2]}
        android_ripple={{ color: theme.accentSoft, borderless: true }}
        style={styles.deleteHit}
      >
        <Trash2 size={17} color={theme.textFaint} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: tokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // No horizontal padding on the container: the rail must reach the edge, and
    // the children carry their own insets.
    paddingRight: tokens.spacing[2],
    overflow: 'hidden',
  },
  rail: {
    width: 3,
    alignSelf: 'stretch',
  },
  checkboxHit: {
    paddingLeft: tokens.spacing[3],
    paddingRight: tokens.spacing[2],
    paddingVertical: tokens.spacing[4],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: tokens.radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingVertical: tokens.spacing[4],
    gap: tokens.spacing[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing[2],
  },
  title: {
    ...tokens.typography.body,
    flex: 1,
    fontWeight: '600',
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  priorityPill: {
    paddingHorizontal: tokens.spacing[1.5],
    paddingVertical: 2,
    borderRadius: tokens.radius.sm,
  },
  priorityText: {
    ...tokens.typography.micro,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  description: {
    ...tokens.typography.caption,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacing[3],
    marginTop: tokens.spacing[0.5],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[1],
  },
  metaText: {
    ...tokens.typography.caption,
  },
  metaUrgent: {
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: tokens.spacing[1.5],
    paddingVertical: 2,
    borderRadius: tokens.radius.full,
  },
  statusText: {
    ...tokens.typography.micro,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  deleteHit: {
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: tokens.spacing[4],
  },
});
