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
 * We seed through the admin (session auth = a real user) rather than the token
 * API because woo-publications' user-less service token 500s on every API call
 * for as long as Stagehand drives the admin on the same server (see README
 * "Known server flake"). Requires an authenticated admin session on `page`.
 */
export async function addConceptPublication(page: Page, titel: string) {
  await page.goto(resource.addFormUrl())
  await page.locator('#id_officiele_titel').fill(titel)
  await page.locator('#id_publicatiestatus').selectOption('concept')
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/**
 * Resolve the integer admin PK of an organisatie by exact naam (needed to fill
 * the publisher raw-id field on the publicatie form). Throws if not found.
 */
async function organisationPk(page: Page, naam: string): Promise<string> {
  const orgChangelist = new URL('/admin/metadata/organisation/', ENV.apps.publicatiebank).href
  await page.goto(`${orgChangelist}?q=${encodeURIComponent(naam)}`)
  const href = await page.locator('#result_list tbody tr th a, #result_list tbody tr td a').first().getAttribute('href')
  const pk = href?.match(/organisation\/(\d+)\/change/)?.[1]
  if (!pk)
    throw new Error(`Could not resolve admin PK for organisatie "${naam}"`)
  return pk
}

/**
 * Create a `gepubliceerd` publicatie through the Django admin (deterministic
 * prerequisite for the withdraw scenario). Publishing enforces a publisher and
 * an informatiecategorie: publisher is a raw-id field (filled with the org's PK),
 * informatiecategorie is a select2 autocomplete (first option picked). Requires
 * an authenticated admin session and an existing (actief) organisatie `orgNaam`.
 */
export async function addPublishedPublication(page: Page, titel: string, orgNaam: string) {
  const pk = await organisationPk(page, orgNaam)
  await page.goto(resource.addFormUrl())
  await page.locator('#id_officiele_titel').fill(titel)
  await page.locator('#id_publisher').fill(pk)
  await page.locator('.field-informatie_categorieen .select2-selection').click()
  await page.waitForSelector('.select2-results__option', { timeout: 8000 })
  await page.locator('.select2-results__option').first().click()
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
 * The publicatiestatus of a publicatie, read (lower-cased) from the admin
 * changelist column — not the change form, whose status field disappears once a
 * publicatie is `ingetrokken` (read-only). '' if the row is not found.
 */
export async function publicationStatusAdmin(page: Page, titel: string): Promise<string> {
  await page.goto(`${resource.changelistUrl()}?q=${encodeURIComponent(titel)}`)
  const row = page.locator('#result_list tbody tr', { hasText: titel })
  if ((await row.count()) === 0)
    return ''
  const cell = await row.first().locator('td.field-publicatiestatus').textContent()
  return (cell ?? '').trim().toLowerCase()
}

/** The omschrijving textarea value on the change page ('' if not found). */
export async function publicationOmschrijvingAdmin(page: Page, titel: string): Promise<string> {
  if (!(await resource.open(page, titel)))
    return ''
  return page.locator('#id_omschrijving').inputValue()
}

/** Officiële titels of leftover `E2E `-prefixed publicaties via the admin. */
export function listE2EPublicationTitels(page: Page, prefix = 'E2E '): Promise<string[]> {
  return resource.listE2ENames(page, prefix)
}
