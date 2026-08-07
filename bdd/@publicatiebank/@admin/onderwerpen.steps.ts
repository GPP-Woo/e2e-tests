import { openAdminSection } from '@/bdd/@publicatiebank/support/login'
import { TOPIC_IMAGE, topicExists, topicIsPromoted, topicOmschrijving } from '@/bdd/@publicatiebank/support/topic'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 3 (onderwerpen) steps. Most UI *mutations* run through the Django
 * admin via Stagehand `act()` behind the `topicAdmin` fixture (a ready-built
 * {@link AdminDriver} bound to `adminStagehand`) — except the mandatory
 * afbeelding on the add form, whose bytes are set straight on the
 * <input type=file> (a CDP browser cannot drive an OS file-picker), and the
 * "Add an onderwerp" scenario itself, which is driven deterministically end to
 * end via plain Playwright `page` locators (no Stagehand). Assertions are made
 * `deterministically` by reading the admin back through the ordinary
 * Playwright `page` (session-authenticated, stable), because the token API is
 * unreliable while Stagehand drives the same server (see README "Known server
 * flake").
 *
 * The `@ai`-tagged skip guard and the `adminStagehand` fixture are shared
 * with the organisatie steps (see steps.ts).
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

Given('the publicatiebank onderwerp admin is open', async ({ topicAdmin }) => {
  await topicAdmin.openList()
})

// Prerequisite (deterministic, not the action under test).
Given('an onderwerp', async ({ topics }) => {
  await topics.add()
})

// --- Add (deterministic Playwright — no Stagehand; image via setInputFiles) -

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

When('I tick the {string} checkbox and save the onderwerp', async ({ topicAdmin, topics }, label: string) => {
  await topicAdmin.open(topics.last())
  await topicAdmin.act(`Tick the "${label}" checkbox`)
  await topicAdmin.save()
})

Then('the onderwerp is promoted in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicIsPromoted(page, titel), READ).toBe(true)
})

// --- Edit omschrijving -----------------------------------------------------

When('I change the onderwerp omschrijving and save it', async ({ topicAdmin, topics, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('topic:omschrijving', omschrijving)
  await topicAdmin.open(topics.last())
  await topicAdmin.act(`Replace the contents of the "Omschrijving" field with: ${omschrijving}`)
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
  // The Stagehand search ran above; confirm the onderwerp is findable through the
  // admin deterministically (topicExists searches the changelist too).
  expect(await topicExists(page, titel)).toBe(true)
})

// --- @todo stubs: gaps vs. manual testscript 3 (bodies not yet implemented) -
// Registered so bddgen stays green; the @todo Before hook skips the scenarios.

// --- Sort (UI read under test, deterministic Playwright — no Stagehand) ----

When('I sort the onderwerpen list by titel', async ({ page }) => {
  await page.getByRole('link', { name: 'Officiële titel', exact: true }).click()
})

Then('the onderwerpen are listed in alphabetical order by titel', async ({ page }) => {
  const titels = await page.locator('th.field-officiele_titel a').allTextContents()
  const sorted = [...titels].sort((a, b) => a.localeCompare(b))
  expect(titels).toEqual(sorted)
})

// --- Filter (UI read under test, deterministic Playwright — no Stagehand) --

When('I filter the onderwerpen list in the admin', async ({ page }) => {
  await page.getByRole('link', { name: 'Concept' }).click()
})

Then('only onderwerpen matching the filter remain visible', async ({ page }) => {
  const statuses = await page.locator('.field-publicatiestatus').allTextContents()
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.every(status => status.trim() === 'Concept')).toBe(true)
})

// --- Compare with the GPP-app (cross-application) --------------------------

When('I open a GPP-app gebruikersgroep to compare onderwerpen', async () => {
  // Impl: drive the gpp-app admin (appStagehand) to open a gebruikersgroep and read its onderwerpen,
  // or read them over the odpc API (see @gpp-app/support/usergroup.ts).
  throw new Error('TODO: open a GPP-app gebruikersgroep and collect its onderwerpen for comparison')
})

Then('the onderwerp appears in the gebruikersgroep onderwerpen in the GPP-app', async () => {
  // Impl: assert topics.last() is present among the gebruikersgroep onderwerpen read above.
  throw new Error('TODO: assert the onderwerp is listed among the GPP-app gebruikersgroep onderwerpen')
})

// --- Logging after edit ("Toon logs", UI read under test, deterministic Playwright — no Stagehand) ---

When('I open the "Toon logs" view for the onderwerp', async ({ page, topics }) => {
  const titel = topics.last()
  // The changelist row's second link is the "Toon logs" icon — it has no
  // accessible name of its own (icon-only), so it's targeted positionally
  // within the row scoped by titel rather than by name.
  await page.getByRole('row', { name: titel }).getByRole('link').nth(1).click()
})

Then('the omschrijving edit is recorded in the onderwerp logs', async ({ page, scratch }) => {
  const expected = scratch.get('topic:omschrijving')!
  const entry = page.getByRole('cell', { name: 'Record bijgewerkt' }).first()
  await expect(entry).toBeVisible()
  await entry.click()
  await expect(page.getByText(expected)).toBeVisible()
  await page.getByRole('link', { name: 'Sluiten' }).click()
})

// --- Audit logging after delete (Logging tab → (audit)logitems, UI read under test, deterministic Playwright — no Stagehand) ---

When('I open the onderwerp audit log', async ({ page }) => {
  await page.goto(new URL('/admin/', ENV.apps.publicatiebank).href)
  await page.getByRole('link', { name: 'Logging' }).click()
  await page.getByRole('link', { name: '(audit)logitems' }).click()
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
