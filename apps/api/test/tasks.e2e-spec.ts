import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import mongoose from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

interface TaskBody {
  id: string;
  title: string;
  description: string;
  scheduledAt: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  tags: string[];
}
interface Paginated {
  data: TaskBody[];
  meta: { total: number; page: number; limit: number; hasMore: boolean };
}
interface Err {
  statusCode: number;
  code: string;
  details?: { field: string; constraint: string }[];
}

const asTask = (b: unknown): TaskBody => b as TaskBody;
const asPage = (b: unknown): Paginated => b as Paginated;
const asErr = (b: unknown): Err => b as Err;

describe('Tasks (e2e)', () => {
  let app: NestExpressApplication;
  let alice = '';
  let bob = '';
  let seq = 0;

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const signUp = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `t${++seq}.${Date.now()}@example.com`,
        password: 'correct horse battery staple',
      })
      .expect(201);
    return (res.body as { accessToken: string }).accessToken;
  };

  const createTask = (token: string, body: object = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'A task', ...body });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    await mongoose.connection.syncIndexes();

    alice = await signUp();
    bob = await signUp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('authentication', () => {
    it('refuses every task route without a token', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/tasks').expect(401);
      await request(server)
        .post('/api/v1/tasks')
        .send({ title: 'x' })
        .expect(401);
      await request(server)
        .get('/api/v1/tasks/507f1f77bcf86cd799439011')
        .expect(401);
      await request(server)
        .patch('/api/v1/tasks/507f1f77bcf86cd799439011')
        .send({})
        .expect(401);
      await request(server)
        .delete('/api/v1/tasks/507f1f77bcf86cd799439011')
        .expect(401);
    });
  });

  describe('create', () => {
    it('stores every field the assignment asks for', async () => {
      const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
      const dueAt = new Date(Date.now() + 86_400_000).toISOString();

      const res = await createTask(alice, {
        title: 'Write the report',
        description: 'Two pages, with charts.',
        scheduledAt,
        dueAt,
        priority: 'HIGH',
        tags: ['work'],
      }).expect(201);

      const task = asTask(res.body);
      expect(task).toMatchObject({
        title: 'Write the report',
        description: 'Two pages, with charts.',
        priority: 'HIGH',
        status: 'TODO',
        tags: ['work'],
      });
      // date-time and deadline are genuinely distinct fields, not one reused.
      expect(new Date(task.scheduledAt as string).toISOString()).toBe(
        scheduledAt,
      );
      expect(new Date(task.dueAt as string).toISOString()).toBe(dueAt);
      expect(task.id).toEqual(expect.any(String));
    });

    it('defaults priority and status sensibly', async () => {
      const res = await createTask(alice, { title: 'Minimal' }).expect(201);
      expect(asTask(res.body)).toMatchObject({
        priority: 'MEDIUM',
        status: 'TODO',
        tags: [],
      });
    });

    it('rejects an empty title', async () => {
      const res = await createTask(alice, { title: '   ' }).expect(400);
      expect(asErr(res.body).details?.some((d) => d.field === 'title')).toBe(
        true,
      );
    });

    it('rejects an over-long title', async () => {
      await createTask(alice, { title: 'x'.repeat(201) }).expect(400);
    });

    it('rejects an invalid priority', async () => {
      await createTask(alice, { priority: 'SUPER_URGENT' }).expect(400);
    });

    it('rejects a non-date deadline', async () => {
      await createTask(alice, { dueAt: 'next tuesday' }).expect(400);
    });

    it('caps the number of tags', async () => {
      await createTask(alice, {
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
      }).expect(400);
    });

    it('ignores a userId in the body — ownership comes from the token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set(auth(alice))
        .send({ title: 'Nice try', userId: '507f1f77bcf86cd799439011' })
        .expect(400); // forbidNonWhitelisted rejects it outright rather than dropping it
      expect(asErr(res.body).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('cross-user isolation', () => {
    it("returns 404 — not 403 — for another user's task", async () => {
      const created = await createTask(alice, {
        title: "Alice's secret",
      }).expect(201);
      const id = asTask(created.body).id;

      // 404 rather than 403 on every verb: a 403 would confirm the id exists, which
      // leaks the presence of other people's data to anyone enumerating identifiers.
      const server = app.getHttpServer();
      for (const res of [
        await request(server)
          .get(`/api/v1/tasks/${id}`)
          .set(auth(bob))
          .expect(404),
        await request(server)
          .patch(`/api/v1/tasks/${id}`)
          .set(auth(bob))
          .send({ title: 'hijacked' })
          .expect(404),
        await request(server)
          .post(`/api/v1/tasks/${id}/toggle`)
          .set(auth(bob))
          .expect(404),
        await request(server)
          .delete(`/api/v1/tasks/${id}`)
          .set(auth(bob))
          .expect(404),
      ]) {
        expect(asErr(res.body).code).toBe('TASK_NOT_FOUND');
      }

      // ...and Alice's task is untouched by any of it.
      const after = await request(server)
        .get(`/api/v1/tasks/${id}`)
        .set(auth(alice))
        .expect(200);
      expect(asTask(after.body).title).toBe("Alice's secret");
    });

    it("never includes another user's tasks in a list", async () => {
      await createTask(alice, { title: 'Alice only' }).expect(201);
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set(auth(bob))
        .expect(200);
      expect(asPage(res.body).data.every((t) => t.title !== 'Alice only')).toBe(
        true,
      );
    });

    it('returns 400 for a malformed id rather than a 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks/not-an-objectid')
        .set(auth(alice))
        .expect(400);
      expect(asErr(res.body).code).toBe('INVALID_ID');
    });
  });

  describe('list, filter, sort, paginate', () => {
    let carol = '';

    beforeAll(async () => {
      carol = await signUp();
      const now = Date.now();
      await createTask(carol, {
        title: 'C due soon',
        dueAt: new Date(now + 3_600_000).toISOString(),
        priority: 'LOW',
        tags: ['x'],
      });
      await createTask(carol, {
        title: 'C due later',
        dueAt: new Date(now + 86_400_000).toISOString(),
        priority: 'URGENT',
        tags: ['y'],
      });
      await createTask(carol, {
        title: 'C no deadline',
        priority: 'HIGH',
        tags: ['x'],
      });
    });

    it('returns a paginated envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks')
        .set(auth(carol))
        .expect(200);
      const page = asPage(res.body);
      expect(page.meta).toMatchObject({ total: 3, page: 1, hasMore: false });
      expect(page.data).toHaveLength(3);
    });

    it('paginates without dropping or repeating rows', async () => {
      const server = app.getHttpServer();
      const p1 = asPage(
        (
          await request(server)
            .get('/api/v1/tasks?page=1&limit=2')
            .set(auth(carol))
            .expect(200)
        ).body,
      );
      const p2 = asPage(
        (
          await request(server)
            .get('/api/v1/tasks?page=2&limit=2')
            .set(auth(carol))
            .expect(200)
        ).body,
      );

      expect(p1.meta.hasMore).toBe(true);
      expect(p2.meta.hasMore).toBe(false);

      // The `_id` tiebreaker exists precisely so this holds: without it, equal sort
      // values have no defined order and pages can overlap.
      const ids = [...p1.data, ...p2.data].map((t) => t.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('filters by status', async () => {
      const server = app.getHttpServer();
      const all = asPage(
        (
          await request(server)
            .get('/api/v1/tasks')
            .set(auth(carol))
            .expect(200)
        ).body,
      );
      await request(server)
        .post(`/api/v1/tasks/${all.data[0].id}/toggle`)
        .set(auth(carol))
        .expect(200);

      const done = asPage(
        (
          await request(server)
            .get('/api/v1/tasks?status=DONE')
            .set(auth(carol))
            .expect(200)
        ).body,
      );
      expect(done.meta.total).toBe(1);
      expect(done.data[0].status).toBe('DONE');
    });

    it('filters by tag', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks?tag=x')
        .set(auth(carol))
        .expect(200);
      expect(asPage(res.body).meta.total).toBe(2);
    });

    it('rejects an out-of-range limit', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/tasks?limit=1000')
        .set(auth(carol))
        .expect(400);
    });
  });

  describe('update and toggle', () => {
    it('updates fields', async () => {
      const created = await createTask(alice, { title: 'Before' }).expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${asTask(created.body).id}`)
        .set(auth(alice))
        .send({ title: 'After', priority: 'URGENT' })
        .expect(200);
      expect(asTask(res.body)).toMatchObject({
        title: 'After',
        priority: 'URGENT',
      });
    });

    it('keeps completedAt consistent with status in both directions', async () => {
      const created = await createTask(alice, { title: 'Toggle me' }).expect(
        201,
      );
      const id = asTask(created.body).id;
      const server = app.getHttpServer();

      const done = asTask(
        (
          await request(server)
            .post(`/api/v1/tasks/${id}/toggle`)
            .set(auth(alice))
            .expect(200)
        ).body,
      );
      expect(done.status).toBe('DONE');
      // The server derives this rather than trusting the client to send both fields —
      // otherwise a client could produce a DONE task with no completion time.
      expect(done.completedAt).not.toBeNull();

      const undone = asTask(
        (
          await request(server)
            .post(`/api/v1/tasks/${id}/toggle`)
            .set(auth(alice))
            .expect(200)
        ).body,
      );
      expect(undone.status).toBe('TODO');
      expect(undone.completedAt).toBeNull();
    });
  });

  describe('delete and restore', () => {
    it('hides a deleted task but allows restoring it — the server half of undo', async () => {
      const created = await createTask(alice, {
        title: 'Deleted then restored',
      }).expect(201);
      const id = asTask(created.body).id;
      const server = app.getHttpServer();

      await request(server)
        .delete(`/api/v1/tasks/${id}`)
        .set(auth(alice))
        .expect(204);
      await request(server)
        .get(`/api/v1/tasks/${id}`)
        .set(auth(alice))
        .expect(404);

      const restored = await request(server)
        .post(`/api/v1/tasks/${id}/restore`)
        .set(auth(alice))
        .expect(200);
      // Same id — which is why undo can be a compensating call rather than a re-create.
      expect(asTask(restored.body).id).toBe(id);
      await request(server)
        .get(`/api/v1/tasks/${id}`)
        .set(auth(alice))
        .expect(200);
    });

    it('never leaks the soft-delete bookkeeping field', async () => {
      const created = await createTask(alice, {
        title: 'Check serialisation',
      }).expect(201);
      expect(JSON.stringify(created.body)).not.toContain('deletedAt');
    });

    it("refuses to restore another user's task", async () => {
      const created = await createTask(alice, { title: 'Mine' }).expect(201);
      const id = asTask(created.body).id;
      const server = app.getHttpServer();
      await request(server)
        .delete(`/api/v1/tasks/${id}`)
        .set(auth(alice))
        .expect(204);
      await request(server)
        .post(`/api/v1/tasks/${id}/restore`)
        .set(auth(bob))
        .expect(404);
    });
  });

  describe('demo seed', () => {
    it('creates a signable-in account with dates relative to now', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/demo/reset')
        .expect(200);
      const seed = res.body as {
        email: string;
        password: string;
        tasksCreated: number;
      };
      expect(seed.tasksCreated).toBeGreaterThan(5);

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: seed.email, password: seed.password })
        .expect(200);
      const token = (login.body as { accessToken: string }).accessToken;

      const tasks = asPage(
        (
          await request(app.getHttpServer())
            .get('/api/v1/tasks?limit=100')
            .set(auth(token))
            .expect(200)
        ).body,
      );

      // The seed only earns its keep if the data is actually varied — a flat list
      // would make the smart sort look like it does nothing.
      const withDeadlines = tasks.data.filter((t) => t.dueAt !== null);
      expect(
        withDeadlines.some(
          (t) => new Date(t.dueAt as string).getTime() < Date.now(),
        ),
      ).toBe(true); // overdue
      expect(
        withDeadlines.some(
          (t) => new Date(t.dueAt as string).getTime() > Date.now(),
        ),
      ).toBe(true); // upcoming
      expect(tasks.data.some((t) => t.dueAt === null)).toBe(true); // exercises the null path
      expect(new Set(tasks.data.map((t) => t.priority)).size).toBeGreaterThan(
        2,
      );
      expect(tasks.data.some((t) => t.status === 'DONE')).toBe(true);
    });

    it('is idempotent', async () => {
      await request(app.getHttpServer()).post('/api/v1/demo/reset').expect(200);
      const res = await request(app.getHttpServer())
        .post('/api/v1/demo/reset')
        .expect(200);
      expect(
        (res.body as { tasksCreated: number }).tasksCreated,
      ).toBeGreaterThan(5);
    });
  });
});
