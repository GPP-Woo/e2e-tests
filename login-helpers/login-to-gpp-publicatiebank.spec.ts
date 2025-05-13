import environment from '@/environment'
import { adminState } from '@/login-helpers'
import { expect, test } from '@playwright/test'

test.use({
  storageState: adminState,
})

export async function login(page) {
  await page.goto(environment.GPP_PUBLICATIEBANK_BASE_URL)
  await page.getByRole('link', { name: 'Beheer' }).click()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
}
