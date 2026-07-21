import type { ImageKind } from '@/bdd/@burgerportaal/support/beheer-config'
import type { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { settle, stagehandPage } from '@/bdd/_core/stagehand'
import { expect } from '@playwright/test'
import { z } from 'zod'
import { Given, Then, When } from '../../_core/fixture'
import { ENV } from '../../_core/types'

/**
 * Testscript 1 steps. Mutations run through the beheer UI via Stagehand
 * (natural-language `act()` on Dutch field/menu labels); assertions run against
 * the public site deterministically — the config API
 * (`/api/environment/resources`), raw image bytes, and one AI `extract()` to
 * prove a burger actually sees the rendered welcome text.
 *
 * Image replacement uses the authenticated upload API rather than the UI: the
 * LOCAL Stagehand browser is CDP-based and cannot drive an OS file dialog, so
 * we POST to the very endpoint the beheer UI calls and assert the public effect.
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

/** Public config field behind each footer link + its beheer form label. */
const FOOTER_FIELD: Record<string, string> = { privacy: 'privacyUrl', contact: 'contactUrl', toegankelijkheid: 'a11yUrl' }
const FOOTER_LABEL: Record<string, string> = { privacy: 'Privacy', contact: 'Contact', toegankelijkheid: 'Toegankelijkheid' }

const POLL = { timeout: 20_000, intervals: [500, 1000, 2000] }

// The @beheer feature is tagged @ai, so the shared @ai Before hook (in
// @publicatiebank/@admin/steps.ts) already skips it without OPENROUTER_API_KEY
// and off Chromium — no feature-specific guard needed here.

Given('the burgerportaal beheer interface is open', async ({ stagehand }) => {
  const page = stagehandPage(stagehand)
  await page.goto(`${base}/beheer`)
  await settle(page)
})

// --- Welkomsttekst ---------------------------------------------------------

When('I set the welcome text to {string}', async ({ stagehand, beheerState }, label: string) => {
  const token = uniqueToken()
  beheerState.expected.set('welcomeToken', token)
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Homepage" item in the beheer navigation menu')
  await stagehand.act(`Replace the entire contents of the "Welkomsttekst" rich text editor with: ${label} ${token}`)
})

When('I publish the homepage settings', async ({ stagehand }) => {
  await stagehand.act('Click the "Publiceren" button to save the homepage settings')
  await settle(stagehandPage(stagehand))
})

Then('the public homepage shows the new welcome text', async ({ stagehand, beheer, beheerState }) => {
  const token = beheerState.expected.get('welcomeToken')!
  // Authoritative: the public config reflects the change.
  await expect.poll(() => resource(beheer, 'welcomeText'), POLL).toContain(token)
  // And a burger sees it: extract the rendered homepage text via the AI browser.
  const page = stagehandPage(stagehand)
  await page.goto(`${base}/`)
  await settle(page)
  const extracted = await stagehand.extract('Extract the welcome text shown on the homepage', z.string())
  expect(extracted ?? '').toContain(token)
})

// --- Promotievideo ---------------------------------------------------------

When('I set the promotion video URL to {string}', async ({ stagehand }, url: string) => {
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Homepage" item in the beheer navigation menu')
  await stagehand.act(`Set the "Promotie- of instructievideo" URL field to: ${url}`)
})

Then('the public homepage has a promotion video', async ({ beheer }) => {
  await expect.poll(() => resource(beheer, 'videoUrl'), POLL).not.toBe('')
})

When('I clear the promotion video URL', async ({ stagehand }) => {
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Homepage" item in the beheer navigation menu')
  await stagehand.act('Clear the "Promotie- of instructievideo" URL field so it is empty')
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

When('I set the organisation website URL to {string}', async ({ stagehand, beheerState }, label: string) => {
  const url = `${label}-${uniqueToken()}`
  beheerState.expected.set('websiteUrl', url)
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Externe links" item in the beheer navigation menu')
  await stagehand.act(`Set the "URL Website organisatie" field to: ${url}`)
})

When('I publish the external links', async ({ stagehand }) => {
  await stagehand.act('Click the "Publiceren" button to save the external links')
  await settle(stagehandPage(stagehand))
})

Then('the public organisation website URL matches', async ({ beheer, beheerState }) => {
  const url = beheerState.expected.get('websiteUrl')!
  await expect.poll(() => resource(beheer, 'websiteUrl'), POLL).toBe(url)
})

When('I set the {string} footer link to {string}', async ({ stagehand, beheerState }, which: string, label: string) => {
  const url = `${label}-${uniqueToken()}`
  beheerState.expected.set(`footer:${which}`, url)
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Externe links" item in the beheer navigation menu')
  await stagehand.act(`Set the "${FOOTER_LABEL[which]}" URL field to: ${url}`)
})

Then('the public {string} footer link matches', async ({ beheer, beheerState }, which: string) => {
  const url = beheerState.expected.get(`footer:${which}`)!
  await expect.poll(() => resource(beheer, FOOTER_FIELD[which]), POLL).toBe(url)
})

When('I remove the {string} footer link', async ({ stagehand }, which: string) => {
  await stagehandPage(stagehand).goto(`${base}/beheer`)
  await stagehand.act('Open the "Externe links" item in the beheer navigation menu')
  await stagehand.act(`Clear the "${FOOTER_LABEL[which]}" URL field so it is empty`)
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

Then('the public homepage loads successfully', async ({ page }) => {
  throw new Error('TODO: assert a burger-facing landmark (e.g. #search-field / main header) is visible on the public homepage')
})

// Implement: page.goto(`${base}/`), then assert an <iframe> whose src points at
// the configured YouTube/Vimeo embed (resource(beheer,'videoUrl')) is present.
Then('the public homepage renders the promotion video iframe', async ({ page, beheer }) => {
  throw new Error('TODO: assert the homepage renders an <iframe> with src matching the configured videoUrl embed')
})

// Implement: page.goto(`${base}/`), then assert no promotion-video <iframe> is
// present (locator count is 0) once the videoUrl has been cleared.
Then('the public homepage renders no promotion video iframe', async ({ page }) => {
  throw new Error('TODO: assert the homepage renders no promotion-video <iframe> after the video URL was cleared')
})

// Implement: page.goto(`${base}/`), read the rendered logo <img> src, fetch its
// bytes and assert the sha matches the uploaded fixture (beheer.getPublicImage /
// FIXTURE_IMAGES.logo) rather than the pre-test logo.
Then('the public homepage displays the new logo', async ({ page, beheer }) => {
  throw new Error('TODO: read the homepage logo <img> and assert its bytes match the uploaded logo fixture')
})

// Implement: page.goto(`${base}/`), read <link rel="icon">/<link rel="shortcut
// icon"> href, fetch it and assert its sha matches the uploaded favicon fixture.
Then('the public homepage links to the new favicon', async ({ page, beheer }) => {
  throw new Error('TODO: read the <link rel="icon"> href and assert its bytes match the uploaded favicon fixture')
})

// Implement: page.goto(`${base}/`), read the rendered sfeerfoto <img> (or CSS
// background-image) and assert its bytes match the uploaded image fixture.
Then('the public homepage displays the new sfeerfoto', async ({ page, beheer }) => {
  throw new Error('TODO: read the homepage sfeerfoto image and assert its bytes match the uploaded sfeerfoto fixture')
})

// Implement: page.goto(`${base}/`), locate the top-right "Naar de gemeente"
// anchor and assert its href equals beheerState.expected.get('websiteUrl').
Then('the "Naar de gemeente" link points to the new organisation website URL', async ({ page, beheerState }) => {
  const url = beheerState.expected.get('websiteUrl')!
  throw new Error(`TODO: assert the "Naar de gemeente" link href equals ${url}`)
})

// Implement: page.goto(`${base}/`), locate the footer anchor by its label
// (FOOTER_LABEL[which]) and assert its href equals beheerState.expected
// .get(`footer:${which}`).
Then('the public {string} footer link points to the new URL', async ({ page, beheerState }, which: string) => {
  const url = beheerState.expected.get(`footer:${which}`)!
  throw new Error(`TODO: assert the "${FOOTER_LABEL[which]}" footer link href equals ${url}`)
})

// Implement: page.goto(`${base}/`), assert the footer anchor labelled
// FOOTER_LABEL[which] is no longer rendered (locator count 0) once its URL was
// removed and republished.
Then('the public {string} footer link is no longer shown', async ({ page }, which: string) => {
  throw new Error(`TODO: assert the "${FOOTER_LABEL[which]}" footer link is no longer rendered in the footer`)
})
