import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../_core/fixture'

// The burgerportaal SPA never finishes booting in WebKit on this stack (stuck on
// its "wordt geladen…" splash), so skip there instead of timing out. Chromium
// and Firefox boot it fine.
Before({ tags: '@no-webkit' }, async ({ browserName }) => {
  test.skip(
    browserName === 'webkit',
    '@no-webkit: the burgerportaal SPA does not boot in WebKit on this stack (stuck on the loading splash).',
  )
})

/**
 * Testscript 11 (zoeken en raadplegen, burger) steps. The public burgerportaal is
 * driven deterministically through the ordinary Playwright `page` (the portal is
 * public — the @admin session on `page` is only used to seed the onderwerp). No
 * mutations happen here, so there is nothing for Stagehand to do.
 *
 * Onderwerpen are seeded through the publicatiebank admin (the `topics` fixture)
 * and are served live on the burgerportaal, so a freshly published onderwerp is
 * browsable within seconds. See the feature file for why search-hit indexing and
 * the homepage counters are not asserted.
 */

const burg = ENV.apps.burgerportaal.replace(/\/$/, '')
const LIVE = { timeout: 30_000, intervals: [1000, 2000, 3000] }

Given('the burgerportaal homepage is open', async ({ page }) => {
  await page.goto(burg)
  await page.waitForLoadState('networkidle').catch(() => {})
})

// Prerequisite (deterministic, through the admin): a promoted, gepubliceerd
// onderwerp — the only kind visible to the public.
Given('a promoted, published onderwerp', async ({ topics, scratch }) => {
  const omschrijving = `E2E burger omschrijving ${Date.now()}`
  scratch.set('onderwerp:omschrijving', omschrijving)
  await topics.add(undefined, { status: 'gepubliceerd', promoot: true, omschrijving })
})

// --- Full-text search (experience, not seeded-content indexing) -------------

When('I search the burgerportaal for {string}', async ({ page }, term: string) => {
  await page.goto(burg)
  await page.waitForLoadState('networkidle').catch(() => {})
  // The search field can be late to hydrate on WebKit; reload-retry until it is.
  const field = page.locator('#search-field')
  await waitForWithReload(page, field)
  await field.fill(term)
  await field.press('Enter')
  await page.waitForURL(/\/zoeken/, { timeout: 15_000 }).catch(() => {})
})

Then('I land on the search results page', async ({ page }) => {
  expect(page.url()).toContain('/zoeken')
})

// --- Browse onderwerpen (served live from the publicatiebank) ---------------

When('I open the Onderwerpen page on the burgerportaal', async ({ page }) => {
  await page.goto(`${burg}/onderwerpen`)
  await page.waitForLoadState('networkidle').catch(() => {})
})

Then('the onderwerp is listed with its omschrijving', async ({ page, topics, scratch }) => {
  const titel = topics.last()
  const omschrijving = scratch.get('onderwerp:omschrijving')!
  // The list is served live from the publicatiebank; allow a few seconds and a
  // reload for propagation, then read the rendered page text.
  await expect.poll(async () => {
    await page.goto(`${burg}/onderwerpen`)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)
  expect(await page.locator('body').textContent()).toContain(omschrijving)
})

When('I open that onderwerp on the burgerportaal', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(`${burg}/onderwerpen`)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)
  await page.getByText(titel, { exact: false }).first().click()
  await page.waitForLoadState('networkidle').catch(() => {})
})

Then('its omschrijving is shown', async ({ page, scratch }) => {
  const omschrijving = scratch.get('onderwerp:omschrijving')!
  await expect.poll(() => page.locator('body').textContent(), { timeout: 10_000, intervals: [400, 800, 1500] })
    .toContain(omschrijving)
})
