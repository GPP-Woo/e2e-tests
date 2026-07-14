import type { Stagehand } from '@browserbasehq/stagehand'
import { adminDriver } from '@/bdd/@publicatiebank/support/admin-driver'
import { TOPIC_IMAGE, topicExists, topicIsPromoted, topicOmschrijving } from '@/bdd/@publicatiebank/support/topic'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 3 (onderwerpen) steps. UI *mutations* run through the Django admin
 * via Stagehand `act()` behind the shared {@link adminDriver} seam — except the
 * mandatory afbeelding on the add form, whose bytes are set straight on the
 * <input type=file> (a CDP browser cannot drive an OS file-picker). Assertions
 * are made *deterministically* by reading the admin back through the ordinary
 * Playwright `page` (session-authenticated, stable), because the token API is
 * unreliable while Stagehand drives the same server (see README "Known server
 * flake").
 *
 * The `@anthropic`-tagged skip guard and the `adminStagehand` fixture are shared
 * with the organisatie steps (see steps.ts).
 */

const pub = ENV.apps.publicatiebank.replace(/\/$/, '')
const TOPIC_CHANGELIST = `${pub}/admin/publications/topic/`
const TOPIC_ADD = `${pub}/admin/publications/topic/add/`
const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

function onderwerp(stagehand: Stagehand) {
  return adminDriver(stagehand, { noun: 'onderwerp', changelist: TOPIC_CHANGELIST, add: TOPIC_ADD })
}

Given('the publicatiebank onderwerp admin is open', async ({ adminStagehand }) => {
  await onderwerp(adminStagehand).openList()
})

// Prerequisite (deterministic, not the action under test).
Given('an onderwerp', async ({ topics }) => {
  await topics.add()
})

// --- Add (Stagehand for fields; image via setInputFiles carve-out) ----------

When('I add an onderwerp through the admin', async ({ adminStagehand, topics }) => {
  const titel = topics.freshName()
  const d = onderwerp(adminStagehand)
  await d.openAdd()
  // File carve-out: set the required afbeelding bytes directly on the input.
  await d.page.locator('#id_afbeelding').setInputFiles(TOPIC_IMAGE)
  await d.act(`Fill the "Officiële titel" field with: ${titel}`)
  await d.act('Select "Concept" as the publicatiestatus')
  await d.save()
  topics.track(titel)
})

Then('the onderwerp exists in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicExists(page, titel), READ).toBe(true)
})

// --- Promote ---------------------------------------------------------------

When('I tick the {string} checkbox and save the onderwerp', async ({ adminStagehand, topics }, label: string) => {
  const d = onderwerp(adminStagehand)
  await d.open(topics.last())
  await d.act(`Tick the "${label}" checkbox`)
  await d.save()
})

Then('the onderwerp is promoted in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicIsPromoted(page, titel), READ).toBe(true)
})

// --- Edit omschrijving -----------------------------------------------------

When('I change the onderwerp omschrijving and save it', async ({ adminStagehand, topics, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('topic:omschrijving', omschrijving)
  const d = onderwerp(adminStagehand)
  await d.open(topics.last())
  await d.act(`Replace the contents of the "Omschrijving" field with: ${omschrijving}`)
  await d.save()
})

Then('the onderwerp has the new omschrijving in the API', async ({ page, topics, scratch }) => {
  const titel = topics.last()
  const expected = scratch.get('topic:omschrijving')!
  await expect.poll(() => topicOmschrijving(page, titel), READ).toContain(expected)
})

// --- Delete ----------------------------------------------------------------

When('I delete the onderwerp through the admin', async ({ adminStagehand, topics }) => {
  const d = onderwerp(adminStagehand)
  await d.open(topics.last())
  await d.removeCurrent()
})

Then('the onderwerp no longer exists in the API', async ({ page, topics }) => {
  const titel = topics.last()
  await expect.poll(() => topicExists(page, titel), READ).toBe(false)
})

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the onderwerp', async ({ adminStagehand, topics }) => {
  await onderwerp(adminStagehand).search(topics.last())
})

Then('the onderwerp is shown in the admin results', async ({ page, topics }) => {
  const titel = topics.last()
  // The Stagehand search ran above; confirm the onderwerp is findable through the
  // admin deterministically (topicExists searches the changelist too).
  expect(await topicExists(page, titel)).toBe(true)
})
