import { Before, Given, test, Then, When } from '@/bdd/_core/fixture'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

// The live Keycloak login redirects to keycloak.woo-search.local, resolvable
// only in Chromium (the --host-resolver-rules launch arg is Chrome-only). Skip
// this feature on Firefox/WebKit rather than fail on an unreachable host.
Before({ tags: '@chromium-only' }, async ({ browserName }) => {
  test.skip(
    browserName !== 'chromium',
    `@chromium-only: keycloak.woo-search.local resolves only in Chromium (host-resolver launch arg); ${browserName} cannot reach it.`,
  )
})

Given('I am on the GPP-app', async ({ page }) => {
  await page.goto(ENV.apps.gppApp)
})

Given('I am logged in to the GPP-app', async ({ page }) => {
  // Session is restored from storage state (@admin / @regular tag).
  await page.goto(ENV.apps.gppApp)
  await expect(page.getByRole('link', { name: 'Mijn publicaties' })).toBeVisible()
})

When('I sign in to the GPP-app as {string}', async ({ signIn, currentUser }, userKey: string) => {
  const user = ENV.users[userKey]
  if (!user)
    throw new Error(`Unknown user "${userKey}" (known: ${Object.keys(ENV.users).join(', ')})`)
  currentUser.value = user
  await signIn('gppApp')
})

Then('I should see my publications', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Mijn publicaties' })).toBeVisible()
})
