import { test as setup } from '@playwright/test'
import environment from '../environment'
import { adminState, ensureLoggedIn } from '../login-helpers'

setup('authenticate as admin', async ({ page }) => {
  await page.goto(environment.GPP_APP_BASE_URL)
  await ensureLoggedIn(page, { asAdmin: true })
  await page.goto(environment.GPP_PUBLICATIEBANK_BASE_URL)
  await ensureLoggedIn(page, { asAdmin: true })
  await page.context().storageState({ path: adminState })
})
