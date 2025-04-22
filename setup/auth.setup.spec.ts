import environment from '@/environment'
import { adminState, logIn, regularUserState } from '@/login-helpers'
import { test as setup } from '@playwright/test'

setup('authenticate as admin', async ({ page }) => {
  await page.goto(environment.GPP_APP_BASE_URL)
  await logIn(page, { asAdmin: true })
  await page.goto(environment.GPP_PUBLICATIEBANK_BASE_URL)
  await logIn(page, { asAdmin: true })
  await page.context().storageState({ path: adminState })
})

setup('authenticate as regular user', async ({ page }) => {
  await page.goto(environment.GPP_APP_BASE_URL)
  await logIn(page, { asAdmin: false })
  await page.goto(environment.GPP_PUBLICATIEBANK_BASE_URL)
  await logIn(page, { asAdmin: false })
  await page.context().storageState({ path: regularUserState })
})
