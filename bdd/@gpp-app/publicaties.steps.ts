import { publicationStatusAdmin } from '@/bdd/@publicatiebank/support/publication'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../_core/fixture'
import { createAndPublishViaUi, withdrawViaUi } from './support/publicatie-ui'

/**
 * Testscripts 6 & 7 (eindgebruiker publicatie flows) steps. The authorised
 * gebruikersgroep prerequisite is seeded over the odpc API (`authProfile`
 * fixture); the create/withdraw *mutations* run through the gpp-app SPA via
 * Stagehand `act()` on the `adminStagehand` browser (its adminState cookies
 * authenticate the gpp-app — the admin is the AD-beheerder). Assertions read the
 * publicatiestatus back deterministically through the publicatiebank Django admin
 * (session-authenticated `page`), because the token API is unreliable while
 * Stagehand drives the same server (see README "Known server flake").
 *
 * The `@ai` skip guard (no OpenRouter key → skip) is shared with the other
 * Stagehand features (see @publicatiebank/@admin/steps.ts).
 */

const READ = { timeout: 15_000, intervals: [500, 1000, 2000] }

// --- Create + publish -------------------------------------------------------

Given('the signed-in user belongs to an authorised gebruikersgroep', async ({ authProfile, scratch }) => {
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed()
  scratch.set('profielUuid', profielUuid)
  scratch.set('organisatieUuid', organisatieUuid)
  scratch.set('informatiecategorieUuid', informatiecategorieUuid)
})

When('I create and publish a publicatie through the gpp-app', async ({ adminStagehand, publications, scratch }) => {
  const titel = publications.freshName()
  await createAndPublishViaUi(adminStagehand, {
    profielUuid: scratch.get('profielUuid')!,
    organisatieUuid: scratch.get('organisatieUuid')!,
    informatiecategorieUuid: scratch.get('informatiecategorieUuid')!,
    titel,
  })
  // Track for cleanup + so the assertion knows which titel to read back.
  publications.track(titel)
})

Then('the publicatie is public on the burgerportaal', async ({ page, publications }) => {
  // Deterministic proxy for "public": a gepubliceerd publicatie is what the
  // burgerportaal serves. ES/burgerportaal visibility lags indexing (not asserted).
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('gepubliceerd')
})

// --- Withdraw (intrekken) ---------------------------------------------------

Given('a published publicatie owned by the signed-in user', async ({ page, adminStagehand, authProfile, publications }) => {
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed()
  const titel = publications.freshName()
  await createAndPublishViaUi(adminStagehand, { profielUuid, organisatieUuid, informatiecategorieUuid, titel })
  publications.track(titel)
  // Make sure it actually published before the scenario withdraws it.
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('gepubliceerd')
})

When('I withdraw the publicatie through the gpp-app', async ({ adminStagehand, publications }) => {
  await withdrawViaUi(adminStagehand, publications.last())
})

Then('the publicatie is no longer public', async ({ page, publications }) => {
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('ingetrokken')
})

// ===========================================================================
// @todo stubs — gaps between the manual testscripts (TS6/TS7) and the two
// green scenarios above. These throw until the gpp-app Stagehand driver
// (support/publicatie-ui.ts) grows the matching helpers; the global
// Before({tags:'@todo'}) hook skips the scenarios so bddgen stays green.
// ===========================================================================

// --- TS6 gaps: creëren van een publicatie ----------------------------------

When('I select one or more onderwerpen while creating a publicatie', async () => {
  // Extend createAndPublishViaUi to tick onderwerp checkboxes by uuid; track them for the assertion.
  throw new Error('TODO: select onderwerpen in the Nieuwe publicatie form (Stagehand act + id/value clicks)')
})

Then('the publicatie is linked to the selected onderwerpen', async () => {
  // Read the publicatie back through the publicatiebank admin and assert its onderwerpen match.
  throw new Error('TODO: assert the created publicatie carries the selected onderwerpen (admin read-back)')
})

When('I upload a document to a new publicatie', async () => {
  // Drive the document upload widget in the wizard (setInputFiles on the hidden file input, like the onderwerp add form).
  throw new Error('TODO: upload a document to a new publicatie via the wizard file input')
})

Then('the document title is derived from the filename', async () => {
  // Read the document title field and assert it equals the uploaded filename (sans extension).
  throw new Error('TODO: assert the document title is auto-filled from the filename')
})

Then('the document date is filled in automatically', async () => {
  // Assert the "datum document" input is non-empty after upload.
  throw new Error('TODO: assert the document date is auto-filled after upload')
})

When('I try to publish a new publicatie with only a titel', async () => {
  // Fill only #titel, leave organisatie/informatiecategorie empty, then click "Publiceren".
  throw new Error('TODO: submit the Nieuwe publicatie form with only a titel via Stagehand act')
})

Then('the gpp-app shows validation messages for the missing required fields', async () => {
  // Assert the form shows validation errors for the required organisatie/informatiecategorie fields.
  throw new Error('TODO: assert required-field validation messages are visible (Stagehand observe / page locator)')
})

When('I save a new publicatie as concept and confirm the concept dialog', async () => {
  // Click "Opslaan als concept" then confirm the "weet je het zeker" dialog; track the titel.
  throw new Error('TODO: save as concept and confirm the dialog via Stagehand act')
})

Then('I return to the gpp-app homepage', async () => {
  // Assert the SPA navigated back to the gpp-app root (Mijn publicaties homepage) after saving.
  throw new Error('TODO: assert the app returned to the homepage (URL / heading via stagehandPage)')
})

Then('the concept publicatie appears in my publicaties list', async () => {
  // Assert the just-saved concept titel is listed on the homepage (Stagehand observe or admin read-back as concept).
  throw new Error('TODO: assert the concept publicatie appears in the Mijn publicaties list')
})

Given('a concept publicatie owned by the signed-in user', async ({ authProfile, adminStagehand, publications, scratch }) => {
  // Seed like the withdraw Given but stop at "Opslaan als concept" (add a saveAsConceptViaUi helper).
  void authProfile; void adminStagehand; void publications; void scratch
  throw new Error('TODO: seed a concept (unpublished) publicatie via a saveAsConceptViaUi helper')
})

When('I open the concept publicatie from my publicaties list', async () => {
  // From Mijn publicaties, click the tracked concept titel to open it.
  throw new Error('TODO: open the concept publicatie by titel from Mijn publicaties (Stagehand act)')
})

Then('the concept publicatie opens with its saved details', async () => {
  // Assert the opened form shows the concept titel and status = concept.
  throw new Error('TODO: assert the reopened concept shows its saved titel/details')
})

When('I search my publicaties by date', async () => {
  // Use the Mijn publicaties date filter/search control for the tracked publicatie's registratiedatum.
  throw new Error('TODO: search Mijn publicaties by date via Stagehand act')
})

Then('the matching publicatie is shown in my publicaties list', async () => {
  // Assert the tracked titel is present in the filtered results.
  throw new Error('TODO: assert the matching publicatie is listed after the date search')
})

When('I filter my publicaties by informatiecategorie, onderwerp and publicatiestatus', async () => {
  // Apply the list filters for the tracked publicatie's category/topic/status.
  throw new Error('TODO: apply informatiecategorie/onderwerp/status filters via Stagehand act')
})

Then('only the matching publicaties are shown in my publicaties list', async () => {
  // Assert the tracked titel is shown and non-matching ones are filtered out.
  throw new Error('TODO: assert only matching publicaties remain after filtering')
})

When('I sort my publicaties by titel', async () => {
  // Click the "Titel" sort control on Mijn publicaties.
  throw new Error('TODO: sort Mijn publicaties by titel via Stagehand act')
})

Then('my publicaties are ordered by titel', async () => {
  // Read the visible list order and assert it is sorted by titel.
  throw new Error('TODO: assert the list is ordered by titel')
})

When('I sort my publicaties by registratiedatum', async () => {
  // Click the "Registratiedatum" sort control on Mijn publicaties.
  throw new Error('TODO: sort Mijn publicaties by registratiedatum via Stagehand act')
})

Then('my publicaties are ordered by registratiedatum', async () => {
  // Read the visible list order and assert it is sorted by registratiedatum.
  throw new Error('TODO: assert the list is ordered by registratiedatum')
})

When('I open a publicatie from my publicaties search results', async () => {
  // Search for the tracked titel, then click the result to open it.
  throw new Error('TODO: open a publicatie from the search results (Stagehand act)')
})

Then('the publicatie opens with its saved details', async () => {
  // Assert the opened detail view shows the tracked titel.
  throw new Error('TODO: assert the opened publicatie shows its saved titel/details')
})

Then('the concept publicatie is not visible on the burgerportaal', async () => {
  // Deterministic proxy: assert the seeded concept never reaches "gepubliceerd" (admin read-back stays concept).
  throw new Error('TODO: assert the concept publicatie is not public (admin status stays concept)')
})

// --- TS7 gaps: wijzigen of intrekken van een publicatie --------------------

When('I open the publicatie from the Mijn publicaties menu', async () => {
  // Navigate root -> Mijn publicaties -> click the tracked titel (reuse openMijnPublicaties).
  throw new Error('TODO: open the tracked publicatie from the Mijn publicaties menu (Stagehand act)')
})

Then('the publicatie is shown as gepubliceerd before I edit it', async ({ page, publications }) => {
  // Confirm the published state deterministically before the edit steps run.
  void page; void publications
  throw new Error('TODO: assert the opened publicatie status is gepubliceerd (admin read-back)')
})

Given('the signed-in user is authorised for a second gebruikersgroep', async ({ authProfile, scratch }) => {
  // Seed a second authorised profiel (second authProfile.seed()) so the profiel picker offers a choice.
  void authProfile; void scratch
  throw new Error('TODO: seed a second authorised gebruikersgroep for the profiel switch')
})

When('I change the publicatie profiel to another gebruikersgroep', async () => {
  // On the opened publicatie, select the other profiel in the top #gebruikersgroep select and re-fill required fields.
  throw new Error('TODO: switch the publicatie profiel to the second gebruikersgroep (Stagehand act + id/value)')
})

Then('the publicatie is owned by the newly chosen gebruikersgroep', async () => {
  // Read "Eigenaar (groep)" back through the publicatiebank admin and assert it is the second group.
  throw new Error('TODO: assert the publicatie eigenaar-groep changed to the second gebruikersgroep (admin read-back)')
})

When('I edit the titel of the publicatie and save it', async ({ scratch }) => {
  // Open the tracked publicatie, replace #titel with a new value (store it in scratch), and save.
  void scratch
  throw new Error('TODO: edit the publicatie titel and save (Stagehand act + scratch the new titel)')
})

When('I reopen the publicatie from my publicaties list', async () => {
  // Re-navigate to Mijn publicaties and open the (possibly renamed) publicatie again.
  throw new Error('TODO: reopen the publicatie from Mijn publicaties (Stagehand act)')
})

Then('the edited titel of the publicatie has persisted', async ({ scratch }) => {
  // Assert the reopened form shows the edited titel stored in scratch.
  void scratch
  throw new Error('TODO: assert the edited titel persisted after reopening')
})

When('I withdraw a single document on the publicatie and save it', async () => {
  // Open a document on the publicatie, click its "intrekken", then save the publicatie.
  throw new Error('TODO: withdraw a single document and save (Stagehand act)')
})

Then('the withdrawn document is still withdrawn', async () => {
  // On reopen, assert the document is still shown as ingetrokken (irreversible).
  throw new Error('TODO: assert the withdrawn document stays withdrawn after reopening')
})

When('I click the Bekijk online button on the publicatie', async () => {
  // Open the published publicatie and click "Bekijk online" (opens the burgerportaal, likely a new tab).
  throw new Error('TODO: click "Bekijk online" on the published publicatie (Stagehand act + handle popup)')
})

Then('the publicatie opens on the burgerportaal', async () => {
  // Assert a burgerportaal page/tab for the publicatie opened (URL under ENV.apps.burgerportaal).
  throw new Error('TODO: assert the burgerportaal opened for the publicatie')
})

When('I withdraw the publicatie and confirm the intrekken dialog', async () => {
  // Withdraw via the UI and explicitly confirm the "bevestig" dialog (extend withdrawViaUi to assert the dialog appears).
  throw new Error('TODO: withdraw and confirm the intrekken dialog (Stagehand act)')
})

Then('the publicatie is shown as ingetrokken in my publicaties list', async () => {
  // On Mijn publicaties, assert the row is struck through and carries the "ingetrokken" label.
  throw new Error('TODO: assert the publicatie shows as ingetrokken (struck through + label) in the list')
})

Then('the opened publicatie shows the ingetrokken message', async () => {
  // Open the publicatie and assert the banner text "Deze publicatie is ingetrokken." is visible.
  throw new Error('TODO: assert the "Deze publicatie is ingetrokken." message is shown')
})

Then('the Bekijk online button is no longer shown on the publicatie', async () => {
  // Assert the "Bekijk online" button is absent on a withdrawn publicatie.
  throw new Error('TODO: assert the "Bekijk online" button is gone after withdrawing')
})

Given('a published publicatie owned by a colleague in my gebruikersgroep', async ({ authProfile, adminStagehand, publications, scratch }) => {
  // Seed a shared gebruikersgroep + a published publicatie owned by a *different* member (colleague) via API/admin.
  void authProfile; void adminStagehand; void publications; void scratch
  throw new Error('TODO: seed a colleague-owned published publicatie in a shared gebruikersgroep')
})

When('I open a colleague publicatie under the collega publicaties menu and choose a profiel', async () => {
  // Navigate root -> "Publicaties van collega's", choose the profiel when prompted, open the colleague publicatie.
  throw new Error('TODO: open a colleague publicatie via "Publicaties van collega\'s" choosing a profiel (Stagehand act)')
})

Then('the current publicatie-eigenaar is shown before I claim it', async () => {
  // Assert the "Publicatie-eigenaar" field shows the colleague (not the signed-in user) before claiming.
  throw new Error('TODO: assert the current publicatie-eigenaar is the colleague before claiming')
})
