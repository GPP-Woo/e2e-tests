import type { AppName, User } from '@/bdd/_core/types'
import type { Page } from '@playwright/test'
import { awaitKeycloakFormOrSso, fillKeycloakLogin } from '@/bdd/_core/keycloak'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

const publicatiebank: AppName = 'publicatiebank'

/**
 * Open the publicatiebank Django admin assuming the browser context already
 * holds an authenticated session (restored from storage state). Navigates to
 * the admin via "Beheer" without going through Keycloak.
 */
export async function openBeheer(page: Page) {
  await page.goto(ENV.apps[publicatiebank])
  await page.getByRole('link', { name: 'Beheer' }).click()
  // Crosses a real navigation + admin render; on firefox/webkit against an
  // emulated backend this exceeds the 5s default expect timeout, so allow more.
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 })
}

/**
 * Open an admin changelist from the header nav. The django-admin-index header
 * groups the models under collapsed dropdowns ("Publicaties", "Metadata", …);
 * the model links only become visible once the group is clicked, so clicking
 * the model link straight away waits forever on a hidden element.
 */
export async function openAdminSection(page: Page, group: string, model: string) {
  await page.locator('#header').getByText(group, { exact: true }).click()
  await page.locator('#header').getByRole('link', { name: model, exact: true }).click()
}

/**
 * Sign in to the GPP-publicatiebank (odrc) Django admin via Keycloak OIDC.
 *
 * Flow: landing page -> "Beheer" -> admin login -> "Inloggen met
 * organisatieaccount" -> Keycloak form (+ TOTP) -> /admin/.
 *
 * When a realm-wide Keycloak SSO session already exists, Keycloak redirects
 * straight back to the admin without showing its login form, so the username
 * step is skipped.
 */
export async function signInToPublicatiebank(page: Page, user: User) {
  const beheerLink = page.getByRole('link', { name: 'Beheer' })
  const oidcLink = page.getByRole('link', {
    name: 'Inloggen met organisatieaccount',
  })
  const adminIndex = /\/admin\/$/

  await beheerLink.or(oidcLink).first().waitFor()
  if (await beheerLink.isVisible()) {
    await beheerLink.click()
  }

  await oidcLink.waitFor()
  await oidcLink.click()

  // Either Keycloak shows its login form, or an existing SSO session logs us
  // straight back into the admin.
  if (await awaitKeycloakFormOrSso(page, adminIndex))
    await fillKeycloakLogin(page, user)

  await page.waitForURL(adminIndex)
}
