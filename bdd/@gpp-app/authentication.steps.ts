import { Before, Given, test, Then, When } from '@/bdd/_core/fixture'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

// Pins a scenario to Chromium. Two reasons occur in this suite: the live
// Keycloak login redirects to keycloak.woo-search.local, resolvable only in
// Chromium (the --host-resolver-rules launch arg is Chrome-only); and the
// publicatiebank @admin features cover one browser on purpose, since the Django
// admin is server-rendered and a 3-browser sweep buys little for the runtime.
// Skipped with a reason rather than failing, so the choice stays visible.
Before({ tags: '@chromium-only' }, async ({ browserName }) => {
  test.skip(browserName !== 'chromium', `@chromium-only: pinned to Chromium; skipped on ${browserName}.`)
})

Given('I am on the GPP-app', async ({ page }) => {
  await page.goto(ENV.apps.gppApp)
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
