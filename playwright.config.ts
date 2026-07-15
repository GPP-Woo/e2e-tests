import path from 'node:path'
import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import { defineBddConfig } from 'playwright-bdd'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({ path: path.resolve(__dirname, '.env') })

/**
 * playwright-bdd: features + steps live under ./bdd. Directory names prefixed
 * with `@` become tags (tags-from-path), e.g. bdd/@publicatiebank/@admin/*.
 * `bddgen` generates runnable specs into the returned testDir before each run.
 * https://vitalets.github.io/playwright-bdd/
 */
const testDir = defineBddConfig({
  featuresRoot: './bdd',
  /* Attach a ready-to-paste "Fix with AI" prompt (failing step, error, snippet)
     to every failing test in the HTML report.
     https://vitalets.github.io/playwright-bdd/#/configuration/options?id=aifix */
  aiFix: {
    promptAttachment: true,
  },
})

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir,
  /* Sweep any test data left behind by a hard-killed run (via the admin UI, so
     it works against any environment — no container access). The reference-data
     prerequisite is verified in setup/auth.setup.ts. See setup/global-teardown.ts. */
  globalTeardown: './setup/global-teardown.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['html'], ['github'], ['dot']] : [['html'], ['line']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on',

    /* Resolve the local Keycloak hostname (used as OIDC issuer) to localhost so the
       browser reaches the published Keycloak port without an /etc/hosts entry. */
    launchOptions: {
      args: ['--host-resolver-rules=MAP keycloak.woo-search.local 127.0.0.1'],
    },
  },

  /* Configure projects for major browsers */
  projects: [
    /* Signs in once per role and writes .auth/*.json; runs before the BDD
       projects. Kept out of ./bdd so bddgen does not treat it as a step file. */
    {
      name: 'setup',
      testDir: './setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },
  ],
})
