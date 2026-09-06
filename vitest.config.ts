import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests hit a real Postgres database and must be run
    // explicitly via `npm run test:integration`, never picked up by the
    // default `npm test` -- that's what a CI pipeline or a quick sanity
    // check would run, and it must never depend on (or risk touching) a
    // real database. See vitest.integration.config.ts.
    exclude: ['tests/**/*.integration.test.ts', '**/node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
