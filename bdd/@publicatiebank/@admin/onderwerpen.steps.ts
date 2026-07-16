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
