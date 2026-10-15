import type { AppName, User } from '@/bdd/_core/types'
import type { Page } from '@playwright/test'
import { signInToGppApp } from '@/bdd/@gpp-app/support/login'
import { signInToPublicatiebank } from '@/bdd/@publicatiebank/support/login'
import { ENV } from '@/bdd/_core/types'

/**
 * Navigate to `app` and perform a full Keycloak sign-in as `user`.
 */
export async function signIn(page: Page, app: AppName, user: User) {
  await page.goto(ENV.apps[app])
  if (app === 'gppApp') {
    await signInToGppApp(page, user)
  }
  else {
    await signInToPublicatiebank(page, user)
  }
}
