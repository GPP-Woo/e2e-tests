import type { Page } from '@playwright/test'
import type { LoginParams } from '../login-helpers/types'
import environment from '../environment'
import { ensureLoggedIn as ensureLoggedInInApp } from '../login-helpers/gpp-app'
import { login as ensureLoggedInMaykin } from '../login-helpers/maykin'

export const adminState = './.auth/admin.json'
export const regularUserState = './.auth/regular-user.json'

export async function ensureLoggedIn(page: Page, loginParams?: LoginParams) {
  const url = page.url()
  if (url.includes(environment.GPP_APP_BASE_URL)) {
    await ensureLoggedInInApp(page, loginParams)
  }
  else {
    return ensureLoggedInMaykin(page, loginParams)
  }
}
