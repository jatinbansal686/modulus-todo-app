import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  // Reuses the real repositories and the real password service, so the demo account
  // is created through exactly the same code path as a genuine registration.
  imports: [UsersModule, TasksModule, AuthModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
