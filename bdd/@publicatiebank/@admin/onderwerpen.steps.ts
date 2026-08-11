import { resolveOnderwerpUuid } from '@/bdd/@gpp-app/support/usergroup'
import { openAdminSection } from '@/bdd/@publicatiebank/support/login'
import { TOPIC_IMAGE, topicExists, topicIsPromoted, topicOmschrijving } from '@/bdd/@publicatiebank/support/topic'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest, expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 3 (onderwerpen) steps. UI *mutations* run through the Django admin
 * with plain Playwright locators — the shared changelist mechanics (search, open
 * a row, save, delete-with-confirm) behind the `topicAdmin` fixture (a
 * ready-built {@link AdminDriver}), the per-field edits inline here. The
 * mandatory afbeelding on the add form is set straight on the <input type=file>,
 * since a file-picker cannot be driven any other way.
 *
 * Assertions read the admin back through the same session-authenticated `page`
 * rather than the token API, which is unreliable while an admin session mutates
 * the same server (see README "Known server flake").
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

Given('the publicatiebank onderwerp admin is open', async ({ topicAdmin }) => {
  await topicAdmin.openList()
})

// Prerequisite (deterministic, not the action under test).
Given('an onderwerp', async ({ topics }) => {
  await topics.add()
})

// --- Add (full add form here, not via the driver; image via setInputFiles) --

When('I add an onderwerp through the admin', async ({ page, topics }) => {
  const titel = topics.freshName()
  const omschrijving = `E2E omschrijving ${Date.now()}`

  await page.getByRole('link', { name: 'Dashboard' }).click()
  await openAdminSection(page, 'Publicaties', 'Onderwerpen')
  await page.getByRole('link', { name: 'onderwerp toevoegen' }).click()

  // File carve-out: set the required afbeelding bytes directly on the input.
  await page.locator('#id_afbeelding').setInputFiles(TOPIC_IMAGE)

  await page.getByRole('textbox', { name: 'Officiële titel:' }).fill(titel)
  await page.getByRole('textbox', { name: 'Omschrijving:' }).fill(omschrijving)
  await page.getByLabel('Status:').selectOption('concept')

  await page.getByRole('button', { name: 'Opslaan', exact: true }).click()

  topics.track(titel)
})

Then('the onderwerp exists in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicExists(page, titel), READ).toBe(true)
})

// --- Promote ---------------------------------------------------------------

When('I tick the {string} checkbox and save the onderwerp', async ({ page, topicAdmin, topics }, label: string) => {
  await topicAdmin.open(topics.last())
  await page.getByRole('checkbox', { name: label }).check()
  await topicAdmin.save()
})

Then('the onderwerp is promoted in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicIsPromoted(page, titel), READ).toBe(true)
})

// --- Edit omschrijving -----------------------------------------------------

When('I change the onderwerp omschrijving and save it', async ({ page, topicAdmin, topics, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('topic:omschrijving', omschrijving)
  await topicAdmin.open(topics.last())
  await page.locator('#id_omschrijving').fill(omschrijving)
  await topicAdmin.save()
})

Then('the onderwerp has the new omschrijving in the API', async ({ page, topics, scratch }) => {
  const titel = topics.last()
  const expected = scratch.get('topic:omschrijving')!
  await expect.poll(() => topicOmschrijving(page, titel), READ).toContain(expected)
})

// --- Delete ----------------------------------------------------------------

When('I delete the onderwerp through the admin', async ({ topicAdmin, topics }) => {
  await topicAdmin.open(topics.last())
  await topicAdmin.removeCurrent()
})

Then('the onderwerp no longer exists in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicExists(page, titel), READ).toBe(false)
})

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the onderwerp', async ({ topicAdmin, topics }) => {
  await topicAdmin.search(topics.last())
})

Then('the onderwerp is shown in the admin results', async ({ page, topics }) => {
  const titel = topics.last()
  // The admin search box ran above; confirm the onderwerp is findable through
  // the admin (topicExists searches the changelist too).
  expect(await topicExists(page, titel)).toBe(true)
})

// --- Sort (UI read under test) ---------------------------------------------

When('I sort the onderwerpen list by titel', async ({ page }) => {
  await page.getByRole('link', { name: 'Officiële titel', exact: true }).click()
})

Then('the onderwerpen are listed in alphabetical order by titel', async ({ page }) => {
  const titels = await page.locator('th.field-officiele_titel a').allTextContents()
  const sorted = [...titels].sort((a, b) => a.localeCompare(b))
  expect(titels).toEqual(sorted)
})

// --- Filter (UI read under test) -------------------------------------------

When('I filter the onderwerpen list in the admin', async ({ page }) => {
  await page.getByRole('link', { name: 'Concept' }).click()
})

Then('only onderwerpen matching the filter remain visible', async ({ page }) => {
  const statuses = await page.locator('.field-publicatiestatus').allTextContents()
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.every(status => status.trim() === 'Concept')).toBe(true)
})

// --- Compare with the GPP-app (cross-application) --------------------------
// The gebruikersgroep authorisatie UI lists onderwerpen from the same odpc
// waardelijst (`/api/v2/onderwerpen`) that resolveOnderwerpUuid reads — assert
// against that rather than driving the SPA form (TS5 covers the UI).

When('I open a GPP-app gebruikersgroep to compare onderwerpen', async ({ topics, scratch }) => {
  const titel = topics.last()
  const ctx = await apiRequest.newContext({ storageState: adminState })
  try {
    await expect.poll(() => resolveOnderwerpUuid(ctx, titel).then(() => true, () => false), READ).toBe(true)
    scratch.set('gpp:onderwerpUuid', await resolveOnderwerpUuid(ctx, titel))
    scratch.set('gpp:onderwerpTitel', titel)
  }
  finally {
    await ctx.dispose()
  }
})

Then('the onderwerp appears in the gebruikersgroep onderwerpen in the GPP-app', async ({ topics, scratch }) => {
  expect(scratch.get('gpp:onderwerpTitel')).toBe(topics.last())
  expect(scratch.get('gpp:onderwerpUuid')).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  )
})

// --- Logging after edit ("Toon logs", UI read under test) ------------------

When('I open the "Toon logs" view for the onderwerp', async ({ page, topics }) => {
  const titel = topics.last()
  await page.getByRole('row', { name: titel }).getByRole('link', { name: 'Toon logs' }).click()
})

Then('the omschrijving edit is recorded in the onderwerp logs', async ({ page, scratch }) => {
  const expected = scratch.get('topic:omschrijving')!
  // The cell itself is not clickable — the row's link opens the log detail.
  const row = page.getByRole('row').filter({ hasText: 'Record bijgewerkt' }).first()
  await expect(row).toBeVisible()
  await row.getByRole('link').first().click()
  await expect(page.getByText(expected).first()).toBeVisible()
})

// --- Audit logging after delete (Logging tab → (audit)logitems) ------------

When('I open the onderwerp audit log', async ({ page }) => {
  await page.goto(new URL('/admin/', ENV.apps.publicatiebank).href)
  await openAdminSection(page, 'Logging', '(audit)logitems')
})

Then('the onderwerp deletion is recorded in the audit log', async ({ page, topics }) => {
  const titel = topics.last()
  // Django's built-in changelist search box: a stable id across every admin
  // changelist, regardless of theme.
  await page.locator('#searchbar').fill(titel)
  await page.locator('#searchbar').press('Enter')
  const entries = page.getByRole('row', { name: titel }).filter({ hasText: 'verwijderd' })
  await expect(entries.first()).toBeVisible()
})
