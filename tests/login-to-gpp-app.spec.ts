import environment from '@/environment'
import { adminState } from '@/login-helpers'
import { expect, test } from '@playwright/test'

test.use({
  storageState: adminState,
})

test('login works', async ({ page }) => {
  await page.goto(environment.GPP_APP_BASE_URL)
  await expect(page.getByRole('link', { name: 'Nieuwe publicatie' })).toBeVisible()
})
