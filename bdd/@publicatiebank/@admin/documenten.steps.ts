import type { Page } from '@playwright/test'
import { auditEntryCount, newestAuditEntryText } from '@/bdd/@publicatiebank/support/audit-log'
import {
  documentExistsAdmin,
  documentFormIsReadOnly,
  documentStatusAdmin,
  documentUuidAdmin,
  openDocumentAdmin,
  openDocumentLogsAdmin,
  seedPublishedDocument,
} from '@/bdd/@publicatiebank/support/document'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 8 (document beheer) steps. A published document is seeded through the
 * token API (`documents` fixture tracks it for admin cleanup); the beheer
 * mutations run through the Django admin with plain Playwright locators behind
 * the `docAdmin` fixture, and assertions read the admin back through the same
 * session-authenticated `page` (stable, unlike the token API while an admin
 * session mutates the same server — see README "Known server flake").
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }
// The burgerportaal renders a document from a live API call to the
// publicatiebank, but it is an SPA behind a proxy — allow a few seconds and a
// reload, as the publicatie burgerportaal scenarios do.
const LIVE = { timeout: 30_000, intervals: [1000, 2000, 3000] }
const burg = ENV.apps.burgerportaal.replace(/\/$/, '')

/** Body text of the burgerportaal detail page of the document under test. */
async function burgerportaalDocumentText(page: Page, uuid: string): Promise<string | null> {
  await page.goto(`${burg}/documenten/${uuid}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  return page.locator('body').textContent()
}

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
  // The publicatiestatus is a native <select>, so set it directly; the driver
  // only owns the shared changelist mechanics (open the row, save).
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

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the document', async ({ docAdmin, documents }) => {
  await docAdmin.search(documents.last())
})

Then('the document is shown in the admin results', async ({ page, documents }) => {
  expect(await documentExistsAdmin(page, documents.last())).toBe(true)
})

// --- Edit metadata ----------------------------------------------------------

When('I edit the document metadata through the admin', async ({ page, docAdmin, documents, scratch }) => {
  const oldTitel = documents.last()
  const newTitel = `${documents.freshName()} hernoemd`
  const verkorte = `E2E verkort ${Date.now()}`
  const omschrijving = `E2E omschrijving ${Date.now()}`
  // Stash uuid while the document still exists under its old titel — needed by
  // the burgerportaal assertion after the rename.
  const uuid = await documentUuidAdmin(page, oldTitel)
  if (!uuid)
    throw new Error(`Document "${oldTitel}" has no uuid on the change form`)
  scratch.set('doc:uuid', uuid)
  scratch.set('doc:officiele_titel', newTitel)
  scratch.set('doc:verkorte_titel', verkorte)
  scratch.set('doc:omschrijving', omschrijving)
  await openDocumentAdmin(page, oldTitel)
  await page.locator('#id_officiele_titel').fill(newTitel)
  await page.locator('#id_verkorte_titel').fill(verkorte)
  await page.locator('#id_omschrijving').fill(omschrijving)
  await docAdmin.save()
  // Track the new titel so cleanup deletes the renamed document too.
  documents.track(newTitel)
})

Then('the document shows the edited metadata when reopened', async ({ page, documents, scratch }) => {
  const titel = scratch.get('doc:officiele_titel') ?? documents.last()
  const verkorte = scratch.get('doc:verkorte_titel')!
  const omschrijving = scratch.get('doc:omschrijving')!
  await expect.poll(async () => {
    if (!(await documentExistsAdmin(page, titel)))
      return ''
    await openDocumentAdmin(page, titel)
    return page.locator('#id_officiele_titel').inputValue()
  }, READ).toBe(titel)
  await expect(page.locator('#id_verkorte_titel')).toHaveValue(verkorte)
  await expect(page.locator('#id_omschrijving')).toHaveValue(omschrijving)
})

// --- Edit kenmerken ---------------------------------------------------------

When('I edit the document kenmerken through the admin', async ({ page, docAdmin, documents, scratch }) => {
  const kenmerk = `E2E kenmerk ${Date.now()}`
  const bron = 'E2E bron'
  scratch.set('doc:kenmerk', kenmerk)
  await openDocumentAdmin(page, documents.last())
  // Kenmerken are a DocumentIdentifier inline with `extra = 0`, so an existing
  // document without identifiers renders no empty row to fill.
  const first = page.locator('#id_documentidentifier_set-0-kenmerk')
  if ((await first.count()) === 0)
    await page.locator('#documentidentifier_set-group .add-row a').click()
  await page.locator('#id_documentidentifier_set-0-kenmerk').fill(kenmerk)
  await page.locator('#id_documentidentifier_set-0-bron').fill(bron)
  await docAdmin.save()
})

Then('the document shows the edited kenmerken when reopened', async ({ page, documents, scratch }) => {
  const expected = scratch.get('doc:kenmerk')!
  await expect.poll(async () => {
    await openDocumentAdmin(page, documents.last())
    return page.locator('#id_documentidentifier_set-0-kenmerk').inputValue()
  }, READ).toBe(expected)
})

// --- Logs (Toon logs / audit) ----------------------------------------------

When('I open the document logs through the admin', async ({ page, documents }) => {
  await openDocumentLogsAdmin(page, documents.last())
})

Then('the document logs list the document', async ({ page, documents }) => {
  const titel = documents.last()
  await expect(page.getByRole('row').filter({ hasText: titel }).first()).toBeVisible()
})

// --- Burgerportaal verification --------------------------------------------

Then('the edited metadata is visible in the Burgerportaal', async ({ page, scratch }) => {
  const uuid = scratch.get('doc:uuid')!
  const titel = scratch.get('doc:officiele_titel')!
  await expect.poll(() => burgerportaalDocumentText(page, uuid), LIVE).toContain(titel)
})

Then('the document is no longer visible in the Burgerportaal', async ({ page, documents, scratch }) => {
  // Prefer a uuid stashed earlier; otherwise read it from the (still present)
  // withdrawn document's change form.
  let uuid = scratch.get('doc:uuid')
  if (!uuid) {
    uuid = await documentUuidAdmin(page, documents.last())
    if (!uuid)
      throw new Error(`Document "${documents.last()}" has no uuid on the change form`)
    scratch.set('doc:uuid', uuid)
  }
  // A withdrawn document 404s on the burgerportaal API (non-gepubliceerd), which
  // the portal renders as its "niet (meer) beschikbaar" alert.
  await expect.poll(() => burgerportaalDocumentText(page, uuid!), LIVE).toContain('niet (meer) beschikbaar')
})

// --- Read-only after withdraw ----------------------------------------------

Then('the document can no longer be edited', async ({ page, documents }) => {
  await expect.poll(() => documentFormIsReadOnly(page, documents.last()), READ).toBe(true)
})

// --- Audit log after withdraw / delete -------------------------------------

Then('the withdrawal is recorded in the audit log', async ({ page, documents }) => {
  // A withdrawal is an update whose snapshot carries the new publicatiestatus.
  await expect.poll(() => newestAuditEntryText(page, documents.last(), 'update'), READ).toContain('ingetrokken')
})

Then('the deletion is recorded in the audit log', async ({ page, documents }) => {
  // The titel survives the deletion in the entry's cached object repr, which is
  // exactly what the admin search matches on.
  await expect.poll(() => auditEntryCount(page, documents.last(), 'delete'), READ).toBeGreaterThan(0)
})

// --- Edit / delete from within the publication -----------------------------
//
// DocumentInlineAdmin is read-only (no editable fields, can_delete=False). The
// inline exposes a title link to the document change page and a Verwijderen
// link to the document delete confirmation — that is the "from within its
// publication" entry point under test.

When('I edit the document from within its publication through the admin', async ({ page, pubAdmin, docAdmin, publications, documents, scratch }) => {
  const oldTitel = documents.last()
  const newTitel = `${documents.freshName()} via-pub`
  const verkorte = `E2E verkort ${Date.now()}`
  const omschrijving = `E2E omschrijving ${Date.now()}`
  scratch.set('doc:officiele_titel', newTitel)
  scratch.set('doc:verkorte_titel', verkorte)
  scratch.set('doc:omschrijving', omschrijving)
  await pubAdmin.open(publications.last())
  await page.locator('#document_set-group').getByRole('link', { name: oldTitel }).click()
  await page.locator('#id_officiele_titel').fill(newTitel)
  await page.locator('#id_verkorte_titel').fill(verkorte)
  await page.locator('#id_omschrijving').fill(omschrijving)
  await docAdmin.save()
  documents.track(newTitel)
})

When('I delete the document from within its publication through the admin', async ({ page, pubAdmin, publications, documents }) => {
  const titel = documents.last()
  await pubAdmin.open(publications.last())
  // The inline Delete link uses target="_blank"; follow its href in-tab so the
  // confirmation stays on the same Playwright page.
  const href = await page.locator('#document_set-group')
    .getByRole('row', { name: titel })
    .getByRole('link', { name: 'Verwijderen' })
    .getAttribute('href')
  if (!href)
    throw new Error(`No Verwijderen link for document "${titel}" in the publication inline`)
  await page.goto(new URL(href, ENV.apps.publicatiebank).href)
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
})
