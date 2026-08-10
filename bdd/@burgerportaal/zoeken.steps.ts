import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../_core/fixture'

// Neither SPA (burgerportaal, gpp-app) finishes booting in WebKit on this stack:
// both serve `Content-Security-Policy: upgrade-insecure-requests`, and WebKit —
// unlike Chromium and Firefox — applies that to http://localhost as well, so
// every asset request is upgraded to https and dies on the TLS handshake,
// leaving the page on its "wordt geladen…" splash. Skip instead of timing out.
Before({ tags: '@no-webkit' }, async ({ browserName }) => {
  test.skip(
    browserName === 'webkit',
    '@no-webkit: the SPA does not boot in WebKit on this stack (upgrade-insecure-requests on plain http).',
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

// --- @todo stubs: gaps vs. manual testscript 11 (bodies not yet implemented) -
// Registered so bddgen stays green; the @todo Before hook skips the scenarios.
// Several of the search-result stubs are additionally "skipped by design" (the
// woo-search Elasticsearch index is not active on the test stack, so a freshly
// seeded item is never returned as a hit) — they document intended coverage.

// --- Homepage (manual step 1) ----------------------------------------------

Then('the homepage shows counts of onderwerpen, publicaties and documenten', async () => {
  // Impl: on `page` at `burg`, read the footer info block and assert it shows
  // numeric counts labelled onderwerpen / publicaties / documenten.
  throw new Error('TODO: assert the homepage info block shows counts of onderwerpen, publicaties and documenten')
})

Then('the homepage shows the configured branding', async () => {
  // Impl: read the beheer config (via the `beheer` fixture) and assert the homepage
  // renders the configured logo, colours and homepage video.
  throw new Error('TODO: assert the homepage renders the configured branding (logo, kleuren, video)')
})

// --- Full-text search (manual step 2) --------------------------------------

When('I submit an empty burgerportaal search', async () => {
  // Impl: focus #search-field (leave it empty) and press Enter / click Zoeken, then
  // waitForURL(/\/zoeken/) on `page`.
  throw new Error('TODO: submit the burgerportaal search with an empty query')
})

When('I search the burgerportaal with the boolean query {string}', async ({}, query: string) => {
  // Impl: fill #search-field with the AND/OR query arg, submit, waitForURL(/\/zoeken/).
  throw new Error(`TODO: submit the burgerportaal search with a boolean AND/OR query: ${query}`)
})

When('I search the burgerportaal for the exact phrase {string}', async ({}, phrase: string) => {
  // Impl: fill #search-field with the phrase arg wrapped in double quotes, submit,
  // waitForURL(/\/zoeken/).
  throw new Error(`TODO: submit the burgerportaal search with a quoted exact phrase: ${phrase}`)
})

When('I search the burgerportaal by clicking the Zoeken button', async () => {
  // Impl: fill #search-field, then click the "Zoeken" submit button (not Enter),
  // waitForURL(/\/zoeken/).
  throw new Error('TODO: submit the burgerportaal search by clicking the Zoeken button')
})

When('I search the burgerportaal for a term in a document\'s contents', async () => {
  // Impl (skipped by design): search for a term known to live inside a seeded
  // document's file contents; needs an active Elasticsearch index.
  throw new Error('TODO: search for a term that only appears in a document\'s file contents')
})

When('I search the burgerportaal for a term in an onderwerp\'s titel', async () => {
  // Impl (skipped by design): search for a term from the seeded onderwerp titel;
  // needs an active Elasticsearch index.
  throw new Error('TODO: search for a term from a seeded onderwerp\'s titel')
})

Then('the matching publicatie appears in the search results', async () => {
  // Impl (skipped by design): assert the seeded publicatie is listed as a hit.
  throw new Error('TODO: assert the matching publicatie appears among the search results')
})

Then('the matching onderwerp appears in the search results', async () => {
  // Impl (skipped by design): assert the seeded onderwerp is listed as a hit.
  throw new Error('TODO: assert the matching onderwerp appears among the search results')
})

// --- Navigating the search results (manual step 3) -------------------------

Given('the burgerportaal search results page is open', async () => {
  // Impl: goto `${burg}/zoeken?...` (or search "woo" from the homepage) on `page` and
  // wait for the results list to render, so the result-navigation steps have a page.
  throw new Error('TODO: open the burgerportaal search results page (/zoeken)')
})

Then('the search results are ordered by relevance by default', async () => {
  // Impl: assert the sort control defaults to "relevantie" on first load.
  throw new Error('TODO: assert the search results default to relevance ordering')
})

When('I edit the search query on the results page', async () => {
  // Impl: change the query in the results-page search field and re-submit.
  throw new Error('TODO: edit the search query on the results page and re-submit')
})

Then('the results page reflects the edited query', async () => {
  // Impl: assert the URL / search field now shows the edited query.
  throw new Error('TODO: assert the results page reflects the edited search query')
})

When('I sort the search results chronologically', async () => {
  // Impl: select the "chronologisch" option in the sort control.
  throw new Error('TODO: sort the search results chronologically')
})

Then('the search results are ordered by date', async () => {
  // Impl: read the result dates and assert they are in chronological order.
  throw new Error('TODO: assert the search results are ordered by date')
})

When('I filter the search results by type', async () => {
  // Impl: tick a "type" facet in the filter sidebar and wait for the list to update.
  throw new Error('TODO: apply a type filter on the search results')
})

Then('only search results matching the filter remain', async () => {
  // Impl: assert every visible result row matches the applied type filter.
  throw new Error('TODO: assert only results matching the applied filter remain')
})

When('I activate a search result filter', async () => {
  // Impl: activate one facet option and capture the other facets' available options.
  throw new Error('TODO: activate a search result filter facet')
})

Then('the remaining search filters only offer options that yield results', async () => {
  // Impl: assert the other facets now only offer options that lead to >=1 result.
  throw new Error('TODO: assert the remaining filters only offer result-yielding options')
})

Then('the search results are paginated at ten per page', async () => {
  // Impl: assert at most 10 results per page and a pager is present when more exist.
  throw new Error('TODO: assert the search results are paginated at ten per page')
})

// --- Inspecting a search result (manual step 4) ----------------------------

When('I open a search result', async () => {
  // Impl (skipped by design): click the first result to open its detail page.
  throw new Error('TODO: open a search result from the results list')
})

Then('the opened result shows its metadata', async () => {
  // Impl (skipped by design): assert the detail page shows the metadata block, with
  // only fields that have a value.
  throw new Error('TODO: assert the opened result shows its metadata (only valued fields)')
})

When('I open a document search result', async () => {
  // Impl (skipped by design): open a result that is a document.
  throw new Error('TODO: open a document search result')
})

Then('the document result offers a download button', async () => {
  // Impl (skipped by design): assert the document detail page has a download button.
  throw new Error('TODO: assert the document result offers a download button')
})

Then('I can navigate from the document to its publicatie', async () => {
  // Impl (skipped by design): click the linked publicatie at the bottom and assert it opens.
  throw new Error('TODO: navigate from the document detail to its coupled publicatie')
})

When('I open a publicatie search result', async () => {
  // Impl (skipped by design): open a result that is a publicatie.
  throw new Error('TODO: open a publicatie search result')
})

Then('the publicatie result lists its coupled documenten', async () => {
  // Impl (skipped by design): assert the publicatie detail lists its coupled documents.
  throw new Error('TODO: assert the publicatie result lists its coupled documenten')
})

// --- Onderwerp detail page (manual step 4f) --------------------------------

Then('the onderwerp shows an illustration image', async () => {
  // Impl: on the opened onderwerp detail page, assert an illustration <img> is visible.
  throw new Error('TODO: assert the opened onderwerp shows an illustration image')
})

Then('the onderwerp metadata is shown', async () => {
  // Impl: assert the onderwerp detail page renders its metadata block.
  throw new Error('TODO: assert the opened onderwerp shows its metadata')
})

Then('the onderwerp lists its coupled publicaties', async () => {
  // Impl: assert the onderwerp detail page lists the coupled publicaties at the bottom.
  throw new Error('TODO: assert the opened onderwerp lists its coupled publicaties')
})

Then('I can search and sort the publicaties within the onderwerp', async () => {
  // Impl: use the onderwerp's publicatie search/sort controls and assert the list updates.
  throw new Error('TODO: search and sort the publicaties within the onderwerp')
})

// --- Onderwerpen page (manual step 5) --------------------------------------

Then('each listed onderwerp shows an illustration image', async () => {
  // Impl: on /onderwerpen, assert each onderwerp card shows an illustration <img>.
  throw new Error('TODO: assert each onderwerp on the Onderwerpen page shows an illustration image')
})

Then('the promoted onderwerpen are shown at the top of the Onderwerpen page', async () => {
  // Impl: assert the gepromote onderwerpen appear above the full onderwerpen list.
  throw new Error('TODO: assert promoted onderwerpen are shown at the top of the Onderwerpen page')
})

// --- Homepage promoted-onderwerpen carousel (manual step 5) ----------------

Then('the homepage carousel shows at most three promoted onderwerpen', async () => {
  // Impl: on the homepage, assert the carousel shows only gepromote onderwerpen and
  // at most three at a time.
  throw new Error('TODO: assert the homepage carousel shows at most three promoted onderwerpen')
})

When('I pause the homepage onderwerpen carousel', async () => {
  // Impl: click the carousel pause control on the homepage.
  throw new Error('TODO: pause the homepage onderwerpen carousel')
})

Then('I can browse the carousel onderwerpen manually', async () => {
  // Impl: click the next/prev carousel controls and assert the shown onderwerp changes.
  throw new Error('TODO: browse the homepage carousel onderwerpen manually via the controls')
})

When('I open a promoted onderwerp from the homepage carousel', async () => {
  // Impl: click the seeded onderwerp inside the homepage carousel to open its detail page.
  throw new Error('TODO: open a promoted onderwerp from the homepage carousel')
})
