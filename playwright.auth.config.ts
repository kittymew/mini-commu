import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/auth',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173/mini-commu/',
    // Auth traces/screenshots can contain credentials. Do not record them.
    trace: 'off', screenshot: 'off', video: 'off',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/mini-commu/',
    reuseExistingServer: false,
  },
})
