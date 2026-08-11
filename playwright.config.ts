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
 * Resolve the local Keycloak hostname (used as OIDC issuer) to localhost so the
 * browser reaches the published Keycloak port without an /etc/hosts entry.
 * Chromium-only — see the note in `use` for why it must not be set globally.
 */
const KEYCLOAK_HOST_RESOLVER = '--host-resolver-rules=MAP keycloak.woo-search.local 127.0.0.1'

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
  /* Retries. The SPA/admin teardown can time out on a slow firefox/webkit under
     emulated-backend load. A single retry absorbs that transient flake without
     masking a real, reproducible failure (which fails twice). One retry only:
     the @chromium-only scenarios carry @timeout:120000/@timeout:240000, so a
     second CI retry costs up to 4 extra minutes *per broken scenario* — that
     alone pushed the k8s run past its job timeout without catching anything a
     single retry doesn't. */
  retries: 1,
  /* CI runs 2 workers, not 1: the suite was 39 min of a 54 min job at one
     worker, and `ubuntu-latest` has 4 vCPU / 16 GB — the kind stack sits at
     roughly half of that, so there is room for a second browser. If the backend
     starts starving, it shows up as the symptoms described below (502s on
     documenten, exit 137, beforeEach timeouts that pass in isolation); drop
     back to 1 rather than chasing them.

     Locally, cap instead of letting Playwright pick one worker per core. The
     whole stack (Elasticsearch + Keycloak + four Django/dotnet apps) shares one
     Docker VM, and on a small VM unbounded workers × 3 browser projects push the
     node into swap until the kernel SIGKILLs the publicatiebank (exit 137). That
     surfaces as failures nowhere near the cause — `POST documenten -> 502`, an
     admin "Beheermenu" that never renders, beforeEach timeouts — every one of
     which passes in isolation, so they read as flakes rather than as a starved
     backend. 4 is safe on an 8 GB VM; raise it only alongside the VM's memory
     (`docker info --format '{{.MemTotal}}'`). */
  workers: process.env.CI ? 2 : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['html'], ['github'], ['dot'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : [['html'], ['line']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
       Always-on tracing is what makes the published report interactive, but on CI
       it also records ~390 passing traces nobody opens — CPU the kind cluster on
       the same runner needs, and a report near the 1 GB Pages cap. Keep it on
       locally; on CI trace only the retry of something that actually failed. */
    trace: process.env.CI ? 'on-first-retry' : 'on',

    /* NOTE: --host-resolver-rules is deliberately NOT set here. It is a Chromium-only
       flag, and the WebKit build on Linux *hard-errors* on an unknown option
       ("Cannot parse arguments: Unknown option --host-resolver-rules=…") so the
       browser never launches — every webkit scenario then fails with
       "Target page, context or browser has been closed". macOS WebKit tolerates it,
       which is exactly why this only ever showed up on CI. Firefox cannot use the
       flag either, and the scenarios that need it are @chromium-only, so it belongs
       on the chromium project alone (see below). */
  },

  /* Configure projects for major browsers */
  projects: [
    /* Signs in once per role and writes .auth/*.json; runs before the BDD
       projects. Kept out of ./bdd so bddgen does not treat it as a step file. */
    {
      name: 'setup',
      testDir: './setup',
      testMatch: /auth\.setup\.ts/,
      /* Runs on chromium (no browser override) and performs the real Keycloak
         sign-in, so this is the one project that genuinely needs the resolver
         rule — see the note in `use`. */
      use: { launchOptions: { args: [KEYCLOAK_HOST_RESOLVER] } },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Expose CDP so an @ai (Stagehand) scenario can attach to THIS browser
           (see bdd/_core/stagehand.ts cdpEndpointForWorker — the port must
           match: 9330 + the worker's parallel index) and share one traced page.
           Unused until a scenario is tagged @ai, but the port must already be
           open when one is. Carries the Keycloak resolver rule too, since it is
           set per-project rather than in `use` (see the note there). */
        launchOptions: {
          args: [
            KEYCLOAK_HOST_RESOLVER,
            `--remote-debugging-port=${9330 + Number(process.env.TEST_PARALLEL_INDEX ?? 0)}`,
          ],
        },
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      /* @chromium-only scenarios mutate shared global resources (e.g. the
         burgerportaal config, seeded publicaties). Excluding them here — not just
         via the runtime Before-skip — stops a parallel browser from clobbering a
         snapshot/restore mid-flight. @ai is excluded for the same reason plus a
         hard one: Stagehand attaches over CDP, which only Chromium exposes. */
      grepInvert: /@chromium-only|@ai/,
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      /* @no-webkit is excluded here rather than left to the runtime Before-skip:
         both SPAs send `upgrade-insecure-requests`, which WebKit (unlike
         Chromium/Firefox) also applies to http://localhost, so they never boot on
         this plain-http stack. */
      grepInvert: /@chromium-only|@ai|@no-webkit/,
      dependencies: ['setup'],
    },
  ],
})
