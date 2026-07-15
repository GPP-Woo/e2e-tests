import type { ImageKind } from '@/bdd/@burgerportaal/support/beheer-config'
import type { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hasOpenRouterKey, settle, stagehandPage } from '@/bdd/_core/stagehand'
import { expect } from '@playwright/test'
import { z } from 'zod'
import { Before, Given, test, Then, When } from '../../_core/fixture'
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

// Skip the whole feature when no model key is configured, so the rest of the
// suite stays green without OpenRouter.
Before({ tags: '@beheer' }, async () => {
  test.skip(!hasOpenRouterKey(), 'Set OPENROUTER_API_KEY to run the Stagehand @beheer scenarios')
})

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
