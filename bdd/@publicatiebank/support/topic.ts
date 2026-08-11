import type { Page } from '@playwright/test'
import path from 'node:path'
import { adminResource } from './admin-resource'

/** Shared Django-admin changelist mechanics for this entity (also drives its `adminDriver`). */
export const resource = adminResource({
  path: 'publications/topic',
  nameCell: 'th.field-officiele_titel a',
  changeId: '[0-9a-f-]+',
})

/** A small (≤600×600) PNG the add form accepts as the mandatory afbeelding. */
export const TOPIC_IMAGE = path.join(__dirname, '..', '@admin', 'fixtures', 'onderwerp.png')

/**
 * Create an onderwerp (Topic) through the Django admin. Onderwerpen are
 * `GET`-only over the API, so — like information categories — the only way a
 * test can own one is the admin. The add form requires an afbeelding (max
 * 600×600 px) plus an officiële titel and a publicatiestatus.
 *
 * Defaults to `concept` status so the test-owned onderwerp never becomes
 * publicly visible on the burgerportaal; pass `status: 'gepubliceerd'` when a
 * scenario needs the public effect. Requires an authenticated admin session.
 */
export async function addTopic(
  page: Page,
  titel: string,
  { status = 'concept', promoot = false, omschrijving = '' } = {},
) {
  await page.goto(resource.addFormUrl())
  await page.locator('#id_afbeelding').setInputFiles(TOPIC_IMAGE)
  await page.locator('#id_officiele_titel').fill(titel)
  if (omschrijving)
    await page.locator('#id_omschrijving').fill(omschrijving)
  await page.locator('#id_publicatiestatus').selectOption(status)
  if (promoot)
    await page.locator('#id_promoot').setChecked(true)
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/**
 * List the officiële titels of leftover `E2E `-prefixed onderwerpen via the
 * admin, so a hard-killed run can be swept clean. Requires an admin session.
 */
export function listE2ETopicNames(page: Page, prefix = 'E2E ') {
  return resource.listE2ENames(page, prefix)
}

/**
 * Whether an onderwerp with exactly this titel exists, read from the admin
 * changelist. Deterministic verification for the admin-driven scenarios (the token API is
 * unreliable while an admin session mutates the same server — see README).
 */
export function topicExists(page: Page, titel: string): Promise<boolean> {
  return resource.exists(page, titel)
}

/** Whether the onderwerp's "Promoot" checkbox is ticked, read from its change page. */
export async function topicIsPromoted(page: Page, titel: string): Promise<boolean> {
  if (!(await resource.open(page, titel)))
    return false
  return page.locator('#id_promoot').isChecked()
}

/** The onderwerp's omschrijving text, read from its change page ('' if not found). */
export async function topicOmschrijving(page: Page, titel: string): Promise<string> {
  if (!(await resource.open(page, titel)))
    return ''
  return page.locator('#id_omschrijving').inputValue()
}

/** Delete an onderwerp by officiële titel via the admin. No-op if already gone. */
export function deleteTopicByName(page: Page, titel: string) {
  return resource.remove(page, titel)
}
