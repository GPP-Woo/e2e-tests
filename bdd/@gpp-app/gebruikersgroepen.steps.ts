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
 * The `@ai` skip guard (no OpenRouter key → skip) is shared with the other
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

// --- @todo: gap-coverage stubs (TS5 steps 4b-4g, 5, 6a-6i) ------------------
// Skipped by the global Before({tags:'@todo'}) hook in _core/todo.steps.ts.

// --- Create with omschrijving + gebruiker + autorisaties (4b-4g) ------------

When('I create a gebruikersgroep with a naam and omschrijving through the gpp-app', async () => {
  // Like createGroupViaUi but also act() on the "Omschrijving" textarea; track the naam.
  throw new Error('TODO: open Gebruikersgroepen, Nieuwe gebruikersgroep, fill Naam + Omschrijving, usergroups.track(naam)')
})

When('I add myself as a gebruiker to the gebruikersgroep', async () => {
  // On the open group form, act() to add the signed-in user by e-mail (currentUserId / /api/me email).
  throw new Error('TODO: act("Add myself as a gebruiker by e-mail to this gebruikersgroep")')
})

When('I authorise the gebruikersgroep for one or more organisaties', async () => {
  // Expand the "Organisatie" panel and tick a few actieve organisaties.
  throw new Error('TODO: act("Expand Organisatie and tick one or more organisaties")')
})

When('I authorise the gebruikersgroep for one or more informatiecategorieën', async () => {
  // Expand the "Informatiecategorie" panel and tick a few categorieën.
  throw new Error('TODO: act("Expand Informatiecategorie and tick one or more informatiecategorieën")')
})

When('I authorise the gebruikersgroep for one or more onderwerpen', async () => {
  // Expand the "onderwerpen" panel and tick a few onderwerpen.
  throw new Error('TODO: act("Expand onderwerpen and tick one or more onderwerpen")')
})

When('I save the gebruikersgroep', async () => {
  // Click "Opslaan" and settle().
  throw new Error('TODO: act("Click the Opslaan button") then settle()')
})

Then('the gebruikersgroep has the entered omschrijving, gebruiker and autorisaties', async () => {
  // Read the group back over the odpc API (/api/gebruikersgroepen/{uuid}) and assert
  // omschrijving, gekoppeldeGebruikers and gekoppeldeWaardelijsten are non-empty/as entered.
  throw new Error('TODO: GET the tracked group by uuid and assert omschrijving + gebruiker + gekoppeldeWaardelijsten')
})

// --- Autorisaties constrain the publicatie flow (step 5) --------------------

Given('a gebruikersgroep authorised for one organisatie and one informatiecategorie', async () => {
  // Seed deterministically via the authProfile fixture (seed() -> {profielUuid, organisatieUuid, informatiecategorieUuid}); stash uuids in scratch.
  throw new Error('TODO: authProfile.seed() and scratch.set the returned uuids for later assertions')
})

When('I start a nieuwe publicatie in the gpp-app', async () => {
  // Navigate Publicaties -> Nieuwe publicatie via Stagehand, picking the seeded profiel if prompted.
  throw new Error('TODO: act through Publicaties > Nieuwe publicatie, choose the seeded gebruikersgroep as profiel')
})

Then('I can only select the organisatie and informatiecategorie the gebruikersgroep is authorised for', async () => {
  // Assert the Organisatie/Informatiecategorie selects only expose the seeded uuids as options.
  throw new Error('TODO: assert the publicatie-form option values equal the seeded organisatie/informatiecategorie uuids')
})

// --- Edit omschrijving + add another gebruiker (6a-6d) ----------------------

When('I change the gebruikersgroep omschrijving through the gpp-app', async () => {
  // openGroup(last()) then act() to replace the "Omschrijving" textarea; stash new text in scratch.
  throw new Error('TODO: open the tracked group, replace Omschrijving, save, scratch.set the new omschrijving')
})

When('I add another gebruiker to the gebruikersgroep through the gpp-app', async () => {
  // On the open group form, act() to add a second (different) gebruiker by e-mail.
  throw new Error('TODO: act("Add another gebruiker by e-mail") and save')
})

Then('the gebruikersgroep has the changed omschrijving and the added gebruiker', async () => {
  // Read the group back over the odpc API and assert omschrijving matches scratch and gekoppeldeGebruikers grew.
  throw new Error('TODO: GET the group by uuid; assert omschrijving === scratch value and >=2 gekoppeldeGebruikers')
})

// --- Modify autorisaties + verify change (6e-6h) ----------------------------

When('I change the gebruikersgroep autorisaties through the gpp-app', async () => {
  // Open the seeded group, untick some org/categorie/onderwerp vinkjes and tick others; save.
  throw new Error('TODO: open the seeded group, toggle organisatie/informatiecategorie/onderwerp checkboxes, save')
})

Then('the gebruikersgroep reflects the changed autorisaties', async () => {
  // Read the group back over the odpc API and assert gekoppeldeWaardelijsten differs from the seeded set.
  throw new Error('TODO: GET the group by uuid; assert gekoppeldeWaardelijsten changed from the seeded uuids')
})

Then('a nieuwe publicatie only offers the changed authorised waardelijsten', async () => {
  // Re-run the nieuwe-publicatie flow and assert the offered options match the *new* autorisaties.
  throw new Error('TODO: start Nieuwe publicatie and assert option values equal the changed waardelijst uuids')
})

// --- Existing publicatie no longer authorised (6i) --------------------------

Given('an existing publicatie made under that gebruikersgroep', async () => {
  // Create a publicatie via the API under the seeded profiel (reuse publicatiebank fixtures); track it.
  throw new Error('TODO: create a publicatie under the seeded profiel/organisatie/informatiecategorie and track it')
})

When('I remove the informatiecategorie autorisatie from the gebruikersgroep through the gpp-app', async () => {
  // Open the seeded group and untick the informatiecategorie the publicatie uses; save.
  throw new Error('TODO: open the seeded group, untick its informatiecategorie vinkje, save')
})

When('I open the existing publicatie for editing in the gpp-app', async () => {
  // Navigate Publicaties -> open the tracked publicatie for editing via Stagehand.
  throw new Error('TODO: act through Publicaties and open the tracked publicatie for editing')
})

Then('I see an error telling me to contact the beheerder', async () => {
  // Assert the form shows the "neem contact op met de beheerder" foutmelding.
  throw new Error('TODO: expect the publicatie form to show the contact-de-beheerder error message')
})
