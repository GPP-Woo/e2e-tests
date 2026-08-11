import type { Page } from '@playwright/test'
import { adminResource } from './admin-resource'

const resource = adminResource({
  path: 'metadata/organisation',
  nameCell: 'th.field-naam a',
})

/**
 * Create a self-added (`zelf_toegevoegd`) organisatie through the Django admin.
 * The organisatie API can create (`POST`) but not delete, and cleanup must be
 * portable, so the whole own-and-clean-up lifecycle runs through the admin —
 * the same approach the information-category scenarios use. The manual add form
 * forces `oorsprong = zelf_toegevoegd`; `is_actief` defaults on so the created
 * organisatie shows up under the "actief" filter the testscript checks.
 * Requires an authenticated admin session on `page`.
 */
export async function addSelfAddedOrganisation(page: Page, naam: string, { actief = true } = {}) {
  await page.goto(resource.addFormUrl())
  await page.locator('#id_naam').fill(naam)
  if (actief !== (await page.locator('#id_is_actief').isChecked()))
    await page.locator('#id_is_actief').setChecked(actief)
  await page.locator('input[name="_save"]').click()
  // Django redirects to the changelist and shows a success message.
  await resource.assertOnChangelist(page)
}

/**
 * List the names of leftover `E2E `-prefixed organisaties via the admin, so a
 * hard-killed run can be swept clean. Requires an authenticated admin session.
 */
export function listE2EOrganisationNames(page: Page, prefix = 'E2E ') {
  return resource.listE2ENames(page, prefix)
}

/**
 * Whether an organisatie with exactly this naam exists, read from the admin
 * changelist. Deterministic verification for the admin-driven scenarios (the token API is
 * unreliable while an admin session mutates the same server — see README). Requires an admin session.
 */
export function organisationExists(page: Page, naam: string): Promise<boolean> {
  return resource.exists(page, naam)
}

/** Whether the organisatie's "Is actief" checkbox is ticked, read from its change page. */
export async function organisationIsActive(page: Page, naam: string): Promise<boolean> {
  if (!(await resource.open(page, naam)))
    return false
  return page.locator('#id_is_actief').isChecked()
}

/**
 * Delete an organisatie by name via the admin, for scenario cleanup. No-op if
 * it is already gone.
 */
export function deleteOrganisationByName(page: Page, naam: string) {
  return resource.remove(page, naam)
}
