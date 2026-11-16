import { defineConfig, devices } from '@playwright/test';

/**
 * Visual regression screenshots of the built app. Baselines are Linux renders from CI (software
 * WebGL), so they're made there: run the Visual workflow with "update" and commit what it
 * uploads. See tests/visual/street.pw.ts.
 */
export default defineConfig({
  testDir: 'tests/visual',
  testMatch: '*.pw.ts',
  // Software WebGL takes 10 to 15 seconds a frame here, and a stable screenshot takes several.
  timeout: 300_000,
  expect: {
    timeout: 120_000,
    // Software rendering wobbles by a pixel here and there between runs.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    reducedMotion: 'reduce',
    timezoneId: 'America/New_York',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 860 },
        // WebGL without a GPU, the same on every runner.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
