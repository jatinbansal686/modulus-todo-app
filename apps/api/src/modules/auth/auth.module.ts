import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    // Secret and expiry are passed per-signature in AuthService rather than
    // configured globally here, so the algorithm and TTL are visible at the point
    // the token is actually created.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, RefreshTokenService, JwtAuthGuard],
  // JwtAuthGuard is exported so app.module.ts can register it as the global APP_GUARD.
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
