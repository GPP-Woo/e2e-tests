import type { Page } from '@playwright/test'
import type { LoginParams } from './types'
import { loginToAzureEntraId } from './azure'

function getLoginLocator(page: Page) {
  return page.getByRole('link', { name: 'Inloggen' })
}

async function isLoggedInAs(page: Page, loginParams: LoginParams | undefined) {
  const loginLocator = getLoginLocator(page)
  const publicatiesLocator = page.getByRole('link', { name: 'Publicaties' })
  await loginLocator.or(publicatiesLocator).waitFor()
  if (await loginLocator.isVisible())
    return false
  return (
    !loginParams?.asAdmin
    || page.getByRole('link', { name: 'Groepen' }).isVisible()
  )
}

async function login(page: Page, loginParams: LoginParams | undefined) {
  await getLoginLocator(page).click()
  await loginToAzureEntraId(page, loginParams)
}

async function ensureLoggedOut(page: Page) {
  if (!(await getLoginLocator(page).isVisible())) {
    await page.goto('/api/logoff')
  }
}

export async function ensureLoggedIn(page: Page, loginParams?: LoginParams) {
  if (!await isLoggedInAs(page, loginParams)) {
    await ensureLoggedOut(page)
    await login(page, loginParams)
    await page.getByRole('link', { name: 'Publicaties' }).waitFor()
  }
}
