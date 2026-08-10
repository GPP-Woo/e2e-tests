import type { Page } from '@playwright/test'
import { auditEntryCount } from '@/bdd/@publicatiebank/support/audit-log'
import { addSelfAddedCategory } from '@/bdd/@publicatiebank/support/information-category'
import { openAdminSection, openBeheer } from '@/bdd/@publicatiebank/support/login'
import { Given, Then, When } from '@/bdd/_core/fixture'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

const READ = { timeout: 10_000, intervals: [400, 800, 1500] }

function stripWs(s: string) {
  return s.replace(/\s+/g, '')
}
function compareIgnoringWhitespace(a: string, b: string) {
  return stripWs(a).localeCompare(stripWs(b))
}

async function search(page: Page, query: string) {
  await page.getByRole('textbox', { name: 'Search' }).fill(query)
  await page.getByRole('button', { name: 'Zoeken' }).click()
}

async function assertOnChangePage(page: Page, naam: string) {
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/\d+\/change\/(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'informatiecategorie wijzigen' })).toBeVisible()
  await expect(page.getByRole('heading', { name: naam })).toBeVisible()
}

Given('I am logged in to the publicatiebank admin', async ({ page }) => {
  // Session is restored from storage state (the @admin tag); just open the admin.
  await openBeheer(page)
})

Given('I have added a self-added information category', async ({ categories }) => {
  await categories.add()
})

Given('I open the {string} metadata page', async ({ page }, name: string) => {
  await openAdminSection(page, 'Metadata', name)
})

Then('the {string} column header is visible and clickable', async ({ page }, header: string) => {
  const headerElement = page.getByRole('link', { name: header })
  await expect(headerElement).toBeVisible()
  await expect(headerElement).toHaveText(header)
  await headerElement.click()
})

When('I choose {string} from the {string} menu', async ({ page }, action: string, menu: string) => {
  await page.getByText(menu).click()
  await page.getByText(action).click()
})

When('I search for the self-added information category', async ({ page, categories }) => {
  await search(page, categories.last())
})

Then('I see the self-added information category in the results', async ({ page, categories }) => {
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toHaveCount(1)
})

Then('the self-added information category is listed', async ({ page, categories }) => {
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toBeVisible()
})

When('I open the self-added information category', async ({ page, categories }) => {
  await page.getByRole('link', { name: categories.last(), exact: true }).click()
})

Then('I am on its information category change page', async ({ page, categories }) => {
  await assertOnChangePage(page, categories.last())
})

When('I filter on {string}', async ({ page }, filterName: string) => {
  await page.getByRole('link', { name: filterName, exact: true }).click()
  await page.locator('td.field-oorsprong').first().waitFor()
})

Then('every result has {string} as its origin', async ({ page }, origin: string) => {
  const cells = page.locator('td.field-oorsprong')
  const count = await cells.count()
  for (let i = 0; i < count; i++) {
    expect((await cells.nth(i).textContent())?.trim()).toBe(origin)
  }
})

Then(
  'the results contain both {string} and {string} origins',
  async ({ page }, first: string, second: string) => {
    const cells = page.locator('td.field-oorsprong')
    const count = await cells.count()
    const values: string[] = []
    for (let i = 0; i < count; i++) {
      const text = (await cells.nth(i).textContent())?.trim()
      if (text)
        values.push(text)
    }
    expect(values).toContain(first)
    expect(values).toContain(second)
  },
)

When('I sort ascending by the {string} column', async ({ page }, column: string) => {
  await page.getByRole('link', { name: column }).click()
  const sortLink = page.getByRole('link', { name: 'Sortering aan/uit' })
  await sortLink.click()
  await sortLink.click()
})

Then('the information categories are listed alphabetically by name', async ({ page }) => {
  const naamLinks = await page.locator('th.field-naam a').all()
  const names = await Promise.all(
    naamLinks.map(async el => (await el.textContent())?.trim() || ''),
  )
  const sorted = [...names].sort(compareIgnoringWhitespace)
  expect(names).toEqual(sorted)
})

// ---------------------------------------------------------------------------
// TS2 gap coverage — prerequisite steps (Background, "I filter on", "I search
// for", "I open the self-added") are reused from above.
// ---------------------------------------------------------------------------

function formRow(page: Page, label: string) {
  return page.locator('.form-row').filter({ has: page.locator('label', { hasText: label }) })
}

// --- Default catalogue present + coexistence (admin read via `page`) --------

Then('all 18 default information categories from the landelijke waardelijst are present', async ({ page }) => {
  await expect(page.locator('td.field-oorsprong')).toHaveCount(18)
})

Then('both the default categories and my self-added category are listed', async ({ page, categories }) => {
  const waardelijst = page.locator('td.field-oorsprong').filter({ hasText: 'Waardelijst' })
  expect(await waardelijst.count()).toBeGreaterThanOrEqual(18)
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toBeVisible()
})

// --- Add through the UI (mutation via the admin form on `page`) -------------

When('I add an information category through the admin form', async ({ page, categories }) => {
  const naam = categories.freshName()
  await addSelfAddedCategory(page, naam)
  categories.track(naam)
})

Then('the new information category is listed on the overview', async ({ page, categories }) => {
  await search(page, categories.last())
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toHaveCount(1)
})

// --- Restricted fields on a Waardelijst category (admin read) ---------------

When('I open a Waardelijst information category', async ({ page }) => {
  await page.getByRole('link', { name: 'Waardelijst', exact: true }).click()
  await page.locator('td.field-oorsprong').first().waitFor()
  await page.locator('th.field-naam a').first().click()
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/\d+\/change\//)
})

Then('only the omschrijving and archivering fields are editable', async ({ page }) => {
  await expect(page.locator('#id_omschrijving')).toBeEditable()
  await expect(page.locator('#id_bron_bewaartermijn')).toBeEditable()
  await expect(page.locator('#id_bewaartermijn')).toBeEditable()
  await expect(page.locator('#id_archiefnominatie')).toBeEnabled()
})

Then('the oorsprong, identificatie and UUID fields are read-only', async ({ page }) => {
  await expect(formRow(page, 'Oorsprong:').locator('.readonly')).toBeVisible()
  await expect(formRow(page, 'Identificatie:').locator('.readonly')).toBeVisible()
  await expect(formRow(page, 'UUID:').locator('.readonly')).toBeVisible()
})

// --- Edit a self-added category (mutation via admin form on `page`) ---------

When('I change its omschrijving and save the information category', async ({ page, scratch }) => {
  const value = `E2E gewijzigd ${Date.now()}`
  scratch.set('cat:omschrijving', value)
  await page.locator('#id_omschrijving').fill(value)
  await page.locator('input[name="_save"]').click()
})

Then('the updated omschrijving is shown on the change page', async ({ page, categories, scratch }) => {
  const expected = scratch.get('cat:omschrijving')!
  await search(page, categories.last())
  await page.getByRole('link', { name: categories.last(), exact: true }).click()
  await assertOnChangePage(page, categories.last())
  await expect(page.locator('#id_omschrijving')).toHaveValue(expected)
})

// --- Logging after edit ("Toon logs") ---------------------------------------

Given('I have changed the omschrijving of the self-added information category', async ({ page, categories, scratch }) => {
  const value = `E2E gewijzigd ${Date.now()}`
  scratch.set('cat:omschrijving', value)
  await search(page, categories.last())
  await page.getByRole('link', { name: categories.last(), exact: true }).click()
  await assertOnChangePage(page, categories.last())
  await page.locator('#id_omschrijving').fill(value)
  // Stay on the change page so the next step can open "Toon logs" from here.
  await page.locator('input[name="_continue"]').click()
  await assertOnChangePage(page, categories.last())
})

When('I open the {string} view from the change page', async ({ page }, linkName: string) => {
  await page.getByRole('link', { name: linkName }).click()
})

Then('the omschrijving change is listed in the category logs', async ({ page, categories, scratch }) => {
  const expected = scratch.get('cat:omschrijving')!
  const row = page.getByRole('row').filter({ hasText: 'Record bijgewerkt' }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(categories.last())
  await row.getByRole('link').first().click()
  await expect(page.getByText(expected).first()).toBeVisible()
})

// --- Delete through the UI with confirmation --------------------------------

When('I start deleting the information category', async ({ page }) => {
  await page.getByRole('link', { name: 'Verwijderen' }).click()
})

Then('a confirmation page lists the consequences of the deletion', async ({ page, categories }) => {
  await expect(page.getByText(/Weet u zeker/i)).toBeVisible()
  await expect(page.locator('#content')).toContainText(categories.last())
  await expect(page.getByRole('button', { name: /Ja, ik weet het zeker/i })).toBeVisible()
})

When('I confirm the deletion', async ({ page }) => {
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/(?:\?.*)?$/)
})

Then('the information category is no longer listed on the overview', async ({ page, categories }) => {
  await search(page, categories.last())
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toHaveCount(0)
})

// --- Audit log after delete --------------------------------------------------

Given('I have deleted the self-added information category through the UI', async ({ page, categories }) => {
  await search(page, categories.last())
  await page.getByRole('link', { name: categories.last(), exact: true }).click()
  await assertOnChangePage(page, categories.last())
  await page.getByRole('link', { name: 'Verwijderen' }).click()
  await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/(?:\?.*)?$/)
})

When('I open the {string} via the {string} tab', async ({ page }, section: string, tab: string) => {
  await page.goto(new URL('/admin/', ENV.apps.publicatiebank).href)
  await openAdminSection(page, tab, section)
})

Then('the deletion of the information category is recorded in the audit log', async ({ page, categories }) => {
  await expect.poll(() => auditEntryCount(page, categories.last(), 'delete'), READ).toBeGreaterThan(0)
})
