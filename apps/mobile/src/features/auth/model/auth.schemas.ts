import { z } from 'zod';

/**
 * Form validation for the auth screens.
 *
 * These mirror `apps/api/src/modules/auth/dto/auth.dto.ts` deliberately, but they
 * are **not** a security control — the API revalidates everything behind
 * `forbidNonWhitelisted: true`, and a client is not a place to enforce rules. What
 * they buy is that a typo is caught in the field the user is looking at, before a
 * round trip to a free-tier instance that may be cold.
 *
 * The limits are copied rather than shared because RN cannot consume the API's
 * `class-validator` DTOs (decorators plus `reflect-metadata` in a Hermes bundle).
 * The trade-off is stated here so the duplication is a decision, not an accident.
 *
 * @see apps/api/src/modules/auth/dto/auth.dto.ts
 */

/**
 * Email, normalised and then validated.
 *
 * ⚠️ The order is load-bearing and the obvious spelling is wrong. `z.email().trim()`
 * runs the format check *before* the trim, so `" a@b.com "` fails — and Android's
 * keyboard appends a trailing space after autocomplete routinely. Piping a
 * pre-trimmed string into the format check is what makes normalisation happen first.
 *
 * Verified rather than assumed: `auth.schemas.test.ts` asserts the padded case.
 */
const emailField = z
  .string()
  .trim()
  .min(1, { error: 'Email is required' })
  .pipe(
    z
      .email({ error: 'Enter a valid email address' })
      // RFC 5321's maximum, matching the API's `@MaxLength(254)`.
      .max(254, { error: 'Email is too long' }),
  );

/**
 * Sign-in credentials.
 *
 * ⚠️ The password rule here is `min(1)`, **not** the `min(8)` used at registration,
 * and the difference is intentional. On sign-in the password already exists: a
 * length rule cannot improve it, it publishes the policy to anyone probing the
 * form, and it locks out any account created before the rule existed. The API's
 * `LoginDto` has no `@MinLength` for the same reason. All this check does is stop
 * an empty submit.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, { error: 'Password is required' })
    // Matches the API's ceiling. An unbounded password is free CPU for an attacker:
    // every request would run Argon2id over whatever they sent.
    .max(128, { error: 'Password is too long' }),
});

/** Validated sign-in form values. */
export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Registration payload.
 *
 * 8 characters is the NIST floor and the API's own rule. There are deliberately no
 * composition requirements (an upper-case, a digit, a symbol) — current guidance is
 * that they push people toward predictable substitutions without adding entropy.
 */
export const registerSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(8, { error: 'Use at least 8 characters' })
    .max(128, { error: 'Password is too long' }),

  /**
   * Optional, and normalised to `undefined` when blank.
   *
   * The transform matters: the field's default value is `''`, and `''` is a
   * perfectly valid string as far as the API's `@IsOptional() @IsString()` is
   * concerned. Sent as-is it would be *stored*, and the account would then render
   * with a blank name everywhere instead of falling back to the email. `undefined`
   * is dropped by `JSON.stringify`, so the key never reaches the wire.
   */
  displayName: z
    .string()
    .trim()
    .max(80, { error: 'Display name is too long' })
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** Validated registration form values. */
export type RegisterFormValues = z.infer<typeof registerSchema>;
