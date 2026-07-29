import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, SortOrder, Types } from 'mongoose';
import type { ListTasksQueryDto } from './dto/task.dto';
import { Task, TaskDocument } from './schemas/task.schema';

export interface PaginatedResult<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; hasMore: boolean };
}

/**
 * All Mongoose access for tasks.
 *
 * Every method takes `userId` and folds it into the query. Ownership is therefore
 * enforced in the one place that talks to the database, rather than relying on each
 * service method to remember a check — the pattern where cross-tenant leaks come from.
 */
@Injectable()
export class TasksRepository {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument>,
  ) {}

  /** Base scope: this user's tasks that have not been soft-deleted. */
  private scope(userId: Types.ObjectId): QueryFilter<TaskDocument> {
    return { userId, deletedAt: null };
  }

  async create(
    userId: Types.ObjectId,
    data: Partial<Task>,
  ): Promise<TaskDocument> {
    return this.model.create({ ...data, userId });
  }

  async findOne(
    userId: Types.ObjectId,
    id: string,
  ): Promise<TaskDocument | null> {
    return this.model.findOne({ ...this.scope(userId), _id: id }).exec();
  }

  async list(
    userId: Types.ObjectId,
    query: ListTasksQueryDto,
  ): Promise<PaginatedResult<TaskDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const filter: QueryFilter<TaskDocument> = this.scope(userId);
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.tag) filter.tags = query.tag;

    const direction: SortOrder = query.order === 'desc' ? -1 : 1;
    const sortField = query.sort ?? 'dueAt';

    // `_id` is always the final sort key. Without a unique tiebreaker, documents with
    // equal sort values have no defined order between queries, so paginating with
    // skip/limit can return the same task on two pages and drop another entirely.
    const sort: Record<string, SortOrder> = { [sortField]: direction, _id: 1 };

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data,
      meta: { total, page, limit, hasMore: page * limit < total },
    };
  }

  async update(
    userId: Types.ObjectId,
    id: string,
    patch: Partial<Task>,
  ): Promise<TaskDocument | null> {
    return this.model
      .findOneAndUpdate(
        { ...this.scope(userId), _id: id },
        { $set: patch },
        { new: true },
      )
      .exec();
  }

  /** Soft delete. Returns null when the task is absent or owned by someone else. */
  async softDelete(
    userId: Types.ObjectId,
    id: string,
  ): Promise<TaskDocument | null> {
    return this.model
      .findOneAndUpdate(
        { ...this.scope(userId), _id: id },
        { $set: { deletedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  /**
   * Restores a soft-deleted task — the server half of the client's undo.
   *
   * Note this deliberately does NOT use `scope()`: it has to match a document whose
   * `deletedAt` is set, which the normal scope excludes by definition.
   */
  async restore(
    userId: Types.ObjectId,
    id: string,
  ): Promise<TaskDocument | null> {
    return this.model
      .findOneAndUpdate(
        { userId, _id: id, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true },
      )
      .exec();
  }

  /** Used by the demo seed to clear a user's tasks before re-seeding. */
  async hardDeleteAllForUser(userId: Types.ObjectId): Promise<number> {
    const result = await this.model.deleteMany({ userId }).exec();
    return result.deletedCount;
  }

  async insertManyForUser(
    userId: Types.ObjectId,
    tasks: Partial<Task>[],
  ): Promise<number> {
    const docs = await this.model.insertMany(
      tasks.map((t) => ({ ...t, userId })),
    );
    return docs.length;
  }
}
