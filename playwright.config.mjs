import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  // Keep browser cleanup from deleting the earlier unit-test report.
  outputDir: './test-results/browser-artifacts',
  // Software WebGL on shared CI CPUs takes longer than a desktop GPU.
  timeout: 120_000,
  globalTimeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['junit', { outputFile: 'test-results/browser.xml' }], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] }
  },
  webServer: { command: 'npm run serve', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 20_000 }
});
