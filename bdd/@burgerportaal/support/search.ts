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

export { burg as burgerportaalBase }

/** Wait until the homepage (or current page) search field is hydrated. */
export async function waitForSearchField(page: Page) {
  const field = page.getByRole('searchbox', { name: 'Zoekterm' })
  await waitForWithReload(page, field)
  return field
}

/**
 * Search the burgerportaal homepage for `term` via its "Zoekterm" search field
 * (Enter). Waits until `/zoeken` is reached.
 */
export async function searchPublicatieViaUi(page: Page, term: string): Promise<void> {
  await page.goto(burg)
  await page.waitForLoadState('networkidle').catch(() => {})
  const field = await waitForSearchField(page)
  await field.fill(term)
  await field.press('Enter')
  await page.waitForURL(/\/zoeken/, { timeout: 15_000 }).catch(() => {})
}

/**
 * Submit a homepage search by clicking the "Zoeken" button (not Enter).
 * Pass `term` empty to submit an empty query.
 */
export async function submitHomepageSearch(
  page: Page,
  term: string,
  { via }: { via: 'enter' | 'button' } = { via: 'enter' },
): Promise<void> {
  // Retry once on transient empty responses from the local burgerportaal.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(burg)
      break
    }
    catch (err) {
      if (attempt > 0 || !String(err).includes('ERR_EMPTY_RESPONSE'))
        throw err
      await page.waitForTimeout(1000)
    }
  }
  await page.waitForLoadState('networkidle').catch(() => {})
  const field = await waitForSearchField(page)
  await field.fill(term)
  if (via === 'button')
    await page.getByRole('button', { name: 'Zoeken', exact: true }).click()
  else
    await field.press('Enter')
  await page.waitForURL(/\/zoeken/, { timeout: 15_000 }).catch(() => {})
}

/** Open the burgerportaal `/zoeken` results page (optionally with a query). */
export async function openSearchResultsPage(page: Page, query = 'woo'): Promise<void> {
  const url = query
    ? `${burg}/zoeken?query=${encodeURIComponent(query)}`
    : `${burg}/zoeken`
  await page.goto(url)
  await page.waitForLoadState('networkidle').catch(() => {})
  await expect(page.getByRole('heading', { name: 'Zoeken', level: 1 })).toBeVisible({
    timeout: 20_000,
  })
}

/** Assert the burgerportaal search results page reports no matches. */
export async function expectNoSearchResults(page: Page): Promise<void> {
  // The results grid renders its empty state (SearchGrid.vue) only once the
  // search request has come back; the SPA needs more than the 5s default here.
  await expect(page.getByText('Geen resultaten gevonden.')).toBeVisible({ timeout: 20_000 })
}
