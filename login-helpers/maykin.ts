import type { Page } from '@playwright/test'
import type { LoginParams } from './types'
import { loginToAzureEntraId } from './azure'

export async function login(page: Page, loginParams: LoginParams | undefined) {
  const beheerLocator = page.getByRole('link', { name: 'Beheer' })
  const oidcLocator = page.getByRole('link', { name: 'Inloggen met organisatieaccount' })
  const dashboardLocator = page.getByRole('link', { name: 'Dashboard' })
  const icattLink = page.getByRole('link', { name: 'Azure ICATT' })
  const email = page.getByRole('textbox', { name: 'email' })

  await oidcLocator
    .or(dashboardLocator)
    .or(beheerLocator)
    .or(icattLink)
    .or(email)
    .waitFor()

  if (await beheerLocator.isVisible()) {
    await beheerLocator.click()
    await oidcLocator
      .or(dashboardLocator)
      .or(icattLink)
      .or(email)
      .waitFor()
  }

  if (await oidcLocator.isVisible()) {
    await oidcLocator.click()
    await dashboardLocator
      .or(icattLink)
      .or(email)
      .waitFor()
  }
  if (await icattLink.isVisible()) {
    await icattLink.click()
    await email.or(dashboardLocator).isVisible()
  }
  if (await email.isVisible()) {
    await loginToAzureEntraId(page, loginParams)
  }
  if (await oidcLocator.isVisible())
    return false
  return !loginParams?.asAdmin || dashboardLocator.isVisible()
}
