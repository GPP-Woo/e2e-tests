import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { login } from '../login-helpers/login-to-gpp-publicatiebank.spec'

const removeWhitespace = (s: string) => s.replace(/\s+/g, '')
const compareIgnoringWhitespace = (a: string, b: string) => removeWhitespace(a).localeCompare(removeWhitespace(b))

test('navigate and validate table headers', async ({ page }) => {
  await login(page)

  await page.locator('#header').getByText('Metadata').click()
  await page.locator('#header').getByRole('link', { name: 'Informatiecategorieën' }).click()

  const headers = ['Naam', 'Identificatie', 'Oorsprong']
  for (const header of headers) {
    const headerElement = page.getByRole('link', { name: header })
    await expect(headerElement).toBeVisible()
    await expect(headerElement).toHaveText(header)
    await headerElement.click()
  }

  await page.getByText('Acties').click()
  await page.getByText('Move').click()
})

test('search for "organisatie en werkwijze" and verify result', async ({ page }) => {
  await goToInformatiecategorieen(page)

  await page.getByRole('textbox', { name: 'Search' }).fill('organisatie en werkwijze')
  await page.getByRole('button', { name: 'Zoeken' }).click()

  const searchResults = page.getByRole('link', { name: 'organisatie en werkwijze' })
  await expect(searchResults).toHaveCount(1)
})

test('filter based on Waardelijst', async ({ page }) => {
  await goToInformatiecategorieen(page)
  await assertOorsprongFilter(page, 'Waardelijst')
})

test('filter based on Zelf-toegevoegd item', async ({ page }) => {
  await goToInformatiecategorieen(page)
  await assertOorsprongFilter(page, 'Zelf-toegevoegd item')
})

test('filter "Alle" shows all items sorted alphabetically', async ({ page }) => {
  await goToInformatiecategorieen(page)

  // Click the "Alle" filter
  await page.getByRole('link', { name: 'Alle', exact: true }).click()

  // Wait for table to update
  await expect(page.locator('td.field-oorsprong').first()).toBeVisible()

  // Get all oorsprong values from the column
  const oorsprongCells = page.locator('td.field-oorsprong')
  const count = await oorsprongCells.count()
  const values: string[] = []

  for (let i = 0; i < count; i++) {
    const text = await oorsprongCells.nth(i).textContent()
    if (text) {
      values.push(text)
    }
  }

  // Check both types are present
  expect(values).toContain('Waardelijst')
  expect(values).toContain('Zelf-toegevoegd item')

  // Check alphabetical order
  const sortedValues = [...values].sort(compareIgnoringWhitespace)

  expect(values).toEqual(sortedValues)
})

test('search information category and navigate to its detail view', async ({ page }) => {
  await goToInformatiecategorieen(page)
  await page.getByRole('textbox', { name: 'Search' }).fill('organisatie en werkwijze')
  await page.getByRole('button', { name: 'Zoeken' }).click()

  const searchResults = page.getByRole('link', { name: 'organisatie en werkwijze' })
  await expect(searchResults).toHaveCount(1)

  await page.getByRole('link', { name: 'organisatie en werkwijze' }).click()
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/\d+\/change\/(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'informatiecategorie wijzigen' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'organisatie en werkwijze' })).toBeVisible()
})

test('sort information category based on Naam column', async ({ page }) => {
  await goToInformatiecategorieen(page)
  await page.getByRole('link', { name: 'Naam' }).click()
  await page.getByRole('link', { name: 'Sortering aan/uit' }).click()
  await page.getByRole('link', { name: 'Sortering aan/uit' }).click()

  await page.waitForTimeout(1000)

  // Get all name values from the table rows
  const naamLinks = await page.locator('th.field-naam a').all()
  // Extract and trim text contents
  const names = await Promise.all(naamLinks.map(async el => (await el.textContent())?.trim() || ''))

  // Copy and sort for comparison
  const sortedNames = [...names].sort(compareIgnoringWhitespace)

  // Assert sorted order
  expect(names).toEqual(sortedNames)
})

async function assertOorsprongFilter(page: Page, filterName: string) {
  await page.getByRole('link', { name: filterName }).click()
  await page.waitForSelector('td.field-oorsprong')

  const oorsprongCells = page.locator('td.field-oorsprong')
  const count = await oorsprongCells.count()

  for (let i = 0; i < count; i++) {
    const text = await oorsprongCells.nth(i).textContent()
    expect(text?.trim()).toBe(filterName)
  }
}

async function goToInformatiecategorieen(page: Page) {
  await login(page)
  await page.locator('#header').getByText('Metadata').click()
  await page.locator('#header').getByRole('link', { name: 'Informatiecategorieën' }).click()
}
