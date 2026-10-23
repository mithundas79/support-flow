import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173/support-flow/';
const external = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/independent', open: 'never' }]],
  outputDir: 'test-results/independent',
  use: {
    baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  ...(!external ? { webServer: {
    command: 'npm run preview --workspace @support-flow/web -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  } } : {}),
});
