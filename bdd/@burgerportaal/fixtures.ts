import { gppAppTest } from '@/bdd/@gpp-app/fixtures'
import { burgerportaalAdminState } from '@/bdd/_core/roles'
import { withSingletonGuard } from '@/bdd/_core/singleton-guard'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'
import { BeheerConfigClient } from './support/beheer-config'

/**
 * Burgerportaal-owned fixtures: the anonymous sitemap client and the beheer
 * config client (a shared server-side singleton, guarded so scenarios restore
 * it exactly as found). Last link in the fixture chain (order is arbitrary —
 * nothing here depends on the other apps).
 */

/** One GET against the burgerportaal (status + content type + raw body). */
export interface SitemapResponse {
  path: string
  status: number
  contentType: string
  body: string
}

/**
 * Anonymous HTTP client for the public GPP-burgerportaal sitemap. Uses
 * Playwright's `request` context (no browser, no auth — the Woo-index harvester
 * reads the sitemap signed-out) and remembers the last response so a `When I
 * fetch ...` step and its `Then ...` assertions can share it.
 */
export interface SitemapClient {
  /** GET `path` on the burgerportaal, store and return the response. */
  get: (path: string) => Promise<SitemapResponse>
  /** The most recently fetched response (throws if nothing fetched yet). */
  last: () => SitemapResponse
}

/** Scenario-scoped scratch space shared between a mutating step and its assertion. */
export interface BeheerState {
  /** Expected config values keyed by field (e.g. the unique welcome text set). */
  expected: Map<string, string>
  /** Public image bytes (hex sha) captured before a replacement, keyed by kind. */
  imageBefore: Map<string, string>
}

export interface BurgerportaalFixtures {
  /** Anonymous HTTP client for the public burgerportaal sitemap. */
  sitemap: SitemapClient
  /**
   * Authenticated burgerportaal beheer config client. The config is a shared
   * server-side singleton, so the fixture wraps the scenario in a
   * {@link withSingletonGuard}: snapshot on setup, restore in teardown — a
   * scenario owns (and cleans up) every change it makes, safe against
   * shared/production environments.
   */
  beheer: BeheerConfigClient
  /** Scenario-scoped scratch space for the @beheer steps. */
  beheerState: BeheerState
}

export const burgerportaalTest = gppAppTest.extend<BurgerportaalFixtures>({
  sitemap: async ({ request }, use) => {
    const base = ENV.apps.burgerportaal.replace(/\/$/, '')
    let latest: SitemapResponse | undefined
    await use({
      async get(path) {
        const response = await request.get(base + path)
        latest = {
          path,
          status: response.status(),
          contentType: response.headers()['content-type'] ?? '',
          body: await response.text(),
        }
        return latest
      },
      last() {
        if (!latest)
          throw new Error('No sitemap resource fetched yet in this scenario')
        return latest
      },
    })
  },
  // Depends on no other fixtures; builds its own authenticated API context.
  // eslint-disable-next-line no-empty-pattern
  beheer: async ({}, use) => {
    const context = await apiRequest.newContext({ storageState: burgerportaalAdminState })
    const client = new BeheerConfigClient(context)
    try {
      await withSingletonGuard(client, () => use(client))
    }
    finally {
      await context.dispose()
    }
  },
  // eslint-disable-next-line no-empty-pattern
  beheerState: async ({}, use) => {
    await use({ expected: new Map(), imageBefore: new Map() })
  },
})
