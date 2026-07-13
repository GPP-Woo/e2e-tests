import path from 'node:path'
import environment from '@/environment'
import { loginToAzureEntraId } from '@/login-helpers/azure'
import { expect, test } from '@playwright/test'

test('create a new publicatie with full details', async ({ page }) => {
  await test.step('Given I am logged in to the GPP application', async () => {
    await page.goto(environment.GPP_APP_BASE_URL)
    const loginLink = page.getByRole('link', { name: 'Inloggen' })
    const publicatiesLink = page.getByRole('link', { name: 'Mijn publicaties' })
    await loginLink.or(publicatiesLink).waitFor()
    if (await loginLink.isVisible()) {
      await loginLink.click()
      await loginToAzureEntraId(page, { asAdmin: true })
      await publicatiesLink.waitFor()
    }
  })

  await test.step('When I click on Nieuwe publicatie button', async () => {
    await page.getByRole('link', { name: 'Nieuwe publicatie' }).click()
    await page.waitForLoadState('networkidle')
  })

  await test.step('And enter "Technical implications E2E-testing" in Titel field', async () => {
    await page.getByRole('textbox', { name: 'Titel', exact: false }).fill('Technical implications E2E-testing')
  })

  await test.step('And click on Meer details', async () => {
    await page.getByText('Meer details', { exact: false }).click()
  })

  await test.step('And enter "Verkorte titel" in verkorte titel field', async () => {
    await page.getByRole('textbox', { name: 'Verkorte titel' }).fill('Verkorte titel')
  })

  await test.step('And enter "Omschriving" in Omschrijving field', async () => {
    await page.getByRole('textbox', { name: 'Omschrijving' }).fill('Omschriving')
  })

  await test.step('And enter Datum in werking as 1 January 2026', async () => {
    await page.getByRole('textbox', { name: 'Datum in werking', exact: false }).fill('2026-01-01')
  })

  await test.step('And enter Datum buiten werking as Next year', async () => {
    await page.getByRole('textbox', { name: 'Datum buiten werking', exact: false }).fill('2027-07-10')
  })

  await test.step('And enter "test" in Kenmerk toevoegen field', async () => {
    await page.getByRole('textbox', { name: 'kenmerk toevoegen', exact: false }).fill('test')
    await page.getByRole('button', { name: 'Toevoegen' }).click()
  })

  await test.step('And click on Organisatie', async () => {
    await page.getByText('Organisatie', { exact: false }).first().click()
  })

  await test.step('And select "152202@testorganisatie" option', async () => {
    await page.getByRole('radio', { name: '152202@testorganisatie' }).click()
  })

  await test.step('And click on informatiecategorieen', async () => {
    await page.getByText('Informatiecategorie', { exact: false }).first().click()
  })

  await test.step('And click on "Convenant" checkbox', async () => {
    await page.getByRole('checkbox', { name: 'convenant', exact: false }).click()
  })

  await test.step('And click on Onderwerpen', async () => {
    await page.getByText('Onderwerpen', { exact: false }).first().click()
  })

  await test.step('And click on "Aanleg stadspark" checkbox', async () => {
    await page.getByRole('checkbox', { name: 'Aanleg stadspark', exact: false }).click()
  })

  await test.step('And attach a blank word document', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'Technical detail E2E-testing nr 1.docx')
    await page.locator('input[type="file"]').setInputFiles(filePath)
    await page.getByText('Technical detail E2E-testing nr 1.docx').waitFor()
  })

  await test.step('Then the form reflects all entered values', async () => {
    const publicatieGroup = page.getByRole('group', { name: 'Publicatie' })
    await expect(publicatieGroup.getByRole('textbox', { name: 'Titel *', exact: true })).toHaveValue('Technical implications E2E-testing')
    await expect(publicatieGroup.getByLabel('Verkorte titel')).toHaveValue('Verkorte titel')
    await expect(publicatieGroup.getByLabel('Omschrijving')).toHaveValue('Omschriving')
    await expect(page.getByRole('radio', { name: '152202@testorganisatie' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'convenant', exact: false })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Aanleg stadspark', exact: false })).toBeChecked()
    await expect(page.getByText('Technical detail E2E-testing nr 1.docx')).toBeVisible()
  })

  await test.step('And click on Publiceren', async () => {
    await page.getByRole('button', { name: 'Publiceren' }).click()
  })

  await test.step('Then a success message is displayed', async () => {
    await expect(page.locator('body').getByText(/succes/i)).toBeVisible()
  })
})
