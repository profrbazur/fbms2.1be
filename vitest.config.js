import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/loadTestEnv.js'],
    // DB-backed test files share one Atlas connection pool sequentially —
    // avoids opening many concurrent connections against the free-tier
    // cluster and any interleaving between files that touch the same
    // collections.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: ['src/seeders/run.js', 'src/server.js'],
    },
  },
});
