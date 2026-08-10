import path from 'node:path'
import { expectNoSearchResults, searchPublicatieViaUi } from '@/bdd/@burgerportaal/support/search'
import { publicationOnderwerpenAdmin, publicationStatusAdmin } from '@/bdd/@publicatiebank/support/publication'
import { regularState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest, expect } from '@playwright/test'
import { Given, Then, When } from '../_core/fixture'
import { waitForWithReload } from './support/hydrate'
import {
  addDocumentAndRepublishViaUi,
  addDocumentToNewPublicatieViaUi,
  attemptPublishWithOnlyTitelViaUi,
  bekijkOnlineLink,
  changeProfielAndRepublishViaUi,
  claimButton,
  clickBekijkOnlineViaUi,
  conceptStatusBanner,
  confirmWrite,
  createAndPublishViaUi,
  DOCUMENT_FIXTURE,
  documentDatumField,
  documentIngetrokkenStatus,
  documentIntrekkenCheckbox,
  documentTitelField,
  editTitelAndRepublishViaUi,
  filterPublicatiesViaUi,
  ingetrokkenStatusBanner,
  intrekkenDialog,
  openCollegaPublicatieViaUi,
  openMijnPublicaties,
  openOptionGroup,
  openPublicatieViaUi,
  optionGroupError,
  publicatieEigenaar,
  publicatieListItem,
  saveAsConceptViaUi,
  searchPublicatiesByDateViaUi,
  sortPublicatiesViaUi,
  visiblePublicatieTitels,
  visibleRegistratiedatums,
  withdrawButton,
  withdrawDocumentViaUi,
  withdrawViaUi,
} from './support/publicatie-ui'
import { currentUserId } from './support/usergroup'

/**
 * Testscripts 6 & 7 (eindgebruiker publicatie flows) steps. The authorised
 * gebruikersgroep prerequisite is seeded over the odpc API (`authProfile`
 * fixture); the create/withdraw *mutations* run through the gpp-app SPA directly
 * on the session-authenticated `page` (its adminState cookies authenticate the
 * gpp-app — the admin is the AD-beheerder). The same `page` also reads the
 * publicatiestatus back deterministically through the publicatiebank Django admin.
 */

const READ = { timeout: 15_000, intervals: [500, 1000, 2000] }

// --- Create + publish -------------------------------------------------------

Given('the signed-in user belongs to an authorised gebruikersgroep', async ({ authProfile, scratch }) => {
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed()
  scratch.set('profielUuid', profielUuid)
  scratch.set('organisatieUuid', organisatieUuid)
  scratch.set('informatiecategorieUuid', informatiecategorieUuid)
})

/**
 * Same prerequisite, but authorised for *two* organisaties + informatiecategorieën.
 * The form pre-selects a waardelijst the profiel only has one value of, so with
 * the single-value profiel above nothing is ever "missing" and publishing with
 * only a titel simply succeeds.
 */
Given('the signed-in user belongs to a gebruikersgroep with several waardelijstwaarden', async ({ authProfile, scratch }) => {
  const { profielUuid } = await authProfile.seed({ choices: 2 })
  scratch.set('profielUuid', profielUuid)
})

When('I create and publish a publicatie through the gpp-app', async ({ page, publications, scratch }) => {
  const titel = publications.freshName()
  await createAndPublishViaUi(page, {
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

Given('a published publicatie owned by the signed-in user', async ({ page, authProfile, publications, topics, scratch }) => {
  const titel = publications.freshName()
  // Link an onderwerp too, so scenarios that filter/read it back have a real value.
  // The profiel must be authorised for it — the form only offers authorised ones.
  const onderwerpTitel = await topics.add()
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed({ onderwerpTitels: [onderwerpTitel] })
  await createAndPublishViaUi(page, { profielUuid, organisatieUuid, informatiecategorieUuid, titel, onderwerpTitels: [onderwerpTitel] })
  publications.track(titel)
  scratch.set('informatiecategorieUuid', informatiecategorieUuid)
  scratch.set('onderwerpTitel', onderwerpTitel)
  // Make sure it actually published before the scenario withdraws it.
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('gepubliceerd')
})

When('I withdraw the publicatie through the gpp-app', async ({ page, publications }) => {
  await withdrawViaUi(page, publications.last())
})

Then('the publicatie is no longer public', async ({ page, publications }) => {
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('ingetrokken')
})

// --- Select onderwerpen ------------------------------------------------------
// Onderwerpen are not gated by the profiel's autorisaties (unlike organisatie /
// informatiecategorie), so a couple are seeded ad hoc through the `topics`
// fixture and selected by their visible titel in the "Onderwerpen" section.

When('I select one or more onderwerpen while creating a publicatie', async ({ page, authProfile, publications, topics, scratch }) => {
  const titel = publications.freshName()
  const onderwerpTitels = [await topics.add(), await topics.add()]
  // Re-seed the profiel with these onderwerpen authorised: the "Onderwerp"
  // section only lists what the selected profiel is authorised for.
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed({ onderwerpTitels })
  await createAndPublishViaUi(page, {
    profielUuid,
    organisatieUuid,
    informatiecategorieUuid,
    titel,
    onderwerpTitels,
  })
  publications.track(titel)
  scratch.set('onderwerpTitels', onderwerpTitels.join('|'))
})

Then('the publicatie is linked to the selected onderwerpen', async ({ page, publications, scratch }) => {
  const titel = publications.last()
  const onderwerpTitels = scratch.get('onderwerpTitels')!.split('|')
  await expect.poll(() => publicationOnderwerpenAdmin(page, titel), READ).toEqual(expect.arrayContaining(onderwerpTitels))
})

// --- Upload a document -------------------------------------------------------
// Choosing a file is enough to trigger the auto-derivation under test; the
// publicatie is deliberately never saved/published, so no cleanup is needed.

When('I upload a document to a new publicatie', async ({ page, scratch }) => {
  await addDocumentToNewPublicatieViaUi(page, {
    profielUuid: scratch.get('profielUuid')!,
    filePath: DOCUMENT_FIXTURE,
  })
})

Then('the document title is derived from the filename', async ({ page }) => {
  await expect(documentTitelField(page)).toHaveValue(path.parse(DOCUMENT_FIXTURE).name)
})

Then('the document date is filled in automatically', async ({ page }) => {
  await expect(documentDatumField(page)).not.toHaveValue('')
})

// --- Required-field validation ------------------------------------------------
// Organisatie and informatiecategorie are the two other required fields on the
// form (see createAndPublishViaUi); leaving both empty and publishing should
// surface a field-scoped message for each rather than one generic error.

When('I try to publish a new publicatie with only a titel', async ({ page, publications, scratch }) => {
  const titel = publications.freshName()
  await attemptPublishWithOnlyTitelViaUi(page, {
    profielUuid: scratch.get('profielUuid')!,
    titel,
  })
})

Then('the gpp-app shows validation messages for the missing required fields', async ({ page }) => {
  for (const label of ['Organisatie', 'Informatiecategorie']) {
    await openOptionGroup(page, label)
    await expect(optionGroupError(page, label)).toBeVisible()
  }
})

// --- Save as concept ---------------------------------------------------------
// A concept only needs a titel (see saveAsConceptViaUi); saving redirects back
// to the gpp-app homepage, which for a signed-in eindgebruiker is Mijn publicaties.

When('I save a new publicatie as concept and confirm the concept dialog', async ({ page, publications, scratch }) => {
  const titel = publications.freshName()
  await saveAsConceptViaUi(page, {
    profielUuid: scratch.get('profielUuid')!,
    titel,
  })
  publications.track(titel)
})

Then('I return to the gpp-app homepage', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Nieuwe publicatie' })).toBeVisible()
})

Then('the concept publicatie appears in my publicaties list', async ({ page, publications }) => {
  await expect(page.getByText(publications.last(), { exact: true })).toBeVisible()
})

// --- Reopen a concept -------------------------------------------------------

Given('a concept publicatie owned by the signed-in user', async ({ page, authProfile, publications }) => {
  const { profielUuid } = await authProfile.seed()
  const titel = publications.freshName()
  await saveAsConceptViaUi(page, { profielUuid, titel })
  publications.track(titel)
})

When('I open the concept publicatie from my publicaties list', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
})

Then('the concept publicatie opens with its saved details', async ({ page, publications }) => {
  await expect(page.locator('#titel')).toHaveValue(publications.last())
  await expect(conceptStatusBanner(page)).toBeVisible()
})

// --- Search by date ----------------------------------------------------------

When('I search my publicaties by date', async ({ page }) => {
  // The publicatie was just created, so its registratiedatum is today.
  const today = new Date().toISOString().slice(0, 10)
  await searchPublicatiesByDateViaUi(page, today)
})

Then('the matching publicatie is shown in my publicaties list', async ({ page, publications }) => {
  await expect(page.getByText(publications.last(), { exact: true })).toBeVisible()
})

// --- Filter by informatiecategorie, onderwerp and status ---------------------
// The Given links the publicatie to a real onderwerp (see above) so all three
// filters can be applied at once with values the publicatie actually matches.

When('I filter my publicaties by informatiecategorie, onderwerp and publicatiestatus', async ({ page, scratch }) => {
  await filterPublicatiesViaUi(page, {
    informatiecategorieUuid: scratch.get('informatiecategorieUuid')!,
    onderwerpTitel: scratch.get('onderwerpTitel')!,
    status: 'gepubliceerd',
  })
})

Then('only the matching publicaties are shown in my publicaties list', async ({ page, publications }) => {
  await expect(page.getByText(publications.last(), { exact: true })).toBeVisible()
})

// --- Sort by titel -----------------------------------------------------------

When('I sort my publicaties by titel', async ({ page }) => {
  // The option's value is the API ordering field, not the label
  // (PublicatiesOverviewSort.vue): "Title (a-z)" is `officiele_titel`.
  await sortPublicatiesViaUi(page, 'officiele_titel')
})

Then('my publicaties are ordered by titel', async ({ page }) => {
  const titels = await visiblePublicatieTitels(page).allTextContents()
  const sorted = [...titels].sort((a, b) => a.localeCompare(b))
  expect(titels).toEqual(sorted)
})

// --- Sort by registratiedatum -------------------------------------------------
// The plain (unprefixed) sort option is ascending in this app's DRF-style
// ordering convention (mirrored by the "-registratiedatum" descending option).

When('I sort my publicaties by registratiedatum', async ({ page }) => {
  await sortPublicatiesViaUi(page, 'registratiedatum')
})

Then('my publicaties are ordered by registratiedatum', async ({ page }) => {
  const dates = await visibleRegistratiedatums(page)
  const ascending = [...dates].map(d => d.getTime()).sort((a, b) => a - b)
  expect(dates.map(d => d.getTime())).toEqual(ascending)
})

// --- Open from search results ------------------------------------------------

When('I open a publicatie from my publicaties search results', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
})

Then('the publicatie opens with its saved details', async ({ page, publications }) => {
  await expect(page.locator('#titel')).toHaveValue(publications.last())
})

// ===========================================================================
// TS7 — document withdraw (@blocked) + colleague claim
// ===========================================================================

Then('the concept publicatie is not visible on the burgerportaal', async ({ page, publications }) => {
  const titel = publications.last()
  await searchPublicatieViaUi(page, titel)
  await expectNoSearchResults(page)
})

// --- TS7 gaps: wijzigen of intrekken van een publicatie --------------------

When('I open the publicatie from the Mijn publicaties menu', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
})

Then('the publicatie is shown as gepubliceerd before I edit it', async ({ page }) => {
  // The "Publicatie intrekken" button only renders for a gepubliceerd publicatie
  // (see withdrawButton), so its visibility is the SPA's own on-page proof of
  // the status — checked without leaving the opened page (no admin round-trip).
  await expect(withdrawButton(page)).toBeVisible()
})

Given('the signed-in user is authorised for a second gebruikersgroep', async ({ authProfile, scratch }) => {
  // A second, independent authorised profiel — its own gebruikersgroep, organisatie
  // and informatiecategorie — so the profiel picker offers a real choice. It also
  // authorises the onderwerp already linked to the publicatie, since switching
  // profiel re-scopes the "Onderwerp" section to the new profiel's autorisaties.
  const onderwerpTitel = scratch.get('onderwerpTitel')
  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed(
    onderwerpTitel ? { onderwerpTitels: [onderwerpTitel] } : {},
  )
  scratch.set('secondProfielUuid', profielUuid)
  scratch.set('secondOrganisatieUuid', organisatieUuid)
  scratch.set('secondInformatiecategorieUuid', informatiecategorieUuid)
})

When('I change the publicatie profiel to another gebruikersgroep', async ({ page, publications, scratch }) => {
  // Onderwerpen aren't gated by the profiel, but re-tick the one linked in the
  // Given step in case the switch clears it (see changeProfielAndRepublishViaUi).
  await changeProfielAndRepublishViaUi(page, publications.last(), {
    nieuweProfielUuid: scratch.get('secondProfielUuid')!,
    organisatieUuid: scratch.get('secondOrganisatieUuid')!,
    informatiecategorieUuid: scratch.get('secondInformatiecategorieUuid')!,
    onderwerpTitels: [scratch.get('onderwerpTitel')!],
  })
})

Then('the publicatie is owned by the newly chosen gebruikersgroep', async ({ page, publications, scratch }) => {
  // Reopen and read the persisted "Profiel" value back from the form itself —
  // the same uuid-as-value convention #titel's own persistence check relies on.
  await openPublicatieViaUi(page, publications.last())
  await expect(page.locator('#gebruikersgroep')).toHaveValue(scratch.get('secondProfielUuid')!)
})

When('I edit the titel of the publicatie and save it', async ({ page, publications }) => {
  const titel = publications.last()
  const editedTitel = `${titel}-edited`
  await editTitelAndRepublishViaUi(page, titel, editedTitel)
  // Track the renamed titel so cleanup (and `last()` from here on) targets it.
  publications.track(editedTitel)
})

When('I reopen the publicatie from my publicaties list', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
})

Then('the edited titel of the publicatie has persisted', async ({ page, publications }) => {
  await expect(page.locator('#titel')).toHaveValue(publications.last())
})

When('I withdraw a single document on the publicatie and save it', async ({ page, publications }) => {
  const titel = publications.last()
  // Given publishes document-less; attach one first, then withdraw via UI.
  await addDocumentAndRepublishViaUi(page, titel)
  await withdrawDocumentViaUi(page, titel)
})

Then('the withdrawn document is still withdrawn', async ({ page }) => {
  await expect(documentIngetrokkenStatus(page)).toBeVisible({ timeout: 15_000 })
  await expect(documentIntrekkenCheckbox(page)).toHaveCount(0)
})

When('I click the Bekijk online button on the publicatie', async ({ page, publications, popup }) => {
  popup.value = await clickBekijkOnlineViaUi(page, publications.last())
})

Then('the publicatie opens on the burgerportaal', async ({ publications, popup }) => {
  const popupPage = popup.value
  if (!popupPage)
    throw new Error('"Bekijk online" did not open a popup')
  const burg = ENV.apps.burgerportaal.replace(/\/$/, '')
  expect(popupPage.url()).toContain(burg)
  // The burgerportaal SPA can be slow to hydrate on non-Chromium engines; retry
  // with a reload rather than an arbitrary wait (see waitForWithReload).
  const heading = popupPage.getByRole('heading', { name: publications.last(), exact: true })
  await waitForWithReload(popupPage, heading)
  await expect(heading).toBeVisible()
})

When('I withdraw the publicatie and confirm the intrekken dialog', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
  await withdrawButton(page).click()
  // Unlike withdrawViaUi (which confirms only if a dialog happens to appear),
  // this scenario explicitly verifies the dialog itself before confirming it.
  await expect(intrekkenDialog(page)).toBeVisible()
  // Confirm through confirmWrite, not a bare click: the confirm button is
  // clickable a beat before the app wires its handler, so a plain click is
  // silently dropped and the publicatie is never withdrawn at all.
  await confirmWrite(page, 'Ja, intrekken')
})

Then('the publicatie is shown as ingetrokken in my publicaties list', async ({ page, publications }) => {
  await openMijnPublicaties(page)
  // Assert the status on this publicatie's own row. A page-wide
  // getByText(/ingetrokken/i).first() instead resolves to the hidden
  // <option value="ingetrokken"> of the publicatiestatus *filter*, which precedes
  // the list in the DOM and never becomes visible.
  const row = publicatieListItem(page, publications.last())
  await expect(row).toBeVisible()
  await expect(row.getByRole('status')).toHaveText(/ingetrokken/i)
})

Then('the opened publicatie shows the ingetrokken message', async ({ page, publications }) => {
  await openPublicatieViaUi(page, publications.last())
  await expect(ingetrokkenStatusBanner(page)).toBeVisible()
})

Then('the Bekijk online button is no longer shown on the publicatie', async ({ page }) => {
  await expect(bekijkOnlineLink(page)).toHaveCount(0)
})

Given('a published publicatie owned by a colleague in my gebruikersgroep', async ({ browser, page, authProfile, publications, scratch }) => {
  // Shared profiel: signed-in admin + regular user. The colleague publishes under
  // that profiel in a separate browser context (regularState); the scenario's
  // `page` stays on the admin session to open it via "Publicaties van collega's".
  const regularCtx = await apiRequest.newContext({ storageState: regularState })
  let colleagueId: string
  let colleagueName: string
  try {
    colleagueId = await currentUserId(regularCtx)
    const me = await (await regularCtx.get(new URL('/api/me', ENV.apps.gppApp).href)).json()
    colleagueName = me.fullName as string
  }
  finally {
    await regularCtx.dispose()
  }

  const { profielUuid, organisatieUuid, informatiecategorieUuid } = await authProfile.seed({
    extraGebruikerIds: [colleagueId],
  })
  scratch.set('profielUuid', profielUuid)
  scratch.set('colleagueName', colleagueName)

  const colleagueBrowser = await browser.newContext({ storageState: regularState })
  const colleaguePage = await colleagueBrowser.newPage()
  try {
    const titel = publications.freshName()
    await createAndPublishViaUi(colleaguePage, {
      profielUuid,
      organisatieUuid,
      informatiecategorieUuid,
      titel,
    })
    publications.track(titel)
  }
  finally {
    await colleagueBrowser.close()
  }
  // Status read-back uses the admin `page` (Django admin session), not the colleague context.
  await expect.poll(() => publicationStatusAdmin(page, publications.last()), READ).toBe('gepubliceerd')
})

When('I open a colleague publicatie under the collega publicaties menu and choose a profiel', async ({ page, publications, scratch }) => {
  await openCollegaPublicatieViaUi(page, publications.last(), scratch.get('profielUuid')!)
})

Then('the current publicatie-eigenaar is shown before I claim it', async ({ page, scratch }) => {
  await expect(publicatieEigenaar(page)).toHaveText(scratch.get('colleagueName')!)
  // Claim is available precisely when the viewer is not the owner — proof we
  // opened a colleague's publicatie rather than our own.
  await expect(claimButton(page)).toBeVisible()
})
