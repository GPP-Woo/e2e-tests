import type { Page } from '@playwright/test'
import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

/**
 * Reusable burgerportaal full-text search helpers, for scenarios outside
 * zoeken.feature that need to search the public portal (e.g. asserting a
 * concept publicatie never surfaces there). Mirrors the inline search flow in
 * `@burgerportaal/zoeken.steps.ts`'s "I search the burgerportaal for {string}"
 * step, including its WebKit hydration retry.
 */

const burg = ENV.apps.burgerportaal.replace(/\/$/, '')

/** Search the burgerportaal homepage for `term` via its "Zoekterm" search field. */
export async function searchPublicatieViaUi(page: Page, term: string): Promise<void> {
  await page.goto(burg)
  await page.waitForLoadState('networkidle').catch(() => {})
  const field = page.getByRole('searchbox', { name: 'Zoekterm' })
  await waitForWithReload(page, field)
  await field.fill(term)
  await field.press('Enter')
}

/** Assert the burgerportaal search results page reports no matches. */
export async function expectNoSearchResults(page: Page): Promise<void> {
  await expect(page.getByText('Geen resultaten gevonden.')).toBeVisible()
}
