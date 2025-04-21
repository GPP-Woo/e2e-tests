import path from 'node:path'
import process from 'node:process'
import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({ path: path.resolve(__dirname, '.env') })

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './setup',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  use: {
    trace: 'off',
  },
  reporter: process.env.CI ? [['dot'], ['github']] : undefined,
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'auth',
      testMatch: /.*setup\.spec\.ts/,
    },
  ],
})
