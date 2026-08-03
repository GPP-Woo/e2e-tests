import type { Page } from '@playwright/test'
import { auditEntryCount, newestAuditEntryText } from '@/bdd/@publicatiebank/support/audit-log'
import { ownerGroupLabel } from '@/bdd/@publicatiebank/support/owner-group'
import {
  addConceptPublication,
  addPublishedPublication,
  deleteOpenPublication,
  openFirstPublicationResult,
  openPublicationAdmin,
  openPublicationChangelist,
  publicationExistsAdmin,
  publicationFormIsReadOnly,
  publicationOmschrijvingAdmin,
  publicationStatusAdmin,
  publicationUuidAdmin,
  savePublicationForm,
  searchPublicationAdmin,
} from '@/bdd/@publicatiebank/support/publication'
import { publicationField } from '@/bdd/@publicatiebank/support/publication-fields'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 9 (publicatie beheer) steps — driven entirely through the ordinary
 * session-authenticated Playwright `page`.
 *
 * This feature deliberately does *not* use the Stagehand `pubAdmin` driver the
 * other @admin features use. Every mutation here is a Django admin form: a
 * change-form field, a native `<select>`, a select2 autocomplete, an inline
 * formset, a changelist bulk action. Those have stable ids, so natural-language
 * `act()` buys nothing — and it cost a great deal: across the validation runs
 * every single failure came from Stagehand and none from the admin (act() row
 * clicks leaving the DOM churning mid-interaction, silently no-op'ed field
 * edits, "Verwijderen" resolving to the eigenaar-inline link, and the
 * understudy locator's missing auto-wait). Reads were already deterministic;
 * now the writes are too.
 *
 * Test data is still seeded and cleaned up over the admin by the `publications`
 * fixture — the token API is unusable here (see README "Known server flake").
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }
// The burgerportaal renders a publicatie from a live API call to the
// publicatiebank, but it is an SPA behind a proxy — allow a few seconds and a
// reload, as the burgerportaal scenarios do.
const LIVE = { timeout: 30_000, intervals: [1000, 2000, 3000] }
const burg = ENV.apps.burgerportaal.replace(/\/$/, '')

/** Open the change form of the publicatie under test, failing loudly if it is gone. */
async function openPublication(page: Page, titel: string): Promise<void> {
  if (!(await openPublicationAdmin(page, titel)))
    throw new Error(`Publicatie "${titel}" not found in the admin`)
}

// Prerequisites (deterministic, not the action under test), seeded through the
// admin add form — the token API is unusable while Stagehand drives the admin.
Given('a concept publicatie', async ({ publications }) => {
  await publications.seed()
})

// Publishing enforces a publisher + an informatiecategorie, so a concept that is
// going to be published by the scenario itself must already carry both — with a
// bare concept the admin would answer the status change with validation errors.
Given('a concept publicatie with a publisher and informatiecategorie', async ({ page, publications, organisations }) => {
  const orgNaam = await organisations.add()
  const titel = publications.freshName()
  await addConceptPublication(page, titel, orgNaam)
  publications.track(titel)
})

// A gepubliceerd publicatie, seeded deterministically through the admin (needs a
// publisher organisatie + an informatiecategorie); the withdraw is the mutation
// under test.
Given('a published publicatie', async ({ page, publications, organisations, scratch }) => {
  const orgNaam = await organisations.add()
  const titel = publications.freshName()
  await addPublishedPublication(page, titel, orgNaam)
  publications.track(titel)
  // Stash the uuid while the publicatie still exists: it is the burgerportaal's
  // address for it (`/publicaties/<uuid>`), which the Burgerportaal scenarios
  // still need after the admin has deleted the row.
  const uuid = await publicationUuidAdmin(page, titel)
  if (!uuid)
    throw new Error(`Seeded publicatie "${titel}" has no uuid in the admin changelist`)
  scratch.set('pub:uuid', uuid)
})

// --- Edit omschrijving ------------------------------------------------------

When('I change the publicatie omschrijving through the admin', async ({ page, publications, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('pub:omschrijving', omschrijving)
  await openPublication(page, publications.last())
  await page.locator('#id_omschrijving').fill(omschrijving)
  await savePublicationForm(page)
})

Then('the publicatie has the new omschrijving', async ({ page, publications, scratch }) => {
  const titel = publications.last()
  const expected = scratch.get('pub:omschrijving')!
  await expect.poll(() => publicationOmschrijvingAdmin(page, titel), READ).toContain(expected)
})

// --- Rename -----------------------------------------------------------------

When('I rename the publicatie through the admin', async ({ page, publications, scratch }) => {
  const oldTitel = publications.last()
  const newTitel = `${publications.freshName()} hernoemd`
  scratch.set('pub:oldTitel', oldTitel)
  await openPublication(page, oldTitel)
  await page.locator('#id_officiele_titel').fill(newTitel)
  await savePublicationForm(page)
  // Track the new titel so cleanup deletes the renamed publicatie too.
  publications.track(newTitel)
})

Then('the publicatie is known under its new titel and not the old one', async ({ page, publications, scratch }) => {
  const newTitel = publications.last()
  const oldTitel = scratch.get('pub:oldTitel')!
  await expect.poll(() => publicationExistsAdmin(page, newTitel), READ).toBe(true)
  expect(await publicationExistsAdmin(page, oldTitel)).toBe(false)
})

// --- Withdraw (intrekken) ---------------------------------------------------

When('I set the publicatiestatus to {string} and save the publicatie', async ({ page, publications }, label: string) => {
  await openPublication(page, publications.last())
  // Option value = lowercased label (gepubliceerd / ingetrokken / concept).
  await page.locator('#id_publicatiestatus').selectOption(label.toLowerCase())
  await savePublicationForm(page)
})

Then('the publicatie has status {string}', async ({ page, publications }, status: string) => {
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe(status)
})

// --- Delete -----------------------------------------------------------------

When('I delete the publicatie through the admin', async ({ page, publications }) => {
  await openPublication(page, publications.last())
  await deleteOpenPublication(page)
})

Then('the publicatie no longer exists', async ({ page, publications }) => {
  const titel = publications.last()
  await expect.poll(() => publicationExistsAdmin(page, titel), READ).toBe(false)
})

// --- Search (UI read under test) --------------------------------------------

When('I search the admin for the publicatie', async ({ page, publications }) => {
  await searchPublicationAdmin(page, publications.last())
})

Then('the publicatie is shown in the admin results', async ({ page, publications }) => {
  const titel = publications.last()
  expect(await publicationExistsAdmin(page, titel)).toBe(true)
})

// ===========================================================================
// Gap scenarios vs. the manual TS9 (matrix rows 174-202).
// ===========================================================================

// --- Edit remaining metadata fields + persist-after-reopen -----------------
//
// One pair of steps for nine widgets: which field is edited, and how, lives in
// `support/publication-fields.ts`.

When(
  'I change the {string} of the publicatie through the admin',
  async ({ page, publications, categories, organisations, topics, ownerGroups, scratch }, field: string) => {
    const spec = publicationField(field)
    // Seeding a prerequisite navigates the shared tab, so it happens first.
    const value = await spec.prepare({ page, categories, organisations, topics, ownerGroups })
    scratch.set(`pub:field:${field}`, value)
    await openPublication(page, publications.last())
    await spec.apply(page, value)
    await savePublicationForm(page)
  },
)

Then('the {string} persists after reopening the publicatie', async ({ page, publications, scratch }, field: string) => {
  const spec = publicationField(field)
  const expected = scratch.get(`pub:field:${field}`)!
  const titel = publications.last()
  await expect.poll(async () => {
    if (!(await openPublicationAdmin(page, titel)))
      return ''
    return spec.read(page)
  }, READ).toContain(expected)
})

// --- Bulk eigenaar (groep) change (March 2026) -----------------------------

When('I bulk-change the eigenaar groep from the publicatie changelist', async ({ page, publications, ownerGroups, scratch }) => {
  const identifier = await ownerGroups.add()
  // The read-back assertion is the shared `"eigenaar (groep)" persists` step, so
  // stash under the key its field spec uses.
  scratch.set('pub:field:eigenaar (groep)', identifier)
  // The action is picked by its option *value* (the admin action's function
  // name), which — unlike its localised label — cannot drift with a translation.
  await openPublicationChangelist(page, publications.last())
  await page.locator('#result_list tbody tr input.action-select').first().check()
  await page.locator('select[name="action"]').selectOption('change_owner_group')
  await page.locator('#changelist-form button[name="index"]').click()
  // The confirmation page offers an existing groep in a plain ModelChoiceField
  // (labelled `naam - (identifier)`) or a naam to create a new one.
  await page.locator('#id_eigenaar_groep').selectOption({ label: ownerGroupLabel(identifier) })
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
  // Let the POST + redirect finish: the assertion step navigates straight away and
  // would otherwise abort the in-flight submit.
  await page.waitForLoadState('networkidle').catch(() => {})
})

// --- Audit logging ---------------------------------------------------------
//
// An admin edit is logged as an `update` event carrying a snapshot of every field
// (`serialize_instance`), so the log entry can be asserted to record *this*
// change rather than merely that something was logged. See `support/audit-log.ts`.

Then('the audit log shows an edit entry for the publicatie', async ({ page, publications, scratch }) => {
  const omschrijving = scratch.get('pub:omschrijving')!
  await expect.poll(() => newestAuditEntryText(page, publications.last(), 'update'), READ).toContain(omschrijving)
})

Then('the audit log shows a withdrawal entry for the publicatie', async ({ page, publications }) => {
  // A withdrawal is an update whose snapshot carries the new publicatiestatus.
  await expect.poll(() => newestAuditEntryText(page, publications.last(), 'update'), READ).toContain('ingetrokken')
})

Then('the audit log shows a deletion entry for the publicatie', async ({ page, publications }) => {
  // The titel survives the deletion in the entry's cached object repr, which is
  // exactly what the admin search matches on.
  await expect.poll(() => auditEntryCount(page, publications.last(), 'delete'), READ).toBeGreaterThan(0)
})

// --- Burgerportaal visibility ----------------------------------------------
//
// Addressed by uuid (`/publicaties/<uuid>`), never through the portal search: the
// woo-search index is not active on this stack, so a search-based check would
// find nothing either way — and would make the "no longer shows" assertion pass
// vacuously. The detail page is fetched live from the publicatiebank API.

/** Body text of the burgerportaal detail page of the publicatie under test. */
async function burgerportaalDetailText(page: Page, uuid: string): Promise<string | null> {
  await page.goto(`${burg}/publicaties/${uuid}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  return page.locator('body').textContent()
}

Then('the Burgerportaal shows the new omschrijving for the publicatie', async ({ page, scratch }) => {
  const uuid = scratch.get('pub:uuid')!
  const omschrijving = scratch.get('pub:omschrijving')!
  await expect.poll(() => burgerportaalDetailText(page, uuid), LIVE).toContain(omschrijving)
})

Then('the Burgerportaal no longer shows the publicatie', async ({ page, scratch }) => {
  const uuid = scratch.get('pub:uuid')!
  // A deleted publicatie 404s on the API, which the portal renders as its
  // "niet (meer) beschikbaar" alert.
  await expect.poll(() => burgerportaalDetailText(page, uuid), LIVE).toContain('niet (meer) beschikbaar')
})

// --- Read-only after withdrawal --------------------------------------------

Then('the publicatie change form is read-only', async ({ page, publications }) => {
  await expect.poll(() => publicationFormIsReadOnly(page, publications.last()), READ).toBe(true)
})

// --- Find-then-open flow ---------------------------------------------------

When('I search the admin for the publicatie and open it', async ({ page, publications }) => {
  await searchPublicationAdmin(page, publications.last())
  await openFirstPublicationResult(page)
})

Then('the publicatie change form is shown', async ({ page, publications }) => {
  await expect(page.locator('#id_officiele_titel')).toHaveValue(publications.last())
})
