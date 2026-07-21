import { documentExistsAdmin, documentStatusAdmin, openDocumentAdmin, seedPublishedDocument } from '@/bdd/@publicatiebank/support/document'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 8 (document beheer) steps. A published document is seeded through the
 * token API (`documents` fixture tracks it for admin cleanup); the beheer
 * mutations run through the Django admin via Stagehand `act()` behind the
 * `docAdmin` fixture, and assertions read the admin back through the ordinary
 * session-authenticated `page` (stable, unlike the token API while Stagehand
 * drives the same server — see README "Known server flake").
 *
 * The `@ai` skip guard (no OpenRouter key → skip) and the `adminStagehand`
 * fixture are shared with the organisatie/onderwerp/publicatie steps (see steps.ts).
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

// Prerequisite (deterministic, not the action under test): a gepubliceerd
// publicatie owning a gepubliceerd document with real uploaded content. Seeded
// through the token API — the admin add form cannot register a document in the
// Documenten API (the informatieobjecttype URL host would not resolve; see
// support/document.ts).
Given('a published document', async ({ organisations, publications, documents }) => {
  const orgNaam = await organisations.add()
  const publicatieTitel = publications.freshName()
  const documentTitel = documents.freshName()
  await seedPublishedDocument(publicatieTitel, documentTitel, orgNaam)
  publications.track(publicatieTitel)
  documents.track(documentTitel)
})

// --- Withdraw (intrekken) ---------------------------------------------------

When('I withdraw the document through the admin', async ({ page, docAdmin, documents }) => {
  // Open the change page deterministically via the session `page` (same tab as
  // Stagehand after CDP adoption) — the act() row-click did not reliably land on
  // the *document* change page. The publicatiestatus is a native <select>; set it
  // deterministically too (act() on status dropdowns was the flakiest step).
  await openDocumentAdmin(page, documents.last())
  await page.locator('#id_publicatiestatus').selectOption('ingetrokken')
  await docAdmin.save()
})

Then('the document is no longer public', async ({ page, documents }) => {
  await expect.poll(() => documentStatusAdmin(page, documents.last()), READ).toBe('ingetrokken')
})

// --- Delete -----------------------------------------------------------------

When('I delete the document through the admin', async ({ page, docAdmin, documents }) => {
  await openDocumentAdmin(page, documents.last())
  await docAdmin.removeCurrent()
})

Then('the document no longer exists', async ({ page, documents }) => {
  await expect.poll(() => documentExistsAdmin(page, documents.last()), READ).toBe(false)
})

// === @todo — TS8 coverage gaps =============================================
// New scenarios below are @todo (skipped by the global Before hook in
// _core/todo.steps.ts). Bodies throw until implemented; each comment notes the
// intended implementation.

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the document', async ({ docAdmin, documents }) => {
  // Drive the changelist search box via Stagehand: await docAdmin.search(documents.last()).
  throw new Error('TODO: run docAdmin.search(documents.last()) on the document changelist')
})

Then('the document is shown in the admin results', async ({ page, documents }) => {
  // Confirm deterministically via documentExistsAdmin(page, documents.last()) === true.
  throw new Error('TODO: assert documentExistsAdmin(page, documents.last()) is true')
})

// --- Edit metadata ----------------------------------------------------------

When('I edit the document metadata through the admin', async ({ page, docAdmin, documents, scratch }) => {
  // openDocumentAdmin(page, documents.last()); Stagehand act() to replace officiële
  // titel / verkorte titel / omschrijving with fresh values; docAdmin.save().
  // Store the new officiële titel in scratch (documents.track it) for the assertion.
  throw new Error('TODO: open the document change page, edit its metadata fields via docAdmin.act, save, and stash the new titel in scratch')
})

Then('the document shows the edited metadata when reopened', async ({ page, scratch }) => {
  // Reopen the change page and poll the field values (read through the session page)
  // against the values stashed in scratch by the edit step.
  throw new Error('TODO: reopen the document and assert its fields match the edited values from scratch')
})

// --- Edit kenmerken ---------------------------------------------------------

When('I edit the document kenmerken through the admin', async ({ page, docAdmin, documents, scratch }) => {
  // openDocumentAdmin(page, documents.last()); use docAdmin.act to add/change/remove
  // a kenmerk (bron + kenmerk inline rows); docAdmin.save(); stash the value in scratch.
  throw new Error('TODO: open the document, add/change/remove a kenmerk via docAdmin.act, save, and stash the kenmerk in scratch')
})

Then('the document shows the edited kenmerken when reopened', async ({ page, scratch }) => {
  // Reopen the change page and assert the kenmerk inline rows match scratch.
  throw new Error('TODO: reopen the document and assert its kenmerken match the value stashed in scratch')
})

// --- Logs (Toon logs / audit) ----------------------------------------------

When('I open the document logs through the admin', async ({ page, documents }) => {
  // Navigate to the document's "Toon logs" view (the logging changelist filtered to
  // this object) through the session page, e.g. via a logs helper in support/document.ts.
  throw new Error('TODO: open the document logging view for documents.last() through the admin')
})

Then('the document logs list the document', async ({ page, documents }) => {
  // Assert the logging changelist contains an entry referencing documents.last().
  throw new Error('TODO: assert the logging list contains a row for documents.last()')
})

// --- Burgerportaal verification --------------------------------------------

Then('the edited metadata is visible in the Burgerportaal', async ({ sitemap, scratch }) => {
  // Fetch the burgerportaal sitemap/detail for the document and assert the edited
  // titel from scratch appears in the public body (sitemap.get(...) then check body).
  throw new Error('TODO: fetch the burgerportaal resource and assert it shows the edited titel from scratch')
})

Then('the document is no longer visible in the Burgerportaal', async ({ sitemap, documents }) => {
  // Fetch the burgerportaal sitemap and assert documents.last() is absent from the body.
  throw new Error('TODO: fetch the burgerportaal sitemap and assert documents.last() is no longer listed')
})

// --- Read-only after withdraw ----------------------------------------------

Then('the document can no longer be edited', async ({ page, documents }) => {
  // Reopen the change page for the ingetrokken document and assert its fields are
  // read-only / disabled (e.g. #id_officiele_titel is readonly or the save button is absent).
  throw new Error('TODO: reopen the withdrawn document and assert its fields are read-only')
})

// --- Audit log after withdraw / delete -------------------------------------

Then('the withdrawal is recorded in the audit log', async ({ page, documents }) => {
  // Open the (audit)logitems changelist, search documents.last(), assert an entry
  // recording the status change to ingetrokken is present.
  throw new Error('TODO: assert the audit log contains a withdrawal entry for documents.last()')
})

Then('the deletion is recorded in the audit log', async ({ page, documents }) => {
  // Open the (audit)logitems changelist, search documents.last(), assert a deletion
  // entry is present (reads through the session page after docAdmin deleted the row).
  throw new Error('TODO: assert the audit log contains a deletion entry for documents.last()')
})

// --- Edit / delete from within the publication -----------------------------

When('I edit the document from within its publication through the admin', async ({ page, docAdmin, publications, documents, scratch }) => {
  // Open the publications.last() change page, scroll to the document inline, edit its
  // titel/omschrijving via docAdmin.act, save; stash the new titel in scratch for reuse
  // by "the document shows the edited metadata when reopened".
  throw new Error('TODO: edit the document inline on the publicatie change page via docAdmin.act, save, and stash the new titel in scratch')
})

When('I delete the document from within its publication through the admin', async ({ page, docAdmin, publications, documents }) => {
  // Open the publications.last() change page, tick the document inline "Verwijderen"
  // checkbox via docAdmin.act, and docAdmin.save().
  throw new Error('TODO: tick the document inline "Verwijderen" checkbox on the publicatie change page and save')
})
