import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TaskNotFoundException } from '../../common/errors/domain.exception';
import type {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import {
  TaskStatus,
  type Task,
  type TaskDocument,
} from './schemas/task.schema';
import { TasksRepository, type PaginatedResult } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly repo: TasksRepository) {}

  async create(userId: string, dto: CreateTaskDto): Promise<TaskDocument> {
    return this.repo.create(new Types.ObjectId(userId), this.toModel(dto));
  }

  async list(
    userId: string,
    query: ListTasksQueryDto,
  ): Promise<PaginatedResult<TaskDocument>> {
    return this.repo.list(new Types.ObjectId(userId), query);
  }

  async findOne(userId: string, id: string): Promise<TaskDocument> {
    const task = await this.repo.findOne(new Types.ObjectId(userId), id);
    // Not found and not-yours are the same answer, always. A 403 would confirm that
    // an id exists, which leaks the presence of other people's data to anyone willing
    // to enumerate identifiers.
    if (!task) throw new TaskNotFoundException();
    return task;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskDocument> {
    const patch = this.toModel(dto);

    // Keep `completedAt` consistent with `status` here rather than trusting the client
    // to send both. A client that sets one and forgets the other would otherwise
    // produce a task that is DONE with no completion time, or TODO with one.
    if (dto.status !== undefined) {
      patch.status = dto.status;
      patch.completedAt = dto.status === TaskStatus.DONE ? new Date() : null;
    }

    const task = await this.repo.update(new Types.ObjectId(userId), id, patch);
    if (!task) throw new TaskNotFoundException();
    return task;
  }

  /** Convenience toggle — one round trip for the list's most-used interaction. */
  async toggleComplete(userId: string, id: string): Promise<TaskDocument> {
    const current = await this.findOne(userId, id);
    const nextStatus =
      current.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;

    const task = await this.repo.update(new Types.ObjectId(userId), id, {
      status: nextStatus,
      completedAt: nextStatus === TaskStatus.DONE ? new Date() : null,
    });
    if (!task) throw new TaskNotFoundException();
    return task;
  }

  async remove(userId: string, id: string): Promise<void> {
    const task = await this.repo.softDelete(new Types.ObjectId(userId), id);
    if (!task) throw new TaskNotFoundException();
  }

  /**
   * Restores a deleted task.
   *
   * This is the server side of the client's 5-second undo. Because delete is soft,
   * undo is a compensating call on the same id — the task keeps its identity, so
   * anything holding a reference to it stays valid. A hard delete would force the
   * client to re-create the task and every reference would break.
   */
  async restore(userId: string, id: string): Promise<TaskDocument> {
    const task = await this.repo.restore(new Types.ObjectId(userId), id);
    if (!task) throw new TaskNotFoundException();
    return task;
  }

  /** Maps DTO wire types (ISO strings) onto model types (Dates). */
  private toModel(dto: CreateTaskDto | UpdateTaskDto): Partial<Task> {
    const model: Partial<Task> = {};
    if (dto.title !== undefined) model.title = dto.title;
    if (dto.description !== undefined) model.description = dto.description;
    if (dto.priority !== undefined) model.priority = dto.priority;
    if (dto.tags !== undefined) model.tags = dto.tags;
    // `null` is meaningful here — it is how a client clears a date — so an explicit
    // `undefined` check is required rather than a truthiness test.
    if (dto.scheduledAt !== undefined) {
      model.scheduledAt =
        dto.scheduledAt === null ? null : new Date(dto.scheduledAt);
    }
    if (dto.dueAt !== undefined) {
      model.dueAt = dto.dueAt === null ? null : new Date(dto.dueAt);
    }
    return model;
  }
}
