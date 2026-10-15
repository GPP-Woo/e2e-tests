import { hasOpenRouterKey } from '@/bdd/_core/stagehand'
import { Before, test } from '../../_core/fixture'

/**
 * Guard for scenarios that drive the UI through Stagehand (`@ai`).
 *
 * No feature carries `@ai` today — every step now uses plain Playwright
 * locators. The hook is kept alongside the `stagehand` / `adminStagehand`
 * fixtures so tagging a future scenario `@ai` is all it takes to get the AI
 * browser plus the right skips:
 *
 *   - no OPENROUTER_API_KEY → skip, so the suite stays green without a model key;
 *   - non-chromium → skip, since Stagehand attaches to the Playwright browser's
 *     remote-debugging port (see core-fixtures.ts + playwright.config.ts) and
 *     only Chromium exposes one.
 */
Before({ tags: '@ai' }, async ({ browserName }) => {
  test.skip(!hasOpenRouterKey(), 'Set OPENROUTER_API_KEY to run the Stagehand @ai scenarios')
  test.skip(browserName !== 'chromium', `@ai attaches Stagehand to Chromium's CDP port; ${browserName} has none`)
})
