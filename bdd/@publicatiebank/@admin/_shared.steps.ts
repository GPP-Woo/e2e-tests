import { hasOpenRouterKey } from '@/bdd/_core/stagehand'
import { Before, test } from '../../_core/fixture'

// Skip AI-driven scenarios when no model key is configured, so the rest of the
// suite stays green without OpenRouter. `@ai` marks every Stagehand scenario
// across the admin + gpp-app verticals (@beheer has its own guard).
//
// Also chromium-only: Stagehand drives Chromium over CDP and attaches to the
// Playwright browser's remote-debugging port (see fixture.ts + playwright.config.ts),
// which only Chromium exposes. On firefox/webkit there is no port to join, and
// the AI browser would be Chromium anyway, so those add no real coverage.
Before({ tags: '@ai' }, async ({ browserName }) => {
  test.skip(!hasOpenRouterKey(), 'Set OPENROUTER_API_KEY to run the Stagehand @ai scenarios')
  test.skip(browserName !== 'chromium', `@ai attaches Stagehand to Chromium's CDP port; ${browserName} has none`)
})
