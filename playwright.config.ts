import { defineConfig, devices } from '@playwright/test'

const port = 4173
const base = '/' + (process.env.PAGES_BASE_PATH ?? 'fitness-tracker').replace(/^\/+|\/+$/g, '')
const url = `http://127.0.0.1:${port}${base === '/' ? '/' : base + '/'}`
const channel = process.env.PLAYWRIGHT_CHANNEL

export default defineConfig({
  testDir: './tests/e2e',
  workers: 2,
  use: { baseURL: url, timezoneId: 'Asia/Hong_Kong', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer: !process.env.CI,
  },
})
