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

/** `<tag>` with an optional namespace prefix, e.g. `loc` or `diwoo:Document`. */
function tag(name: string) {
  return String.raw`(?:\w+:)?${name}`
}

/** All text contents of `<name>...</name>` occurrences (namespace-tolerant). */
export function elementTexts(xml: string, name: string): string[] {
  const re = new RegExp(`<${tag(name)}[^>]*>([\\s\\S]*?)</${tag(name)}>`, 'g')
  return Array.from(xml.matchAll(re), m => m[1].trim())
}

/** True when at least one `<name>` element (self-closing or not) is present. */
export function hasElement(xml: string, name: string): boolean {
  return new RegExp(`<${tag(name)}(?:[\\s/>])`).test(xml)
}

/** The `<loc>` values listed in a sitemap index. */
export function sitemapLocations(indexXml: string): string[] {
  return elementTexts(indexXml, 'loc')
}

/** Each `<url>...</url>` block of a sitemap, as raw XML fragments. */
export function urlEntries(sitemapXml: string): string[] {
  const re = new RegExp(`<${tag('url')}[^>]*>[\\s\\S]*?</${tag('url')}>`, 'g')
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
