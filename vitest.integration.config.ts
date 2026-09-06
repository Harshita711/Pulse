import { defineConfig } from 'vitest/config';
import path from 'path';

// Deliberately separate from vitest.config.ts: this config is the only one
// that picks up tests/*.integration.test.ts, and it's only ever invoked via
// `npm run test:integration`, never by plain `npm test`. Run it with
// DATABASE_URL pointing at a database you don't mind writing test rows
// into -- ideally a dedicated test database, not your dev database with
// seeded demo data (see the warning in tests/lifecycle.integration.test.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.integration.test.ts'],
    testTimeout: 30_000, // real DB round-trips need more headroom than pure unit tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
