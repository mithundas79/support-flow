import { defineConfig } from '@playwright/test';

const published = process.env.PUBLISHED_DEMO_URL;
if (published && published !== 'https://mithundas79.github.io/support-flow/') throw new Error('PUBLISHED_DEMO_URL must be the support-flow GitHub Pages demo.');
const localPreview = process.env.WEB_DEMO_URL;
if (localPreview && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/support-flow\/$/.test(localPreview)) throw new Error('WEB_DEMO_URL must point to a loopback support-flow preview.');
const baseURL = published || localPreview || 'http://127.0.0.1:4175/support-flow/';
export default defineConfig({
  testDir: './test', timeout: 45_000, expect: { timeout: 8_000 }, retries: 0, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: published || localPreview ? undefined : { command: 'npm run preview -- --port 4175 --strictPort', url: baseURL, reuseExistingServer: false },
});
