import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../_core/fixture'
import {
  burgerportaalBase as burg,
  openSearchResultsPage,
  postZoeken,
  seedIndexedPublicationDocument,
  submitHomepageSearch,
  topicUuidByTitel,
  waitForSearchField,
  waitForZoekenHit,
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
 * and are served live on the burgerportaal. Search hits are seeded via the token
 * API (`seedDocument` + landelijke publisher) and polled on POST /api/zoeken
 * until Elasticsearch surfaces them.
 */

const LIVE = { timeout: 30_000, intervals: [1000, 2000, 3000] }
const INDEX = { timeout: 60_000, intervals: [1000, 2000, 3000] }

function requireScratch(scratch: Map<string, string>, key: string): string {
  const v = scratch.get(key)
  if (!v)
    throw new Error(`Missing scratch ${key} — seed Given/When did not run?`)
  return v
}

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

Given('a promoted, published onderwerp with a coupled publicatie', async ({
  topics,
  publications,
  documents,
  scratch,
}) => {
  const omschrijving = `E2E burger omschrijving ${Date.now()}`
  scratch.set('onderwerp:omschrijving', omschrijving)
  await topics.add(undefined, { status: 'gepubliceerd', promoot: true, omschrijving })
  const topicTitel = topics.last()
  const topicUuid = await topicUuidByTitel(topicTitel)
  scratch.set('onderwerp:uuid', topicUuid)
  const { token, publicatie } = await seedIndexedPublicationDocument({
    publications,
    documents,
    scratch,
    onderwerpen: [topicUuid],
  })
  await waitForZoekenHit(token, hit => hit.type === 'publication' && hit.record.uuid === publicatie.uuid)
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

Given('an indexed publicatie with a document', async ({ publications, documents, scratch }) => {
  const { token, publicatie, document } = await seedIndexedPublicationDocument({
    publications,
    documents,
    scratch,
  })
  // Wait for BOTH hit types — publication indexes first; document scenarios
  // filter to resultTypes=document and fail if we only waited on the pub.
  await waitForZoekenHit(
    token,
    hit => hit.type === 'publication' && hit.record.uuid === publicatie.uuid,
  )
  await waitForZoekenHit(
    token,
    hit => hit.type === 'document' && hit.record.uuid === document.uuid,
  )
})

Given('enough indexed search hits for pagination', async ({ publications, documents, scratch }) => {
  // Page size is 10; each seed yields a publication + document hit under one token.
  const token = `E2EPaginate${Date.now()}`
  scratch.set('zoeken:token', token)
  for (let i = 0; i < 6; i++) {
    await seedIndexedPublicationDocument({
      publications,
      documents,
      scratch,
      token,
      publicatieTitel: `${publications.freshName()} ${token} ${i}`,
      documentTitel: `${documents.freshName()} ${token} ${i}`,
    })
  }
  await expect.poll(async () => (await postZoeken({ query: token })).count, INDEX)
    .toBeGreaterThan(10)
})

Given('the burgerportaal search results page is open for the seeded content', async ({ page, scratch }) => {
  const token = requireScratch(scratch, 'zoeken:token')
  await openSearchResultsPage(page, token)
  await expect.poll(async () => {
    const text = await page.locator('body').textContent()
    return text ?? ''
  }, INDEX).toMatch(/resultaten gevonden|Geen resultaten/)
  await expect(page.getByText(/\d+ resultaten gevonden/)).toBeVisible({ timeout: 20_000 })
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

Then('the homepage shows counts of onderwerpen, publicaties and documenten', async ({ page }) => {
  // Info block at the bottom of the homepage (Cijfers.vue): dt/dd pairs with
  // numeric count links. Zero is a valid count when ES has no indexed content yet.
  // Prefer filter({ hasText }) over getByRole name — dt "term" has no accessible name.
  await expect(page.getByRole('heading', { name: 'Cijfers over deze website' })).toBeVisible({
    timeout: 20_000,
  })
  for (const label of ['Publicaties', 'Documenten', 'Onderwerpen'] as const) {
    const term = page.getByRole('term').filter({ hasText: label })
    await expect(term).toBeVisible()
    const countLink = term.locator('..').getByRole('link', { name: /^\d+$/ })
    await expect(countLink).toBeVisible()
  }
})

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

// Document-body search remains @blocked (see feature); stubs stay for bddgen.
When('I search the burgerportaal for a term in a document\'s contents', async () => {
  throw new Error('BLOCKED: document body text not ingested without download_url')
})

Then('the matching publicatie appears in the search results', async () => {
  throw new Error('BLOCKED: document body text not ingested without download_url')
})

When('I search the burgerportaal for a term in an onderwerp\'s titel', async ({
  page,
  topics,
  scratch,
}) => {
  const token = `E2EZoekTopic${Date.now()}`
  const omschrijving = `E2E zoek omschrijving ${token}`
  scratch.set('onderwerp:omschrijving', omschrijving)
  scratch.set('zoeken:token', token)
  await topics.add(`E2E Zoek ${token}`, {
    status: 'gepubliceerd',
    promoot: true,
    omschrijving,
  })
  scratch.set('zoeken:topicTitel', topics.last())
  await waitForZoekenHit(token, hit => hit.type === 'topic' && hit.record.officieleTitel.includes(token))
  await submitHomepageSearch(page, token, { via: 'enter' })
})

Then('the matching onderwerp appears in the search results', async ({ page, scratch }) => {
  const titel = requireScratch(scratch, 'zoeken:topicTitel')
  await expect(page.getByRole('link', { name: titel })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('article').filter({ hasText: titel }).getByText('Onderwerp', { exact: true }))
    .toBeVisible()
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

When('I sort the search results chronologically', async ({ page, scratch }) => {
  const token = requireScratch(scratch, 'zoeken:token')
  await page.getByLabel('Sorteren').selectOption({ label: 'Chronologisch' })
  await expect(page).toHaveURL(/sort=chronological/)
  // Hold expected API order for the Then.
  const api = await postZoeken({ query: token, sort: 'chronological', pageSize: 10 })
  scratch.set('zoeken:chronoTitles', JSON.stringify(api.results.map(r => r.record.officieleTitel)))
})

Then('the search results are ordered by date', async ({ page, scratch }) => {
  const expected = JSON.parse(requireScratch(scratch, 'zoeken:chronoTitles')) as string[]
  await expect(page.getByLabel('Sorteren')).toHaveValue('chronological')
  const list = page.locator('ol.gpp-woo-search-result-list, ol').filter({
    has: page.getByRole('article'),
  }).first()
  await expect(list.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
  const titles = await list.getByRole('heading', { level: 3 }).locator('a').allTextContents()
  expect(titles.slice(0, expected.length)).toEqual(expected)
})

When('I filter the search results by type', async ({ page }) => {
  const checkbox = page.getByRole('checkbox', { name: /^Document/ })
  await expect(checkbox).toBeVisible({ timeout: 20_000 })
  await checkbox.check()
  await expect(page).toHaveURL(/resultTypes=document/)
})

Then('only search results matching the filter remain', async ({ page, scratch }) => {
  const token = requireScratch(scratch, 'zoeken:token')
  await expect(page.getByText(/\d+ resultaten gevonden/)).toBeVisible({ timeout: 20_000 })
  const articles = page.getByRole('article')
  await expect(articles.first()).toBeVisible()
  const count = await articles.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++)
    await expect(articles.nth(i).getByText('Document', { exact: true })).toBeVisible()
  // Seeded document must still be among the filtered hits.
  await expect(page.getByRole('link', { name: requireScratch(scratch, 'zoeken:docTitel') })).toBeVisible()
  const api = await postZoeken({ query: token, resultTypes: ['document'] })
  expect(api.results.every(r => r.type === 'document')).toBe(true)
})

When('I activate a search result filter', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'Organisaties' }).getByRole('checkbox').first())
    .toBeVisible({ timeout: 20_000 })
  await page.getByRole('checkbox', { name: /^Document/ }).check()
  await expect(page).toHaveURL(/resultTypes=document/)
})

Then('the remaining search filters only offer options that yield results', async ({ page }) => {
  const assertPositiveCounts = async (groupName: string) => {
    const group = page.getByRole('group', { name: groupName })
    const checkboxes = group.getByRole('checkbox')
    await expect(checkboxes.first()).toBeVisible({ timeout: 20_000 })
    const n = await checkboxes.count()
    expect(n).toBeGreaterThan(0)
    for (let i = 0; i < n; i++) {
      const accessible = await checkboxes.nth(i).evaluate(el =>
        (el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      const m = accessible.match(/\((\d+)\)\s*$/)
      expect(m, `${groupName} facet "${accessible}" should include a positive count`).toBeTruthy()
      expect(Number(m![1])).toBeGreaterThan(0)
    }
  }
  await assertPositiveCounts('Organisaties')
  if (await page.getByRole('group', { name: 'Informatiecategorieën' }).getByRole('checkbox').count())
    await assertPositiveCounts('Informatiecategorieën')
})

Then('the search results are paginated at ten per page', async ({ page, scratch }) => {
  const token = requireScratch(scratch, 'zoeken:token')
  await expect(page.getByText(/\d+ resultaten gevonden/)).toBeVisible({ timeout: 20_000 })
  const summary = await page.getByText(/\d+ resultaten gevonden/).textContent()
  const total = Number(summary?.match(/(\d+)/)?.[1] ?? 0)
  expect(total).toBeGreaterThan(10)
  const articles = page.getByRole('article')
  await expect(articles.first()).toBeVisible()
  expect(await articles.count()).toBeLessThanOrEqual(10)
  await expect(page.getByRole('link', { name: /Volgende/ })).toBeVisible()
  // API agrees page 1 is capped at 10 while count > 10.
  const api = await postZoeken({ query: token, page: 1, pageSize: 10 })
  expect(api.count).toBeGreaterThan(10)
  expect(api.results.length).toBeLessThanOrEqual(10)
  expect(api.next).toBe(true)
})

When('I open a search result', async ({ page, scratch }) => {
  const pubTitel = requireScratch(scratch, 'zoeken:pubTitel')
  const link = page.getByRole('link', { name: pubTitel })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await link.click()
  await page.waitForURL(/\/publicaties\//, { timeout: 15_000 })
})

Then('the opened result shows its metadata', async ({ page, scratch }) => {
  const pubTitel = requireScratch(scratch, 'zoeken:pubTitel')
  await expect(page.getByRole('heading', { name: pubTitel, level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('rowheader', { name: 'Officiële titel' })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Gepubliceerd op' })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'Laatst gewijzigd op' })).toBeVisible()
})

When('I open a document search result', async ({ page, scratch }) => {
  const docTitel = requireScratch(scratch, 'zoeken:docTitel')
  const docFilter = page.getByRole('checkbox', { name: /^Document/ })
  await expect(docFilter).toBeVisible({ timeout: 20_000 })
  if (!(await docFilter.isChecked()))
    await docFilter.check()
  await expect(page).toHaveURL(/resultTypes=document/)
  const link = page.getByRole('article').filter({ hasText: docTitel }).getByRole('link').first()
  await expect(link).toBeVisible({ timeout: 30_000 })
  await link.click()
  await page.waitForURL(/\/documenten\//, { timeout: 15_000 })
})

Then('the document result offers a download button', async ({ page, scratch }) => {
  const docTitel = requireScratch(scratch, 'zoeken:docTitel')
  await expect(page.getByRole('heading', { name: docTitel, level: 1 })).toBeVisible({ timeout: 30_000 })
  // Button or link — label may be "Download" or include the filename.
  const download = page.getByRole('link', { name: /Download/i }).or(page.getByRole('button', { name: /Download/i }))
  await expect(download.first()).toBeVisible({ timeout: 20_000 })
  const href = await download.first().getAttribute('href')
  expect(href ?? '').toMatch(/\/api\/v2\/documenten\/.+\/download|\/documenten\/.+\/download/)
})

Then('I can navigate from the document to its publicatie', async ({ page, scratch }) => {
  const pubTitel = requireScratch(scratch, 'zoeken:pubTitel')
  await expect(page.getByRole('heading', { name: 'Gekoppelde publicatie', level: 2 })).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('link', { name: pubTitel }).click()
  await page.waitForURL(/\/publicaties\//, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: pubTitel, level: 1 })).toBeVisible()
})

When('I open a publicatie search result', async ({ page, scratch }) => {
  const pubTitel = requireScratch(scratch, 'zoeken:pubTitel')
  const pubFilter = page.getByRole('checkbox', { name: /^Publicatie/ })
  if (await pubFilter.isVisible().catch(() => false)) {
    if (!(await pubFilter.isChecked()))
      await pubFilter.check()
    await expect(page).toHaveURL(/resultTypes=publication/)
  }
  const link = page.getByRole('link', { name: pubTitel })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await link.click()
  await page.waitForURL(/\/publicaties\//, { timeout: 15_000 })
})

Then('the publicatie result lists its coupled documenten', async ({ page, scratch }) => {
  const docTitel = requireScratch(scratch, 'zoeken:docTitel')
  await expect(page.getByRole('heading', { name: 'Documenten bij deze publicatie', level: 2 }))
    .toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('link', { name: docTitel })).toBeVisible()
})

Then('the onderwerp lists its coupled publicaties', async ({ page, scratch }) => {
  const pubTitel = requireScratch(scratch, 'zoeken:pubTitel')
  await expect(page.getByRole('heading', { name: 'Alle publicaties over dit onderwerp', level: 2 }))
    .toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => page.locator('body').textContent(), INDEX).toContain(pubTitel)
  await expect(page.getByRole('link', { name: pubTitel })).toBeVisible()
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
