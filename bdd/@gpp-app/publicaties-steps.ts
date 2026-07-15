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
