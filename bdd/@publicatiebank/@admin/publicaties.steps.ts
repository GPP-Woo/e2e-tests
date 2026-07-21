import {
  addPublishedPublication,
  publicationExistsAdmin,
  publicationOmschrijvingAdmin,
  publicationStatusAdmin,
} from '@/bdd/@publicatiebank/support/publication'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 9 (publicatie beheer) steps. Publicaties are seeded and cleaned up
 * over the admin by the `publications` fixture; the beheer *mutations* run
 * through the Django admin via Stagehand `act()` behind the `pubAdmin` fixture
 * (a ready-built {@link AdminDriver} bound to `adminStagehand`), and assertions
 * read the admin back through the ordinary session-authenticated `page` (stable,
 * unlike the token API while Stagehand drives the same server — see README
 * "Known server flake").
 *
 * The `@ai` skip guard (no OpenRouter key → skip) and the `adminStagehand`
 * fixture are shared with the organisatie/onderwerp steps (see steps.ts).
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

// Prerequisites (deterministic, not the action under test), seeded through the
// admin add form — the token API is unusable while Stagehand drives the admin.
Given('a concept publicatie', async ({ publications }) => {
  await publications.seed()
})

// A gepubliceerd publicatie, seeded deterministically through the admin (needs a
// publisher organisatie + an informatiecategorie); the withdraw is the mutation
// under test.
Given('a published publicatie', async ({ page, publications, organisations }) => {
  const orgNaam = await organisations.add()
  const titel = publications.freshName()
  await addPublishedPublication(page, titel, orgNaam)
  publications.track(titel)
})

// --- Edit omschrijving ------------------------------------------------------

When('I change the publicatie omschrijving through the admin', async ({ pubAdmin, publications, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('pub:omschrijving', omschrijving)
  await pubAdmin.open(publications.last())
  await pubAdmin.act(`Replace the contents of the "Omschrijving" field with: ${omschrijving}`)
  await pubAdmin.save()
})

Then('the publicatie has the new omschrijving', async ({ page, publications, scratch }) => {
  const titel = publications.last()
  const expected = scratch.get('pub:omschrijving')!
  await expect.poll(() => publicationOmschrijvingAdmin(page, titel), READ).toContain(expected)
})

// --- Rename -----------------------------------------------------------------

When('I rename the publicatie through the admin', async ({ pubAdmin, publications, scratch }) => {
  const oldTitel = publications.last()
  const newTitel = `${publications.freshName()} hernoemd`
  scratch.set('pub:oldTitel', oldTitel)
  await pubAdmin.open(oldTitel)
  await pubAdmin.act(`Replace the contents of the "Officiële titel" field with: ${newTitel}`)
  await pubAdmin.save()
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

When('I set the publicatiestatus to {string} and save the publicatie', async ({ pubAdmin, publications }, label: string) => {
  await pubAdmin.open(publications.last())
  // The publicatiestatus is a native <select>; set it deterministically (act() on
  // the status dropdown is the flakiest AI step — see documenten-steps.ts, which
  // does the same). open() settles the change page first, so the understudy
  // locator finds the rendered <select>. Option value = lowercased label
  // (gepubliceerd / ingetrokken / concept). Stagehand still opens + saves.
  await pubAdmin.page.locator('#id_publicatiestatus').selectOption(label.toLowerCase())
  await pubAdmin.save()
})

Then('the publicatie has status {string}', async ({ page, publications }, status: string) => {
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe(status)
})

// --- Delete -----------------------------------------------------------------

When('I delete the publicatie through the admin', async ({ pubAdmin, publications }) => {
  await pubAdmin.open(publications.last())
  await pubAdmin.removeCurrent()
})

Then('the publicatie no longer exists', async ({ page, publications }) => {
  const titel = publications.last()
  await expect.poll(() => publicationExistsAdmin(page, titel), READ).toBe(false)
})

// --- Search (UI read under test) --------------------------------------------

When('I search the admin for the publicatie', async ({ pubAdmin, publications }) => {
  await pubAdmin.search(publications.last())
})

Then('the publicatie is shown in the admin results', async ({ page, publications }) => {
  const titel = publications.last()
  expect(await publicationExistsAdmin(page, titel)).toBe(true)
})

// ===========================================================================
// @todo gap scenarios (TS9). Skipped by the global Before({tags:'@todo'}) hook
// until implemented. Each body throws with the intended implementation.
// ===========================================================================

// --- Edit remaining metadata fields + persist-after-reopen -----------------

When('I change the {string} of the publicatie through the admin', async ({ pubAdmin, publications, scratch }, field: string) => {
  // Impl: pubAdmin.open(publications.last()); act() a field-specific new value
  // (select2 for informatiecategorieën/onderwerpen, raw-id for publisher/
  // verantwoordelijke/eigenaar, date input, plain text for verkorte titel/
  // kenmerken); stash it in scratch under `pub:field:<field>`; then save().
  void field; void pubAdmin; void publications; void scratch
  throw new Error('TODO: edit the given metadata field of publications.last() via pubAdmin and stash the new value in scratch')
})

Then('the {string} persists after reopening the publicatie', async ({ page, publications, scratch }, field: string) => {
  // Impl: reopen publications.last() through the session `page` and assert the
  // field-specific read (new support helper e.g. publicationFieldAdmin) equals
  // the value stashed under `pub:field:<field>` — via expect.poll(..., READ).
  void field; void page; void publications; void scratch
  throw new Error('TODO: reopen the publicatie and assert the edited field equals the scratch-stashed value')
})

// --- Bulk eigenaar (groep) change (March 2026) -----------------------------

When('I bulk-change the eigenaar groep from the publicatie changelist', async ({ pubAdmin, publications, scratch }) => {
  // Impl: open the publicatie changelist, tick publications.last()'s row, pick
  // the "eigenaar (groep) wijzigen" admin bulk action, choose a groep and
  // confirm; stash the chosen groep under `pub:field:eigenaar (groep)`.
  void pubAdmin; void publications; void scratch
  throw new Error('TODO: run the eigenaar-groep bulk action on the changelist for publications.last()')
})

// --- Audit logging ---------------------------------------------------------

Then('the audit log shows an edit entry for the publicatie', async ({ page, publications }) => {
  // Impl: goto /admin/logging/timelinelogproxy (audit logitems), filter q=titel,
  // assert a row with an "update"/"gewijzigd" action for publications.last().
  void page; void publications
  throw new Error('TODO: assert the audit logitems list has an update entry for publications.last()')
})

Then('the audit log shows a withdrawal entry for the publicatie', async ({ page, publications }) => {
  // Impl: same audit logitems list; assert an entry whose change sets
  // publicatiestatus -> ingetrokken for publications.last().
  void page; void publications
  throw new Error('TODO: assert the audit logitems list records the withdrawal of publications.last()')
})

Then('the audit log shows a deletion entry for the publicatie', async ({ page, publications }) => {
  // Impl: same audit logitems list; assert a "delete"/"verwijderd" action entry
  // for the (now-deleted) publications.last() titel survives after deletion.
  void page; void publications
  throw new Error('TODO: assert the audit logitems list records the deletion of publications.last()')
})

// --- Burgerportaal visibility ----------------------------------------------

Then('the Burgerportaal shows the new omschrijving for the publicatie', async ({ page, publications, scratch }) => {
  // Impl: goto ENV.apps.burgerportaal, search publications.last(), open the
  // detail page and assert it contains scratch.get('pub:omschrijving').
  void page; void publications; void scratch
  throw new Error('TODO: assert the Burgerportaal detail page shows the edited omschrijving')
})

Then('the Burgerportaal no longer shows the publicatie', async ({ page, publications }) => {
  // Impl: goto ENV.apps.burgerportaal, search publications.last() and assert it
  // returns no results (expect.poll for cache/index lag, per manual F5 tip).
  void page; void publications
  throw new Error('TODO: assert the Burgerportaal search no longer returns publications.last()')
})

// --- Read-only after withdrawal --------------------------------------------

Then('the publicatie change form is read-only', async ({ page, publications }) => {
  // Impl: open publications.last() change form; assert the mutable fields
  // (#id_officiele_titel etc.) are disabled/absent and no _save button shows.
  void page; void publications
  throw new Error('TODO: assert the withdrawn publicatie change form exposes no editable fields')
})

// --- Find-then-open flow ---------------------------------------------------

When('I search the admin for the publicatie and open it', async ({ pubAdmin, publications }) => {
  // Impl: pubAdmin.search(publications.last()) then click the matching result
  // row link to land on the change form (pubAdmin.open reuses this navigation).
  void pubAdmin; void publications
  throw new Error('TODO: search the admin for publications.last() and open the matching result')
})

Then('the publicatie change form is shown', async ({ page, publications }) => {
  // Impl: assert the change form for publications.last() is open — the
  // #id_officiele_titel input value equals the titel.
  void page; void publications
  throw new Error('TODO: assert the change form for publications.last() is displayed')
})
