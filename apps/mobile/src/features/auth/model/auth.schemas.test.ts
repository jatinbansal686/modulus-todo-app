import { loginSchema, registerSchema } from './auth.schemas';

/** The first message zod reported, or `null` when parsing succeeded. */
function firstError(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.success ? null : (result.error?.issues[0]?.message ?? null);
}

describe('loginSchema', () => {
  it.each([
    ['a valid address', 'demo@modulusseventeen.com', null],
    // ⚠️ The case the schema is built around. `z.email().trim()` — the spelling
    // everyone reaches for first — validates before trimming and fails this,
    // while Android's keyboard appends a trailing space after autocomplete
    // routinely. If this ever regresses, real users cannot sign in.
    ['surrounding whitespace', '  demo@modulusseventeen.com  ', null],
    ['no at-sign', 'demo.modulusseventeen.com', 'Enter a valid email address'],
    ['no domain', 'demo@', 'Enter a valid email address'],
    ['empty', '', 'Email is required'],
    ['only whitespace', '   ', 'Email is required'],
  ])('email: %s', (_case, email, expected) => {
    const result = loginSchema.safeParse({ email, password: 'anything' });
    expect(firstError(result)).toBe(expected);
  });

  it('normalises the email it hands on, so the API never sees the padding', () => {
    const result = loginSchema.safeParse({
      email: '  Demo@Modulusseventeen.com  ',
      password: 'ModulusDemo2026!',
    });

    expect(result.success).toBe(true);
    // Trimmed, but *not* lower-cased: the API owns canonicalisation, and doing it
    // in two places is how the two disagree later.
    expect(result.data?.email).toBe('Demo@Modulusseventeen.com');
  });

  /**
   * The asymmetry with {@link registerSchema} is deliberate, so it is pinned here.
   *
   * A length rule on sign-in cannot improve a password that already exists. It can
   * only publish the policy and lock out accounts that predate it. Someone
   * "tidying up" by making the two schemas match would break sign-in for exactly
   * the users least able to explain what happened.
   */
  it('accepts a short password — length rules belong at registration, not sign-in', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(firstError(result)).toBe('Password is required');
  });
});

describe('registerSchema', () => {
  const VALID = {
    email: 'new@modulusseventeen.com',
    password: 'at-least-eight',
    displayName: 'Jatin',
  };

  it.each([
    ['at the 8-character floor', 'abcdefgh', null],
    ['below it', 'abcdefg', 'Use at least 8 characters'],
    ['empty', '', 'Use at least 8 characters'],
    ['over the 128 ceiling', 'a'.repeat(129), 'Password is too long'],
  ])('password: %s', (_case, password, expected) => {
    const result = registerSchema.safeParse({ ...VALID, password });
    expect(firstError(result)).toBe(expected);
  });

  /**
   * The transform that keeps a blank display name off the wire.
   *
   * `''` is a perfectly valid string to the API's `@IsOptional() @IsString()`, so
   * without this it would be *stored* and the account would render with a blank
   * name everywhere instead of falling back to the email.
   */
  it.each([
    ['left blank', '', undefined],
    ['whitespace only', '   ', undefined],
    ['omitted entirely', undefined, undefined],
    ['padded', '  Jatin  ', 'Jatin'],
    ['given', 'Jatin', 'Jatin'],
  ])('displayName %s becomes %s', (_case, displayName, expected) => {
    const result = registerSchema.safeParse({ ...VALID, displayName });

    expect(result.success).toBe(true);
    expect(result.data?.displayName).toBe(expected);
  });

  it('drops the displayName key from JSON entirely when blank', () => {
    const result = registerSchema.safeParse({ ...VALID, displayName: '' });

    // The property-level assertion above cannot see this: `{ displayName:
    // undefined }` still *has* the key. What reaches the API is the serialised
    // form, and that is what `forbidNonWhitelisted` inspects.
    expect(JSON.parse(JSON.stringify(result.data))).not.toHaveProperty(
      'displayName',
    );
  });

  it('rejects a display name over the API limit', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      displayName: 'a'.repeat(81),
    });
    expect(firstError(result)).toBe('Display name is too long');
  });
});
