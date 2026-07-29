import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally-applied `JwtAuthGuard`.
 *
 * Authentication is on by default and switched off explicitly, rather than off by
 * default and remembered per controller — the failure mode of the first is a public
 * route that 401s (noisy, caught immediately), and of the second a private route
 * silently open to the world.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
