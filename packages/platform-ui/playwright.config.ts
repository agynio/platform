import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const configDir = path.dirname(fileURLToPath(import.meta.url));

const stubDir = path.resolve(configDir, 'e2e/stubs');
const existingNodePath = process.env.NODE_PATH ? `${path.delimiter}${process.env.NODE_PATH}` : '';
process.env.NODE_PATH = `${stubDir}${existingNodePath}`;
(Module as unknown as { _initPaths: () => void })._initPaths();

if (!process.env.TS_NODE_PROJECT) {
  process.env.TS_NODE_PROJECT = path.resolve(configDir, 'tsconfig.playwright.json');
}

const PORT = Number.parseInt(process.env.PLAYWRIGHT_UI_PORT ?? '4173', 10);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  globalSetup: path.resolve(configDir, 'playwright.setup.cjs'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @agyn/platform-ui exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
