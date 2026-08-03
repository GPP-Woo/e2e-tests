import type { Page } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'

/**
 * The publicatiebank audit trail (`logging.TimelineLogProxy`) read through the
 * Django admin.
 *
 * Two properties of `TimelineLogProxyAdmin` make this readable without container
 * access:
 *
 * - it searches `extra_data___cached_object_repr` — the `str()` of the logged
 *   object, cached when the entry was written — so an entry stays findable by
 *   titel *after* its publicatie is deleted, which is exactly what the deletion
 *   scenario needs;
 * - the `event` GET parameter is the admin's own event filter (see
 *   `EventListFilter`), so a search narrows to the CRUD event under test instead
 *   of drowning in the `read` entries every change-page visit adds.
 *
 * Entries are immutable in the admin (no add/change/delete permission), so Django
 * renders their detail page fully read-only — including the `extra_data` JSON,
 * which holds `serialize_instance()`'s snapshot of every field at that moment.
 * That snapshot is what makes "the log recorded *this* change" assertable rather
 * than merely "something was logged".
 */
export type AuditEvent = 'create' | 'read' | 'update' | 'delete'

const changelist = new URL('/admin/logging/timelinelogproxy/', ENV.apps.publicatiebank).href

function search(page: Page, objectRepr: string, event: AuditEvent) {
  return page.goto(`${changelist}?q=${encodeURIComponent(objectRepr)}&event=${event}`)
}

/** How many audit entries with this event are logged for `objectRepr`. */
export async function auditEntryCount(page: Page, objectRepr: string, event: AuditEvent): Promise<number> {
  await search(page, objectRepr, event)
  return page.locator('#result_list tbody tr').count()
}

/**
 * Body text of the newest audit entry with this event for `objectRepr`, i.e. its
 * read-only detail page including the `extra_data` snapshot. '' if no such entry
 * is logged.
 */
export async function newestAuditEntryText(page: Page, objectRepr: string, event: AuditEvent): Promise<string> {
  await search(page, objectRepr, event)
  // The changelist is ordered `-timestamp` and its first column (the log message)
  // is the row link, so the first link in the first row is the newest entry.
  const link = page.locator('#result_list tbody tr').first().locator('th a, td a').first()
  if ((await link.count()) === 0)
    return ''
  await link.click()
  return (await page.locator('#content').textContent()) ?? ''
}
