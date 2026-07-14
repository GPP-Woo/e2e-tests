import { signInToBurgerportaalBeheer } from '@/bdd/@burgerportaal/support/login'
import { verifyWaardelijstPresent } from '@/bdd/@publicatiebank/support/information-category'
import { signIn } from '@/bdd/_core/signIn'
import { ENV } from '@/bdd/_core/types'
import { test as setup } from '@playwright/test'
import { adminState, burgerportaalAdminState, regularState } from './paths'

/**
 * Sign in once per role and persist the session. Runs serially as a project
 * dependency before the BDD tests.
 *
 * The admin logs into the GPP-app first (full Keycloak flow incl. TOTP), which
 * establishes a realm-wide SSO session; signing into the publicatiebank admin
 * then piggybacks on that session, so a *second* one-time code is never needed.
 */
setup('authenticate as admin', async ({ page }) => {
  await signIn(page, 'gppApp', ENV.users.admin)
  await signIn(page, 'publicatiebank', ENV.users.admin)
  // Reuse the admin session to assert the reference data prerequisite is met.
  await verifyWaardelijstPresent(page)
  await page.context().storageState({ path: adminState })

  // Establish the burgerportaal beheer session in the same context so it
  // piggybacks the realm-wide SSO session (no second one-time code), then
  // persist it separately for the Stagehand-driven @beheer scenarios.
  await signInToBurgerportaalBeheer(page, ENV.users.admin)
  await page.context().storageState({ path: burgerportaalAdminState })
})

setup('authenticate as regular user', async ({ page }) => {
  await signIn(page, 'gppApp', ENV.users.regular)
  await page.context().storageState({ path: regularState })
})
