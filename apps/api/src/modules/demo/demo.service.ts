import { Injectable, Logger } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { UsersRepository } from '../users/users.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import {
  TaskPriority,
  TaskStatus,
  type Task,
} from '../tasks/schemas/task.schema';

/**
 * Credentials for the demo account.
 *
 * Intentionally public — they are printed in the README so a reviewer can sign in
 * without registering. This is a throwaway account on a throwaway database, not a
 * secret that leaked into the repository.
 */
export const DEMO_EMAIL = 'demo@modulusseventeen.com';
export const DEMO_PASSWORD = 'ModulusDemo2026!';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly tasks: TasksRepository,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Creates (or resets) the demo account and its tasks.
   *
   * Idempotent: safe to call repeatedly, and every call wipes the previous task set
   * so a reviewer who has been experimenting can get back to a clean, meaningful
   * state in one request.
   */
  async reset(): Promise<{
    email: string;
    password: string;
    tasksCreated: number;
  }> {
    let user = await this.users.findByEmail(DEMO_EMAIL);

    if (!user) {
      const passwordHash = await this.passwords.hash(DEMO_PASSWORD);
      user = await this.users.create(DEMO_EMAIL, passwordHash, 'Demo User');
      this.logger.log('Created demo account');
    }

    await this.tasks.hardDeleteAllForUser(user._id);
    const tasksCreated = await this.tasks.insertManyForUser(
      user._id,
      this.buildTasks(),
    );

    return { email: DEMO_EMAIL, password: DEMO_PASSWORD, tasksCreated };
  }

  /**
   * The seed data.
   *
   * Every timestamp is computed RELATIVE TO NOW rather than hardcoded. Seeded once
   * with absolute dates, everything would be weeks overdue by the time a reviewer
   * opened it — every urgency score pinned at the ceiling, and the smart sort no
   * longer visibly reordering anything. Which would defeat the entire reason the seed
   * exists.
   *
   * The spread is chosen so the four inputs to the urgency score each visibly matter:
   * an overdue LOW task, an URGENT task with no deadline at all, and a MEDIUM task
   * due within the hour should interleave in a way that is obviously not just
   * "sorted by date" or just "sorted by priority".
   */
  private buildTasks(): Partial<Task>[] {
    const now = Date.now();
    const at = (offsetMs: number) => new Date(now + offsetMs);

    return [
      {
        title: 'Submit the take-home assignment',
        description:
          'Push the final commit, attach the APK, and send the repository link.',
        scheduledAt: at(-2 * HOUR),
        dueAt: at(3 * HOUR),
        priority: TaskPriority.URGENT,
        status: TaskStatus.TODO,
        tags: ['work', 'deadline'],
      },
      {
        title: 'Renew passport',
        description:
          'Appointment slots disappear fast — book before the weekend.',
        scheduledAt: at(-5 * DAY),
        dueAt: at(-2 * DAY), // overdue, but only MEDIUM: tests the overdue term
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        tags: ['personal'],
      },
      {
        title: 'Fix the flaky checkout test',
        description:
          'Fails roughly one run in five on CI. Suspect a timing assumption.',
        scheduledAt: at(1 * HOUR),
        dueAt: at(30 * HOUR),
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        tags: ['work', 'engineering'],
      },
      {
        title: 'Call the dentist',
        // No deadline at all — exercises the null-date path in the urgency function.
        priority: TaskPriority.URGENT,
        status: TaskStatus.TODO,
        tags: ['personal', 'health'],
      },
      {
        title: 'Water the plants',
        description: 'The fern is looking accusatory.',
        scheduledAt: at(4 * HOUR),
        dueAt: at(-30 * 60 * 1000), // 30 min overdue, lowest priority
        priority: TaskPriority.LOW,
        status: TaskStatus.TODO,
        tags: ['home'],
      },
      {
        title: 'Review the design system PR',
        scheduledAt: at(6 * HOUR),
        dueAt: at(2 * DAY),
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        tags: ['work'],
      },
      {
        title: 'Plan the sprint retro',
        description: 'Collect themes from the last two weeks.',
        scheduledAt: at(3 * DAY),
        dueAt: at(5 * DAY),
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        tags: ['work'],
      },
      {
        title: 'Buy a birthday present',
        scheduledAt: at(1 * DAY),
        dueAt: at(6 * DAY),
        priority: TaskPriority.LOW,
        status: TaskStatus.TODO,
        tags: ['personal'],
      },
      // A couple of completed tasks so the list has visible status variety and the
      // status filter has something to filter.
      {
        title: 'Set up the CI pipeline',
        description: 'Lint, typecheck and tests on every pull request.',
        scheduledAt: at(-2 * DAY),
        dueAt: at(-1 * DAY),
        priority: TaskPriority.HIGH,
        status: TaskStatus.DONE,
        completedAt: at(-1 * DAY),
        tags: ['work', 'engineering'],
      },
      {
        title: 'Book flights',
        scheduledAt: at(-4 * DAY),
        dueAt: at(-3 * DAY),
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.DONE,
        completedAt: at(-3 * DAY),
        tags: ['personal', 'travel'],
      },
    ];
  }
}
