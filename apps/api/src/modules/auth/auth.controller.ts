import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  AuthTokensDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
// Auth endpoints get a far stricter bucket than the global default: this is the one
// surface where an attacker gets unlimited free guesses at a secret. Declared on the
// controller so the limit is visible next to the endpoints it protects.
//
// Throttling is skipped entirely when NODE_ENV=test (see app.module.ts) — the
// integration suite legitimately makes far more auth calls per minute from a single
// address than any real client, and would otherwise 429 itself.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and sign in' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 409, description: 'EMAIL_ALREADY_REGISTERED' })
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensDto> {
    return this.auth.register(dto, userAgent);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK) // login creates a session, not a resource
  @ApiOperation({ summary: 'Exchange credentials for tokens' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'AUTH_CREDENTIALS_INVALID' })
  login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokensDto> {
    return this.auth.login(dto, userAgent);
  }

  /**
   * Unauthenticated on purpose: it is called precisely when the access token has
   * expired, so requiring a valid access token would make it unusable.
   * The refresh token in the body is the credential.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new access token' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'AUTH_TOKEN_INVALID' })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single session' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    // Public and idempotent: a client whose access token has already expired must
    // still be able to invalidate its refresh token server-side, and logging out
    // twice is not an error worth reporting.
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke every active session for the current user' })
  async logoutAll(@CurrentUser('sub') userId: string): Promise<void> {
    // Authenticated, unlike `logout`: revoking every device is a destructive action,
    // so it requires proof of the current session rather than one token value.
    await this.auth.logoutAll(userId);
  }
}
