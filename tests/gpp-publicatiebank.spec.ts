import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { login } from '../login-helpers/login-to-gpp-publicatiebank.spec'

const removeWhitespace = (s: string) => s.replace(/\s+/g, '')
const compareIgnoringWhitespace = (a: string, b: string) => removeWhitespace(a).localeCompare(removeWhitespace(b))

async function goToInformatiecategorieen(page: Page) {
  await login(page)
  await page.locator('#header').getByText('Metadata').click()
  await page.locator('#header').getByRole('link', { name: 'Informatiecategorieën' }).click()
}

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

test('navigate and validate table headers', async ({ page }) => {
  await test.step('Login and navigate to Informatiecategorieën page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Verify table headers are visible and clickable', async () => {
    const headers = ['Naam', 'Identificatie', 'Oorsprong']
    for (const header of headers) {
      const headerElement = page.getByRole('link', { name: header })
      await expect(headerElement).toBeVisible()
      await expect(headerElement).toHaveText(header)
      await headerElement.click()
    }
  })

  await test.step('Click on additional table actions', async () => {
    await page.getByText('Acties').click()
    await page.getByText('Move').click()
  })
})

test('search for "organisatie en werkwijze" and verify result and navigation', async ({ page }) => {
  await test.step('Navigate to the information category page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Search for "organisatie en werkwijze"', async () => {
    await page.getByRole('textbox', { name: 'Search' }).fill('organisatie en werkwijze')
    await page.getByRole('button', { name: 'Zoeken' }).click()
  })

  await test.step('Verify search result appears', async () => {
    const resultLink = page.getByRole('link', { name: 'organisatie en werkwijze' })
    await expect(resultLink).toHaveCount(1)
  })
})

test('filter based on Waardelijst', async ({ page }) => {
  await test.step('Navigate to the information category page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Verify all results have "Waardelijst" as oorsprong', async () => {
    await assertOorsprongFilter(page, 'Waardelijst')
  })
})

test('filter based on Zelf-toegevoegd item', async ({ page }) => {
  await test.step('Navigate to the information category page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Verify all results have "Zelf-toegevoegd item" as oorsprong', async () => {
    await assertOorsprongFilter(page, 'Zelf-toegevoegd item')
  })
})

test('filter "Alle" shows all items', async ({ page }) => {
  await test.step('Navigate to informatiecategorieën page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Click the "Alle" filter', async () => {
    await page.getByRole('link', { name: 'Alle', exact: true }).click()
  })

  await test.step('Wait for table to update', async () => {
    await expect(page.locator('td.field-oorsprong').first()).toBeVisible()
  })

  const values: string[] = []

  await test.step('Extract all "oorsprong" values from the table', async () => {
    const oorsprongCells = page.locator('td.field-oorsprong')
    const count = await oorsprongCells.count()

    for (let i = 0; i < count; i++) {
      const text = await oorsprongCells.nth(i).textContent()
      if (text) {
        values.push(text.trim())
      }
    }
  })

  await test.step('Verify both expected types are present', async () => {
    expect(values).toContain('Waardelijst')
    expect(values).toContain('Zelf-toegevoegd item')
  })
})

test('search information category and navigate to its detail view', async ({ page }) => {
  await test.step('Go to the information category page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Search for "organisatie en werkwijze"', async () => {
    await page.getByRole('textbox', { name: 'Search' }).fill('organisatie en werkwijze')
    await page.getByRole('button', { name: 'Zoeken' }).click()
  })

  await test.step('Verify search result appears and navigate', async () => {
    const searchResults = page.getByRole('link', { name: 'organisatie en werkwijze' })
    await expect(searchResults).toHaveCount(1)

    await searchResults.click()
    await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/\d+\/change\/(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'informatiecategorie wijzigen' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'organisatie en werkwijze' })).toBeVisible()
  })
})

test('sort information category based on Naam column', async ({ page }) => {
  await test.step('Navigate to information category page', async () => {
    await goToInformatiecategorieen(page)
  })

  await test.step('Click on "Naam" column to enable sorting', async () => {
    await page.getByRole('link', { name: 'Naam' }).click()
  })

  await test.step('Click on sort icon twice for ascending order', async () => {
    const sortLink = page.getByRole('link', { name: 'Sortering aan/uit' })
    await sortLink.click()
    await sortLink.click()
  })

  await test.step('Verify that information categories are sorted alphabetically', async () => {
    const naamLinks = await page.locator('th.field-naam a').all()
    const names = await Promise.all(
      naamLinks.map(async el => (await el.textContent())?.trim() || ''),
    )

    const sortedNames = [...names].sort(compareIgnoringWhitespace)
    expect(names).toEqual(sortedNames)
  })
})
