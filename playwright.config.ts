import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run the real Angular app in Chromium against a mocked Supabase
 * (see e2e/mock-supabase.ts), so they need no backend. The app must be built
 * with environment.supabaseUrl = http://localhost:54321; the mock intercepts
 * everything sent there.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env['PW_CHROMIUM'] || undefined, args: ['--no-sandbox'] }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx ng serve --port 4300',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000
  }
});
