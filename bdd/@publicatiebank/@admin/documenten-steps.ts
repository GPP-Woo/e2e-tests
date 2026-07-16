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
