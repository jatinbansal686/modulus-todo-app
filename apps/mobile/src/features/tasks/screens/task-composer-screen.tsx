import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, Flag, X } from 'lucide-react-native';

import { describeAuthError } from '@features/auth/lib/describe-auth-error';
import { tokens } from '@shared/theme';
import { useTheme } from '@shared/theme/theme-context';
import { PRIORITY_ORDER } from '@shared/types/task';
import { Notice } from '@shared/ui/notice';
import { PrimaryButton } from '@shared/ui/primary-button';
import { TextField } from '@shared/ui/text-field';
import {
  useCreateTaskMutation,
  useListTasksQuery,
  useUpdateTaskMutation,
} from '../api/tasks.api';
import { DateField } from '../components/date-field';

import type { UpdateTaskInput } from '../api/tasks.api';
import type { RootStackParamList } from '@app/navigation/types';
import type { TaskPriority } from '@shared/types/task';
import type { DisplayableError } from '@features/auth/lib/describe-auth-error';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/** Matches the API's `@MaxLength(200)` on title. */
const TITLE_MAX = 200;

/**
 * Only what this screen touches.
 *
 * Narrower than the full `NativeStackScreenProps`, matching the auth screens: it
 * documents the real coupling to navigation and lets a component test pass
 * `{ goBack: jest.fn() }` instead of assembling a navigation object it never
 * exercises.
 */
interface Props {
  navigation: Pick<
    NativeStackNavigationProp<RootStackParamList, 'TaskComposer'>,
    'goBack'
  >;
  route: { params: RootStackParamList['TaskComposer'] };
}

/**
 * Create *and* edit, as one screen.
 *
 * ## Why edit is not a separate screen
 *
 * The form is identical — same fields, same validation, same request shape bar the
 * verb. A second screen would be the same component twice with two sets of
 * navigation types to keep in step. `route.params.taskId` decides which it is.
 *
 * ⚠️ **Edit was missing from every earlier draft of the plan.** The API shipped
 * full CRUD and no screen consumed `PATCH /tasks/:id`, so the app could not fix a
 * typo in a task title — the first thing anyone tries, and a Correctness
 * requirement in the brief.
 *
 * ## Why a native-stack modal
 *
 * `presentation: 'modal'` on a stack that is already a dependency, rather than
 * `@gorhom/bottom-sheet` — which was cut for an open bug where *the keyboard
 * covers the TextInput inside the sheet*, on precisely this screen.
 */
export function TaskComposerScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const taskId = route.params.taskId;
  const editing = Boolean(taskId);

  /*
   * The task being edited is read from the **list cache**, not fetched.
   *
   * The user can only reach edit mode by tapping a row, so the task is already
   * cached; a `GET /tasks/:id` here would spend a round trip re-fetching what is
   * on screen behind the modal. `useListTasksQuery` with no subscription change
   * simply reads the existing entry.
   */
  const { data } = useListTasksQuery({ sort: 'dueAt', order: 'asc' });
  const existing = useMemo(
    () => data?.data.find((candidate) => candidate.id === taskId),
    [data, taskId],
  );

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(
    existing?.priority ?? 'MEDIUM',
  );
  const [scheduledAt, setScheduledAt] = useState<string | null>(
    existing?.scheduledAt ?? null,
  );
  const [dueAt, setDueAt] = useState<string | null>(existing?.dueAt ?? null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [failure, setFailure] = useState<DisplayableError | null>(null);

  const [createTask, { isLoading: creating }] = useCreateTaskMutation();
  const [updateTask, { isLoading: updating }] = useUpdateTaskMutation();
  const busy = creating || updating;

  // Captured once per mount: the presets resolve against it, and a value that
  // drifted mid-form would make "Tonight" mean something different depending on
  // how long the modal had been open.
  const now = useMemo(() => new Date(), []);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      // The only client-side rule. Everything else the API validates, and its
      // `code` surfaces in the panel below rather than being duplicated here.
      setTitleError('Give the task a title');
      return;
    }

    setTitleError(null);
    setFailure(null);

    const result = editing
      ? await updateTask({
          id: taskId as string,
          patch: {
            title: trimmed,
            description: description.trim() || undefined,
            priority,
            // Explicit `null` clears; the API distinguishes it from `undefined`.
            scheduledAt,
            dueAt,
          } satisfies UpdateTaskInput,
        })
      : await createTask({
          title: trimmed,
          description: description.trim() || undefined,
          priority,
          scheduledAt: scheduledAt ?? undefined,
          dueAt: dueAt ?? undefined,
        });

    if ('error' in result) {
      setFailure(describeAuthError(result.error));
      return;
    }

    // Dismiss only on success. Closing optimistically would hide the error the
    // user needs to see and silently drop what they typed.
    navigation.goBack();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      {/*
        ⚠️ The header pads for `insets.top`, which a modal needs just as much as
        a root screen does. Found on device: a native-stack modal on Android is
        still a full-screen surface under mandatory edge-to-edge, so without this
        the title renders *over the status bar clock*. Easy to miss, because the
        list screen behind it looks correct.
      */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.border,
            paddingTop: insets.top + tokens.spacing[4],
          },
        ]}
      >
        <Text style={[styles.title, { color: theme.text }]}>
          {editing ? 'Edit task' : 'New task'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
          hitSlop={tokens.spacing[3]}
          android_ripple={{ color: theme.accentSoft, borderless: true }}
        >
          <X size={22} color={theme.textMuted} />
        </Pressable>
      </View>

      {/*
        Plain `KeyboardAvoidingView`, per the dependency cuts —
        `react-native-keyboard-controller` was dropped rather than added to the
        Tier 1 native stack. `undefined` behaviour on Android because the manifest
        already sets `adjustResize`; a behaviour there double-counts the inset.
      */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + tokens.spacing[8] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {failure ? (
            <Notice
              tone="danger"
              label={editing ? 'Could not save' : 'Could not create'}
              message={failure.message}
              code={failure.code}
            />
          ) : null}

          <TextField
            label="Title"
            value={title}
            onChangeText={(next) => {
              setTitle(next);
              if (titleError) {
                setTitleError(null);
              }
            }}
            error={titleError ?? undefined}
            placeholder="What needs doing?"
            maxLength={TITLE_MAX}
            autoFocus={!editing}
            returnKeyType="next"
          />

          <TextField
            label="Notes"
            value={description}
            onChangeText={setDescription}
            placeholder="Anything worth remembering (optional)"
            multiline
          />

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Priority
            </Text>
            <View style={styles.priorityRow}>
              {PRIORITY_ORDER.map((level) => {
                const active = level === priority;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Priority ${level}`}
                    onPress={() => setPriority(level)}
                    android_ripple={{ color: theme.accentSoft }}
                    style={[
                      styles.priorityChip,
                      {
                        backgroundColor: active
                          ? theme.priority[level]
                          : theme.surfaceRaised,
                        borderColor: active
                          ? theme.priority[level]
                          : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.priorityLabel,
                        { color: active ? theme.onAccent : theme.textMuted },
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/*
            ⚠️ Two date fields, deliberately worded and iconed apart. The brief
            names "date-time" and "deadline" separately and users conflate them,
            so the UI answers it in the labels: "Scheduled for" is when you intend
            to work on it, "Due by" is when it is late. Only `dueAt` drives the
            countdown and the overdue colour on the row.
          */}
          <DateField
            label="Scheduled for"
            icon={CalendarClock}
            value={scheduledAt}
            onChange={setScheduledAt}
            now={now}
          />

          <DateField
            label="Due by"
            icon={Flag}
            value={dueAt}
            onChange={setDueAt}
            now={now}
          />

          <View style={styles.submit}>
            <PrimaryButton
              label={editing ? 'Save changes' : 'Add task'}
              busyLabel={editing ? 'Saving…' : 'Adding…'}
              busy={busy}
              onPress={() => {
                void submit();
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    ...tokens.typography.subtitle,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: tokens.spacing[5],
    gap: tokens.spacing[5],
  },
  section: {
    gap: tokens.spacing[2],
  },
  sectionLabel: {
    ...tokens.typography.caption,
    fontWeight: '600',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: tokens.spacing[2],
  },
  priorityChip: {
    flex: 1,
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  priorityLabel: {
    ...tokens.typography.micro,
    fontWeight: '800',
  },
  submit: {
    marginTop: tokens.spacing[2],
  },
});
