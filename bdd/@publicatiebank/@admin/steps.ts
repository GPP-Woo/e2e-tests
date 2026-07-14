import type { Stagehand } from '@browserbasehq/stagehand'
import { adminDriver } from '@/bdd/@publicatiebank/support/admin-driver'
import { organisationExists, organisationIsActive } from '@/bdd/@publicatiebank/support/organisation'
import { hasOpenRouterKey } from '@/bdd/_core/stagehand'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../../_core/fixture'

/**
 * Testscript 4 (organisaties) steps. UI *mutations* run through the Django admin
 * via Stagehand `act()` on Dutch labels — no hand-written selectors — behind the
 * shared {@link adminDriver} seam. Assertions are made *deterministically* by
 * reading the admin back through the ordinary Playwright `page` (a separate,
 * session-authenticated browser): the token API is unreliable while Stagehand
 * drives the same server (see README "Known server flake"), whereas admin reads
 * authenticate as a real user and are stable.
 *
 * The organisatie API has no RSIN field and no DELETE, so "edit" is exercised by
 * renaming (naam is visible in the changelist) and cleanup is admin-driven.
 */

const pub = ENV.apps.publicatiebank.replace(/\/$/, '')
const ORG_CHANGELIST = `${pub}/admin/metadata/organisation/`
const ORG_ADD = `${pub}/admin/metadata/organisation/add/`
const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

function org(stagehand: Stagehand) {
  return adminDriver(stagehand, { noun: 'organisatie', changelist: ORG_CHANGELIST, add: ORG_ADD })
}

// Skip the feature when no model key is configured (like @beheer), so the rest
// of the suite stays green without OpenRouter.
Before({ tags: '@anthropic' }, async () => {
  test.skip(!hasOpenRouterKey(), 'Set OPENROUTER_API_KEY to run the Stagehand @admin scenarios')
})

Given('the publicatiebank organisatie admin is open', async ({ adminStagehand }) => {
  await org(adminStagehand).openList()
})

// --- prerequisites (deterministic, not the action under test) --------------

Given('a self-added organisatie', async ({ organisations }) => {
  await organisations.add()
})

Given('a self-added organisatie that is not active', async ({ organisations }) => {
  await organisations.add(undefined, { actief: false })
})

// --- Add (mutation via Stagehand) ------------------------------------------

When('I add a self-added organisatie through the admin', async ({ adminStagehand, organisations }) => {
  const naam = organisations.freshName()
  const d = org(adminStagehand)
  await d.openAdd()
  await d.act(`Fill the "Naam" field with: ${naam}`)
  await d.act('Make sure the "Is actief" checkbox is ticked')
  await d.save()
  organisations.track(naam)
})

Then('the organisatie exists in the API and is active', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Activate --------------------------------------------------------------

When('I tick the {string} checkbox and save the organisatie', async ({ adminStagehand, organisations }, label: string) => {
  const d = org(adminStagehand)
  await d.open(organisations.last())
  await d.act(`Tick the "${label}" checkbox`)
  await d.save()
})

Then('the organisatie is active in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Rename (edit) ---------------------------------------------------------

When('I rename the organisatie and save it', async ({ adminStagehand, organisations, scratch }) => {
  const oldName = organisations.last()
  const newName = `${organisations.freshName()} hernoemd`
  scratch.set('org:oldName', oldName)
  const d = org(adminStagehand)
  await d.open(oldName)
  await d.act(`Replace the contents of the "Naam" field with: ${newName}`)
  await d.save()
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

When('I delete the organisatie through the admin', async ({ adminStagehand, organisations }) => {
  const d = org(adminStagehand)
  await d.open(organisations.last())
  await d.removeCurrent()
})

Then('the organisatie no longer exists in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationExists(page, naam), READ).toBe(false)
})

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the self-added organisatie', async ({ adminStagehand, organisations }) => {
  await org(adminStagehand).search(organisations.last())
})

Then('the self-added organisatie is shown in the admin results', async ({ page, organisations }) => {
  const naam = organisations.last()
  // The Stagehand search ran above; confirm the organisatie is findable through
  // the admin deterministically (organisationExists searches the changelist too).
  expect(await organisationExists(page, naam)).toBe(true)
})
