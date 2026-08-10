import type { ImageKind } from '@/bdd/@burgerportaal/support/beheer-config'
import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
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
// @todo stubs — gaps vs. manual TS1: verify the RENDERED public site, not just
// the config. These are registered so bddgen stays green; the @todo Before hook
// (bdd/_core/todo.steps.ts) skips the scenarios, so the bodies never execute.
// Assertions read the public site deterministically through the plain Playwright
// `page` fixture (public pages need no auth), mirroring the sibling admin steps.
// ===========================================================================

// Implement: page.goto(`${base}/`), settle, then assert a landmark of the burger
// homepage is visible (e.g. the search field #search-field, or the header) so we
// prove the portal renders — not merely that navigation returned a response.
When('I open the public homepage as a burger', async ({ page }) => {
  await page.goto(`${base}/`)
  throw new Error('TODO: goto the public homepage and settle so the load can be asserted')
})

Then('the public homepage loads successfully', async () => {
  throw new Error('TODO: assert a burger-facing landmark (e.g. #search-field / main header) is visible on the public homepage')
})

// Implement: page.goto(`${base}/`), then assert an <iframe> whose src points at
// the configured YouTube/Vimeo embed (resource(beheer,'videoUrl')) is present.
Then('the public homepage renders the promotion video iframe', async () => {
  throw new Error('TODO: assert the homepage renders an <iframe> with src matching the configured videoUrl embed')
})

// Implement: page.goto(`${base}/`), then assert no promotion-video <iframe> is
// present (locator count is 0) once the videoUrl has been cleared.
Then('the public homepage renders no promotion video iframe', async () => {
  throw new Error('TODO: assert the homepage renders no promotion-video <iframe> after the video URL was cleared')
})

// Implement: page.goto(`${base}/`), read the rendered logo <img> src, fetch its
// bytes and assert the sha matches the uploaded fixture (beheer.getPublicImage /
// FIXTURE_IMAGES.logo) rather than the pre-test logo.
Then('the public homepage displays the new logo', async () => {
  throw new Error('TODO: read the homepage logo <img> and assert its bytes match the uploaded logo fixture')
})

// Implement: page.goto(`${base}/`), read <link rel="icon">/<link rel="shortcut
// icon"> href, fetch it and assert its sha matches the uploaded favicon fixture.
Then('the public homepage links to the new favicon', async () => {
  throw new Error('TODO: read the <link rel="icon"> href and assert its bytes match the uploaded favicon fixture')
})

// Implement: page.goto(`${base}/`), read the rendered sfeerfoto <img> (or CSS
// background-image) and assert its bytes match the uploaded image fixture.
Then('the public homepage displays the new sfeerfoto', async () => {
  throw new Error('TODO: read the homepage sfeerfoto image and assert its bytes match the uploaded sfeerfoto fixture')
})

// Implement: page.goto(`${base}/`), locate the top-right "Naar de gemeente"
// anchor and assert its href equals beheerState.expected.get('websiteUrl').
Then('the "Naar de gemeente" link points to the new organisation website URL', async ({ beheerState }) => {
  const url = beheerState.expected.get('websiteUrl')!
  throw new Error(`TODO: assert the "Naar de gemeente" link href equals ${url}`)
})

// Implement: page.goto(`${base}/`), locate the footer anchor by its public label
// (FOOTER_PUBLIC_LABEL[which]) and assert its href equals beheerState.expected
// .get(`footer:${which}`).
Then('the public {string} footer link points to the new URL', async ({ beheerState }, which: string) => {
  const url = beheerState.expected.get(`footer:${which}`)!
  throw new Error(`TODO: assert the "${FOOTER_PUBLIC_LABEL[which]}" footer link href equals ${url}`)
})

// Implement: page.goto(`${base}/`), assert the footer anchor labelled
// FOOTER_PUBLIC_LABEL[which] is no longer rendered (locator count 0) once its
// URL was removed and republished.
Then('the public {string} footer link is no longer shown', async ({}, which: string) => {
  throw new Error(`TODO: assert the "${FOOTER_PUBLIC_LABEL[which]}" footer link is no longer rendered in the footer`)
})
