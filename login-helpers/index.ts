import type { Page } from '@playwright/test'
import type { LoginParams } from '../login-helpers/types'
import environment from '../environment'
import { login as loginInApp } from '../login-helpers/gpp-app'
import { login as loginMaykin } from '../login-helpers/maykin'

export const adminState = './.auth/admin.json'
export const regularUserState = './.auth/regular-user.json'

export async function logIn(page: Page, loginParams?: LoginParams) {
  const url = page.url()
  if (url.includes(environment.GPP_APP_BASE_URL)) {
    await loginInApp(page, loginParams)
  }
  else {
    return loginMaykin(page, loginParams)
  }
}
