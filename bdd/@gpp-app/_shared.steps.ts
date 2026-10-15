import { Given } from '@/bdd/_core/fixture'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

// Shared GPP-app steps reused across features (auth-specific steps live in
// authentication.steps.ts).
Given('I am logged in to the GPP-app', async ({ page }) => {
  // Session is restored from storage state (@admin / @regular tag).
  await page.goto(ENV.apps.gppApp)
  await expect(page.getByRole('link', { name: 'Mijn publicaties' })).toBeVisible()
})
