import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  TaskPriority,
  TaskStatus,
  type TaskPriorityValue,
  type TaskStatusValue,
} from '../schemas/task.schema';

export class CreateTaskDto {
  @ApiProperty({ example: 'Submit the assignment', maxLength: 200 })
  @IsString()
  @MinLength(1, { message: 'title must not be empty' })
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @ApiPropertyOptional({
    example: 'Push the final commit and email the link.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'When you plan to work on this (ISO 8601). The assignment\'s "date-time".',
    example: '2026-07-30T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt must be an ISO 8601 date string' })
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'The deadline (ISO 8601). Drives the overdue signal.',
    example: '2026-07-31T17:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'dueAt must be an ISO 8601 date string' })
  dueAt?: string;

  @ApiPropertyOptional({
    enum: Object.values(TaskPriority),
    default: TaskPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'priority must be one of LOW, MEDIUM, HIGH, URGENT',
  })
  priority?: TaskPriorityValue;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  // Bounded: an unbounded array of unbounded strings is an easy way to store
  // megabytes per task and bypass the body limit's intent.
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];
}

/**
 * Every field optional, reusing the create validation rules.
 *
 * `PartialType` from `@nestjs/swagger` (not `@nestjs/mapped-types`) so the generated
 * OpenAPI schema stays correct as well as the runtime validation.
 */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ enum: Object.values(TaskStatus) })
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'status must be TODO or DONE' })
  status?: TaskStatusValue;
}

export const TaskSortField = {
  DUE_AT: 'dueAt',
  CREATED_AT: 'createdAt',
  PRIORITY: 'priority',
  TITLE: 'title',
} as const;
export type TaskSortFieldValue =
  (typeof TaskSortField)[keyof typeof TaskSortField];

export class ListTasksQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(TaskStatus),
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatusValue;

  @ApiPropertyOptional({ enum: Object.values(TaskPriority) })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriorityValue;

  @ApiPropertyOptional({ description: 'Filter by a single tag' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({ enum: Object.values(TaskSortField), default: 'dueAt' })
  @IsOptional()
  @IsEnum(TaskSortField)
  sort?: TaskSortFieldValue;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Capped so a single request cannot be used to pull the whole collection.
  @Max(100)
  limit?: number;
}

/** Paginated envelope. Lists are wrapped; single resources are returned bare. */
export class PaginatedTasksDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  data!: unknown[];

  @ApiProperty({
    example: { total: 12, page: 1, limit: 50, hasMore: false },
    type: 'object',
    additionalProperties: true,
  })
  meta!: { total: number; page: number; limit: number; hasMore: boolean };
}
