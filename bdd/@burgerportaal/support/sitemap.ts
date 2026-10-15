/**
 * Minimal, dependency-free helpers for the GPP-burgerportaal DiWoo sitemap.
 *
 * The sitemap is public XML the Woo-index harvester reads anonymously
 * (robots.txt -> sitemap index -> one sitemap per year/month -> `<url>` entries
 * with DiWoo metadata). These helpers extract the bits the tests assert on.
 *
 * Matching is namespace-prefix tolerant: the burgerportaal serialises DiWoo
 * elements with a `diwoo:` prefix, so every tag matcher accepts an optional
 * `prefix:` (e.g. both `<loc>` and `<diwoo:Document>`).
 */

import type { SitemapClient } from '@/bdd/@burgerportaal/fixtures'
import process from 'node:process'

/** `<tag>` with an optional namespace prefix, e.g. `loc` or `diwoo:Document`. */
function tag(name: string) {
  return String.raw`(?:\w+:)?${name}`
}

/** Open tag: name must end at whitespace, `/`, or `>` so `omschrijving` ≠ `omschrijvingen`. */
function openTag(name: string) {
  return String.raw`<${tag(name)}(?=[\s/>])[^>]*>`
}

function closeTag(name: string) {
  return String.raw`</${tag(name)}>`
}

/** Self-closing or opening tag presence. */
function tagStart(name: string) {
  return String.raw`<${tag(name)}(?=[\s/>])`
}

/** All text contents of `<name>...</name>` occurrences (namespace-tolerant). */
export function elementTexts(xml: string, name: string): string[] {
  const re = new RegExp(`${openTag(name)}([\\s\\S]*?)${closeTag(name)}`, 'g')
  return Array.from(xml.matchAll(re), m => m[1].trim())
}

/** True when at least one `<name>` element (self-closing or not) is present. */
export function hasElement(xml: string, name: string): boolean {
  return new RegExp(tagStart(name)).test(xml)
}

/** The `<loc>` values listed in a sitemap index. */
export function sitemapLocations(indexXml: string): string[] {
  return elementTexts(indexXml, 'loc')
}

/** Each `<url>...</url>` block of a sitemap, as raw XML fragments. */
export function urlEntries(sitemapXml: string): string[] {
  const re = new RegExp(`${openTag('url')}[\\s\\S]*?${closeTag('url')}`, 'g')
  return sitemapXml.match(re) ?? []
}

/** DiWoo metadata every `<url>` entry must carry (testscript step 3c). */
export const REQUIRED_DIWOO_FIELDS = [
  'loc',
  'lastmod',
  'Document',
  'creatiedatum',
  'officieleTitel',
  'publisher',
  'verantwoordelijke',
  'informatiecategorie',
  'soortHandeling',
] as const

/** Field names from {@link REQUIRED_DIWOO_FIELDS} missing from a `<url>` entry. */
export function missingDiwooFields(entry: string): string[] {
  return REQUIRED_DIWOO_FIELDS.filter(f => !hasElement(entry, f))
}

/** First text of `<name>`, or `undefined` when absent. */
export function elementText(xml: string, name: string): string | undefined {
  return elementTexts(xml, name)[0]
}

/**
 * Text content of a DiWoo `ResourceWithValue` element (`publisher`,
 * `verantwoordelijke`, `informatiecategorie`, `soortHandeling`, …). Prefers the
 * element text (the human label); falls back to the `resource` attribute.
 */
export function resourceValues(xml: string, name: string): string[] {
  const re = new RegExp(
    `${openTag(name)}([\\s\\S]*?)${closeTag(name)}|${tagStart(name)}([^>]*)/>`,
    'g',
  )
  return Array.from(xml.matchAll(re), (m) => {
    const text = (m[1] ?? '').trim()
    if (text)
      return text
    const attrs = m[2] ?? ''
    return attrs.match(/\bresource\s*=\s*"([^"]+)"/i)?.[1] ?? ''
  }).filter(Boolean)
}

/** Document UUID embedded in a `<loc>` download URL (`…/documenten/{uuid}/download`). */
export function locDocumentUuid(loc: string): string | undefined {
  const m = loc.match(/\/documenten\/([0-9a-f-]+)\/download/i)
  return m?.[1]
}

/** Whether a `<url>` entry refers to the given document UUID (via `<loc>`). */
export function entryMatchesDocumentUuid(entry: string, uuid: string): boolean {
  const loc = elementText(entry, 'loc')
  return !!loc && locDocumentUuid(loc) === uuid
}

/** Whether a `<url>` entry's officiële titel equals `titel`. */
export function entryMatchesOfficieleTitel(entry: string, titel: string): boolean {
  return elementText(entry, 'officieleTitel') === titel
}

/**
 * Turn an absolute or root-relative sitemap `<loc>` into a path the anonymous
 * {@link SitemapClient} can GET (burgerportaal origin stripped).
 */
export function locToPath(loc: string, burgerportaalBase: string): string {
  const base = burgerportaalBase.replace(/\/$/, '')
  if (loc.startsWith(base))
    return loc.slice(base.length) || '/'
  try {
    return new URL(loc).pathname
  }
  catch {
    return loc.startsWith('/') ? loc : `/${loc}`
  }
}

/**
 * Walk the DiWoo sitemap index → every monthly sitemap and return all `<url>`
 * entries. Empty months contribute nothing (valid).
 */
export async function collectAllUrlEntries(
  sitemap: SitemapClient,
  burgerportaalBase: string,
): Promise<string[]> {
  await sitemap.get('/api/sitemapindex-diwoo.xml')
  const locations = sitemapLocations(sitemap.last().body)
  const entries: string[] = []
  for (const loc of locations) {
    const path = locToPath(loc, burgerportaalBase)
    await sitemap.get(path)
    if (sitemap.last().status !== 200)
      throw new Error(`GET ${path} -> ${sitemap.last().status}`)
    entries.push(...urlEntries(sitemap.last().body))
  }
  return entries
}

/**
 * How long a sitemap read may keep retrying before the caller asserts on it.
 * Override with `SITEMAP_POLL_TIMEOUT_MS` on a slow environment.
 */
const POLL_TIMEOUT_MS = Number(process.env.SITEMAP_POLL_TIMEOUT_MS ?? 20_000)
const POLL_INTERVAL_MS = 500

/**
 * Re-read until `accept` is satisfied, or the budget runs out (then return the
 * last value read, so the caller's own assertion produces the failure message).
 *
 * The sitemap is *eventually* consistent with the token API: ODRC registers an
 * uploaded document with the Documenten API asynchronously, so a document
 * seeded a moment ago is briefly absent from the sitemap — and a withdrawn or
 * deleted one briefly still present. Sequentially the window closes before the
 * next step looks; under parallel workers it does not (verified: the whole
 * feature passes with `--workers=1` and loses 4+ scenarios in parallel, always
 * on a fast "not present yet", never on a mismatch).
 */
async function pollUntil<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let value = await read()
  while (!accept(value) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    value = await read()
  }
  return value
}

/**
 * Find the single `<url>` entry for a seeded document across all monthly
 * sitemaps. Matches by document UUID in `<loc>` when known, else by
 * `officieleTitel`. Polls while the entry is absent (see {@link pollUntil}).
 */
export async function findDocumentEntry(
  sitemap: SitemapClient,
  burgerportaalBase: string,
  opts: { uuid?: string, officieleTitel?: string },
): Promise<{ entry?: string, entryCount: number }> {
  return pollUntil(
    async () => {
      const entries = await collectAllUrlEntries(sitemap, burgerportaalBase)
      const entry = entries.find((e) => {
        if (opts.uuid && entryMatchesDocumentUuid(e, opts.uuid))
          return true
        if (opts.officieleTitel && entryMatchesOfficieleTitel(e, opts.officieleTitel))
          return true
        return false
      })
      // Carry the total too: "not found among 0 entries" and "not found among 40"
      // are different bugs, and the failure message should not make you guess.
      return { entry, entryCount: entries.length }
    },
    found => !!found.entry,
  )
}

/** Path of the sitemap covering "now" (the month change-propagation asserts on). */
export function currentMonthSitemapPath(): string {
  const now = new Date()
  return `/api/sitemap/${now.getFullYear()}/${now.getMonth() + 1}.xml`
}

/**
 * GET the current month's sitemap, polling until its `<url>` entries satisfy
 * `accept`. Returns the last entries read either way, so the calling step keeps
 * ownership of the assertion (and of its failure message).
 */
export async function currentMonthEntriesUntil(
  sitemap: SitemapClient,
  accept: (entries: string[]) => boolean,
): Promise<string[]> {
  const path = currentMonthSitemapPath()
  return pollUntil(async () => {
    await sitemap.get(path)
    return urlEntries(sitemap.last().body)
  }, accept)
}

/**
 * Wait for the burgerportaal sitemap output-cache to expire before refetching.
 *
 * Default stack sets `SITEMAP_CACHE_DURATION_HOURS=23`. The Plateau-4 testscript
 * expects a testomgeving override (~1 minute). Tests must set
 * `SITEMAP_CACHE_WAIT_MS` explicitly — never sleep for the 23h default.
 */
export async function waitForSitemapCacheExpiry(): Promise<void> {
  const raw = process.env.SITEMAP_CACHE_WAIT_MS
  if (raw == null || raw === '') {
    throw new Error(
      'SITEMAP_CACHE_WAIT_MS is unset — sitemap output cache is ~23h by default; '
      + 'set a short wait (ms) only when the stack has a short SITEMAP_CACHE_DURATION_HOURS override',
    )
  }
  const waitMs = Number(raw)
  if (!Number.isFinite(waitMs) || waitMs < 0)
    throw new Error(`SITEMAP_CACHE_WAIT_MS must be a non-negative number, got ${JSON.stringify(raw)}`)
  if (waitMs > 0)
    await new Promise(r => setTimeout(r, waitMs))
}
