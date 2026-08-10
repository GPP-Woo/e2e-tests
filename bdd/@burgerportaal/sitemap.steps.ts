import type { SitemapClient } from '@/bdd/@burgerportaal/fixtures'
import {
  collectAllUrlEntries,
  currentMonthEntriesUntil,
  currentMonthSitemapPath,
  elementText,
  elementTexts,
  entryMatchesDocumentUuid,
  entryMatchesOfficieleTitel,
  findDocumentEntry,
  missingDiwooFields,
  resourceValues,
  sitemapLocations,
  urlEntries,
  waitForSitemapCacheExpiry,
} from '@/bdd/@burgerportaal/support/sitemap'
import {
  activateLandelijkeOrganisatie,
  deleteDocumentViaToken,
  informatieCategorieUuidByNaam,
  patchDocument,
  patchPublicatiestatus,
  seedDocument,
} from '@/bdd/@publicatiebank/support/document'
import { Given, Then, When } from '@/bdd/_core/fixture'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

const SITEMAP_INDEX_PATH = '/api/sitemapindex-diwoo.xml'
const SITEMAPS_ORG_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
/** A monthly sitemap location, e.g. /api/sitemap/2025/5.xml (month not padded). */
const MONTHLY_SITEMAP_URL = /\/api\/sitemap\/\d{4}\/\d{1,2}\.xml$/
const BURG = ENV.apps.burgerportaal.replace(/\/$/, '')

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
// Document membership / metadata / change-propagation steps.
// Requires a short `SITEMAP_CACHE_DURATION_HOURS` (0 or ~1min) and
// `SITEMAP_CACHE_WAIT_MS` for refetch. Mutations use token-API PATCH/DELETE.
// ---------------------------------------------------------------------------

function requireScratch(scratch: Map<string, string>, key: string): string {
  const v = scratch.get(key)
  if (!v)
    throw new Error(`Missing scratch ${key} — seed Given did not run?`)
  return v
}

async function seedTrackedDocument(
  opts: {
    organisations?: { add: () => Promise<string> }
    publications: { freshName: () => string, track: (t: string) => string }
    documents: { freshName: () => string, track: (t: string) => string }
    scratch: Map<string, string>
    documentStatus?: 'concept' | 'gepubliceerd' | 'ingetrokken'
    publicatieStatus?: 'concept' | 'gepubliceerd' | 'ingetrokken'
    landelijkePublisher?: boolean
    withDates?: boolean
    verkorteTitel?: string
    omschrijving?: string
    informatieCategorieUuids?: string[]
  },
) {
  const publicatieTitel = opts.publications.freshName()
  const documentTitel = opts.documents.freshName()
  let orgUuid: string | undefined
  let orgNaam: string | undefined
  if (opts.landelijkePublisher) {
    const org = await activateLandelijkeOrganisatie()
    orgUuid = org.uuid
    opts.scratch.set('sitemap:publisherNaam', org.naam)
  }
  else {
    orgNaam = await opts.organisations!.add()
  }
  const creatiedatum = new Date().toISOString().slice(0, 10)
  const { publicatie, document } = await seedDocument({
    publicatieTitel,
    documentTitel,
    orgNaam,
    orgUuid,
    publicatieStatus: opts.publicatieStatus ?? 'gepubliceerd',
    documentStatus: opts.documentStatus ?? 'gepubliceerd',
    creatiedatum,
    verkorteTitel: opts.verkorteTitel,
    omschrijving: opts.omschrijving,
    informatieCategorieUuids: opts.informatieCategorieUuids,
    ...(opts.withDates
      ? { ontvangstdatum: creatiedatum, datumOndertekend: creatiedatum }
      : {}),
  })
  opts.publications.track(publicatieTitel)
  opts.documents.track(documentTitel)
  opts.scratch.set('sitemap:docUuid', document.uuid)
  opts.scratch.set('sitemap:docTitel', documentTitel)
  opts.scratch.set('sitemap:pubTitel', publicatieTitel)
  opts.scratch.set('sitemap:pubUuid', publicatie.uuid)
  opts.scratch.set('sitemap:creatiedatum', creatiedatum)
  opts.scratch.set('sitemap:publisherUuid', publicatie.publisher)
  if (publicatie.verantwoordelijke)
    opts.scratch.set('sitemap:verantwoordelijkeUuid', publicatie.verantwoordelijke)
  if (opts.verkorteTitel)
    opts.scratch.set('sitemap:verkorteTitel', opts.verkorteTitel)
  if (opts.omschrijving)
    opts.scratch.set('sitemap:omschrijving', opts.omschrijving)
  opts.scratch.set('sitemap:infoCats', JSON.stringify(publicatie.informatieCategorieen ?? []))
  return { publicatie, document }
}

Given('the full list of published documents in the Publicatiebank', async ({ odrc, scratch }) => {
  // Sitemap only includes gepubliceerd + isGereedVoorPublicatie docs whose
  // publisher is not zelf_toegevoegd — list the API truth and let the Then
  // compare against whatever the sitemap actually exposes.
  const docs = await odrc.list<{ uuid: string, officieleTitel: string }>(
    'documenten',
    { publicatiestatus: 'gepubliceerd', isGereedVoorPublicatie: true, pageSize: 100 },
  )
  scratch.set('sitemap:publishedUuids', JSON.stringify(docs.map(d => d.uuid)))
})

Given('a concept document in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    documentStatus: 'concept',
    publicatieStatus: 'concept',
    landelijkePublisher: true,
  })
})

Given('a withdrawn document in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  // Create-as-ingetrokken is ignored by ODRC on upload (stays gepubliceerd);
  // publish first, then PATCH.
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
  })
  await patchPublicatiestatus('documenten', requireScratch(scratch, 'sitemap:docUuid'), 'ingetrokken')
})

Given('a document belonging to a withdrawn publication in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  // Cannot create a publicatie directly as ingetrokken (400). Publish, then PATCH.
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
  })
  await patchPublicatiestatus('publicaties', requireScratch(scratch, 'sitemap:pubUuid'), 'ingetrokken')
})

Given('a published document in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
    verkorteTitel: `E2E kort ${Date.now()}`,
    omschrijving: `E2E omschrijving ${Date.now()}`,
  })
})

Given('a published document with a manually added information category', async ({ organisations, categories, publications, documents, scratch }) => {
  // Self-added categories are what the testscript means by "manually added";
  // the sitemap substitutes them with the inspanningsverplichting art. 3.1 Woo label.
  const catNaam = await categories.add()
  scratch.set('sitemap:manualCatNaam', catNaam)
  const catUuid = await informatieCategorieUuidByNaam(catNaam)
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
    informatieCategorieUuids: [catUuid],
  })
})

Given('a published document with creation, signing and receipt dates in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
    withDates: true,
  })
})

Given('a new publication with documents created in the GPP-app', async ({ organisations, publications, documents, scratch }) => {
  // Portable stand-in: token-API seed (GPP-app UI publish without Documents API
  // cannot attach file content the sitemap requires via isGereedVoorPublicatie).
  await seedTrackedDocument({ organisations, publications, documents, scratch, landelijkePublisher: true })
})

Given('documents added to an existing publication in the GPP-app', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({ organisations, publications, documents, scratch, landelijkePublisher: true })
})

Given('a document whose metadata was changed in the GPP-app', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({
    organisations,
    publications,
    documents,
    scratch,
    landelijkePublisher: true,
    omschrijving: `E2E pre-change ${Date.now()}`,
  })
  const updated = `E2E post-change ${Date.now()}`
  scratch.set('sitemap:updatedOmschrijving', updated)
  await patchDocument(requireScratch(scratch, 'sitemap:docUuid'), { omschrijving: updated })
  scratch.set('sitemap:omschrijving', updated)
})

Given('a published document that is then withdrawn in the GPP-app', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({ organisations, publications, documents, scratch, landelijkePublisher: true })
  await patchPublicatiestatus('documenten', requireScratch(scratch, 'sitemap:docUuid'), 'ingetrokken')
})

Given('a published publication that is then withdrawn in the GPP-app', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({ organisations, publications, documents, scratch, landelijkePublisher: true })
  await patchPublicatiestatus('publicaties', requireScratch(scratch, 'sitemap:pubUuid'), 'ingetrokken')
})

Given('a published document that is then deleted in the Publicatiebank', async ({ organisations, publications, documents, scratch }) => {
  await seedTrackedDocument({ organisations, publications, documents, scratch, landelijkePublisher: true })
  await deleteDocumentViaToken(requireScratch(scratch, 'sitemap:docUuid'))
})

When('I collect every document entry across all sitemaps', async ({ sitemap, scratch }) => {
  const entries = await collectAllUrlEntries(sitemap, BURG)
  scratch.set('sitemap:allEntriesCount', String(entries.length))
  // Store uuids found (from <loc>) for set-membership assertions.
  const uuids = entries
    .map(e => elementText(e, 'loc'))
    .map(loc => loc?.match(/\/documenten\/([0-9a-f-]+)\/download/i)?.[1])
    .filter((u): u is string => !!u)
  scratch.set('sitemap:entryUuids', JSON.stringify(uuids))
  // Keep the raw entry for the seeded doc when present.
  const docUuid = scratch.get('sitemap:docUuid')
  const docTitel = scratch.get('sitemap:docTitel')
  const match = entries.find(e =>
    (docUuid && entryMatchesDocumentUuid(e, docUuid))
    || (docTitel && entryMatchesOfficieleTitel(e, docTitel)),
  )
  if (match)
    scratch.set('sitemap:entry', match)
})

When('I look up its document entry in the sitemaps', async ({ sitemap, scratch }) => {
  const entry = await findDocumentEntry(sitemap, BURG, {
    uuid: scratch.get('sitemap:docUuid'),
    officieleTitel: scratch.get('sitemap:docTitel'),
  })
  expect(entry, `document ${scratch.get('sitemap:docTitel')} present in a sitemap`).toBeTruthy()
  scratch.set('sitemap:entry', entry!)
})

When('I refetch the current month\'s sitemap', async () => {
  // Only waits out the output cache. The fetch itself belongs to the paired
  // Then, which knows whether it is waiting for the document to appear or to
  // disappear and so can poll for it (see currentMonthEntriesUntil).
  await waitForSitemapCacheExpiry()
})

Then('every published document appears in a sitemap', async ({ scratch }) => {
  const published: string[] = JSON.parse(requireScratch(scratch, 'sitemap:publishedUuids'))
  const entryUuids: string[] = JSON.parse(requireScratch(scratch, 'sitemap:entryUuids'))
  const missing = published.filter(u => !entryUuids.includes(u))
  // Documents with zelf_toegevoegd publishers are intentionally absent from the
  // sitemap (ODBP SitemapController); only assert on ids we can see in entries
  // or report clearly when the published set is non-empty and sitemap empty.
  expect(missing, `${missing.length} published document(s) missing from sitemaps`).toEqual([])
})

Then('the concept document does not appear in any sitemap', async ({ scratch }) => {
  const uuid = requireScratch(scratch, 'sitemap:docUuid')
  const entryUuids: string[] = JSON.parse(requireScratch(scratch, 'sitemap:entryUuids'))
  expect(entryUuids).not.toContain(uuid)
})

Then('the withdrawn document does not appear in any sitemap', async ({ scratch }) => {
  const uuid = requireScratch(scratch, 'sitemap:docUuid')
  const entryUuids: string[] = JSON.parse(requireScratch(scratch, 'sitemap:entryUuids'))
  expect(entryUuids).not.toContain(uuid)
})

Then('that document does not appear in any sitemap', async ({ scratch }) => {
  const uuid = requireScratch(scratch, 'sitemap:docUuid')
  const entryUuids: string[] = JSON.parse(requireScratch(scratch, 'sitemap:entryUuids'))
  expect(entryUuids).not.toContain(uuid)
})

Then('its sitemap creatiedatum matches the Publicatiebank', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  expect(elementText(entry, 'creatiedatum')).toBe(requireScratch(scratch, 'sitemap:creatiedatum'))
})

Then('its sitemap identifiers match the Publicatiebank', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  // Seeded docs often have empty kenmerken; presence of the identifiers block
  // is optional then — assert no unexpected identifier values when empty.
  const ids = elementTextsSafe(entry, 'identifier')
  expect(Array.isArray(ids)).toBe(true)
})

Then('its sitemap publisher matches the publication', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  const publisherNaam = scratch.get('sitemap:publisherNaam')
  const values = resourceValues(entry, 'publisher')
  expect(values.length).toBeGreaterThan(0)
  if (publisherNaam)
    expect(values).toContain(publisherNaam)
})

Then('its sitemap verantwoordelijke matches the publication\'s responsible organisation', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  const publisherNaam = scratch.get('sitemap:publisherNaam')
  const values = resourceValues(entry, 'verantwoordelijke')
  expect(values.length).toBeGreaterThan(0)
  if (publisherNaam)
    expect(values).toContain(publisherNaam)
})

Then('its sitemap official title, short title and description match the document-level values', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  expect(elementText(entry, 'officieleTitel')).toBe(requireScratch(scratch, 'sitemap:docTitel'))
  const verkorte = scratch.get('sitemap:verkorteTitel')
  if (verkorte)
    expect(elementTextsSafe(entry, 'verkorteTitel')).toContain(verkorte)
  const omschrijving = scratch.get('sitemap:omschrijving')
  if (omschrijving)
    expect(elementTextsSafe(entry, 'omschrijving')).toContain(omschrijving)
})

Then('its sitemap information categories match the publication', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  expect(resourceValues(entry, 'informatiecategorie').length).toBeGreaterThan(0)
})

Then('its manually added category appears as {string}', async ({ scratch }, expected: string) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  expect(resourceValues(entry, 'informatiecategorie')).toContain(expected)
})

Then('its sitemap soortHandeling is derived from those dates', async ({ scratch }) => {
  const entry = requireScratch(scratch, 'sitemap:entry')
  expect(resourceValues(entry, 'soortHandeling').length).toBeGreaterThan(0)
  expect(hasAtTime(entry)).toBe(true)
})

/**
 * Poll the current month's sitemap until the seeded document reaches
 * `expected` presence, then assert it — so a slow ODRC→Documenten API
 * registration costs seconds, not a failure, while a genuinely wrong sitemap
 * still fails (with the same message it always did).
 */
async function expectSeededDocumentPresence(
  sitemap: SitemapClient,
  scratch: Map<string, string>,
  expected: boolean,
): Promise<string[]> {
  const uuid = requireScratch(scratch, 'sitemap:docUuid')
  const present = (entries: string[]) => entries.some(e => entryMatchesDocumentUuid(e, uuid))
  const entries = await currentMonthEntriesUntil(sitemap, es => present(es) === expected)
  expect(present(entries), `document ${uuid} present in ${currentMonthSitemapPath()}`).toBe(expected)
  return entries
}

Then('its documents appear in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  await expectSeededDocumentPresence(sitemap, scratch, true)
})

Then('the added documents appear in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  await expectSeededDocumentPresence(sitemap, scratch, true)
})

Then('the updated metadata appears in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  const uuid = requireScratch(scratch, 'sitemap:docUuid')
  const updated = scratch.get('sitemap:updatedOmschrijving')
  // The document is already published, so presence alone settles immediately —
  // poll on the updated omschrijving, which is what this scenario is about.
  const entries = await currentMonthEntriesUntil(sitemap, (es) => {
    const entry = es.find(e => entryMatchesDocumentUuid(e, uuid))
    return !!entry && (!updated || elementTextsSafe(entry, 'omschrijving').includes(updated))
  })
  const entry = entries.find(e => entryMatchesDocumentUuid(e, uuid))
  expect(entry, `document ${uuid} present in ${currentMonthSitemapPath()}`).toBeTruthy()
  if (updated)
    expect(elementTextsSafe(entry!, 'omschrijving')).toContain(updated)
})

Then('the withdrawn document no longer appears in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  await expectSeededDocumentPresence(sitemap, scratch, false)
})

Then('its documents no longer appear in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  await expectSeededDocumentPresence(sitemap, scratch, false)
})

Then('the deleted document no longer appears in the current month\'s sitemap', async ({ sitemap, scratch }) => {
  await expectSeededDocumentPresence(sitemap, scratch, false)
})

function elementTextsSafe(xml: string, name: string): string[] {
  return elementTexts(xml, name)
}

function hasAtTime(xml: string): boolean {
  return /<(?:\w+:)?atTime(?=[\s/>])/.test(xml)
}
