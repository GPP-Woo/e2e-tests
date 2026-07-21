import { organisationExists, organisationIsActive } from '@/bdd/@publicatiebank/support/organisation'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 4 (organisaties) steps. UI *mutations* run through the Django admin
 * via Stagehand `act()` on Dutch labels — no hand-written selectors — behind the
 * `orgAdmin` fixture (a ready-built {@link AdminDriver} bound to `adminStagehand`;
 * see _core/fixture.ts). Assertions are made *deterministically* by reading the
 * admin back through the ordinary Playwright `page` (a separate,
 * session-authenticated browser): the token API is unreliable while Stagehand
 * drives the same server (see README "Known server flake"), whereas admin reads
 * authenticate as a real user and are stable.
 *
 * The organisatie API has no RSIN field and no DELETE, so "edit" is exercised by
 * renaming (naam is visible in the changelist) and cleanup is admin-driven.
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

Given('the publicatiebank organisatie admin is open', async ({ orgAdmin }) => {
  await orgAdmin.openList()
})

// --- prerequisites (deterministic, not the action under test) --------------

Given('a self-added organisatie', async ({ organisations }) => {
  await organisations.add()
})

Given('a self-added organisatie that is not active', async ({ organisations }) => {
  await organisations.add(undefined, { actief: false })
})

// --- Add (mutation via Stagehand) ------------------------------------------

When('I add a self-added organisatie through the admin', async ({ orgAdmin, organisations }) => {
  const naam = organisations.freshName()
  await orgAdmin.openAdd()
  await orgAdmin.act(`Fill the "Naam" field with: ${naam}`)
  await orgAdmin.act('Make sure the "Is actief" checkbox is ticked')
  await orgAdmin.save()
  organisations.track(naam)
})

Then('the organisatie exists in the API and is active', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Activate --------------------------------------------------------------

When('I tick the {string} checkbox and save the organisatie', async ({ orgAdmin, organisations }, label: string) => {
  await orgAdmin.open(organisations.last())
  await orgAdmin.act(`Tick the "${label}" checkbox`)
  await orgAdmin.save()
})

Then('the organisatie is active in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Rename (edit) ---------------------------------------------------------

When('I rename the organisatie and save it', async ({ orgAdmin, organisations, scratch }) => {
  const oldName = organisations.last()
  const newName = `${organisations.freshName()} hernoemd`
  scratch.set('org:oldName', oldName)
  await orgAdmin.open(oldName)
  await orgAdmin.act(`Replace the contents of the "Naam" field with: ${newName}`)
  await orgAdmin.save()
  // Track the new name so teardown deletes the renamed row too.
  organisations.track(newName)
})

Then('the API knows the organisatie under its new name and not the old one', async ({ page, organisations, scratch }) => {
  const newName = organisations.last()
  const oldName = scratch.get('org:oldName')!
  await expect.poll(() => organisationExists(page, newName), READ).toBe(true)
  expect(await organisationExists(page, oldName)).toBe(false)
})

// --- Delete ----------------------------------------------------------------

When('I delete the organisatie through the admin', async ({ orgAdmin, organisations }) => {
  await orgAdmin.open(organisations.last())
  await orgAdmin.removeCurrent()
})

Then('the organisatie no longer exists in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationExists(page, naam), READ).toBe(false)
})

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the self-added organisatie', async ({ orgAdmin, organisations }) => {
  await orgAdmin.search(organisations.last())
})

Then('the self-added organisatie is shown in the admin results', async ({ page, organisations }) => {
  const naam = organisations.last()
  // The Stagehand search ran above; confirm the organisatie is findable through
  // the admin deterministically (organisationExists searches the changelist too).
  expect(await organisationExists(page, naam)).toBe(true)
})

// ===========================================================================
// @todo — Testscript 4 coverage gaps (gap matrix rows 56-65). Stubs only: the
// @todo Before hook skips these scenarios, but the steps must be registered so
// bddgen stays green. Follow the file's split: mutate/read the changelist UI via
// `orgAdmin` (Stagehand), assert deterministically through the session `page`.
// ===========================================================================

// --- Sort (changelist ordering under test) ---------------------------------

When('I sort the organisatie changelist by the {string} column', async (_, _column: string) => {
  // Impl: orgAdmin.act(`Click the "${_column}" column header to sort the table`), then settle.
  throw new Error('TODO: click the changelist column header via orgAdmin.act to sort by naam')
})

Then('the organisaties are listed in alphabetical order by name', async () => {
  // Impl: read the `th.field-naam a` cells off the changelist on `page` and assert
  // the array equals its locale-sorted copy (see admin-resource nameCell selector).
  throw new Error('TODO: read the naam column off the changelist and assert ascending order')
})

// --- Filter (right-side "actief" filter under test) ------------------------

When('I filter the organisatie changelist on active organisaties', async () => {
  // Impl: orgAdmin.act('Use the filter on the right to show only actieve organisaties'), then settle.
  throw new Error('TODO: apply the right-hand "actief" changelist filter via orgAdmin.act')
})

Then('only active organisaties are shown in the results', async () => {
  // Impl: for each naam in the filtered changelist assert organisationIsActive(page, naam) is true;
  // at minimum confirm the tracked self-added org (created actief) is present.
  throw new Error('TODO: assert every organisatie in the filtered results is active')
})

// --- Cross-application: publicatiebank vs GPP-app waardelijst ---------------

When('I list the active organisaties in the admin', async () => {
  // Impl: filter the changelist to actief and collect the naam cells, storing the
  // set in `scratch` (JSON) for the Then to compare against the GPP-app.
  throw new Error('TODO: collect the active organisatie names from the admin into scratch')
})

Then('the same organisaties are available in the GPP-app gebruikersgroep waardelijst', async () => {
  // Impl: read the gpp-app waardelijst via a session ctx (apiRequest.newContext({ storageState: adminState }))
  // and GET /api/v2/organisaties (see @gpp-app/support/usergroup resolveOrganisatieUuid); assert the
  // scratch set of active names is a subset of the GPP-app organisatie namen.
  throw new Error('TODO: cross-check the active admin organisaties against the GPP-app /api/v2/organisaties list')
})

// --- Logging: "Toon logs" on a self-added organisatie ----------------------

When('I open the organisatie logs via {string}', async (_, _button: string) => {
  // Impl: orgAdmin.act(`Click the "${_button}" button on the organisatie detail page`), then settle.
  throw new Error('TODO: open the organisatie logs by clicking the "Toon logs" button via orgAdmin.act')
})

Then('the edit is recorded in the organisatie logs', async () => {
  // Impl: on the logs page (session `page`), assert a "gewijzigd"/"Naam" entry exists
  // for the renamed organisatie (organisations.last()).
  throw new Error('TODO: assert the rename shows as a wijzigings-logregel for the organisatie')
})

// --- Audit logging after delete (Logging tab → (audit)logitems) ------------

When('I open the audit log items', async () => {
  // Impl: orgAdmin.act('Open the "Logging" tab and go to the (audit)logitems list'), then settle.
  throw new Error('TODO: navigate to the (audit)logitems changelist via the Logging tab')
})

Then('the deletion of the organisatie is recorded in the audit log', async () => {
  // Impl: search the (audit)logitems changelist on `page` for the deleted organisatie naam
  // (organisations.last()) and assert a "verwijderd"/delete entry is present.
  throw new Error('TODO: assert a delete audit-logitem exists for the removed organisatie')
})
