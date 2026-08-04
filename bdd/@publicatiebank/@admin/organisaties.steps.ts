import type { Page } from '@playwright/test'
import { resolveOrganisatieUuid } from '@/bdd/@gpp-app/support/usergroup'
import { openBeheer } from '@/bdd/@publicatiebank/support/login'
import { organisationExists, organisationIsActive } from '@/bdd/@publicatiebank/support/organisation'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest, expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'

/**
 * Testscript 4 (organisaties) steps. Every UI mutation and read runs through
 * the ordinary session-authenticated Playwright `page` — no Stagehand, no AI
 * model in the loop. The `@admin` tag this file inherits from its directory
 * path (`@publicatiebank/@admin`) selects the admin storage state (see
 * `_core/roles.ts`), so the admin session is already live before any step runs.
 *
 * The organisatie API has no RSIN field and no DELETE, so "edit" is exercised by
 * renaming (naam is visible in the changelist) and cleanup is admin-driven.
 */

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

function randomRsin(): string {
  return String(100_000_000 + Math.floor(Math.random() * 900_000_000))
}

async function searchOrganisaties(page: Page, query: string) {
  await page.getByRole('textbox', { name: 'Search' }).fill(query)
  await page.getByRole('button', { name: 'Zoeken' }).click()
}

async function openOrganisatie(page: Page, naam: string) {
  await searchOrganisaties(page, naam)
  await page.getByRole('link', { name: naam, exact: true }).click()
}

Given('the publicatiebank organisatie admin is open', async ({ page }) => {
  await openBeheer(page)
  await page.locator('#header').getByRole('link', { name: 'Organisaties' }).click()
})

// --- prerequisites (deterministic, not the action under test) --------------

Given('a self-added organisatie', async ({ organisations }) => {
  await organisations.add()
})

Given('a self-added organisatie that is not active', async ({ organisations }) => {
  await organisations.add(undefined, { actief: false })
})

// --- Add ---------------------------------------------------------------

When('I add a self-added organisatie through the admin', async ({ page, organisations }) => {
  const naam = organisations.freshName()
  await page.getByRole('link', { name: 'organisatie toevoegen' }).click()
  await page.getByRole('textbox', { name: 'Naam:' }).fill(naam)

  // RSIN isn't required by the organisatie API/model, but fill it when the
  // admin form renders it so the add flow matches a real recorded session.
  const rsin = page.getByRole('textbox', { name: 'RSIN:' })
  if (await rsin.count())
    await rsin.fill(randomRsin())

  const actief = page.locator('#id_is_actief')
  if (!(await actief.isChecked()))
    await actief.check()

  await page.getByRole('button', { name: 'Opslaan', exact: true }).click()
  organisations.track(naam)
})

Then('the organisatie exists in the API and is active', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Activate ------------------------------------------------------------

When('I tick the {string} checkbox and save the organisatie', async ({ page, organisations }, _label: string) => {
  await openOrganisatie(page, organisations.last())
  await page.locator('#id_is_actief').check()
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click()
})

Then('the organisatie is active in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationIsActive(page, naam), READ).toBe(true)
})

// --- Rename (edit) ---------------------------------------------------------

When('I rename the organisatie and save it', async ({ page, organisations, scratch }) => {
  const oldName = organisations.last()
  const newName = `${organisations.freshName()} hernoemd`
  scratch.set('org:oldName', oldName)
  await openOrganisatie(page, oldName)
  await page.getByRole('textbox', { name: 'Naam:' }).fill(newName)
  await page.getByRole('button', { name: 'Opslaan', exact: true }).click()
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

When('I delete the organisatie through the admin', async ({ page, organisations }) => {
  await openOrganisatie(page, organisations.last())
  await page.getByRole('link', { name: 'Verwijderen' }).click()
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
})

Then('the organisatie no longer exists in the API', async ({ page, organisations }) => {
  const naam = organisations.last()
  await expect.poll(() => organisationExists(page, naam), READ).toBe(false)
})

// --- Search (UI read under test) -------------------------------------------

When('I search the admin for the self-added organisatie', async ({ page, organisations }) => {
  await searchOrganisaties(page, organisations.last())
})

Then('the self-added organisatie is shown in the admin results', async ({ page, organisations }) => {
  const naam = organisations.last()
  // The search above exercised the admin UI; organisationExists confirms it
  // deterministically (it searches the changelist too).
  expect(await organisationExists(page, naam)).toBe(true)
})

// --- Sort (changelist ordering under test) ---------------------------------

When('I sort the organisatie changelist by the {string} column', async ({ page }, column: string) => {
  await page.getByRole('link', { name: column }).click()
})

Then('the organisaties are listed in alphabetical order by name', async ({ page }) => {
  const names = (await page.locator('th.field-naam a').allTextContents()).map(n => n.trim())
  expect(names.length).toBeGreaterThan(0)
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
})

// --- Filter (right-side "actief" filter under test) ------------------------

When('I filter the organisatie changelist on active organisaties', async ({ page }) => {
  await page.locator('#changelist-filter').getByRole('link', { name: 'Ja', exact: true }).click()
})

Then('only active organisaties are shown in the results', async ({ page, organisations }) => {
  const names = (await page.locator('th.field-naam a').allTextContents()).map(n => n.trim())
  expect(names).toContain(organisations.last())
  for (const naam of names)
    expect(await organisationIsActive(page, naam)).toBe(true)
})

// --- Cross-application: publicatiebank vs GPP-app waardelijst ---------------

When('I list the active organisaties in the admin', async ({ page, scratch }) => {
  await page.locator('#changelist-filter').getByRole('link', { name: 'Ja', exact: true }).click()
  const names = (await page.locator('th.field-naam a').allTextContents()).map(n => n.trim())
  scratch.set('org:activeNames', JSON.stringify(names))
})

Then('the same organisaties are available in the GPP-app gebruikersgroep waardelijst', async ({ scratch }) => {
  const names: string[] = JSON.parse(scratch.get('org:activeNames') ?? '[]')
  expect(names.length).toBeGreaterThan(0)
  // Session-authenticated gpp-app (odpc) API context — same pattern the
  // authProfile fixture (@gpp-app/fixtures.ts) uses to resolve organisatie uuids.
  const ctx = await apiRequest.newContext({ storageState: adminState })
  try {
    for (const naam of names)
      await expect(resolveOrganisatieUuid(ctx, naam)).resolves.toBeTruthy()
  }
  finally {
    await ctx.dispose()
  }
})

// --- Logging: "Toon logs" on a self-added organisatie ----------------------

When('I open the organisatie logs via {string}', async ({ page, organisations }, _button: string) => {
  // The changelist row's second link is the "Toon logs" icon — it has no
  // accessible name of its own (icon-only), so it's targeted positionally
  // within the row scoped by naam rather than by name.
  await page.getByRole('row', { name: organisations.last() }).getByRole('link').nth(1).click()
})

Then('the edit is recorded in the organisatie logs', async ({ page, organisations }) => {
  const entry = page.getByRole('cell', { name: 'Record bijgewerkt' }).first()
  await expect(entry).toBeVisible()
  await entry.click()
  await expect(page.getByText(organisations.last())).toBeVisible()
  await page.getByRole('link', { name: 'Sluiten' }).click()
})

// --- Audit logging after delete (Logging tab → (audit)logitems) ------------

When('I open the audit log items', async ({ page }) => {
  await page.goto(new URL('/admin/', ENV.apps.publicatiebank).href)
  await page.getByRole('link', { name: 'Logging' }).click()
  await page.getByRole('link', { name: '(audit)logitems' }).click()
})

Then('the deletion of the organisatie is recorded in the audit log', async ({ page, organisations }) => {
  const naam = organisations.last()
  // Django's built-in changelist search box: a stable id across every admin
  // changelist, regardless of theme.
  await page.locator('#searchbar').fill(naam)
  await page.locator('#searchbar').press('Enter')
  const entries = page.getByRole('row', { name: naam }).filter({ hasText: 'verwijderd' })
  await expect(entries.first()).toBeVisible()
})
