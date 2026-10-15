import type { Locator, Page } from '@playwright/test'

/**
 * Wait for a locator to become visible, reloading the page a few times if it
 * doesn't show up. The GPP SPAs (odpc gpp-app, the burgerportaal) occasionally
 * fail to hydrate their first render on non-Chromium engines (WebKit/Firefox);
 * a plain reload reliably nudges them. Chromium hits the element on the first
 * try, so this is a no-op there.
 */
export async function waitForWithReload(
  page: Page,
  locator: Locator,
  { tries = 4, timeout = 15_000 }: { tries?: number, timeout?: number } = {},
) {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout })
      return
    }
    catch (error) {
      if (attempt === tries - 1)
        throw error
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForLoadState('networkidle').catch(() => {})
    }
  }
}
