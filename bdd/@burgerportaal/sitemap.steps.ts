import {
  missingDiwooFields,
  sitemapLocations,
  urlEntries,
} from '@/bdd/@burgerportaal/support/sitemap'
import { Given, Then, When } from '@/bdd/_core/fixture'
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

// ---------------------------------------------------------------------------
// @todo stubs — gaps vs manual testscript 10 (matrix rows 209-226). Skipped by
// the global Before({tags:'@todo'}) hook; here only so bddgen resolves them.
// Each needs a Publicatiebank/GPP-app read to compare against sitemap values.
// ---------------------------------------------------------------------------

// --- prerequisites: seed / identify source documents ----------------------

Given('the full list of published documents in the Publicatiebank', async () => {
  // Read GET /api/v1/documenten filtered on publicatiestatus=gepubliceerd; keep their identifiers.
  throw new Error('TODO: fetch every published document from the Publicatiebank documenten API')
})

Given('a concept document in the Publicatiebank', async () => {
  // Create/find a document with publicatiestatus=concept; remember its identifier.
  throw new Error('TODO: seed a concept-status document in the Publicatiebank')
})

Given('a withdrawn document in the Publicatiebank', async () => {
  // Create/find a document with publicatiestatus=ingetrokken; remember its identifier.
  throw new Error('TODO: seed an ingetrokken-status document in the Publicatiebank')
})

Given('a document belonging to a withdrawn publication in the Publicatiebank', async () => {
  // Seed a document on a publicatie with publicatiestatus=ingetrokken; remember its identifier.
  throw new Error('TODO: seed a document under an ingetrokken publicatie in the Publicatiebank')
})

Given('a published document in the Publicatiebank', async () => {
  // Create/find one gepubliceerd document + parent publicatie; keep both for value comparison.
  throw new Error('TODO: seed a published document and its publicatie in the Publicatiebank')
})

Given('a published document with a manually added information category', async () => {
  // Seed a document whose publicatie has an informatiecategorie outside the landelijke waardenlijst.
  throw new Error('TODO: seed a published document with a manually added informatiecategorie')
})

Given('a published document with creation, signing and receipt dates in the Publicatiebank', async () => {
  // Seed a document with creatiedatum, datum ondertekening and ontvangstdatum set.
  throw new Error('TODO: seed a published document with creatiedatum/ondertekening/ontvangstdatum')
})

Given('a new publication with documents created in the GPP-app', async () => {
  // Create a publicatie + documents via the GPP-app so they land in the current month.
  throw new Error('TODO: create a new publicatie with documents through the GPP-app')
})

Given('documents added to an existing publication in the GPP-app', async () => {
  // Add documents to a pre-existing publicatie via the GPP-app.
  throw new Error('TODO: add documents to an existing publicatie through the GPP-app')
})

Given('a document whose metadata was changed in the GPP-app', async () => {
  // Edit a published document's metadata (e.g. officieleTitel) via the GPP-app.
  throw new Error('TODO: change a published document\'s metadata through the GPP-app')
})

Given('a published document that is then withdrawn in the GPP-app', async () => {
  // Publish a document, then set its status to ingetrokken via the GPP-app.
  throw new Error('TODO: withdraw a previously published document through the GPP-app')
})

Given('a published publication that is then withdrawn in the GPP-app', async () => {
  // Publish a publicatie with documents, then withdraw the publicatie via the GPP-app.
  throw new Error('TODO: withdraw a previously published publicatie through the GPP-app')
})

Given('a published document that is then deleted in the Publicatiebank', async () => {
  // Publish a document, then DELETE it in the Publicatiebank.
  throw new Error('TODO: delete a previously published document in the Publicatiebank')
})

// --- actions: read the sitemap(s) -----------------------------------------

When('I collect every document entry across all sitemaps', async () => {
  // Walk the sitemap index -> each monthly sitemap; gather all <url> entries via urlEntries().
  throw new Error('TODO: fetch each monthly sitemap from the index and collect all <url> entries')
})

When('I look up its document entry in the sitemaps', async () => {
  // Find the single <url> entry whose <loc>/identifier matches the seeded document.
  throw new Error('TODO: locate the seeded document\'s <url> entry across the sitemaps')
})

When('I refetch the current month\'s sitemap', async ({ sitemap }) => {
  // Re-GET the current month sitemap after the source change (needs 1-min cache override).
  const now = new Date()
  await sitemap.get(`/api/sitemap/${now.getFullYear()}/${now.getMonth() + 1}.xml`)
  throw new Error('TODO: allow for the sitemap cache TTL before asserting the refetched result')
})

// --- assertions: set membership --------------------------------------------

Then('every published document appears in a sitemap', async () => {
  // Every Publicatiebank identifier from the Given must have a matching <url> entry.
  throw new Error('TODO: assert each published document identifier is present among the sitemap entries')
})

Then('the concept document does not appear in any sitemap', async () => {
  // The concept document's identifier must be absent from the collected entries.
  throw new Error('TODO: assert the concept document identifier is absent from the sitemap entries')
})

Then('the withdrawn document does not appear in any sitemap', async () => {
  // The ingetrokken document's identifier must be absent from the collected entries.
  throw new Error('TODO: assert the withdrawn document identifier is absent from the sitemap entries')
})

Then('that document does not appear in any sitemap', async () => {
  // The document under the withdrawn publicatie must be absent from the collected entries.
  throw new Error('TODO: assert the withdrawn-publicatie document identifier is absent from the sitemap entries')
})

// --- assertions: metadata values -------------------------------------------

Then('its sitemap creatiedatum matches the Publicatiebank', async () => {
  // Compare <diwoo:creatiedatum> against the document's creatiedatum.
  throw new Error('TODO: compare sitemap creatiedatum with the Publicatiebank document creatiedatum')
})

Then('its sitemap identifiers match the Publicatiebank', async () => {
  // Compare the entry's <diwoo:identifier(s)>/kenmerken against the document's identifiers.
  throw new Error('TODO: compare sitemap identifiers with the Publicatiebank document identifiers')
})

Then('its sitemap publisher matches the publication', async () => {
  // Compare <diwoo:publisher> against the parent publicatie's publisher.
  throw new Error('TODO: compare sitemap publisher with the parent publicatie publisher')
})

Then('its sitemap verantwoordelijke matches the publication\'s responsible organisation', async () => {
  // Compare <diwoo:verantwoordelijke> against the parent publicatie's verantwoordelijke.
  throw new Error('TODO: compare sitemap verantwoordelijke with the parent publicatie verantwoordelijke')
})

Then('its sitemap official title, short title and description match the document-level values', async () => {
  // Compare officieleTitel/verkorteTitel/omschrijving against the document (not publicatie) fields.
  throw new Error('TODO: compare sitemap officieleTitel/verkorteTitel/omschrijving with the document-level values')
})

Then('its sitemap information categories match the publication', async () => {
  // Compare <diwoo:informatiecategorie> values against the parent publicatie's categories.
  throw new Error('TODO: compare sitemap informatiecategorie values with the parent publicatie categories')
})

Then('its manually added category appears as {string}', async ({}, expected: string) => {
  // The manually added category must be serialised as `expected` (landelijke waardenlijst substitution).
  throw new Error(`TODO: assert the manually added category is serialised as "${expected}" in the sitemap`)
})

Then('its sitemap soortHandeling is derived from those dates', async () => {
  // Verify <diwoo:soortHandeling> is derived from creatiedatum/datum ondertekening/ontvangstdatum.
  throw new Error('TODO: assert soortHandeling is derived from the document creatiedatum/ondertekening/ontvangstdatum')
})

// --- assertions: change propagation ----------------------------------------

Then('its documents appear in the current month\'s sitemap', async () => {
  // The new publicatie's document identifiers must now be present in the current month sitemap.
  throw new Error('TODO: assert the new publicatie documents are present in the refetched sitemap')
})

Then('the added documents appear in the current month\'s sitemap', async () => {
  // The newly added document identifiers must be present in the current month sitemap.
  throw new Error('TODO: assert the added documents are present in the refetched sitemap')
})

Then('the updated metadata appears in the current month\'s sitemap', async () => {
  // The changed field value must be reflected in the document's <url> entry.
  throw new Error('TODO: assert the updated metadata value is reflected in the refetched sitemap entry')
})

Then('the withdrawn document no longer appears in the current month\'s sitemap', async () => {
  // The withdrawn document's identifier must be gone from the current month sitemap.
  throw new Error('TODO: assert the withdrawn document is absent from the refetched sitemap')
})

Then('its documents no longer appear in the current month\'s sitemap', async () => {
  // All documents of the withdrawn publicatie must be gone from the current month sitemap.
  throw new Error('TODO: assert the withdrawn publicatie documents are absent from the refetched sitemap')
})

Then('the deleted document no longer appears in the current month\'s sitemap', async () => {
  // The deleted document's identifier must be gone from the current month sitemap.
  throw new Error('TODO: assert the deleted document is absent from the refetched sitemap')
})
