import type { Page } from '@playwright/test'
import { publicationStatusAdmin } from '@/bdd/@publicatiebank/support/publication'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest, expect } from '@playwright/test'
import { Given, Then, When } from '../_core/fixture'
import { createAndPublishViaUi, openNieuwePublicatieAndSelectProfielViaUi, openOptionGroup, openPublicatieViaUi, selectableInformatiecategorieUuids, selectableOrganisatieUuids } from './support/publicatie-ui'
import { informatiecategorieen, resolveOrganisatieUuid } from './support/usergroup'

/**
 * Testscript 5 (gebruikersgroepen) steps. Every UI mutation runs through the
 * ordinary session-authenticated Playwright `page` — no Stagehand, no AI model
 * in the loop. The feature's `@admin` tag selects the admin storage state (see
 * `_core/roles.ts`); its cookies also authenticate the gpp-app. Verification
 * and cleanup use the odpc JSON API through the `usergroups` fixture — the
 * token API on the publicatiebank is not involved here.
 */

const gppApp = ENV.apps.gppApp.replace(/\/$/, '')
const READ = { timeout: 15_000, intervals: [500, 1000, 2000] }

// The gpp-app is a SPA that only hydrates its routes when navigated via clicks
// from the app root — deep-linking a route (e.g. /gebruikersgroepen/nieuw) leaves
// the form unrendered. So every flow starts at the root and clicks through.
async function openGebruikersgroepen(page: Page) {
  await page.goto(gppApp)
  await page.getByRole('link', { name: 'Gebruikersgroepen' }).click()
}

/** Create a gebruikersgroep with just a naam through the gpp-app UI. */
async function createGroupViaUi(page: Page, naam: string) {
  await openGebruikersgroepen(page)
  await page.getByRole('link', { name: 'Nieuwe gebruikersgroep' }).click()
  await page.getByRole('textbox', { name: 'Naam *' }).fill(naam)
  await page.getByRole('button', { name: 'Opslaan' }).click()
}

/** Open a gebruikersgroep by naam from the overview. */
async function openGroup(page: Page, naam: string) {
  await openGebruikersgroepen(page)
  await page.getByRole('link', { name: naam, exact: true }).click()
}

// --- Create -----------------------------------------------------------------

When('I create a gebruikersgroep through the gpp-app', async ({ page, usergroups }) => {
  const naam = usergroups.freshName()
  await createGroupViaUi(page, naam)
  usergroups.track(naam)
})

Then('the gebruikersgroep exists', async ({ usergroups }) => {
  const naam = usergroups.last()
  await expect.poll(() => usergroups.exists(naam), READ).toBe(true)
})

// --- Prerequisite -----------------------------------------------------------

Given('a gebruikersgroep', async ({ page, usergroups }) => {
  const naam = usergroups.freshName()
  await createGroupViaUi(page, naam)
  usergroups.track(naam)
  // Make sure it actually landed before the scenario mutates it.
  await expect.poll(() => usergroups.exists(naam), READ).toBe(true)
})

// --- Rename -----------------------------------------------------------------

When('I rename the gebruikersgroep through the gpp-app', async ({ page, usergroups, scratch }) => {
  const oldName = usergroups.last()
  const newName = `${usergroups.freshName()} hernoemd`
  scratch.set('groep:oldName', oldName)
  await openGroup(page, oldName)
  await page.getByRole('textbox', { name: 'Naam *' }).fill(newName)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  usergroups.track(newName)
})

Then('the gebruikersgroep is known under its new name and not the old one', async ({ usergroups, scratch }) => {
  const newName = usergroups.last()
  const oldName = scratch.get('groep:oldName')!
  await expect.poll(() => usergroups.exists(newName), READ).toBe(true)
  expect(await usergroups.exists(oldName)).toBe(false)
})

// --- Delete -----------------------------------------------------------------

When('I delete the gebruikersgroep through the gpp-app', async ({ page, usergroups }) => {
  const naam = usergroups.last()
  await openGroup(page, naam)
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('button', { name: 'Ja' }).click()
})

Then('the gebruikersgroep no longer exists', async ({ usergroups }) => {
  const naam = usergroups.last()
  await expect.poll(() => usergroups.exists(naam), READ).toBe(false)
})

// --- Create with omschrijving + gebruiker + autorisaties (4b-4g) ------------

// The form stays open across this whole chain of steps (naam+omschrijving ->
// gebruiker -> autorisaties -> save), so every step below acts on the same
// "Nieuwe gebruikersgroep" page the first step navigates to.

When('I create a gebruikersgroep with a naam and omschrijving through the gpp-app', async ({ page, usergroups, scratch }) => {
  const naam = usergroups.freshName()
  const omschrijving = `E2E omschrijving ${Date.now()}`
  scratch.set('groep:omschrijving', omschrijving)
  await openGebruikersgroepen(page)
  await page.getByRole('link', { name: 'Nieuwe gebruikersgroep' }).click()
  await page.getByRole('textbox', { name: 'Naam *' }).fill(naam)
  await page.getByRole('textbox', { name: 'Omschrijving' }).fill(omschrijving)
  usergroups.track(naam)
})

When('I add myself as a gebruiker to the gebruikersgroep', async ({ page }) => {
  // The signed-in identity is the admin user (the feature's @admin tag), same
  // one the ENV config uses to sign in — not read back from the API, since the
  // UI adds a gebruiker by e-mail rather than by id.
  await page.getByRole('textbox', { name: 'Gebruiker toevoegen ?' }).fill(ENV.users.admin.email)
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await openOptionGroup(page, 'Toegevoegde gebruikers')
})

/**
 * The autorisatie sections only render once the waardelijsten they list are
 * non-empty: with no *actieve* organisatie the form shows "Er is iets misgegaan
 * bij het ophalen van de waardelijsten" and no sections at all, and the
 * "Onderwerp" section is absent until at least one onderwerp exists. Both are
 * test-owned here (a concept onderwerp is enough and stays off the
 * burgerportaal) instead of relying on demo rows that a fresh stack lacks.
 */
Given('waardelijsten to authorise the gebruikersgroep for', async ({ organisations, topics, scratch }) => {
  const orgNaam = await organisations.add()
  scratch.set('groep:onderwerpTitel', await topics.add())
  const ctx = await apiRequest.newContext({ storageState: adminState })
  try {
    scratch.set('groep:organisatieUuid', await resolveOrganisatieUuid(ctx, orgNaam))
    const cats = await informatiecategorieen(ctx, 2)
    scratch.set('groep:catUuids', JSON.stringify(cats.map(c => c.uuid)))
  }
  finally {
    await ctx.dispose()
  }
})

When('I authorise the gebruikersgroep for one or more organisaties', async ({ page, scratch }) => {
  await openOptionGroup(page, 'Organisatie')
  await page.locator(`input[type="checkbox"][value="${scratch.get('groep:organisatieUuid')}"]`).check()
})

When('I authorise the gebruikersgroep for one or more informatiecategorieën', async ({ page, scratch }) => {
  await openOptionGroup(page, 'Informatiecategorie')
  for (const uuid of JSON.parse(scratch.get('groep:catUuids')!) as string[])
    await page.locator(`input[type="checkbox"][value="${uuid}"]`).check()
})

When('I authorise the gebruikersgroep for one or more onderwerpen', async ({ page, scratch }) => {
  await openOptionGroup(page, 'Onderwerp')
  await page.getByRole('checkbox', { name: scratch.get('groep:onderwerpTitel')! }).check()
})

When('I save the gebruikersgroep', async ({ page }) => {
  await page.getByRole('button', { name: 'Opslaan' }).click()
})

Then('the gebruikersgroep has the entered omschrijving, gebruiker and autorisaties', async ({ usergroups, scratch }) => {
  const naam = usergroups.last()
  const omschrijving = scratch.get('groep:omschrijving')!
  await expect.poll(async () => (await usergroups.detail(naam)).omschrijving, READ).toBe(omschrijving)
  const detail = await usergroups.detail(naam)
  expect(detail.gekoppeldeGebruikers.length).toBeGreaterThan(0)
  expect(detail.gekoppeldeWaardelijsten.length).toBeGreaterThanOrEqual(3)
})

// --- Autorisaties constrain the publicatie flow (step 5) --------------------

Given('a gebruikersgroep authorised for one organisatie and one informatiecategorie', async ({ authProfile, scratch }) => {
  const { profielUuid, naam, organisatieUuid, informatiecategorieUuid } = await authProfile.seed()
  scratch.set('profielUuid', profielUuid)
  scratch.set('groep:naam', naam)
  scratch.set('organisatieUuid', organisatieUuid)
  scratch.set('informatiecategorieUuid', informatiecategorieUuid)
})

When('I start a nieuwe publicatie in the gpp-app', async ({ page, scratch }) => {
  await openNieuwePublicatieAndSelectProfielViaUi(page, scratch.get('profielUuid')!)
})

Then('I can only select the organisatie and informatiecategorie the gebruikersgroep is authorised for', async ({ page, scratch }) => {
  const organisatieUuid = scratch.get('organisatieUuid')!
  const informatiecategorieUuid = scratch.get('informatiecategorieUuid')!
  expect(await selectableOrganisatieUuids(page)).toEqual([organisatieUuid])
  expect(await selectableInformatiecategorieUuids(page)).toEqual([informatiecategorieUuid])
})

// --- Edit omschrijving + add another gebruiker (6a-6d) ----------------------

When('I change the gebruikersgroep omschrijving through the gpp-app', async ({ page, usergroups, scratch }) => {
  const naam = usergroups.last()
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('groep:omschrijving', omschrijving)
  await openGroup(page, naam)
  await page.getByRole('textbox', { name: 'Omschrijving' }).fill(omschrijving)
  await page.getByRole('button', { name: 'Opslaan' }).click()
})

When('I add another gebruiker to the gebruikersgroep through the gpp-app', async ({ page, usergroups }) => {
  // "Another" gebruiker than the signed-in admin — the regular user is a
  // distinct, already-configured identity, not a made-up e-mail.
  const secondUserEmail = ENV.users.regular.email
  await openGroup(page, usergroups.last())
  await page.getByRole('textbox', { name: 'Gebruiker toevoegen ?' }).fill(secondUserEmail)
  await page.getByRole('button', { name: 'Toevoegen' }).click()
  await openOptionGroup(page, 'Toegevoegde gebruikers')
  // Confirm the row actually landed before saving.
  await expect(page.getByRole('cell', { name: secondUserEmail, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Opslaan' }).click()
})

Then('the gebruikersgroep has the changed omschrijving and the added gebruiker', async ({ usergroups, scratch }) => {
  const naam = usergroups.last()
  const omschrijving = scratch.get('groep:omschrijving')!
  await expect.poll(async () => (await usergroups.detail(naam)).omschrijving, READ).toBe(omschrijving)
  const detail = await usergroups.detail(naam)
  expect(detail.gekoppeldeGebruikers.length).toBeGreaterThanOrEqual(1)
})

// --- Modify autorisaties + verify change (6e-6h) ----------------------------
// The seeded organisatie/informatiecategorie uuids (see the Given above) let the
// old organisatie's checkbox be unticked by `value` — no display naam needed —
// mirroring how support/publicatie-ui.ts targets these same waardelijst inputs.

When('I change the gebruikersgroep autorisaties through the gpp-app', async ({ page, organisations, scratch }) => {
  const naam = scratch.get('groep:naam')!
  const oldOrganisatieUuid = scratch.get('organisatieUuid')!

  // A fresh, self-added organisatie to switch to — deterministic, not a hardcoded uuid.
  const ctx = await apiRequest.newContext({ storageState: adminState })
  let newOrganisatieUuid: string
  try {
    const newOrganisatieNaam = await organisations.add()
    newOrganisatieUuid = await resolveOrganisatieUuid(ctx, newOrganisatieNaam)
  }
  finally {
    await ctx.dispose()
  }
  scratch.set('groep:newOrganisatieUuid', newOrganisatieUuid)

  await openGroup(page, naam)
  await openOptionGroup(page, 'Organisatie')
  await page.locator(`input[type="checkbox"][value="${oldOrganisatieUuid}"]`).uncheck()
  await page.locator(`input[type="checkbox"][value="${newOrganisatieUuid}"]`).check()
  await page.getByRole('button', { name: 'Opslaan' }).click()
})

Then('the gebruikersgroep reflects the changed autorisaties', async ({ usergroups, scratch }) => {
  const naam = scratch.get('groep:naam')!
  const oldOrganisatieUuid = scratch.get('organisatieUuid')!
  const newOrganisatieUuid = scratch.get('groep:newOrganisatieUuid')!
  await expect.poll(async () => (await usergroups.detail(naam)).gekoppeldeWaardelijsten, READ)
    .toEqual(expect.arrayContaining([newOrganisatieUuid]))
  const { gekoppeldeWaardelijsten } = await usergroups.detail(naam)
  expect(gekoppeldeWaardelijsten).not.toContain(oldOrganisatieUuid)
})

Then('a nieuwe publicatie only offers the changed authorised waardelijsten', async ({ page, scratch }) => {
  const profielUuid = scratch.get('profielUuid')!
  const newOrganisatieUuid = scratch.get('groep:newOrganisatieUuid')!
  const informatiecategorieUuid = scratch.get('informatiecategorieUuid')!
  await openNieuwePublicatieAndSelectProfielViaUi(page, profielUuid)
  expect(await selectableOrganisatieUuids(page)).toEqual([newOrganisatieUuid])
  expect(await selectableInformatiecategorieUuids(page)).toEqual([informatiecategorieUuid])
})

// --- Existing publicatie no longer authorised (6i) --------------------------

Given('an existing publicatie made under that gebruikersgroep', async ({ page, publications, scratch }) => {
  const titel = publications.freshName()
  await createAndPublishViaUi(page, {
    profielUuid: scratch.get('profielUuid')!,
    organisatieUuid: scratch.get('organisatieUuid')!,
    informatiecategorieUuid: scratch.get('informatiecategorieUuid')!,
    titel,
  })
  publications.track(titel)
  // Make sure it actually published before the scenario strips the autorisatie.
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe('gepubliceerd')
})

When('I remove the informatiecategorie autorisatie from the gebruikersgroep through the gpp-app', async ({ page, scratch }) => {
  const naam = scratch.get('groep:naam')!
  const informatiecategorieUuid = scratch.get('informatiecategorieUuid')!
  await openGroup(page, naam)
  await openOptionGroup(page, 'Informatiecategorie')
  await page.locator(`input[type="checkbox"][value="${informatiecategorieUuid}"]`).uncheck()
  await page.getByRole('button', { name: 'Opslaan' }).click()
})

When('I open the existing publicatie for editing in the gpp-app', async ({ page, publications }) => {
  // Opening it is enough: the app renders the "no longer authorised" notice on
  // the publicatie itself, it does not wait for a republish attempt.
  await openPublicatieViaUi(page, publications.last())
})

Then('I see an error telling me to contact the beheerder', async ({ page }) => {
  // Observed message: "De publicatie kon niet worden ... Probeer het nogmaals
  // of neem contact op met de beheerder." — anchored on the trailing,
  // unambiguous phrase rather than the full (possibly-truncated) sentence.
  await expect(page.getByText(/neem contact op met de beheerder/i)).toBeVisible()
})
