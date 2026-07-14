import type { Page } from '@playwright/test'
import { openBeheer } from '@/bdd/@publicatiebank/support/login'
import { Given, Then, When } from '@/bdd/_core/fixture'
import { expect } from '@playwright/test'

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
  await page.locator('#header').getByText('Metadata').click()
  await page.locator('#header').getByRole('link', { name }).click()
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
