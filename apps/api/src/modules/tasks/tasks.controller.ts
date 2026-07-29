import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  PaginatedTasksDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task' })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<unknown> {
    // The owner comes from the verified token, never from the request body. There is
    // no userId field a caller could set to write into someone else's list.
    return (await this.tasks.create(userId, dto)).toJSON();
  }

  @Get()
  @ApiOperation({
    summary: 'List tasks with filtering, sorting and pagination',
  })
  @ApiResponse({ status: 200, type: PaginatedTasksDto })
  async list(
    @CurrentUser('sub') userId: string,
    @Query() query: ListTasksQueryDto,
  ): Promise<PaginatedTasksDto> {
    const result = await this.tasks.list(userId, query);
    return { data: result.data.map((t) => t.toJSON()), meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single task' })
  @ApiResponse({
    status: 404,
    description: 'TASK_NOT_FOUND — also returned for another user’s task',
  })
  async findOne(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return (await this.tasks.findOne(userId, id)).toJSON();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<unknown> {
    return (await this.tasks.update(userId, id, dto)).toJSON();
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flip a task between TODO and DONE' })
  async toggle(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return (await this.tasks.toggleComplete(userId, id)).toJSON();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task (soft — restorable via /restore)' })
  async remove(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.tasks.remove(userId, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a deleted task — backs the client’s undo' })
  async restore(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return (await this.tasks.restore(userId, id)).toJSON();
  }
}
