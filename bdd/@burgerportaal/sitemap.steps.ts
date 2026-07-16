import {
  missingDiwooFields,
  sitemapLocations,
  urlEntries,
} from '@/bdd/@burgerportaal/support/sitemap'
import { Then, When } from '@/bdd/_core/fixture'
import { expect } from '@playwright/test'

const SITEMAP_INDEX_PATH = '/api/sitemapindex-diwoo.xml'
const SITEMAPS_ORG_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
/** A monthly sitemap location, e.g. /api/sitemap/2025/5.xml (month not padded). */
const MONTHLY_SITEMAP_URL = /\/api\/sitemap\/\d{4}\/\d{1,2}\.xml$/

When('I fetch the burgerportaal robots.txt', async ({ sitemap }) => {
  await sitemap.get('/robots.txt')
})

When('I fetch the sitemap index', async ({ sitemap }) => {
  await sitemap.get(SITEMAP_INDEX_PATH)
})

When('I fetch the current month\'s sitemap', async ({ sitemap }) => {
  const now = new Date()
  // Months are not zero-padded in the sitemap index locations.
  await sitemap.get(`/api/sitemap/${now.getFullYear()}/${now.getMonth() + 1}.xml`)
})

Then('the response status is {int}', async ({ sitemap }, status: number) => {
  expect(sitemap.last().status).toBe(status)
})

Then('it advertises the DiWoo sitemap index location', async ({ sitemap }) => {
  const { body } = sitemap.last()
  const line = body.split(/\r?\n/).find(l => /^\s*Sitemap:/i.test(l))
  expect(line, 'robots.txt has a Sitemap: directive').toBeTruthy()
  expect(line).toContain(SITEMAP_INDEX_PATH)
})

Then(
  'the response is XML with a sitemaps.org {string} root',
  async ({ sitemap }, root: string) => {
    const { contentType, body } = sitemap.last()
    expect(contentType).toContain('xml')
    // Root element present (possibly self-closing when empty) in the sitemaps.org namespace.
    expect(body).toMatch(new RegExp(`<${root}[\\s>]`))
    expect(body).toContain(SITEMAPS_ORG_NS)
  },
)

Then('every location it lists is a monthly sitemap URL', async ({ sitemap }) => {
  const locations = sitemapLocations(sitemap.last().body)
  // Empty on a fresh environment with no published documents — still valid.
  for (const loc of locations)
    expect(loc, `${loc} is a monthly sitemap URL`).toMatch(MONTHLY_SITEMAP_URL)
})

Then('every document entry carries the required DiWoo metadata', async ({ sitemap }) => {
  const entries = urlEntries(sitemap.last().body)
  for (const entry of entries)
    expect(missingDiwooFields(entry), `<url> entry missing DiWoo fields`).toEqual([])
  // eslint-disable-next-line no-console
  console.log(`[sitemap] validated DiWoo metadata on ${entries.length} document(s)`)
})
