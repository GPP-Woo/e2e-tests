import type { User } from '@/bdd/_core/types'
import type { Page } from '@playwright/test'
import { Secret, TOTP } from 'otpauth'

const TOTP_PERIOD_MS = 30_000

/**
 * Wait until the next TOTP time-window so a *fresh* one-time code is generated.
 * Keycloak rejects a code that was already consumed ("Invalid authenticator
 * code"), which happens when two logins for the same account land in the same
 * 30s window (e.g. the auth setup and the login-flow feature). Waiting for the
 * next window and regenerating sidesteps the reuse.
 */
async function waitForNextTotpWindow(page: Page) {
  const now = Date.now()
  await page.waitForTimeout(TOTP_PERIOD_MS - (now % TOTP_PERIOD_MS) + 500)
}

/**
 * After triggering an OIDC challenge, wait for one of the two outcomes: Keycloak
 * either shows its login form (`#username`) or — when a realm-wide SSO session
 * already exists — redirects straight to `landedUrl`. Returns whether the login
 * form is showing (i.e. whether the caller still needs to fill credentials). The
 * publicatiebank admin and the burgerportaal beheer login share this race.
 */
export async function awaitKeycloakFormOrSso(page: Page, landedUrl: RegExp): Promise<boolean> {
  const username = page.locator('#username')
  await Promise.race([
    username.waitFor().catch(() => {}),
    page.waitForURL(landedUrl).catch(() => {}),
  ])
  return username.isVisible().catch(() => false)
}

/**
 * Drive the Keycloak login form (local `gpp-local` realm).
 *
 * Keycloak shows username + password on one page (#username / #password,
 * submit #kc-login), optionally followed by a one-time-code page (#otp) when
 * the user has TOTP configured. The OTP submit retries with a fresh code if the
 * first is rejected as reused.
 */
export async function fillKeycloakLogin(page: Page, user: User) {
  await page.locator('#username').waitFor()
  await page.locator('#username').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.locator('#kc-login').click()

  // One-time-code page (only shown when the user has TOTP configured).
  const otp = page.locator('#otp')
  await otp.waitFor({ timeout: 10_000 }).catch(() => {})
  if (!(await otp.isVisible()))
    return

  // Keycloak stores the realm's TOTP secretData.value as a raw string and uses
  // its UTF-8 bytes directly as the HMAC key (it Base32-encodes only for the QR
  // code). Our seeds (e.g. "gpp-user-otp-seed-0001") aren't valid Base32, so
  // decode them the same way Keycloak keys them: from UTF-8, not Base32.
  const totp = new TOTP({ secret: Secret.fromUTF8(user.otpSecret) })

  for (let attempt = 0; attempt < 3; attempt++) {
    await otp.fill(totp.generate())
    await page.locator('#kc-login').click()
    // Submitting the code POSTs the form: on success Keycloak redirects away
    // (the #otp field is gone), on failure it re-renders the OTP page with an
    // error. Wait for the page to settle, then decide by #otp's presence — do
    // not match the error text, which lingers in the DOM across re-renders.
    await page.waitForLoadState('networkidle').catch(() => {})
    if (!(await otp.isVisible().catch(() => false)))
      return

    // Rejected (reused/expired code): wait for a fresh window and retry.
    await waitForNextTotpWindow(page)
  }
}
