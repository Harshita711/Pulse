// Fail-fast environment validation. validateEnv() is called once from
// src/instrumentation.ts's register() hook, which Next.js runs when the
// server process actually starts (`next dev` / `next start`) -- NOT during
// `next build`. That distinction matters: if this threw at module-import
// time instead, it would risk breaking `docker build` (where the build
// step runs before any real secrets are injected via env_file/.env at
// container run time), rather than catching a genuine misconfiguration.
// Failing at process boot, not at build time, is the correct fail-fast
// point for a containerized deploy.

const REQUIRED_VARS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in .env (see .env.example) before starting the server. ' +
        'There is no fallback default for these -- a missing JWT secret must fail loudly, not silently sign tokens with a guessable value.'
    );
  }
}

/**
 * Reads a required env var at call time (not at module-import time, for the
 * same next-build-safety reason as above). auth.ts calls this inside its
 * signing/verification functions rather than caching the value in a
 * module-level constant, so a missing secret throws a clear error the
 * moment it's actually needed rather than silently falling back to a
 * hardcoded default.
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Set it in .env (see .env.example).`);
  }
  return value;
}
