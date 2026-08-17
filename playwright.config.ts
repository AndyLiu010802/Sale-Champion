import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: { baseURL: 'http://localhost:3344' },
  webServer: {
    command: 'tsx e2e/start-server.ts',
    url: 'http://localhost:3344/api/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: { PORT: '3344', NODE_ENV: 'production' },
  },
});
