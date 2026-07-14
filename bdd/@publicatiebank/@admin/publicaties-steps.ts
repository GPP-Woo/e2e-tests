import type { Stagehand } from '@browserbasehq/stagehand'
import { adminDriver } from '@/bdd/@publicatiebank/support/admin-driver'
import {
  addPublishedPublication,
  publicationExistsAdmin,
  publicationOmschrijvingAdmin,
  publicationStatusAdmin,
} from '@/bdd/@publicatiebank/support/publication'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 9 (publicatie beheer) steps. Publicaties are seeded and cleaned up
 * over the admin by the `publications` fixture; the beheer *mutations* run
 * through the Django admin via Stagehand `act()` behind the shared
 * {@link adminDriver} seam, and assertions read the admin back through the
 * ordinary session-authenticated `page` (stable, unlike the token API while
 * Stagehand drives the same server — see README "Known server flake").
 *
 * The `@anthropic` skip guard (no OpenRouter key → skip) and the `adminStagehand`
 * fixture are shared with the organisatie/onderwerp steps (see steps.ts).
 */

const pub = ENV.apps.publicatiebank.replace(/\/$/, '')
const PUB_CHANGELIST = `${pub}/admin/publications/publication/`
const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

function publicatie(stagehand: Stagehand) {
  return adminDriver(stagehand, { noun: 'publicatie', changelist: PUB_CHANGELIST, rowLink: 'titel link' })
}

// Prerequisites (deterministic, not the action under test), seeded through the
// admin add form — the token API is unusable while Stagehand drives the admin.
Given('a concept publicatie', async ({ publications }) => {
  await publications.seed()
})

// A gepubliceerd publicatie, seeded deterministically through the admin (needs a
// publisher organisatie + an informatiecategorie); the withdraw is the mutation
// under test.
Given('a published publicatie', async ({ page, publications, organisations }) => {
  const orgNaam = await organisations.add()
  const titel = publications.freshName()
  await addPublishedPublication(page, titel, orgNaam)
  publications.track(titel)
})

// --- Edit omschrijving ------------------------------------------------------

When('I change the publicatie omschrijving through the admin', async ({ adminStagehand, publications, scratch }) => {
  const omschrijving = `E2E gewijzigde omschrijving ${Date.now()}`
  scratch.set('pub:omschrijving', omschrijving)
  const d = publicatie(adminStagehand)
  await d.open(publications.last())
  await d.act(`Replace the contents of the "Omschrijving" field with: ${omschrijving}`)
  await d.save()
})

Then('the publicatie has the new omschrijving', async ({ page, publications, scratch }) => {
  const titel = publications.last()
  const expected = scratch.get('pub:omschrijving')!
  await expect.poll(() => publicationOmschrijvingAdmin(page, titel), READ).toContain(expected)
})

// --- Rename -----------------------------------------------------------------

When('I rename the publicatie through the admin', async ({ adminStagehand, publications, scratch }) => {
  const oldTitel = publications.last()
  const newTitel = `${publications.freshName()} hernoemd`
  scratch.set('pub:oldTitel', oldTitel)
  const d = publicatie(adminStagehand)
  await d.open(oldTitel)
  await d.act(`Replace the contents of the "Officiële titel" field with: ${newTitel}`)
  await d.save()
  // Track the new titel so cleanup deletes the renamed publicatie too.
  publications.track(newTitel)
})

Then('the publicatie is known under its new titel and not the old one', async ({ page, publications, scratch }) => {
  const newTitel = publications.last()
  const oldTitel = scratch.get('pub:oldTitel')!
  await expect.poll(() => publicationExistsAdmin(page, newTitel), READ).toBe(true)
  expect(await publicationExistsAdmin(page, oldTitel)).toBe(false)
})

// --- Withdraw (intrekken) ---------------------------------------------------

When('I set the publicatiestatus to {string} and save the publicatie', async ({ adminStagehand, publications }, label: string) => {
  const d = publicatie(adminStagehand)
  await d.open(publications.last())
  await d.act(`Select "${label}" as the publicatiestatus`)
  await d.save()
})

Then('the publicatie has status {string}', async ({ page, publications }, status: string) => {
  const titel = publications.last()
  await expect.poll(() => publicationStatusAdmin(page, titel), READ).toBe(status)
})

// --- Delete -----------------------------------------------------------------

When('I delete the publicatie through the admin', async ({ adminStagehand, publications }) => {
  const d = publicatie(adminStagehand)
  await d.open(publications.last())
  await d.removeCurrent()
})

Then('the publicatie no longer exists', async ({ page, publications }) => {
  const titel = publications.last()
  await expect.poll(() => publicationExistsAdmin(page, titel), READ).toBe(false)
})

// --- Search (UI read under test) --------------------------------------------

When('I search the admin for the publicatie', async ({ adminStagehand, publications }) => {
  await publicatie(adminStagehand).search(publications.last())
})

Then('the publicatie is shown in the admin results', async ({ page, publications }) => {
  const titel = publications.last()
  expect(await publicationExistsAdmin(page, titel)).toBe(true)
})
