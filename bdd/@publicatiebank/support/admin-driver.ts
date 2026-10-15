import type { Page } from '@playwright/test'
import type { AdminResource } from './admin-resource'

/**
 * A Django-admin resource driven through the ordinary session-authenticated
 * Playwright `page`.
 *
 * The organisatie/onderwerp/publicatie beheer scenarios all run the same
 * changelist CRUD script — open the changelist, search a row and open it, save
 * with "Opslaan", delete-with-confirm — differing only in the Dutch noun and the
 * entity's {@link AdminResource}. This binds that script to one config so the
 * step files express intent (`open`, `save`, `remove`) instead of re-typing the
 * goto→click→assert mechanics. The changelist selectors themselves live once in
 * `admin-resource.ts`, which the read/cleanup helpers share.
 */
export interface AdminDriverConfig {
  /** Dutch singular used in error messages, e.g. `organisatie`, `onderwerp`, `publicatie`. */
  noun: string
  /** The entity's shared changelist mechanics (search, open, delete-with-confirm). */
  resource: AdminResource
}

export interface AdminDriver {
  /** Open the changelist. */
  openList: () => Promise<void>
  /** Search for `name` and open its row in the changelist; throws if there is none. */
  open: (name: string) => Promise<void>
  /** Click "Opslaan" and assert the admin redirected back to the changelist. */
  save: () => Promise<void>
  /** Delete-with-confirm the currently open change page. */
  removeCurrent: () => Promise<void>
  /** Search the changelist for `name` through the admin search box. */
  search: (name: string) => Promise<void>
}

export function adminDriver(page: Page, { noun, resource }: AdminDriverConfig): AdminDriver {
  return {
    async openList() {
      await page.goto(resource.changelistUrl())
    },
    async open(name) {
      if (!(await resource.open(page, name)))
        throw new Error(`No ${noun} named "${name}" in the admin changelist`)
    },
    async save() {
      await page.locator('input[name="_save"]').click()
      await resource.assertOnChangelist(page)
    },
    async removeCurrent() {
      await resource.deleteOpen(page)
    },
    async search(name) {
      // Django's built-in changelist search box — a stable id on every admin
      // changelist, regardless of theme. Driven as a user would (rather than a
      // `?q=` goto) because the search box itself is the read under test.
      await page.goto(resource.changelistUrl())
      await page.locator('#searchbar').fill(name)
      await page.locator('#searchbar').press('Enter')
      await resource.assertOnChangelist(page)
    },
  }
}
