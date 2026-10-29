import { defineConfig } from '@playwright/test';
import {firefoxLaunch} from './scripts/browser-settings.mjs';

export default defineConfig({
  testDir: './tests/browser',
  // Keep browser cleanup from deleting the earlier unit-test report.
  outputDir: './test-results/browser-artifacts',
  // Software WebGL on shared CI CPUs takes longer than a desktop GPU.
  timeout: 180_000,
  // CI runs one eighth of the matrix per container; a local full run includes
  // all controls and combinations and needs a larger overall budget.
  globalTimeout: (process.env.CI ? 60 : 180) * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? Number(process.env.PW_WORKERS||1) : 2,
  retries: process.env.CI ? 1 : 0,
  // A retry provides a trace for diagnosis, not permission to publish an
  // intermittently broken renderer.
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['junit', { outputFile: 'test-results/browser.xml' }], ['html', { outputFolder: 'playwright-report', open: 'never' }], ...process.env.CI_SHARD_REPORT_DIR ? [['blob', { outputDir: process.env.CI_SHARD_REPORT_DIR }]] : []],
  projects: [
    {name:'phone-firefox',testMatch:/studio\.spec\.mjs/,use:{browserName:'firefox',viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,launchOptions:firefoxLaunch}},
    {name:'phone-webkit',testMatch:/studio\.spec\.mjs/,use:{browserName:'webkit',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,launchOptions:{args:[]}}},
    {name:'chromium',use:{browserName:'chromium'}}
  ],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] }
  },
  webServer: { command: 'npm run serve', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 20_000 }
});
