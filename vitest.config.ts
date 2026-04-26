import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/frontend/**',
        'src/shared/types.ts',
        // Covered by integration tests (not unit tests)
        'src/proxy/server.ts',
        'src/proxy/forwarder.ts',
        'src/live-server/server.ts',
        // Covered by E2E tests (not unit tests)
        'src/cli/index.ts',
        'src/cli/commands/**',
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
