import type { User } from '@/bdd/_core/types'
import type { Page } from '@playwright/test'
import { fillKeycloakLogin } from '@/bdd/_core/keycloak'
import { waitForWithReload } from './hydrate'

/**
 * Sign in to the GPP-app (odpc) front-end via Keycloak OIDC.
 *
 * Flow: landing page -> "Inloggen" -> Keycloak form -> "Mijn publicaties".
 * When a realm-wide SSO session already exists, the app lands straight on the
 * authenticated view and the login link is never shown.
 */
export async function signInToGppApp(page: Page, user: User) {
  const loginLink = page.getByRole('link', { name: 'Inloggen' })
  const publicatiesLink = page.getByRole('link', { name: 'Mijn publicaties' })

  // The gpp-app nav can fail to hydrate on the first render (WebKit/Firefox);
  // reload-retry until one of the links shows.
  await waitForWithReload(page, loginLink.or(publicatiesLink))
  if (await loginLink.isVisible()) {
    await loginLink.click()
    await fillKeycloakLogin(page, user)
  }
  await publicatiesLink.waitFor()
}
