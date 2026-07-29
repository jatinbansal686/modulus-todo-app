import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'demo@modulusseventeen.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple', minLength: 8 })
  @IsString()
  // 8 is the NIST floor. No composition rules (upper/digit/symbol): current guidance
  // is that they push people toward predictable substitutions without adding entropy.
  @MinLength(8, { message: 'password must be at least 8 characters' })
  // Argon2id has no length ceiling of its own, but an unbounded password is free CPU
  // for an attacker — every request would hash whatever they sent.
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Demo User' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@modulusseventeen.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'The opaque refresh token issued at login' })
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

/** Response body for register, login and refresh. */
export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({
    description: 'Opaque token — not a JWT. Store it in the device keystore.',
  })
  refreshToken!: string;

  @ApiProperty({
    description:
      'Absolute expiry of the access token (ISO 8601). The client refreshes proactively just before this, rather than waiting for a 401.',
    example: '2026-07-29T10:15:00.000Z',
  })
  accessTokenExpiresAt!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  user!: { id: string; email: string; displayName?: string };
}
