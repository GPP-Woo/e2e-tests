import type { User } from '@/bdd/_core/types'
import type { Page } from '@playwright/test'
import { awaitKeycloakFormOrSso, fillKeycloakLogin } from '@/bdd/_core/keycloak'
import { ENV } from '@/bdd/_core/types'

/**
 * Sign in to the GPP-burgerportaal beheer (admin config) UI via Keycloak OIDC.
 *
 * The beheer SPA is protected by the ASP.NET OIDC client `odbp`. A full-page
 * navigation to `/api/challenge?returnUrl=/beheer` triggers the OIDC challenge:
 * Keycloak either shows its login form (+ TOTP) or — when a realm-wide SSO
 * session already exists — redirects straight back to `/beheer` authenticated.
 * The session lives in a cookie, so the resulting storage state is all a later
 * browser context or APIRequestContext needs.
 *
 * The beheer config API lives in `beheer-config.ts` (a separate data seam).
 */
export async function signInToBurgerportaalBeheer(page: Page, user: User) {
  const base = ENV.apps.burgerportaal.replace(/\/$/, '')
  const onBeheer = /\/beheer/
  await page.goto(`${base}/api/challenge?returnUrl=/beheer`)

  if (await awaitKeycloakFormOrSso(page, onBeheer))
    await fillKeycloakLogin(page, user)

  await page.waitForURL(onBeheer)
}
