import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../_core/fixture'
import {
  burgerportaalBase as burg,
  openSearchResultsPage,
  submitHomepageSearch,
  waitForSearchField,
} from './support/search'

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

// Enough gepromote onderwerpen for carousel nav/pause controls to appear
// (controls only render when tiles.length > visibleItemsCount, typically 3).
Given('several promoted, published onderwerpen', async ({ topics, scratch }) => {
  let lastOmschrijving = ''
  for (let i = 0; i < 4; i++) {
    lastOmschrijving = `E2E burger omschrijving ${Date.now()}-${i}`
    await topics.add(undefined, {
      status: 'gepubliceerd',
      promoot: true,
      omschrijving: lastOmschrijving,
    })
  }
  scratch.set('onderwerp:omschrijving', lastOmschrijving)
})

// --- Full-text search (experience, not seeded-content indexing) -------------

When('I search the burgerportaal for {string}', async ({ page }, term: string) => {
  await submitHomepageSearch(page, term, { via: 'enter' })
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

// --- Homepage (manual step 1) ----------------------------------------------

Then('the homepage shows the configured branding', async ({ page, beheer }) => {
  const resources = await beheer.getResources()
  // Logo (SVG inlined into .gpp-woo-logo, or <img>).
  await expect(page.locator('.gpp-woo-logo')).toBeVisible({ timeout: 20_000 })
  // Hero sfeerfoto when configured.
  if (typeof resources.imageUrl === 'string' && resources.imageUrl)
    await expect(page.locator('.gpp-woo-hero__image')).toBeVisible()
  // Welcome / branding article when welcome text is set.
  if (typeof resources.welcomeText === 'string' && resources.welcomeText.trim())
    await expect(page.locator('article.utrecht-article').first()).toBeVisible()
  // Promotion video iframe when a video URL is configured.
  if (typeof resources.videoUrl === 'string' && resources.videoUrl)
    await expect(page.locator('iframe[title="Uitleg Burgerportaal"]')).toBeVisible()
})

// --- Full-text search (manual step 2) --------------------------------------

When('I submit an empty burgerportaal search', async ({ page }) => {
  await submitHomepageSearch(page, '', { via: 'enter' })
})

When('I search the burgerportaal with the boolean query {string}', async ({ page }, query: string) => {
  await submitHomepageSearch(page, query, { via: 'enter' })
})

When('I search the burgerportaal for the exact phrase {string}', async ({ page }, phrase: string) => {
  await submitHomepageSearch(page, `"${phrase}"`, { via: 'enter' })
})

When('I search the burgerportaal by clicking the Zoeken button', async ({ page }) => {
  await submitHomepageSearch(page, 'woo', { via: 'button' })
})

// --- Navigating the search results (manual step 3) -------------------------

Given('the burgerportaal search results page is open', async ({ page }) => {
  await openSearchResultsPage(page, 'woo')
})

Then('the search results are ordered by relevance by default', async ({ page }) => {
  // Sort control defaults to Relevantie on `/zoeken` (SearchGrid.vue).
  await expect(page.getByLabel('Sorteren')).toHaveValue('relevance')
})

When('I edit the search query on the results page', async ({ page, scratch }) => {
  const edited = `e2e-edited-${Date.now()}`
  scratch.set('search:editedQuery', edited)
  const field = await waitForSearchField(page)
  await field.fill(edited)
  await field.press('Enter')
  await page.waitForURL(/query=/, { timeout: 15_000 }).catch(() => {})
})

Then('the results page reflects the edited query', async ({ page, scratch }) => {
  const edited = scratch.get('search:editedQuery')!
  await expect(page.getByRole('searchbox', { name: 'Zoekterm' })).toHaveValue(edited)
  expect(decodeURIComponent(page.url())).toContain(edited)
})

// --- Onderwerp detail page (manual step 4f) --------------------------------

Then('the onderwerp shows an illustration image', async ({ page, topics }) => {
  const titel = topics.last()
  // Spotlight can paint the same afbeelding more than once during layout; any
  // matching illustration proves the onderwerp shows its image.
  const img = page.getByRole('img', { name: new RegExp(`Afbeelding\\s+${escapeRegExp(titel)}`) }).first()
  await expect(img).toBeVisible({ timeout: 20_000 })
})

Then('the onderwerp metadata is shown', async ({ page }) => {
  // OnderwerpDetails.vue renders a metadata table with these kenmerken when valued.
  // The detail page fetches the onderwerp separately from the list that led here,
  // and an onderwerp published seconds ago sometimes comes back without its dates
  // (the rows are skipped when empty) — a reload picks them up.
  await waitForWithReload(page, page.getByRole('rowheader', { name: 'Gepubliceerd op' }), { timeout: 20_000 })
  await expect(page.getByRole('rowheader', { name: 'Laatst gewijzigd op' })).toBeVisible()
})

Then('I can search and sort the publicaties within the onderwerp', async ({ page }) => {
  // SearchGrid on the onderwerp detail exposes search + sort even when ES is down.
  await expect(page.getByRole('heading', { name: 'Alle publicaties over dit onderwerp' })).toBeVisible({
    timeout: 20_000,
  })
  const field = page.getByRole('searchbox', { name: 'Zoekterm' })
  await expect(field).toBeVisible()
  await field.fill('e2e-onderwerp-zoek')
  await field.press('Enter')
  await expect(page).toHaveURL(/query=e2e-onderwerp-zoek/)
  await page.getByLabel('Sorteren').selectOption({ label: 'Chronologisch' })
  await expect(page).toHaveURL(/sort=chronological/)
})

// --- Onderwerpen page (manual step 5) --------------------------------------

Then('each listed onderwerp shows an illustration image', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(`${burg}/onderwerpen`)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)
  // Seeded onderwerpen always carry an afbeelding (addTopic uploads TOPIC_IMAGE).
  const img = page.getByRole('img', { name: new RegExp(`Afbeelding\\s+${escapeRegExp(titel)}`) })
  await expect(img.first()).toBeVisible()
})

Then('the promoted onderwerpen are shown at the top of the Onderwerpen page', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(`${burg}/onderwerpen`)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)
  const gepromoot = page.getByRole('heading', { name: 'Gepromoot', level: 2 })
  await expect(gepromoot).toBeVisible()
  const alle = page.getByRole('heading', { name: /Alle onderwerpen/, level: 2 })
  await expect(alle).toBeVisible()
  // Gepromoot section precedes the full list in document order.
  const gepromootBox = await gepromoot.boundingBox()
  const alleBox = await alle.boundingBox()
  expect(gepromootBox && alleBox && gepromootBox.y < alleBox.y).toBeTruthy()
  await expect(page.getByRole('list').or(page.locator('main')).getByText(titel).first()).toBeVisible()
})

// --- Homepage promoted-onderwerpen carousel (manual step 5) ----------------

Then('the homepage carousel shows at most three promoted onderwerpen', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(burg)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)

  const carousel = page.getByRole('list', { name: 'Tegel carrousel' })
  await expect(carousel).toBeVisible()
  const visibleCount = await carousel.locator('li').evaluateAll(
    els => els.filter(el => el.getAttribute('aria-hidden') !== 'true').length,
  )
  expect(visibleCount).toBeGreaterThan(0)
  expect(visibleCount).toBeLessThanOrEqual(3)
})

When('I pause the homepage onderwerpen carousel', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(burg)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)

  const pause = page.getByRole('button', { name: 'Pauzeren' })
  await expect(pause).toBeVisible({ timeout: 20_000 })
  await pause.click()
  await expect(page.getByRole('button', { name: 'Starten' })).toBeVisible()
})

Then('I can browse the carousel onderwerpen manually', async ({ page }) => {
  const live = page.getByText(/Tegel \d+ van \d+/)
  const before = (await live.textContent())?.trim() ?? ''
  await page.getByRole('button', { name: 'Volgend item' }).click()
  await expect.poll(async () => (await live.textContent())?.trim() ?? '').not.toBe(before)
})

When('I open a promoted onderwerp from the homepage carousel', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(async () => {
    await page.goto(burg)
    await page.waitForLoadState('networkidle').catch(() => {})
    return page.locator('body').textContent()
  }, LIVE).toContain(titel)

  const carousel = page.getByRole('list', { name: 'Tegel carrousel' })
  await expect(carousel).toBeVisible({ timeout: 20_000 })
  // Tile title is a link; when off-screen (aria-hidden) it is not tabbable — click via text.
  await carousel.getByRole('link', { name: titel }).click()
  await page.waitForLoadState('networkidle').catch(() => {})
  await expect(page).toHaveURL(/\/onderwerpen\//)
})

// --- @blocked stubs (bddgen registration only; Before(@blocked) skips) ------
// Bodies intentionally throw — the @blocked hook skips before they run. Kept so
// removing the tag later fails loudly until a real implementation lands.

Then('the homepage shows counts of onderwerpen, publicaties and documenten', async () => {
  throw new Error('BLOCKED: homepage counts require woo-search ES facets (POST /api/zoeken)')
})

When('I search the burgerportaal for a term in a document\'s contents', async () => {
  throw new Error('BLOCKED: document-content search requires an active Elasticsearch index')
})

When('I search the burgerportaal for a term in an onderwerp\'s titel', async () => {
  throw new Error('BLOCKED: onderwerp-titel search requires an active Elasticsearch index')
})

Then('the matching publicatie appears in the search results', async () => {
  throw new Error('BLOCKED: asserting a search hit requires an active Elasticsearch index')
})

Then('the matching onderwerp appears in the search results', async () => {
  throw new Error('BLOCKED: asserting a search hit requires an active Elasticsearch index')
})

When('I sort the search results chronologically', async () => {
  throw new Error('BLOCKED: chronological result order requires indexed search hits')
})

Then('the search results are ordered by date', async () => {
  throw new Error('BLOCKED: chronological result order requires indexed search hits')
})

When('I filter the search results by type', async () => {
  throw new Error('BLOCKED: type facets require woo-search ES facet buckets')
})

Then('only search results matching the filter remain', async () => {
  throw new Error('BLOCKED: filter assertions require woo-search ES facet buckets')
})

When('I activate a search result filter', async () => {
  throw new Error('BLOCKED: cascading filter options require woo-search ES facet buckets')
})

Then('the remaining search filters only offer options that yield results', async () => {
  throw new Error('BLOCKED: cascading filter options require woo-search ES facet buckets')
})

Then('the search results are paginated at ten per page', async () => {
  throw new Error('BLOCKED: pagination UI only appears when ES returns count > page size')
})

When('I open a search result', async () => {
  throw new Error('BLOCKED: opening a search result requires an indexed hit')
})

Then('the opened result shows its metadata', async () => {
  throw new Error('BLOCKED: result metadata requires an indexed hit')
})

When('I open a document search result', async () => {
  throw new Error('BLOCKED: document search results require an indexed document hit')
})

Then('the document result offers a download button', async () => {
  throw new Error('BLOCKED: document download requires an indexed document hit')
})

Then('I can navigate from the document to its publicatie', async () => {
  throw new Error('BLOCKED: document→publicatie navigation requires an indexed document hit')
})

When('I open a publicatie search result', async () => {
  throw new Error('BLOCKED: publicatie search results require an indexed publicatie hit')
})

Then('the publicatie result lists its coupled documenten', async () => {
  throw new Error('BLOCKED: coupled documenten require an indexed publicatie hit')
})

Then('the onderwerp lists its coupled publicaties', async () => {
  throw new Error('BLOCKED: onderwerp publicatie list uses SearchGrid → POST /api/zoeken (ES)')
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
