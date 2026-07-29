import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

/**
 * Priority levels.
 *
 * Stored as strings rather than 0-3 so a raw database document is readable and so
 * inserting a new level later does not renumber the existing ones.
 */
export const TaskPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TaskPriorityValue =
  (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  TODO: 'TODO',
  DONE: 'DONE',
} as const;
export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

@Schema({
  timestamps: true,
  collection: 'tasks',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      // Soft-delete bookkeeping is an implementation detail; the client never sees a
      // deleted task, so exposing the field would only invite confusion.
      delete ret.deletedAt;
      return ret;
    },
  },
})
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ trim: true, maxlength: 5000, default: '' })
  description!: string;

  /**
   * When the user intends to work on this — the assignment's "date-time".
   *
   * Deliberately a separate field from `dueAt`. The brief lists "date-time" and
   * "deadline" as two distinct properties, and they genuinely differ: a task can be
   * scheduled for Monday morning but not due until Friday. The UI labels them
   * "Scheduled for" and "Due by" so the distinction is visible rather than implied.
   */
  @Prop({ type: Date, default: null })
  scheduledAt!: Date | null;

  /** The deadline — when the task becomes late. Drives the overdue signal. */
  @Prop({ type: Date, default: null })
  dueAt!: Date | null;

  @Prop({
    type: String,
    enum: Object.values(TaskPriority),
    default: TaskPriority.MEDIUM,
  })
  priority!: TaskPriorityValue;

  @Prop({
    type: String,
    enum: Object.values(TaskStatus),
    default: TaskStatus.TODO,
    index: true,
  })
  status!: TaskStatusValue;

  /** Set when status moves to DONE, cleared when it moves back. */
  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  /**
   * Free-form tags. Satisfies the assignment's "categories **or** tags" bonus at a
   * fraction of the cost of a full category resource with its own CRUD.
   */
  @Prop({ type: [String], default: [] })
  tags!: string[];

  /**
   * Soft delete.
   *
   * Deleting sets this rather than removing the document, which is what makes the
   * client's 5-second undo possible: undo issues a compensating restore instead of
   * having to reconstruct a task that no longer exists. A hard delete would force
   * the client to cache the whole task and re-create it with a new id, breaking any
   * reference to the original.
   */
  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// The list query is always "this user's live tasks, optionally filtered by status,
// ordered by deadline". This compound index serves that directly — equality on
// userId and deletedAt, then a range/sort on dueAt.
TaskSchema.index({ userId: 1, deletedAt: 1, status: 1, dueAt: 1 });

// Fallback ordering for "newest first", and for listing without a status filter.
TaskSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });

// No text index: `$text` matches whole stemmed terms, so typing "gro" would not find
// "groceries" — not what a search box means. Search is out of scope; if it returns, a
// client-side filter over the loaded page is both better UX and free.
