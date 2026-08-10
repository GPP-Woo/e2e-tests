import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import process from 'node:process'
import { waitForWithReload } from '@/bdd/@gpp-app/support/hydrate'
import {
  activateLandelijkeOrganisatie,
  seedDocument,
} from '@/bdd/@publicatiebank/support/document'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest, expect } from '@playwright/test'

/**
 * Reusable burgerportaal full-text search helpers, for scenarios outside
 * zoeken.feature that need to search the public portal (e.g. asserting a
 * concept publicatie never surfaces there). Mirrors the inline search flow in
 * `@burgerportaal/zoeken.steps.ts`'s "I search the burgerportaal for {string}"
 * step, including its WebKit hydration retry.
 */

const burg = ENV.apps.burgerportaal.replace(/\/$/, '')

export { burg as burgerportaalBase }

const ODRC_HOST = process.env.ODRC_INTERNAL_HOST ?? 'gpp-publicatiebank-nginx.gpp-e2e.svc.cluster.local'
const ODRC_API_BASE = `${new URL(ENV.odrc.baseUrl).origin}/api/v2/`

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

export interface ZoekenHit {
  type: string
  record: {
    uuid: string
    officieleTitel: string
    omschrijving?: string
    publicatie?: string
    gepubliceerdOp?: string
    laatstGewijzigdDatum?: string
  }
}

export interface ZoekenResponse {
  count: number
  previous: boolean
  next: boolean
  results: ZoekenHit[]
  facets?: {
    resultTypes?: { naam: string, count: number }[]
    publishers?: { uuid: string, naam: string, count: number }[]
    informatieCategorieen?: { uuid: string, naam: string, count: number }[]
  }
}

/** POST /api/zoeken on the burgerportaal (woo-search ES). */
export async function postZoeken(body: Record<string, unknown>): Promise<ZoekenResponse> {
  const res = await fetch(`${burg}/api/zoeken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, pageSize: 10, sort: 'relevance', query: '', ...body }),
  })
  if (!res.ok)
    throw new Error(`POST /api/zoeken -> ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json() as Promise<ZoekenResponse>
}

/**
 * Poll woo-search until `match` finds a hit (publish → ES index can take a few seconds).
 */
export async function waitForZoekenHit(
  query: string,
  match: (hit: ZoekenHit, response: ZoekenResponse) => boolean,
  { timeout = 60_000, extras = {} }: { timeout?: number, extras?: Record<string, unknown> } = {},
): Promise<ZoekenResponse> {
  let last: ZoekenResponse | undefined
  await expect.poll(async () => {
    last = await postZoeken({ query, ...extras })
    return last.results.some(hit => match(hit, last!))
  }, { timeout, intervals: [1000, 2000, 3000] }).toBe(true)
  return last!
}

/** Resolve an onderwerp UUID by officiële titel via the ODRC token API. */
export async function topicUuidByTitel(titel: string): Promise<string> {
  const ctx = await apiRequest.newContext()
  try {
    let next: string | null = 'onderwerpen?pageSize=100'
    while (next) {
      const res = await ctx.get(new URL(next, ODRC_API_BASE).href, {
        headers: {
          'Authorization': `Token ${ENV.odrc.apiKey}`,
          'Host': ODRC_HOST,
          'Audit-User-ID': 'e2e',
          'Audit-User-Representation': 'E2E test suite',
          'Audit-Remarks': 'resolve onderwerp uuid for zoeken seed',
        },
      })
      const body = await res.text()
      if (!res.ok())
        throw new Error(`GET onderwerpen -> ${res.status()}: ${body.slice(0, 300)}`)
      const page = JSON.parse(body) as {
        results?: { uuid: string, officieleTitel: string }[]
        next?: string | null
      }
      const hit = (page.results ?? []).find(o => o.officieleTitel === titel)
      if (hit)
        return hit.uuid
      next = page.next
        ? String(page.next).replace(/^https?:\/\/[^/]+\/api\/v2\//, '')
        : null
    }
    throw new Error(`Onderwerp "${titel}" not found in ODRC`)
  }
  finally {
    await ctx.dispose()
  }
}

interface Tracked {
  freshName: () => string
  track: (titel: string) => string
}

/**
 * Seed a gepubliceerd publicatie + document against a landelijke publisher so
 * gpp_search_service indexes both. Tracks titels for fixture teardown.
 */
export async function seedIndexedPublicationDocument(opts: {
  publications: Tracked
  documents: Tracked
  scratch: Map<string, string>
  token?: string
  onderwerpen?: string[]
  publicatieTitel?: string
  documentTitel?: string
  omschrijving?: string
  /** Uploaded file body — use a unique token here for document-contents search. */
  fileContent?: string | Buffer
}): Promise<{ publicatie: any, document: any, token: string }> {
  const token = opts.token ?? `E2EZoek${Date.now()}`
  const publicatieTitel = opts.publicatieTitel ?? `${opts.publications.freshName()} ${token}`
  const documentTitel = opts.documentTitel ?? `${opts.documents.freshName()} ${token}`
  const org = await activateLandelijkeOrganisatie()
  const { publicatie, document } = await seedDocument({
    publicatieTitel,
    documentTitel,
    orgUuid: org.uuid,
    onderwerpen: opts.onderwerpen,
    omschrijving: opts.omschrijving,
    fileContent: opts.fileContent,
  })
  opts.publications.track(publicatieTitel)
  opts.documents.track(documentTitel)
  opts.scratch.set('zoeken:token', token)
  opts.scratch.set('zoeken:pubTitel', publicatieTitel)
  opts.scratch.set('zoeken:docTitel', documentTitel)
  opts.scratch.set('zoeken:pubUuid', publicatie.uuid)
  opts.scratch.set('zoeken:docUuid', document.uuid)
  return { publicatie, document, token }
}
