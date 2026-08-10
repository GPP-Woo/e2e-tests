import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
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

/**
 * Open the "Nieuwe publicatie" form: Mijn publicaties -> "Nieuwe publicatie".
 * That control is a *link* (`<a href="/publicaties">`), not a button — asking
 * for a button role silently waits forever.
 */
export async function openNieuwePublicatieForm(page: Page) {
  await openMijnPublicaties(page)
  await page.getByRole('link', { name: 'Nieuwe publicatie' }).click()
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
  await openOptionGroup(page, 'Organisatie')
  await page.locator(`input[type="radio"][value="${opts.organisatieUuid}"]`).check()
  await openOptionGroup(page, 'Informatiecategorie')
  await page.locator(`input[type="checkbox"][value="${opts.informatiecategorieUuid}"]`).check()
  if (opts.onderwerpTitels?.length)
    await openOptionGroup(page, 'Onderwerp')
  for (const onderwerpTitel of opts.onderwerpTitels ?? [])
    await page.getByRole('checkbox', { name: onderwerpTitel }).check()
}

/**
 * The form renders each waardelijst option-group inside a collapsed `<details>`
 * ("Organisatie *", "Informatiecategorieën *", "Onderwerpen"), so its inputs
 * have no visible box until the summary is clicked — `.check()` would wait for
 * a visible element until the test times out. Idempotent: a group that is
 * already open is left alone.
 */
export async function openOptionGroup(page: Page, label: string) {
  const group = optionGroup(page, label)
  if (!(await group.evaluate(el => el.hasAttribute('open'))))
    await group.locator('summary').first().click()
}

/**
 * The field-scoped validation message a failed publish renders inside a
 * waardelijst option-group ("Kies één optie." / "Kies minimaal één optie.").
 * It is a plain `<p class="error">` with no alert role, and lives inside the
 * (collapsible) group — so expand the group before asserting visibility.
 */
export function optionGroupError(page: Page, label: string) {
  return optionGroup(page, label).locator('p.error')
}

/** The `<details>` option-group whose summary starts with `label`. */
function optionGroup(page: Page, label: string) {
  return page.locator('details').filter({ has: page.locator('summary', { hasText: label }) }).first()
}

/**
 * The `value` attribute of every currently selectable organisatie (radio) or
 * informatiecategorie (checkbox) option on the "Nieuwe publicatie" form —
 * both option-groups carry the waardelijst uuid as their `value` (see
 * {@link fillWaardelijstFields}), so this is how a profiel's autorisaties
 * are read back deterministically. Scoped to the option-group itself rather
 * than to whatever inputs happen to be visible on the page, and the group's
 * "selecteer alles" toggle (value `on`, no uuid) is dropped.
 */
async function selectableWaardelijstValues(page: Page, label: string, inputType: 'radio' | 'checkbox'): Promise<string[]> {
  await openOptionGroup(page, label)
  const values = await optionGroup(page, label).locator(`input[type="${inputType}"]`).evaluateAll(
    inputs => inputs.map(input => (input as HTMLInputElement).value),
  )
  return values.filter(value => value !== 'on')
}

/** The `value`s of the organisatie options the "Nieuwe publicatie" form currently offers. */
export function selectableOrganisatieUuids(page: Page): Promise<string[]> {
  return selectableWaardelijstValues(page, 'Organisatie', 'radio')
}

/** The `value`s of the informatiecategorie options the "Nieuwe publicatie" form currently offers. */
export function selectableInformatiecategorieUuids(page: Page): Promise<string[]> {
  return selectableWaardelijstValues(page, 'Informatiecategorie', 'checkbox')
}

/**
 * Click "Publiceren" and confirm the document-less publish ("Publicatie zonder
 * documenten" -> "Ja, publiceren"). Shared by the create/edit flows below and by
 * any scenario that needs to attempt a (re)publish without assuming it
 * succeeds — e.g. one that expects the server to reject it because the
 * publicatie's organisatie/informatiecategorie is no longer authorised.
 */
export async function publishAndConfirmViaUi(page: Page) {
  await page.getByRole('button', { name: 'Publiceren' }).click()
  await settle(page)
  await confirmWrite(page, 'Ja, publiceren')
  await settle(page)
}

/**
 * Confirm a save/publish dialog and wait for the write to reach the API.
 *
 * The confirm button is visible and enabled a beat before the app wires its
 * handler, so a click landing right after the dialog opens is silently dropped —
 * the form then either sits there or re-renders empty ("Profiel is een verplicht
 * veld"). Nothing in the DOM marks the dialog as ready (no disabled/inert
 * state), so watch for the write itself and click again if it never came.
 */
async function confirmWrite(page: Page, name: string) {
  const button = page.getByRole('button', { name })
  await button.waitFor({ state: 'visible' })
  for (let attempt = 0; attempt < 4; attempt++) {
    const write = page
      .waitForResponse(
        r => r.request().method() !== 'GET' && r.url().includes('/api/v2/publicaties'),
        { timeout: 5_000 },
      )
      .catch(() => null)
    await button.click().catch(() => {})
    if (await write)
      return
    // A dropped click leaves the dialog open; anything else means the app moved
    // on and re-clicking would be wrong.
    if (!(await button.isVisible().catch(() => false)))
      return
  }
}

/**
 * Fill the officiële titel and blur it.
 *
 * The form commits this field to its own state on `change`, not on every
 * keystroke, so submitting straight after typing validates an empty model and
 * comes back with "Titel is een verplicht veld" (the create flow gets away with
 * it only because ticking a waardelijst blurs the input first).
 */
async function fillTitel(page: Page, titel: string) {
  await page.locator('#titel').fill(titel)
  await page.locator('#titel').blur()
}

/**
 * Pick the profiel (gebruikersgroep) and wait for the form to re-render.
 *
 * Selecting a profiel makes the app fetch that profiel's waardelijsten and
 * rebuild the rest of the form; anything typed before that render lands in the
 * discarded one, and the submit then rejects with "Profiel is een verplicht
 * veld" / "Titel is een verplicht veld". Both waardelijst groups have to be on
 * the page before it is safe to type: the organisatie group renders first and a
 * later arriving informatiecategorie response re-renders (and clears) the form.
 */
async function selectProfiel(page: Page, profielUuid: string) {
  await page.locator('#gebruikersgroep').selectOption(profielUuid)
  await optionGroup(page, 'Organisatie').waitFor()
  await optionGroup(page, 'Informatiecategorie').waitFor()
  await settle(page)
}

/**
 * Create a publicatie under `profiel` and publish it (optionally with a
 * document). Publishing without documents opens a "Publicatie zonder
 * documenten" confirm dialog ("Ja, publiceren").
 */
export async function createAndPublishViaUi(page: Page, opts: PublicatieInput & { filePath?: string }) {
  await openNieuwePublicatieForm(page)
  await selectProfiel(page, opts.profielUuid)
  await fillTitel(page, opts.titel)
  await fillWaardelijstFields(page, opts)
  if (opts.filePath) {
    await page.locator('input[type="file"]').setInputFiles(opts.filePath)
    await settle(page)
    await page.getByRole('button', { name: 'Publiceren' }).click()
    await settle(page)
    // With a document attached there is no "zonder documenten" confirm.
    return
  }
  await publishAndConfirmViaUi(page)
}

/**
 * Open "Nieuwe publicatie" and select `profielUuid`, without filling in
 * anything else. For scenarios that only need to inspect what the chosen
 * profiel's form renders — e.g. which organisatie/informatiecategorie values
 * it authorises (see {@link selectableOrganisatieUuids} /
 * {@link selectableInformatiecategorieUuids}) — rather than create a publicatie.
 */
export async function openNieuwePublicatieAndSelectProfielViaUi(page: Page, profielUuid: string) {
  await openNieuwePublicatieForm(page)
  await selectProfiel(page, profielUuid)
}

/**
 * Open a new publicatie, fill only the titel — leaving organisatie and
 * informatiecategorie empty — and attempt to publish it. The mutation the
 * required-field validation scenario exercises; no confirm dialog follows
 * since the SPA is expected to block the publish on the missing fields.
 */
export async function attemptPublishWithOnlyTitelViaUi(page: Page, opts: { profielUuid: string, titel: string }) {
  await openNieuwePublicatieForm(page)
  await selectProfiel(page, opts.profielUuid)
  await fillTitel(page, opts.titel)
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
  await openNieuwePublicatieForm(page)
  await selectProfiel(page, opts.profielUuid)
  await fillTitel(page, opts.titel)
  await page.getByRole('button', { name: 'Opslaan als concept' }).click()
  await settle(page)
  await confirmWrite(page, 'Ja, sla op als concept')
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
  await openNieuwePublicatieForm(page)
  await selectProfiel(page, opts.profielUuid)
  await page.locator('input[type="file"]').setInputFiles(opts.filePath)
  await settle(page)
}

/**
 * The "Documenten" fieldset. Its per-document fields reuse the publicatie's own
 * labels ("Titel *", "Verkorte titel", "Omschrijving"), so anything read out of
 * a document must be scoped here rather than looked up on the whole page.
 */
function documentenFieldset(page: Page) {
  return page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Documenten' }) })
}

/** The auto-filled document titel field after {@link addDocumentToNewPublicatieViaUi}. */
export function documentTitelField(page: Page) {
  return documentenFieldset(page).getByLabel('Titel *', { exact: true }).first()
}

/** The auto-filled document datum field after {@link addDocumentToNewPublicatieViaUi}. */
export function documentDatumField(page: Page) {
  return documentenFieldset(page).getByLabel('Datum document *', { exact: true }).first()
}

/** Checkbox that marks an existing document for withdraw on the next Publiceren. */
export function documentIntrekkenCheckbox(page: Page) {
  return documentenFieldset(page).getByLabel('Document intrekken')
}

/** Status chip shown on a withdrawn document's summary. */
export function documentIngetrokkenStatus(page: Page) {
  return documentenFieldset(page).getByRole('status').filter({ hasText: 'ingetrokken' })
}

/**
 * On an opened gepubliceerd publicatie that already has a document: tick
 * "Document intrekken" and republish so the PUT sets `publicatiestatus=ingetrokken`.
 */
export async function withdrawDocumentViaUi(page: Page, titel: string) {
  await openPublicatieViaUi(page, titel)
  const fieldset = documentenFieldset(page)
  // Existing documents render inside a closed <details>; open it so the
  // "Document intrekken" checkbox is interactable.
  await fieldset.locator('details summary').first().click()
  await documentIntrekkenCheckbox(page).check()
  const put = page.waitForResponse(
    r => r.request().method() === 'PUT' && /\/api\/v2\/documenten\//.test(r.url()),
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: 'Publiceren' }).click()
  const res = await put
  if (!res.ok())
    throw new Error(`PUT documenten -> ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  await settle(page)
}

/**
 * Attach {@link DOCUMENT_FIXTURE} to an already-open gepubliceerd publicatie and
 * republish so ODPC creates+uploads the document.
 */
export async function addDocumentAndRepublishViaUi(page: Page, titel: string, filePath = DOCUMENT_FIXTURE) {
  await openPublicatieViaUi(page, titel)
  await page.locator('input[type="file"]').setInputFiles(filePath)
  await settle(page)
  await expect(documentTitelField(page)).not.toHaveValue('')
  const post = page.waitForResponse(
    r => r.request().method() === 'POST' && /\/api\/v2\/documenten\/?$/.test(new URL(r.url()).pathname),
    { timeout: 60_000 },
  )
  const upload = page.waitForResponse(
    r => r.request().method() === 'PUT' && /\/bestandsdelen\//.test(r.url()),
    { timeout: 60_000 },
  )
  await page.getByRole('button', { name: 'Publiceren' }).click()
  const res = await post
  if (!res.ok())
    throw new Error(`POST documenten -> ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  const up = await upload
  if (!up.ok())
    throw new Error(`PUT bestandsdeel -> ${up.status()}: ${(await up.text()).slice(0, 300)}`)
  await settle(page)
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
  // The date lives in the <dd> next to the <dt>Registratiedatum:</dt>
  // (PublicatiesOverviewResult.vue). Matching the text itself also picks up that
  // bare <dt>, which carries no date at all.
  const labels = await page
    .locator('dl')
    .filter({ has: page.getByText('Registratiedatum:', { exact: true }) })
    .locator('dd')
    .allTextContents()
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
  await selectProfiel(page, opts.nieuweProfielUuid)
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
  await fillTitel(page, newTitel)
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

/** Navigate to "Publicaties van collega's" from the app root. */
export async function openCollegaPublicaties(page: Page) {
  await page.goto(gppApp)
  await settle(page)
  await page.getByRole('link', { name: "Publicaties van collega's" }).click()
  await settle(page)
}

/**
 * Open `titel` from "Publicaties van collega's", selecting `profielUuid` in the
 * Gebruikersgroep picker when it isn't already the active filter (a single
 * mijn-gebruikersgroep is auto-selected by the SPA).
 */
export async function openCollegaPublicatieViaUi(page: Page, titel: string, profielUuid: string) {
  await openCollegaPublicaties(page)
  const select = page.locator('#eigenaarGroep')
  await select.waitFor({ state: 'visible' })
  if (await select.inputValue() !== profielUuid)
    await select.selectOption(profielUuid)
  await settle(page)
  await page.getByText(titel, { exact: true }).click()
  await settle(page)
}

/** The "Publicatie-eigenaar" value on an opened publicatie detail form. */
export function publicatieEigenaar(page: Page) {
  return page.locator('dt').filter({ hasText: 'Publicatie-eigenaar' }).locator('xpath=following-sibling::dd[1]')
}

/** The "Publicatie claimen" button shown when viewing a colleague's publicatie. */
export function claimButton(page: Page) {
  return page.getByRole('button', { name: 'Publicatie claimen' })
}
