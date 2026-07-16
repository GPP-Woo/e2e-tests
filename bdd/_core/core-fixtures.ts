import type { Stagehand } from '@browserbasehq/stagehand'
import type { AppName, User } from './types'
import { test as base } from 'playwright-bdd'
import { stateForTags } from './roles'
import { signIn as performSignIn } from './signIn'
import { cdpEndpointForWorker, createStagehand, overrideModelForTags, tierForTags } from './stagehand'
import { DEFAULT_USER, ENV } from './types'

/**
 * App-agnostic fixtures: auth-by-tag, live sign-in, the Stagehand AI browsers
 * and scenario scratch space. App-owned fixtures (resource managers, admin
 * drivers, the beheer config client) live in each app's `fixtures.ts`; the
 * chain is composed in `_core/fixture.ts`.
 */

/** Mutable holder so hooks and steps can agree on who logs in. */
export interface CurrentUser {
  value?: User
}

export interface CoreFixtures {
  /** Selected identity for a live sign-in; set by the auth hooks (see hooks.ts). */
  currentUser: CurrentUser
  /** Navigate to `app` and sign in live as `currentUser` (falls back to DEFAULT_USER). */
  signIn: (app: AppName) => Promise<void>
  /**
   * AI (Stagehand + OpenRouter) for the @beheer scenarios. Attaches over CDP to
   * the Playwright-traced `page` context (which carries the beheer-admin
   * session) and drives it from natural language; the model is chosen from the
   * scenario tags. Closed automatically in teardown.
   */
  stagehand: Stagehand
  /**
   * AI (Stagehand + OpenRouter) for the @ai/@admin scenarios that mutate the
   * publicatiebank/gpp-app UI from natural language. Attaches over CDP to the
   * Playwright-traced `page` context (which carries the admin session). Model
   * chosen from the scenario tags; closed in teardown.
   */
  adminStagehand: Stagehand
  /** Generic scenario-scoped key/value scratch shared between a step and its assertion. */
  scratch: Map<string, string>
}

export const coreTest = base.extend<CoreFixtures>({
  /**
   * Auth-by-tag: reuse a pre-authenticated session based on the scenario tags.
   * The tag → session table (and why the Stagehand scenarios need the session
   * they get) lives in `_core/roles.ts`.
   */
  storageState: async ({ $tags }, use) => {
    await use(stateForTags($tags))
  },

  // Playwright requires the first arg to be a destructuring pattern; this
  // fixture depends on no others.
  // eslint-disable-next-line no-empty-pattern
  currentUser: async ({}, use) => {
    await use({})
  },
  signIn: async ({ page, currentUser }, use) => {
    await use(async (app: AppName) => {
      const user = currentUser.value ?? ENV.users[DEFAULT_USER]
      await performSignIn(page, app, user)
    })
  },
  stagehand: async ({ page, $tags }, use, testInfo) => {
    // Depend on `page` so its context — created with the tag-selected
    // storageState and traced by Playwright — exists before Stagehand attaches
    // over CDP and adopts it. `about:blank` just materialises the page.
    await page.goto('about:blank')
    const stagehand = await createStagehand({
      tier: tierForTags($tags),
      overrideModel: overrideModelForTags($tags),
      cdpUrl: cdpEndpointForWorker(testInfo.parallelIndex),
    })
    await use(stagehand)
    await stagehand.close()
  },
  adminStagehand: async ({ page, $tags }, use, testInfo) => {
    await page.goto('about:blank')
    const stagehand = await createStagehand({
      tier: tierForTags($tags),
      overrideModel: overrideModelForTags($tags),
      cdpUrl: cdpEndpointForWorker(testInfo.parallelIndex),
    })
    await use(stagehand)
    await stagehand.close()
  },
  // eslint-disable-next-line no-empty-pattern
  scratch: async ({}, use) => {
    await use(new Map<string, string>())
  },
})
