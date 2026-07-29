import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DemoService } from './demo.service';

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /**
   * Resets the demo account to a known, freshly-dated set of tasks.
   *
   * Public, because a reviewer needs it *before* they have an account — that is the
   * whole point. It only ever touches the single hardcoded demo user, so there is no
   * way to aim it at anyone else's data.
   *
   * Rate-limited hard: it deletes and rewrites rows, so it should not be something a
   * script can hammer.
   */
  @Public()
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Reset the demo account and reseed its tasks',
    description:
      'Recreates demo@modulusseventeen.com with ten tasks dated relative to *now*, so the urgency sort always has something meaningful to reorder. Returns the credentials to sign in with.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        email: 'demo@modulusseventeen.com',
        password: 'ModulusDemo2026!',
        tasksCreated: 10,
      },
    },
  })
  reset(): Promise<{ email: string; password: string; tasksCreated: number }> {
    return this.demo.reset();
  }
}
