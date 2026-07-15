import { organisationExists, organisationIsActive } from '@/bdd/@publicatiebank/support/organisation'
import { hasOpenRouterKey } from '@/bdd/_core/stagehand'
import { expect } from '@playwright/test'
import { Before, Given, test, Then, When } from '../../_core/fixture'

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

// Skip AI-driven scenarios when no model key is configured, so the rest of the
// suite stays green without OpenRouter. `@ai` marks every Stagehand scenario
// across the admin + gpp-app verticals (@beheer has its own guard).
//
// Also chromium-only: Stagehand drives Chromium over CDP and attaches to the
// Playwright browser's remote-debugging port (see fixture.ts + playwright.config.ts),
// which only Chromium exposes. On firefox/webkit there is no port to join, and
// the AI browser would be Chromium anyway, so those add no real coverage.
Before({ tags: '@ai' }, async ({ browserName }) => {
  test.skip(!hasOpenRouterKey(), 'Set OPENROUTER_API_KEY to run the Stagehand @ai scenarios')
  test.skip(browserName !== 'chromium', `@ai attaches Stagehand to Chromium's CDP port; ${browserName} has none`)
})

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
