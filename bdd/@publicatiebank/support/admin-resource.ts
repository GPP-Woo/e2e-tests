import type { Page } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'
import { expect } from '@playwright/test'

/**
 * A Django-admin metadata resource (informatiecategorie, organisatie, onderwerp,
 * publicatie) seen through the ordinary session-authenticated Playwright `page`.
 *
 * The four metadata entities the suite owns share one changelist script — search
 * by name, open a row, delete-with-confirm, list `E2E `-prefixed leftovers — that
 * differs only in a handful of selectors. This module captures that script once;
 * each entity is a small {@link AdminResourceConfig} rather than a copy of the
 * whole flow. Reads/deletes go through the session `page` (a real user) because
 * the token API is unreliable while an admin session mutates the same server
 * (see README "Known server flake").
 *
 * Bespoke add-form filling (a topic's mandatory afbeelding, a publicatie's
 * publisher + select2) stays in the per-entity helper — only the shared
 * changelist mechanics live here.
 */
export interface AdminResourceConfig {
  /** Admin app/model path, e.g. `metadata/organisation` or `publications/topic`. */
  path: string
  /**
   * Selector for the name links in the changelist, e.g. `th.field-naam a`.
   * Defaults to the generic result-list cells (used where no single name column
   * class is reliable, as for publicaties).
   */
  nameCell?: string
  /** How a row is matched by name. `exact-link` (default) or `result-row` (substring). */
  rowMatch?: 'exact-link' | 'result-row'
  /** Change-URL id shape: `\d+` (integer PK) or `[0-9a-f-]+` (uuid). */
  changeId?: string
  /** Which delete link to click on the change page. `verwijderen` (default) or `deletelink`. */
  deleteVia?: 'verwijderen' | 'deletelink'
}

export interface AdminResource {
  changelistUrl: () => string
  addFormUrl: () => string
  /** Assert the page has landed back on the changelist (post-save/delete redirect). */
  assertOnChangelist: (page: Page) => Promise<void>
  /** Names of leftover `${prefix}`-prefixed rows, for scenario/run-wide cleanup. */
  listE2ENames: (page: Page, prefix?: string) => Promise<string[]>
  /** Whether a row with exactly this name is listed in the changelist. */
  exists: (page: Page, name: string) => Promise<boolean>
  /** Open the change page of the row with this name; false if none exists. */
  open: (page: Page, name: string) => Promise<boolean>
  /** Delete-with-confirm the change page that is currently open. */
  deleteOpen: (page: Page) => Promise<void>
  /** Delete the row with this name via the admin. No-op if already gone. */
  remove: (page: Page, name: string) => Promise<void>
}

const DEFAULT_NAME_CELL = '#result_list tbody tr th a, #result_list tbody tr td a'

export function adminResource(config: AdminResourceConfig): AdminResource {
  const {
    path,
    nameCell = DEFAULT_NAME_CELL,
    rowMatch = 'exact-link',
    changeId = '\\d+',
    deleteVia = 'verwijderen',
  } = config

  const changelistUrl = () => new URL(`/admin/${path}/`, ENV.apps.publicatiebank).href
  const addFormUrl = () => new URL(`/admin/${path}/add/`, ENV.apps.publicatiebank).href
  const changelistRe = new RegExp(`/admin/${path}/(\\?.*)?$`)
  const changeRe = new RegExp(`/admin/${path}/${changeId}/change/`)

  async function gotoSearch(page: Page, name: string) {
    await page.goto(`${changelistUrl()}?q=${encodeURIComponent(name)}`)
  }

  /** Whether the named row is present, and click into it if `click` is set. */
  async function findRow(page: Page, name: string, click: boolean): Promise<boolean> {
    if (rowMatch === 'result-row') {
      const row = page.locator('#result_list tbody tr', { hasText: name })
      if ((await row.count()) === 0)
        return false
      if (click)
        await row.first().locator('th a, td a').first().click()
      return true
    }
    const row = page.getByRole('link', { name, exact: true })
    if ((await row.count()) === 0)
      return false
    if (click)
      await row.first().click()
    return true
  }

  /** Delete-with-confirm whatever change page is currently open. */
  async function deleteOpen(page: Page) {
    // The publicatie change page also carries an eigenaar-inline "verwijderen"
    // link, so target the main delete link by class rather than accessible name.
    if (deleteVia === 'deletelink')
      await page.locator('a.deletelink').click()
    else
      await page.getByRole('link', { name: 'Verwijderen' }).click()
    await page.getByRole('button', { name: /Ja, ik weet het zeker/i }).click()
    await expect(page).toHaveURL(changelistRe)
  }

  return {
    changelistUrl,
    addFormUrl,
    deleteOpen,
    async assertOnChangelist(page) {
      await expect(page).toHaveURL(changelistRe)
    },
    async listE2ENames(page, prefix = 'E2E ') {
      await gotoSearch(page, prefix)
      const names = await page.locator(nameCell).allTextContents()
      return names.map(n => n.trim()).filter(n => n.startsWith(prefix))
    },
    async exists(page, name) {
      await gotoSearch(page, name)
      return findRow(page, name, false)
    },
    async open(page, name) {
      await gotoSearch(page, name)
      if (!(await findRow(page, name, true)))
        return false
      await expect(page).toHaveURL(changeRe)
      return true
    },
    async remove(page, name) {
      await gotoSearch(page, name)
      if (!(await findRow(page, name, true)))
        return
      await deleteOpen(page)
    },
  }
}
