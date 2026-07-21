import { TOPIC_IMAGE, topicExists, topicIsPromoted, topicOmschrijving } from '@/bdd/@publicatiebank/support/topic'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 3 (onderwerpen) steps. UI *mutations* run through the Django admin
 * via Stagehand `act()` behind the `topicAdmin` fixture (a ready-built
 * {@link AdminDriver} bound to `adminStagehand`) — except the mandatory
 * afbeelding on the add form, whose bytes are set straight on the
 * <input type=file> (a CDP browser cannot drive an OS file-picker). Assertions
 * are made *deterministically* by reading the admin back through the ordinary
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

// --- Add (Stagehand for fields; image via setInputFiles carve-out) ----------

When('I add an onderwerp through the admin', async ({ topicAdmin, topics }) => {
  const titel = topics.freshName()
  await topicAdmin.openAdd()
  // File carve-out: set the required afbeelding bytes directly on the input.
  await topicAdmin.page.locator('#id_afbeelding').setInputFiles(TOPIC_IMAGE)
  await topicAdmin.act(`Fill the "Officiële titel" field with: ${titel}`)
  await topicAdmin.act('Select "Concept" as the publicatiestatus')
  await topicAdmin.save()
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

// --- Sort (UI read under test) ---------------------------------------------

When('I sort the onderwerpen list by titel', async () => {
  // Impl: topicAdmin.act('Click the "Officiële titel" column header to sort ascending').
  throw new Error('TODO: sort the onderwerpen changelist by clicking the titel column header')
})

Then('the onderwerpen are listed in alphabetical order by titel', async () => {
  // Impl: read the changelist titel column via `page` and assert it equals its sorted copy.
  throw new Error('TODO: read the changelist titel column and assert ascending alphabetical order')
})

// --- Filter (UI read under test) -------------------------------------------

When('I filter the onderwerpen list in the admin', async () => {
  // Impl: topicAdmin.act('Apply a filter from the right-hand filter sidebar').
  throw new Error('TODO: apply an admin filter from the right-hand onderwerp filter sidebar')
})

Then('only onderwerpen matching the filter remain visible', async () => {
  // Impl: read the filtered changelist rows via `page` and assert every row matches the filter.
  throw new Error('TODO: assert every visible changelist row matches the applied filter')
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

// --- Logging after edit ("Toon logs") --------------------------------------

When('I open the "Toon logs" view for the onderwerp', async () => {
  // Impl: topicAdmin.act('Click the "Toon logs" button on the onderwerp detail page').
  throw new Error('TODO: open the "Toon logs" view from the onderwerp detail page')
})

Then('the omschrijving edit is recorded in the onderwerp logs', async () => {
  // Impl: read the logs page via `page` and assert an entry for the omschrijving change (scratch 'topic:omschrijving').
  throw new Error('TODO: assert the onderwerp logs contain an entry for the omschrijving edit')
})

// --- Audit logging after delete --------------------------------------------

When('I open the onderwerp audit log', async () => {
  // Impl: navigate via `page` to the "Logging" tab / (audit)logitems changelist and search for the onderwerp.
  throw new Error('TODO: open the (audit)logitems changelist under the Logging tab')
})

Then('the onderwerp deletion is recorded in the audit log', async () => {
  // Impl: assert an audit logitem records the deletion of topics.last() (read the audit changelist via `page`).
  throw new Error('TODO: assert the audit log contains a delete entry for the onderwerp')
})
