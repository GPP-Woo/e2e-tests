import type { Page } from '@playwright/test'
import path from 'node:path'
import { ENV } from '@/bdd/_core/types'

/**
 * Plain-Playwright driver for the gpp-app (odpc) eindgebruiker publicatie flows
 * (TS6/7).
 *
 * The gpp-app is a SPA that only hydrates its routes when navigated by clicking
 * from the app root — deep-linking a route leaves the form unrendered (same
 * constraint as the gebruikersgroepen flow). So every action starts at the root
 * and clicks through.
 *
 * The "Nieuwe publicatie" form only renders when the signed-in user belongs to an
 * authorised gebruikersgroep; the `authProfile` fixture seeds one first and hands
 * back the profiel/organisatie/informatiecategorie uuids. The form's inputs carry
 * those uuids as their `value`, so the form is filled deterministically by
 * id/value.
 */

const gppApp = ENV.apps.gppApp.replace(/\/$/, '')

/**
 * A small deterministic text fixture for the "Nieuwe publicatie" document
 * widget. Its filename (sans extension) is the expected auto-derived
 * documenttitel — do not rename without updating the assertion that reads it.
 */
export const DOCUMENT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'e2e-test-document.txt')

/** Wait for the network to go idle, swallowing the timeout (best-effort settle). */
function settle(page: Page): Promise<void> {
  return page.waitForLoadState('networkidle').then(() => {}).catch(() => {})
}

/** Navigate to "Mijn publicaties" from the app root, without any further action. */
export async function openMijnPublicaties(page: Page) {
  await page.goto(gppApp)
  await settle(page)
  await page.getByRole('link', { name: 'Mijn publicaties' }).click()
  await settle(page)
}

export interface PublicatieInput {
  /** UUID of the authorised gebruikersgroep (the "Profiel" <option> value). */
  profielUuid: string
  titel: string
  /** UUID of the authorised organisatie (the "Organisatie" radio's value). */
  organisatieUuid: string
  /** UUID of the authorised informatiecategorie (the checkbox's value). */
  informatiecategorieUuid: string
  /**
   * Officiële titels of onderwerpen to tick in the "Onderwerpen" section, if
   * any. Unlike organisatie/informatiecategorie, onderwerpen are not gated by
   * the profiel's autorisaties, so they are selected by their visible titel
   * rather than a uuid carried on the checkbox.
   */
  onderwerpTitels?: string[]
}

/**
 * Select `organisatieUuid`'s radio and `informatiecategorieUuid`'s checkbox
 * (both `.check()` — a no-op if already checked, unlike `.click()`), and, if
 * `onderwerpTitels` is given, ensure each is ticked too — expanding the
 * "Onderwerpen" section first only if it isn't already visible. Shared by the
 * create flow and the profiel-change flow: organisatie/informatiecategorie are
 * gated by the selected profiel's own autorisaties, so switching profiel
 * re-scopes (and can clear) all three fields.
 */
async function fillWaardelijstFields(page: Page, opts: { organisatieUuid: string, informatiecategorieUuid: string, onderwerpTitels?: string[] }) {
  await page.locator(`input[type="radio"][value="${opts.organisatieUuid}"]`).check()
  await page.locator(`input[type="checkbox"][value="${opts.informatiecategorieUuid}"]`).check()
  for (const onderwerpTitel of opts.onderwerpTitels ?? []) {
    const checkbox = page.getByRole('checkbox', { name: onderwerpTitel })
    if (!(await checkbox.isVisible().catch(() => false)))
      await page.getByText('Onderwerpen', { exact: true }).click()
    await checkbox.check()
  }
}

/**
 * Click "Publiceren" and confirm the document-less publish ("Publicatie zonder
 * documenten" -> "Ja, publiceren").
 */
async function publishAndConfirmViaUi(page: Page) {
  await page.getByRole('button', { name: 'Publiceren' }).click()
  await settle(page)
  await page.getByRole('button', { name: 'Ja, publiceren' }).click()
  await settle(page)
}

/**
 * Create a publicatie under `profiel` and publish it (no documents — this stack
 * has no Documents API). The form itself is a dependent set of custom widgets (a
 * native profiel <select>, then a titel input plus organisatie-radio /
 * informatiecategorie-checkbox option-groups that only render once a profiel is
 * chosen), so it is filled deterministically by id/value — the same carve-out the
 * onderwerp add form uses for its file input. Publishing a document-less
 * publicatie opens a "Publicatie zonder documenten" confirm dialog ("Ja, publiceren").
 */
export async function createAndPublishViaUi(page: Page, opts: PublicatieInput) {
  await openMijnPublicaties(page)
  await page.getByRole('button', { name: 'Nieuwe publicatie' }).click()
  await settle(page)
  // Choosing a profiel reveals the rest of the form (Vue v-if); fill it deterministically.
  await page.locator('#gebruikersgroep').selectOption(opts.profielUuid)
  await page.locator('#titel').fill(opts.titel)
  await fillWaardelijstFields(page, opts)
  // Publish (the action under test) and confirm the document-less publish.
  await publishAndConfirmViaUi(page)
}

/**
 * Open a new publicatie, fill only the titel — leaving organisatie and
 * informatiecategorie empty — and attempt to publish it. The mutation the
 * required-field validation scenario exercises; no confirm dialog follows
 * since the SPA is expected to block the publish on the missing fields.
 */
export async function attemptPublishWithOnlyTitelViaUi(page: Page, opts: { profielUuid: string, titel: string }) {
  await openMijnPublicaties(page)
  await page.getByRole('button', { name: 'Nieuwe publicatie' }).click()
  await settle(page)
  await page.locator('#gebruikersgroep').selectOption(opts.profielUuid)
  await page.locator('#titel').fill(opts.titel)
  await page.getByRole('button', { name: 'Publiceren' }).click()
}

/**
 * Create a publicatie under `profiel` and save it as a concept via the
 * "Opslaan als concept" confirmation dialog ("Ja, sla op als concept"). Unlike
 * publishing, a concept only needs an officiële titel — organisatie and
 * informatiecategorie are enforced on the publish transition, not here (see
 * `@publicatiebank/support/publication.ts`'s `addConceptPublication`). Saving
 * redirects back to the gpp-app homepage (Mijn publicaties).
 */
export async function saveAsConceptViaUi(page: Page, opts: { profielUuid: string, titel: string }) {
  await openMijnPublicaties(page)
  await page.getByRole('button', { name: 'Nieuwe publicatie' }).click()
  await settle(page)
  await page.locator('#gebruikersgroep').selectOption(opts.profielUuid)
  await page.locator('#titel').fill(opts.titel)
  await page.getByRole('button', { name: 'Opslaan als concept' }).click()
  await settle(page)
  await page.getByRole('button', { name: 'Ja, sla op als concept' }).click()
  await settle(page)
}

/**
 * Open a new publicatie and add a document to it via the wizard's (hidden)
 * file input — the same carve-out the onderwerp add form uses — without
 * saving/publishing. Choosing a file is enough to trigger the app's
 * auto-derivation of the document's titel and datum from the file, which the
 * caller reads back with {@link documentTitelField} / {@link documentDatumField}.
 */
export async function addDocumentToNewPublicatieViaUi(page: Page, opts: { profielUuid: string, filePath: string }) {
  await openMijnPublicaties(page)
  await page.getByRole('button', { name: 'Nieuwe publicatie' }).click()
  await settle(page)
  // Choosing a profiel reveals the rest of the form, including the document widget.
  await page.locator('#gebruikersgroep').selectOption(opts.profielUuid)
  await page.locator('input[type="file"]').setInputFiles(opts.filePath)
  await settle(page)
}

/** The auto-filled "Titel document" field after {@link addDocumentToNewPublicatieViaUi}. */
export function documentTitelField(page: Page) {
  return page.getByLabel('Titel document')
}

/** The auto-filled "Datum document" field after {@link addDocumentToNewPublicatieViaUi}. */
export function documentDatumField(page: Page) {
  return page.getByLabel('Datum document')
}

/** Open a publicatie by titel from "Mijn publicaties". */
export async function openPublicatieViaUi(page: Page, titel: string): Promise<void> {
  await openMijnPublicaties(page)
  await page.getByText(titel, { exact: true }).click()
  await settle(page)
}

/** The banner shown on an opened publicatie that is still a concept. */
export function conceptStatusBanner(page: Page) {
  return page.getByText('Deze publicatie is nog in')
}

/** The banner shown on an opened publicatie that has been withdrawn (ingetrokken). */
export function ingetrokkenStatusBanner(page: Page) {
  return page.getByText('Deze publicatie is ingetrokken')
}

/**
 * Search "Mijn publicaties" for publicaties registered on `date` (an ISO
 * `YYYY-MM-DD` string), using the "Datum van"/"Datum tot en met" range filter
 * with the same day on both ends.
 */
export async function searchPublicatiesByDateViaUi(page: Page, date: string): Promise<void> {
  await openMijnPublicaties(page)
  await page.getByRole('textbox', { name: 'Datum van' }).fill(date)
  await page.getByRole('textbox', { name: 'Datum tot en met' }).fill(date)
  await page.getByRole('button', { name: 'Zoek' }).click()
  await settle(page)
}

/**
 * Sort "Mijn publicaties" via the "Sorteer op" select in the "Sorteer
 * publicaties" group. `sortOption` is the option's value, e.g. `titel` or
 * `registratiedatum` (ascending); prefix with `-` for descending (DRF-style
 * ordering, confirmed by the app offering both `registratiedatum` and
 * `-registratiedatum`).
 */
export async function sortPublicatiesViaUi(page: Page, sortOption: string): Promise<void> {
  await openMijnPublicaties(page)
  await page.getByRole('group', { name: 'Sorteer publicaties' }).getByLabel('Sorteer op').selectOption(sortOption)
  await settle(page)
}

/** The titels of the publicaties currently visible in "Mijn publicaties", in list order. */
export function visiblePublicatieTitels(page: Page) {
  return page.getByRole('heading', { level: 3 })
}

const DUTCH_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** Parse a "Registratiedatum: 27 juli 2026" style label into a comparable Date. */
function parseRegistratiedatum(label: string): Date {
  const match = label.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
  const monthIndex = match ? DUTCH_MONTHS.indexOf(match[2].toLowerCase()) : -1
  if (!match || monthIndex === -1)
    throw new Error(`Could not parse a registratiedatum from "${label}"`)
  return new Date(Number(match[3]), monthIndex, Number(match[1]))
}

/** The "Registratiedatum: ..." dates currently visible in "Mijn publicaties", in list order. */
export async function visibleRegistratiedatums(page: Page): Promise<Date[]> {
  const labels = await page.getByText(/Registratiedatum:/).allTextContents()
  return labels.map(parseRegistratiedatum)
}

/**
 * Apply the "Mijn publicaties" filter bar: informatiecategorie by uuid
 * (mirroring the profiel-scoped organisatie/informatiecategorie inputs
 * elsewhere in this file), onderwerp by its visible titel (its uuid isn't
 * known to the caller — the same carve-out onderwerp selection uses in
 * createAndPublishViaUi), and publicatiestatus by its literal value (e.g.
 * "gepubliceerd").
 */
export async function filterPublicatiesViaUi(page: Page, opts: { informatiecategorieUuid: string, onderwerpTitel: string, status: string }): Promise<void> {
  await openMijnPublicaties(page)
  await page.getByLabel('Filter publicaties op informatiecategorie').selectOption(opts.informatiecategorieUuid)
  await page.getByLabel('Filter publicaties op onderwerp').selectOption({ label: opts.onderwerpTitel })
  await page.getByLabel('Filter publicaties op publicatiestatus').selectOption(opts.status)
  await settle(page)
}

/**
 * The "Publicatie intrekken" button on an opened publicatie. Only rendered
 * while the publicatie is `gepubliceerd` (a concept has nothing to withdraw),
 * so its visibility doubles as the SPA's own on-page proof of that status.
 */
export function withdrawButton(page: Page) {
  return page.getByRole('button', { name: 'Publicatie intrekken' })
}

/** The confirmation dialog opened by clicking {@link withdrawButton}. */
export function intrekkenDialog(page: Page) {
  return page.getByRole('dialog', { name: /intrekken/i })
}

/**
 * Open `titel` from "Mijn publicaties", switch its Profiel to a different
 * authorised gebruikersgroep, and republish. The new profiel authorises its own
 * organisatie/informatiecategorie (and onderwerpen aren't gated by the profiel
 * at all), so {@link fillWaardelijstFields} re-fills all three with the new
 * profiel's values — a no-op for whichever field(s) the switch didn't clear —
 * before publishing again.
 */
export async function changeProfielAndRepublishViaUi(page: Page, titel: string, opts: {
  nieuweProfielUuid: string
  organisatieUuid: string
  informatiecategorieUuid: string
  onderwerpTitels?: string[]
}) {
  await openPublicatieViaUi(page, titel)
  await page.locator('#gebruikersgroep').selectOption(opts.nieuweProfielUuid)
  await settle(page)
  await fillWaardelijstFields(page, opts)
  await publishAndConfirmViaUi(page)
}

/**
 * Open `titel` from "Mijn publicaties", replace its titel with `newTitel`, and
 * republish. Unlike a profiel switch (see {@link changeProfielAndRepublishViaUi}),
 * editing the titel alone doesn't re-scope or clear organisatie/informatiecategorie/
 * onderwerpen, so they are left untouched.
 */
export async function editTitelAndRepublishViaUi(page: Page, titel: string, newTitel: string): Promise<void> {
  await openPublicatieViaUi(page, titel)
  await page.locator('#titel').fill(newTitel)
  await publishAndConfirmViaUi(page)
}

/**
 * The "Bekijk online" link on an opened, gepubliceerd publicatie — opens the
 * burgerportaal detail page for that publicatie in a new tab (a `target="_blank"`
 * link, hence the "(externe link)" accessible-name suffix).
 */
export function bekijkOnlineLink(page: Page) {
  return page.getByRole('link', { name: 'Bekijk online (externe link)' })
}

/**
 * Open `titel` from "Mijn publicaties" and click "Bekijk online", returning the
 * popup tab it opens (the burgerportaal detail page for that publicatie),
 * settled and ready to assert against.
 */
export async function clickBekijkOnlineViaUi(page: Page, titel: string): Promise<Page> {
  await openPublicatieViaUi(page, titel)
  const popupPromise = page.waitForEvent('popup')
  await bekijkOnlineLink(page).click()
  const popup = await popupPromise
  await popup.waitForLoadState('networkidle').catch(() => {})
  return popup
}

/**
 * Open a publicatie by titel from "Mijn publicaties" and withdraw it
 * ("Publicatie intrekken"), confirming if prompted.
 */
export async function withdrawViaUi(page: Page, titel: string) {
  await openPublicatieViaUi(page, titel)
  await withdrawButton(page).click()
  // Confirmation dialog, if any, follows the same "Ja, <verb>" pattern as publish.
  const confirmButton = page.getByRole('button', { name: 'Ja, intrekken' })
  if (await confirmButton.isVisible().catch(() => false))
    await confirmButton.click()
  await settle(page)
}
