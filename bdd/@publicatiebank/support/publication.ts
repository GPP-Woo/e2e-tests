import type { Page } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'
import { adminResource } from './admin-resource'

/**
 * Publicatie test-data ownership through the Django admin.
 *
 * The token API cannot be used during a run: woo-publications' user-less service
 * token 500s on every API call for as long as any admin session is active on the
 * same server (its `SessionProfileMiddleware` dereferences a `None` user — see
 * README "Known server flake"), which a Stagehand-driven run always causes. So
 * publicaties are seeded, verified and cleaned up through the admin UI (session
 * auth = a real user), exactly like the organisatie/onderwerp scenarios.
 *
 * A `concept` publicatie needs only an officiële titel; `gepubliceerd` also
 * enforces a publisher (raw-id field) and an informatiecategorie (select2).
 *
 * NB: documents are intentionally not seeded — this stack has no Documents API
 * configured (`/documenten` POST → 500 "No documents API configured yet"), so
 * publicaties are created document-less.
 */
const resource = adminResource({
  path: 'publications/publication',
  rowMatch: 'result-row',
  changeId: '[0-9a-f-]+',
  deleteVia: 'deletelink',
})

/**
 * Create a `concept` publicatie through the Django admin (deterministic, not the
 * action under test). A concept publicatie needs only an officiële titel and the
 * status — publisher/informatiecategorie are only enforced on `gepubliceerd`.
 *
 * Pass `orgNaam` to also fill the publisher + an informatiecategorie while
 * keeping the status `concept`: those two are required to *publish*, so a
 * scenario that performs the concept → gepubliceerd transition itself needs a
 * concept that already satisfies them (the form would otherwise reject the save
 * with validation errors instead of publishing).
 *
 * We seed through the admin (session auth = a real user) rather than the token
 * API because woo-publications' user-less service token 500s on every API call
 * for as long as Stagehand drives the admin on the same server (see README
 * "Known server flake"). Requires an authenticated admin session on `page`.
 */
export async function addConceptPublication(page: Page, titel: string, orgNaam?: string) {
  // The org PK lookup navigates, so resolve it before opening the add form.
  const pk = orgNaam ? await organisationPk(page, orgNaam) : undefined
  await page.goto(resource.addFormUrl())
  await page.locator('#id_officiele_titel').fill(titel)
  if (pk)
    await fillPublisherAndCategory(page, pk)
  await page.locator('#id_publicatiestatus').selectOption('concept')
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/**
 * Resolve the integer admin PK of an organisatie by exact naam (needed to fill
 * the publisher raw-id field on the publicatie form). Throws if not found.
 */
export async function organisationPk(page: Page, naam: string): Promise<string> {
  const orgChangelist = new URL('/admin/metadata/organisation/', ENV.apps.publicatiebank).href
  await page.goto(`${orgChangelist}?q=${encodeURIComponent(naam)}`)
  const href = await page.locator('#result_list tbody tr th a, #result_list tbody tr td a').first().getAttribute('href')
  const pk = href?.match(/organisation\/(\d+)\/change/)?.[1]
  if (!pk)
    throw new Error(`Could not resolve admin PK for organisatie "${naam}"`)
  return pk
}

/**
 * Fill the two fields publishing enforces, on an already-open publicatie form:
 * publisher (a raw-id field, filled with the organisatie's PK) and an
 * informatiecategorie (a select2 autocomplete, first option picked).
 */
async function fillPublisherAndCategory(page: Page, publisherPk: string) {
  await page.locator('#id_publisher').fill(publisherPk)
  await page.locator('.field-informatie_categorieen .select2-selection').click()
  await page.waitForSelector('.select2-results__option', { timeout: 8000 })
  await page.locator('.select2-results__option').first().click()
}

/**
 * Create a `gepubliceerd` publicatie through the Django admin (deterministic
 * prerequisite for the withdraw scenario). Publishing enforces a publisher and
 * an informatiecategorie (see {@link fillPublisherAndCategory}). Requires an
 * authenticated admin session and an existing (actief) organisatie `orgNaam`.
 */
export async function addPublishedPublication(page: Page, titel: string, orgNaam: string) {
  const pk = await organisationPk(page, orgNaam)
  await page.goto(resource.addFormUrl())
  await page.locator('#id_officiele_titel').fill(titel)
  await fillPublisherAndCategory(page, pk)
  await page.locator('#id_publicatiestatus').selectOption('gepubliceerd')
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/** Delete a publicatie by exact titel via the admin. No-op if already gone. */
export function deletePublicationByTitel(page: Page, titel: string) {
  return resource.remove(page, titel)
}

// --- Admin reads (deterministic while Stagehand drives the admin — see TS3/TS4) -

/**
 * Whether a publicatie with this titel is listed in the admin changelist.
 * Deterministic verification for the Stagehand-driven beheer scenarios (the token
 * API is unreliable while Stagehand drives the same admin — see README).
 */
export function publicationExistsAdmin(page: Page, titel: string): Promise<boolean> {
  return resource.exists(page, titel)
}

/**
 * A changelist column value of a publicatie ('' if the row is not found). Read
 * from the changelist rather than the change form because the form's fields
 * disappear once a publicatie is `ingetrokken` (Django renders it read-only).
 */
async function changelistCell(page: Page, titel: string, field: string): Promise<string> {
  await page.goto(`${resource.changelistUrl()}?q=${encodeURIComponent(titel)}`)
  const row = page.locator('#result_list tbody tr', { hasText: titel })
  if ((await row.count()) === 0)
    return ''
  const cell = await row.first().locator(`td.field-${field}`).textContent()
  return (cell ?? '').trim()
}

/** The publicatiestatus of a publicatie, lower-cased ('' if not found). */
export async function publicationStatusAdmin(page: Page, titel: string): Promise<string> {
  return (await changelistCell(page, titel, 'publicatiestatus')).toLowerCase()
}

/**
 * The UUID of a publicatie, read from the admin changelist column. The
 * burgerportaal serves a publicatie at `/publicaties/<uuid>`, so this is how a
 * scenario asserts portal visibility without depending on the search index
 * (woo-search is not indexing on this stack — see zoeken.feature). '' if not
 * found, so it must be read *before* a scenario deletes the publicatie.
 */
export function publicationUuidAdmin(page: Page, titel: string): Promise<string> {
  return changelistCell(page, titel, 'uuid')
}

/** Open the change page of a publicatie by titel; false if it does not exist. */
export function openPublicationAdmin(page: Page, titel: string): Promise<boolean> {
  return resource.open(page, titel)
}

/** Open the publicatie changelist filtered by `q`. */
export async function openPublicationChangelist(page: Page, q: string): Promise<void> {
  await page.goto(`${resource.changelistUrl()}?q=${encodeURIComponent(q)}`)
}

/**
 * Search the publicatie changelist through the admin's own search box (rather
 * than by crafting a `?q=` URL) — the search *widget* is what TS9's find-a-
 * publicatie scenarios are about.
 */
export async function searchPublicationAdmin(page: Page, term: string): Promise<void> {
  await page.goto(resource.changelistUrl())
  await page.locator('#changelist-search input[name="q"]').fill(term)
  await page.locator('#changelist-search input[type="submit"]').click()
}

/** Open the first row of the changelist currently shown. */
export async function openFirstPublicationResult(page: Page): Promise<void> {
  await page.locator('#result_list tbody tr').first().locator('th a, td a').first().click()
}

/** Save the open publicatie form and wait for the redirect back to the changelist. */
export async function savePublicationForm(page: Page): Promise<void> {
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/** Delete the publicatie whose change form is open, confirming the interstitial. */
export async function deleteOpenPublication(page: Page): Promise<void> {
  // The change page also carries an eigenaar-inline "verwijderen" link, so target
  // the main delete link by class rather than by accessible name.
  await page.locator('a.deletelink').click()
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
  await resource.assertOnChangelist(page)
}

/** The omschrijving textarea value on the change page ('' if not found). */
export async function publicationOmschrijvingAdmin(page: Page, titel: string): Promise<string> {
  if (!(await resource.open(page, titel)))
    return ''
  return page.locator('#id_omschrijving').inputValue()
}

/**
 * Whether the change form of a publicatie exposes no way to edit it.
 * `PublicationAdmin.has_change_permission` returns False for an `ingetrokken`
 * publicatie, so Django falls back to its view-only change form: the editable
 * widgets are replaced by readonly renderings and the submit row drops "Opslaan".
 */
export async function publicationFormIsReadOnly(page: Page, titel: string): Promise<boolean> {
  if (!(await resource.open(page, titel)))
    return false
  return (await page.locator('input[name="_save"]').count()) === 0
    && (await page.locator('#id_officiele_titel').count()) === 0
}

/**
 * Officiële titels of the onderwerpen linked to a publicatie, read from the
 * change page's onderwerpen select2 widget — its backing `<select multiple>`
 * keeps the selected `<option>`s in the DOM, so no select2 interaction is
 * needed to read them back. [] if the publicatie is not found.
 */
export async function publicationOnderwerpenAdmin(page: Page, titel: string): Promise<string[]> {
  if (!(await resource.open(page, titel)))
    return []
  const titels = await page.locator('#id_onderwerpen option:checked').allTextContents()
  return titels.map(t => t.trim())
}

/** Officiële titels of leftover `E2E `-prefixed publicaties via the admin. */
export function listE2EPublicationTitels(page: Page, prefix = 'E2E '): Promise<string[]> {
  return resource.listE2ENames(page, prefix)
}
