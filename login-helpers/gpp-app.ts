import type { Page } from '@playwright/test'
import type { LoginParams } from './types'
import { loginToAzureEntraId } from './azure'

export async function login(page: Page, loginParams: LoginParams | undefined) {
  const loginLink = page.getByRole('link', { name: 'Inloggen' })
  const publicatiesLink = page.getByRole('link', { name: 'Publicaties' })
  await loginLink.or(publicatiesLink).waitFor()
  if (await loginLink.isVisible()) {
    await loginLink.click()
    await loginToAzureEntraId(page, loginParams)
    await publicatiesLink.waitFor()
  }
}
