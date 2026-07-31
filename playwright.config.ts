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
  /* Retries. The Stagehand @ai scenarios are inherently non-deterministic — an
     act() occasionally misfires (rotating across scenarios run-to-run), and the
     SPA/admin teardown can time out on a slow firefox/webkit under emulated-
     backend load. A single retry absorbs these transient flakes without masking a
     real, reproducible failure (which fails twice). CI retries twice (slower,
     noisier infra); locally once. @expensive-ai on the repeat offenders lowers
     the first-attempt miss rate so the retry is rarely needed. */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['html'], ['github'], ['dot'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : [['html'], ['line']],
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
      use: {
        ...devices['Desktop Chrome'],
        /* Expose CDP so the Stagehand @ai/@beheer scenarios can attach to THIS
           browser (see bdd/_core/stagehand.ts cdpEndpointForWorker — the port
           must match: 9330 + the worker's parallel index) and share one traced
           page. Keep the Keycloak host-resolver arg from the shared `use`. */
        launchOptions: {
          args: [
            '--host-resolver-rules=MAP keycloak.woo-search.local 127.0.0.1',
            `--remote-debugging-port=${9330 + Number(process.env.TEST_PARALLEL_INDEX ?? 0)}`,
          ],
        },
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      /* @ai (Stagehand) scenarios drive Chromium over CDP, which firefox/webkit
         don't expose — so they can only run in the chromium project. Excluding
         them here (not just via a runtime Before-skip) also stops the shared
         global resources they mutate (e.g. the burgerportaal config) from being
         clobbered by a parallel browser. */
      grepInvert: /@ai/,
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      grepInvert: /@ai/,
      dependencies: ['setup'],
    },
  ],
})
