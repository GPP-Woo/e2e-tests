import type { ImageKind } from '@/bdd/@burgerportaal/support/beheer-config'
import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { Given, Then, When } from '../../_core/fixture'
import { ENV } from '../../_core/types'

/**
 * Testscript 1 steps. Mutations run through the beheer UI with plain Playwright
 * locators against its Dutch labels; assertions run against the public site —
 * the config API (`/api/environment/resources`), raw image bytes, and the
 * rendered homepage article to prove a burger actually sees the welcome text.
 *
 * Image replacement uses the authenticated upload API rather than the UI: the
 * beheer image forms open an OS file dialog, so we POST to the very endpoint the
 * beheer UI calls and assert the public effect.
 */

const base = ENV.apps.burgerportaal.replace(/\/$/, '')

/** Short unique marker so assertions can't collide with pre-existing config. */
function uniqueToken(): string {
  return `e2e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

function sha(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function resource(beheer: { getResources: () => Promise<Record<string, unknown>> }, key: string): Promise<string> {
  const value = (await beheer.getResources())[key]
  return value == null ? '' : String(value)
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const FIXTURE_IMAGES: Record<ImageKind, { name: string, mimeType: string, file: string }> = {
  logo: { name: 'logo.svg', mimeType: 'image/svg+xml', file: 'logo.svg' },
  favicon: { name: 'favicon.png', mimeType: 'image/png', file: 'favicon.png' },
  image: { name: 'sfeerfoto.png', mimeType: 'image/png', file: 'sfeerfoto.png' },
}

/** Public config field behind each footer link (`/api/environment/resources`). */
const FOOTER_FIELD: Record<string, string> = { privacy: 'privacyUrl', contact: 'contactUrl', toegankelijkheid: 'a11yUrl' }
/** Label of the beheer form field that sets it (BeheerLinksView.vue). */
const FOOTER_LABEL: Record<string, string> = {
  privacy: 'URL Privacy-verklaring',
  contact: 'URL Contact-pagina',
  toegankelijkheid: 'URL Toegankelijkheidsverklaring',
}
/** How the link reads in the public footer — a different wording (TheFooter.vue). */
const FOOTER_PUBLIC_LABEL: Record<string, string> = { privacy: 'Privacy', contact: 'Contact', toegankelijkheid: 'Toegankelijkheid' }

const POLL = { timeout: 20_000, intervals: [500, 1000, 2000] }

/**
 * Open a beheer section through the "Beheermenu" navigation, from `/beheer`.
 *
 * The menu renders the *active* item as a `<span>` and every other item as a
 * link (BeheerLayout.vue), so "Homepage" — the landing route — has no link to
 * click; the `count()` check covers both cases without a second code path.
 */
async function openBeheer(page: Page, item: 'Homepage' | 'Externe links'): Promise<void> {
  await page.goto(`${base}/beheer`)
  // Wait for the menu itself first: `count()` on a freshly loaded SPA route
  // returns 0 before it renders, which silently skipped the click and left the
  // scenario on the Homepage form.
  const menu = page.getByRole('navigation', { name: 'Beheermenu' })
  await menu.waitFor()
  const link = menu.getByRole('link', { name: item, exact: true })
  if (await link.count())
    await link.click()
}

/**
 * Replace the whole contents of the Welkomsttekst rich-text editor.
 *
 * Two CKEditor quirks to step around (CkEditorWrapper.vue):
 *
 * 1. It keeps its own model and re-renders the DOM from it, so a plain `fill()`
 *    on the contenteditable gets reverted — select-all + typing is the input
 *    path the editor itself listens on.
 * 2. It syncs that model into the form's `v-model` *lazily*: mid-typing the
 *    wrapper's mirror `<textarea>` still holds one keystroke. `blur()` flushes
 *    it, but not synchronously — publishing straight after typing PUT'ed
 *    `<p>E</p>` instead of the whole line. So wait for the mirror to actually
 *    carry the text; that textarea is exactly what Publiceren submits.
 */
async function replaceWelcomeText(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ck-editor__editable[contenteditable=true]')
  await editor.click()
  await editor.press('ControlOrMeta+a')
  await editor.pressSequentially(text)
  await editor.blur()
  await expect.poll(() => page.locator('.wrapper > textarea').inputValue(), POLL).toContain(text)
}

/** Submit a beheer form and wait for its success alert. */
async function publish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Publiceren' }).click()
  await expect(page.getByText('Publiceren gelukt.')).toBeVisible()
}

Given('the burgerportaal beheer interface is open', async ({ page }) => {
  await page.goto(`${base}/beheer`)
  await expect(page.getByRole('navigation', { name: 'Beheermenu' })).toBeVisible()
})

// --- Welkomsttekst ---------------------------------------------------------

When('I set the welcome text to {string}', async ({ page, beheerState }, label: string) => {
  const token = uniqueToken()
  beheerState.expected.set('welcomeToken', token)
  await openBeheer(page, 'Homepage')
  await replaceWelcomeText(page, `${label} ${token}`)
})

When('I publish the homepage settings', async ({ page }) => {
  await publish(page)
})

Then('the public homepage shows the new welcome text', async ({ page, beheer, beheerState }) => {
  const token = beheerState.expected.get('welcomeToken')!
  // Authoritative: the public config reflects the change.
  await expect.poll(() => resource(beheer, 'welcomeText'), POLL).toContain(token)
  // And a burger sees it: the homepage renders welcomeText into an <article>
  // (HomeView.vue), both with and without a promotion video alongside it.
  await page.goto(`${base}/`)
  await expect(page.locator('article.utrecht-article').first()).toContainText(token)
})

// --- Promotievideo ---------------------------------------------------------

When('I set the promotion video URL to {string}', async ({ page }, url: string) => {
  await openBeheer(page, 'Homepage')
  await page.locator('#videoUrl').fill(url)
})

Then('the public homepage has a promotion video', async ({ beheer }) => {
  await expect.poll(() => resource(beheer, 'videoUrl'), POLL).not.toBe('')
})

When('I clear the promotion video URL', async ({ page }) => {
  await openBeheer(page, 'Homepage')
  await page.locator('#videoUrl').clear()
})

Then('the public homepage has no promotion video', async ({ beheer }) => {
  await expect.poll(() => resource(beheer, 'videoUrl'), POLL).toBe('')
})

// --- Afbeeldingen (logo / favicon / sfeerfoto) -----------------------------

When('I replace the {string} image', async ({ beheer, beheerState }, kind: string) => {
  const k = kind as ImageKind
  const before = await beheer.getPublicImage(k)
  beheerState.imageBefore.set(k, sha(before.bytes))
  const fixture = FIXTURE_IMAGES[k]
  await beheer.uploadImage(k, {
    name: fixture.name,
    mimeType: fixture.mimeType,
    buffer: fs.readFileSync(path.join(FIXTURES_DIR, fixture.file)),
  })
})

Then('the public {string} image has changed', async ({ beheer, beheerState }, kind: string) => {
  const k = kind as ImageKind
  const before = beheerState.imageBefore.get(k)!
  await expect.poll(async () => sha((await beheer.getPublicImage(k)).bytes), POLL).not.toBe(before)
})

// --- Externe links ---------------------------------------------------------

When('I set the organisation website URL to {string}', async ({ page, beheerState }, label: string) => {
  const url = `${label}-${uniqueToken()}`
  beheerState.expected.set('websiteUrl', url)
  await openBeheer(page, 'Externe links')
  await page.getByLabel('URL Website organisatie').fill(url)
})

When('I publish the external links', async ({ page }) => {
  await publish(page)
})

Then('the public organisation website URL matches', async ({ beheer, beheerState }) => {
  const url = beheerState.expected.get('websiteUrl')!
  await expect.poll(() => resource(beheer, 'websiteUrl'), POLL).toBe(url)
})

When('I set the {string} footer link to {string}', async ({ page, beheerState }, which: string, label: string) => {
  const url = `${label}-${uniqueToken()}`
  beheerState.expected.set(`footer:${which}`, url)
  await openBeheer(page, 'Externe links')
  await page.getByLabel(FOOTER_LABEL[which]).fill(url)
})

Then('the public {string} footer link matches', async ({ beheer, beheerState }, which: string) => {
  const url = beheerState.expected.get(`footer:${which}`)!
  await expect.poll(() => resource(beheer, FOOTER_FIELD[which]), POLL).toBe(url)
})

When('I remove the {string} footer link', async ({ page }, which: string) => {
  await openBeheer(page, 'Externe links')
  await page.getByLabel(FOOTER_LABEL[which]).clear()
})

Then('the public {string} footer link is empty', async ({ beheer }, which: string) => {
  await expect.poll(() => resource(beheer, FOOTER_FIELD[which]), POLL).toBe('')
})

// ===========================================================================
// Rendered public-site assertions (TS1 matrix gaps): not just the config API /
// image bytes, but what a burger actually sees on the homepage.
// ===========================================================================

/** Fetch bytes from a URL as the public page would (relative → absolute). */
async function fetchPageAsset(page: Page, url: string): Promise<Buffer> {
  const absolute = new URL(url, page.url()).href
  const res = await page.request.get(absolute)
  expect(res.ok(), `GET ${absolute} -> ${res.status()}`).toBeTruthy()
  return Buffer.from(await res.body())
}

/** Wait until the public image bytes differ from the pre-upload sha. */
async function waitForImageChange(
  beheer: { getPublicImage: (k: ImageKind) => Promise<{ bytes: Buffer }> },
  kind: ImageKind,
  beforeSha: string,
): Promise<void> {
  await expect.poll(async () => sha((await beheer.getPublicImage(kind)).bytes), POLL).not.toBe(beforeSha)
}

When('I open the public homepage as a burger', async ({ page }) => {
  await page.goto(`${base}/`)
  await page.waitForLoadState('domcontentloaded')
})

Then('the public homepage loads successfully', async ({ page }) => {
  // Hero search field is the burger-facing landmark that only appears once the
  // SPA has hydrated with resources (GppWooHero.vue).
  await expect(page.locator('#search-field')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('navigation', { name: 'Hoofdmenu' })).toBeVisible()
})

Then('the public homepage renders the promotion video iframe', async ({ page, beheer }) => {
  await expect.poll(() => resource(beheer, 'videoUrl'), POLL).not.toBe('')
  const videoUrl = await resource(beheer, 'videoUrl')
  await page.goto(`${base}/`)
  const iframe = page.locator('iframe[title="Uitleg Burgerportaal"]')
  await expect(iframe).toBeVisible({ timeout: 20_000 })
  await expect(iframe).toHaveAttribute('src', videoUrl)
})

Then('the public homepage renders no promotion video iframe', async ({ page, beheer }) => {
  await expect.poll(() => resource(beheer, 'videoUrl'), POLL).toBe('')
  await page.goto(`${base}/`)
  await expect(page.locator('#search-field')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('iframe[title="Uitleg Burgerportaal"]')).toHaveCount(0)
})

Then('the public homepage displays the new logo', async ({ page, beheer, beheerState }) => {
  const before = beheerState.imageBefore.get('logo')!
  await waitForImageChange(beheer, 'logo', before)
  const publicSha = sha((await beheer.getPublicImage('logo')).bytes)

  await page.goto(`${base}/`)
  const logo = page.locator('.gpp-woo-logo')
  await expect(logo).toBeVisible({ timeout: 20_000 })

  // SVG logos are inlined from a <template> (GppWooLogo.vue); raster logos use <img>.
  // Compare against the live public bytes (upload may normalise the file), not the
  // raw fixture — the homepage must serve the same asset the API exposes.
  const img = logo.locator('img')
  if (await img.count()) {
    const src = await img.getAttribute('src')
    expect(src).toBeTruthy()
    expect(sha(await fetchPageAsset(page, src!))).toBe(publicSha)
  }
  else {
    await expect(logo.locator('svg')).toBeVisible()
    const logoUrl = await resource(beheer, 'logoUrl')
    expect(sha(await fetchPageAsset(page, logoUrl))).toBe(publicSha)
    // Fixture logo.svg's purple fill survives SVG sanitisation — proves the
    // inlined markup is the uploaded logo, not a stale organisation mark.
    expect(await logo.innerHTML()).toMatch(/#7a2ff2/i)
  }
})

Then('the public homepage links to the new favicon', async ({ page, beheer, beheerState }) => {
  const before = beheerState.imageBefore.get('favicon')!
  await waitForImageChange(beheer, 'favicon', before)
  const publicSha = sha((await beheer.getPublicImage('favicon')).bytes)

  await page.goto(`${base}/`)
  const icon = page.locator('link[rel~="icon"]')
  // Favicon <link> is rewritten during app boot from resources; poll until the
  // href serves the same bytes as the public API (upload may convert PNG→ICO).
  await expect.poll(async () => {
    const href = await icon.getAttribute('href')
    if (!href)
      return ''
    return sha(await fetchPageAsset(page, href))
  }, POLL).toBe(publicSha)
})

Then('the public homepage displays the new sfeerfoto', async ({ page, beheer, beheerState }) => {
  const before = beheerState.imageBefore.get('image')!
  await waitForImageChange(beheer, 'image', before)
  const publicSha = sha((await beheer.getPublicImage('image')).bytes)

  await page.goto(`${base}/`)
  const hero = page.locator('img.gpp-woo-hero__image')
  await expect(hero).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => {
    const src = await hero.getAttribute('src')
    if (!src)
      return ''
    return sha(await fetchPageAsset(page, src))
  }, POLL).toBe(publicSha)
})

Then('the "Naar de gemeente" link points to the new organisation website URL', async ({ page, beheer, beheerState }) => {
  const url = beheerState.expected.get('websiteUrl')!
  await expect.poll(() => resource(beheer, 'websiteUrl'), POLL).toBe(url)
  await page.goto(`${base}/`)
  // Nav label is `Naar ${organisationLabel}` (UtrechtNavBar.vue) — often
  // "Naar de organisatie" / "Naar de gemeente", not a fixed string.
  const link = page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: /^Naar / })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await expect(link).toHaveAttribute('href', url)
})

Then('the public {string} footer link points to the new URL', async ({ page, beheer, beheerState }, which: string) => {
  const url = beheerState.expected.get(`footer:${which}`)!
  await expect.poll(() => resource(beheer, FOOTER_FIELD[which]), POLL).toBe(url)
  await page.goto(`${base}/`)
  const link = page.locator('.gpp-woo-page-footer').getByRole('link', { name: FOOTER_PUBLIC_LABEL[which] })
  await expect(link).toBeVisible({ timeout: 20_000 })
  await expect(link).toHaveAttribute('href', url)
})

Then('the public {string} footer link is no longer shown', async ({ page, beheer }, which: string) => {
  await expect.poll(() => resource(beheer, FOOTER_FIELD[which]), POLL).toBe('')
  await page.goto(`${base}/`)
  await expect(page.locator('#search-field')).toBeVisible({ timeout: 20_000 })
  await expect(
    page.locator('.gpp-woo-page-footer').getByRole('link', { name: FOOTER_PUBLIC_LABEL[which] }),
  ).toHaveCount(0)
})
