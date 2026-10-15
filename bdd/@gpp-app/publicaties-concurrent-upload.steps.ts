import type { Page } from '@playwright/test'
import { addSelfAddedOrganisation, deleteOrganisationByName } from '@/bdd/@publicatiebank/support/organisation'
import { deletePublicationByTitel, publicationStatusAdmin } from '@/bdd/@publicatiebank/support/publication'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { expect, request as apiRequest, test } from '@playwright/test'
import { After, Given, Then, When } from '../_core/fixture'
import { createAndPublishViaUi, DOCUMENT_FIXTURE } from './support/publicatie-ui'
import { createAuthorisedGroup, currentUserId, informatiecategorieen, resolveOrganisatieUuid } from './support/usergroup'

/**
 * Steps for publicaties-concurrent-upload.feature — see that file's header for
 * why ALL Django-admin interaction (organisatie seeding, publicatiestatus
 * verification, cleanup) runs through a dedicated admin-authenticated page
 * rather than the scenario's own `page`: `@regular`'s own `page` only ever
 * signs into the gpp-app (see `_core/roles.ts`), so it has no session on the
 * publicatiebank Django admin — any admin-UI helper fed that `page` directly
 * (as the TS6/7 steps do) hits the admin's login form and hangs.
 *
 * The scenario's own `page` is used for exactly one thing: signing into and
 * driving the gpp-app SPA upload + publish action — the thing actually under
 * test for each of the two users.
 */

const READ = { timeout: 15_000, intervals: [500, 1000, 2000] }

/** Scenario-scoped admin page + its own-and-cleanup state, keyed by worker. */
interface AdminSeedState {
  adminPage: Page
  orgNaam?: string
  publicatieTitel?: string
}
const seedStateByWorker = new Map<number, AdminSeedState>()

Given('the signed-in user is authorised to upload and publish', async ({ page, browser, scratch }) => {
  // A dedicated admin-authenticated page/context, independent of whichever
  // session (@admin/@regular) this scenario's own `page` carries — see the
  // module comment above.
  const adminContext = await browser.newContext({ storageState: adminState })
  const adminPage = await adminContext.newPage()
  const workerIndex = test.info().parallelIndex
  const orgNaam = `E2E org ${workerIndex}-${Date.now()}`
  await addSelfAddedOrganisation(adminPage, orgNaam)
  seedStateByWorker.set(workerIndex, { adminPage, orgNaam })

  // Read the IDENTITY of whichever session this scenario's own `page` actually
  // carries (admin or regular), via that session's own cookies.
  const me = await page.request.get(new URL('/api/me', ENV.apps.gppApp).href).then(r => r.json())
  if (!me?.id)
    throw new Error(`/api/me returned no id for the signed-in session: ${JSON.stringify(me).slice(0, 200)}`)

  // Admin-authenticated odpc API context — resolving the organisatie uuid and
  // creating the gebruikersgroep are both API calls, unaffected by which page
  // signed in as whom.
  const ctx = await apiRequest.newContext({ storageState: adminState })
  try {
    const organisatieUuid = await resolveOrganisatieUuid(ctx, orgNaam)
    const [cat] = await informatiecategorieen(ctx, 1)
    const adminId = await currentUserId(ctx)
    const naam = `E2E profiel ${workerIndex}-${Date.now()}`
    // De-duplicated: for the @admin scenario `adminId === me.id`, and the odpc
    // API 500s on a duplicate member (a DB uniqueness conflict), so a plain
    // `[adminId, me.id]` broke that scenario.
    const gebruikerIds = [...new Set([adminId, me.id])]
    const profielUuid = await createAuthorisedGroup(ctx, {
      naam,
      gebruikerIds,
      waardelijstUuids: [organisatieUuid, cat.uuid],
    })
    scratch.set('profielUuid', profielUuid)
    scratch.set('organisatieUuid', organisatieUuid)
    scratch.set('informatiecategorieUuid', cat.uuid)
  }
  finally {
    await ctx.dispose()
  }
})

When('I upload a document and publish the publicatie', async ({ page, scratch }) => {
  const workerIndex = test.info().parallelIndex
  const titel = `E2E pub ${workerIndex}-${Date.now()}`
  await createAndPublishViaUi(page, {
    profielUuid: scratch.get('profielUuid')!,
    organisatieUuid: scratch.get('organisatieUuid')!,
    informatiecategorieUuid: scratch.get('informatiecategorieUuid')!,
    titel,
    filePath: DOCUMENT_FIXTURE,
  })
  const state = seedStateByWorker.get(workerIndex)
  if (state)
    state.publicatieTitel = titel
  scratch.set('publicatieTitel', titel)
})

Then('the publicatie shows as gepubliceerd in the admin', async ({ scratch }) => {
  const state = seedStateByWorker.get(test.info().parallelIndex)
  if (!state)
    throw new Error('No admin page open for this scenario (Given step did not run?)')
  const titel = scratch.get('publicatieTitel')!
  await expect.poll(() => publicationStatusAdmin(state.adminPage, titel), READ).toBe('gepubliceerd')
})

// Best-effort cleanup of the organisatie + publicatie created above, and the
// dedicated admin context itself. The organisatie API has no DELETE and the
// admin page here is scenario-local (not a shared fixture), so cleanup happens
// in this hook rather than through the `organisations`/`publications`
// fixtures — both are bound to the scenario's own `page` and would break for
// @regular (see the module comment). The run-wide sweep in
// setup/global-teardown.ts is the backstop if this best-effort cleanup itself
// is interrupted.
After({ tags: '@concurrent-upload' }, async ({}, testInfo) => { // eslint-disable-line no-empty-pattern
  const workerIndex = testInfo?.parallelIndex ?? test.info().parallelIndex
  const state = seedStateByWorker.get(workerIndex)
  if (!state)
    return
  seedStateByWorker.delete(workerIndex)
  if (state.publicatieTitel)
    await deletePublicationByTitel(state.adminPage, state.publicatieTitel).catch(() => {})
  if (state.orgNaam)
    await deleteOrganisationByName(state.adminPage, state.orgNaam).catch(() => {})
  await state.adminPage.context().close().catch(() => {})
})
