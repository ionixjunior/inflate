import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'webview-ui/**/*.test.ts'],
    // Integration tests run under VS Code (mocha), not vitest.
    exclude: ['src/test/integration/**', 'node_modules/**', 'out/**', 'dist/**'],
  },
});
