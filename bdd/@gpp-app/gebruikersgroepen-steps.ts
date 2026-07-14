import type { Stagehand } from '@browserbasehq/stagehand'
import { settle, stagehandPage } from '@/bdd/_core/stagehand'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../_core/fixture'

/**
 * Testscript 5 (gebruikersgroepen) steps. Mutations run through the gpp-app UI
 * via Stagehand `act()` on the `adminStagehand` browser (its adminState cookies
 * authenticate the gpp-app — the admin account is the AD-beheerder). Verification
 * and cleanup use the odpc JSON API through the `usergroups` fixture — the token
 * API on the publicatiebank is not involved here.
 *
 * The `@anthropic` skip guard (no OpenRouter key → skip) is shared with the other
 * Stagehand features (see @publicatiebank/@admin/steps.ts).
 */

const gppApp = ENV.apps.gppApp.replace(/\/$/, '')
const READ = { timeout: 15_000, intervals: [500, 1000, 2000] }

// The gpp-app is a SPA that only hydrates its routes when navigated via clicks
// from the app root — deep-linking a route (e.g. /gebruikersgroepen/nieuw) leaves
// the form unrendered. So every flow starts at the root and clicks through.
async function openGebruikersgroepen(stagehand: Stagehand) {
  const page = stagehandPage(stagehand)
  await page.goto(gppApp)
  await settle(page)
  await stagehand.act('Click "Gebruikersgroepen" in the top navigation')
  await settle(page)
}

/** Create a gebruikersgroep with just a naam through the gpp-app UI (Stagehand). */
async function createGroupViaUi(stagehand: Stagehand, naam: string) {
  await openGebruikersgroepen(stagehand)
  await stagehand.act('Click the "Nieuwe gebruikersgroep" button')
  await stagehand.act(`Fill the "Naam" field with: ${naam}`)
  await stagehand.act('Click the "Opslaan" button to save the gebruikersgroep')
  await settle(stagehandPage(stagehand))
}

/** Open a gebruikersgroep by naam from the overview (Stagehand). */
async function openGroup(stagehand: Stagehand, naam: string) {
  await openGebruikersgroepen(stagehand)
  await stagehand.act(`Open the gebruikersgroep named "${naam}" by clicking it`)
  await settle(stagehandPage(stagehand))
}

// --- Create -----------------------------------------------------------------

When('I create a gebruikersgroep through the gpp-app', async ({ adminStagehand, usergroups }) => {
  const naam = usergroups.freshName()
  await createGroupViaUi(adminStagehand, naam)
  usergroups.track(naam)
})

Then('the gebruikersgroep exists', async ({ usergroups }) => {
  const naam = usergroups.last()
  await expect.poll(() => usergroups.exists(naam), READ).toBe(true)
})

// --- Prerequisite -----------------------------------------------------------

Given('a gebruikersgroep', async ({ adminStagehand, usergroups }) => {
  const naam = usergroups.freshName()
  await createGroupViaUi(adminStagehand, naam)
  usergroups.track(naam)
  // Make sure it actually landed before the scenario mutates it.
  await expect.poll(() => usergroups.exists(naam), READ).toBe(true)
})

// --- Rename -----------------------------------------------------------------

When('I rename the gebruikersgroep through the gpp-app', async ({ adminStagehand, usergroups, scratch }) => {
  const oldName = usergroups.last()
  const newName = `${usergroups.freshName()} hernoemd`
  scratch.set('groep:oldName', oldName)
  await openGroup(adminStagehand, oldName)
  await adminStagehand.act(`Replace the contents of the "Naam" field with: ${newName}`)
  await adminStagehand.act('Click the "Opslaan" button to save the gebruikersgroep')
  await settle(stagehandPage(adminStagehand))
  usergroups.track(newName)
})

Then('the gebruikersgroep is known under its new name and not the old one', async ({ usergroups, scratch }) => {
  const newName = usergroups.last()
  const oldName = scratch.get('groep:oldName')!
  await expect.poll(() => usergroups.exists(newName), READ).toBe(true)
  expect(await usergroups.exists(oldName)).toBe(false)
})

// --- Delete -----------------------------------------------------------------

When('I delete the gebruikersgroep through the gpp-app', async ({ adminStagehand, usergroups }) => {
  const naam = usergroups.last()
  await openGroup(adminStagehand, naam)
  await adminStagehand.act('Click the "Verwijderen" button to delete this gebruikersgroep')
  await adminStagehand.act('Confirm the deletion by clicking the "Ja, verwijderen" button')
  await settle(stagehandPage(adminStagehand))
})

Then('the gebruikersgroep no longer exists', async ({ usergroups }) => {
  const naam = usergroups.last()
  await expect.poll(() => usergroups.exists(naam), READ).toBe(false)
})
