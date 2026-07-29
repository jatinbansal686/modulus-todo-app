/**
 * Task domain types, hand-mirrored from the API's Mongoose schema.
 *
 * These are written by hand rather than generated from the OpenAPI document on
 * purpose: there are only a handful of them, and an OpenAPI codegen step is a
 * toolchain to debug for no gain at this size. The trade-off — that the API could
 * change without TypeScript noticing — is real, and the mitigation is that these
 * literal unions mirror `apps/api/src/modules/tasks/schemas/task.schema.ts`
 * exactly, so a mismatch shows up as a failing request in the very first screen
 * that uses it rather than as a silent `undefined`.
 *
 * @see apps/api/src/modules/tasks/schemas/task.schema.ts
 */

/** Priority levels, string-valued so a raw document stays readable. */
export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

/** A single priority level. */
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

/** Task lifecycle. The API models completion as a status, not a boolean. */
export const TaskStatus = {
  TODO: 'TODO',
  DONE: 'DONE',
} as const;

/** A single lifecycle state. */
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/**
 * Priority levels in ascending order of urgency.
 *
 * Exported as an ordered array because `Object.values()` on the const object is
 * only incidentally ordered, and both the priority selector and the urgency
 * scoring table depend on this being a defined ramp rather than a set.
 */
export const PRIORITY_ORDER: readonly TaskPriority[] = [
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.URGENT,
];

/**
 * A task as returned by the API.
 *
 * Dates arrive as ISO-8601 strings, not `Date` objects — they cross the wire as
 * JSON and are kept as strings all the way into the Redux store. Storing a `Date`
 * in Redux would be a non-serialisable value, which RTK's default middleware
 * warns about in development and which breaks time-travel debugging.
 */
export interface Task {
  id: string;
  title: string;
  description?: string;
  /** When the user intends to work on it. Distinct from `dueAt` — see the UI spec. */
  scheduledAt?: string | null;
  /** The deadline. Everything urgency-related is derived from this field. */
  dueAt?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  /** Set when status moves to DONE, cleared when it moves back. */
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
