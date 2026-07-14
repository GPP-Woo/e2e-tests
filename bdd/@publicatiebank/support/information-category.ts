import type { Page } from '@playwright/test'
import { adminResource } from './admin-resource'

const resource = adminResource({
  path: 'metadata/informationcategory',
  nameCell: 'th.field-naam a',
})

/**
 * Create a self-added (`zelf_toegevoegd`) information category through the Django
 * admin. The API is read-only for categories and the admin forces
 * `oorsprong = zelf_toegevoegd` for manually added entries, so this is the only
 * way a test can own one. Requires an authenticated admin session on `page`.
 */
export async function addSelfAddedCategory(page: Page, naam: string) {
  await page.goto(resource.addFormUrl())
  await page.locator('#id_naam').fill(naam)
  await page.locator('#id_naam_meervoud').fill(naam)
  await page.locator('#id_definitie').fill(`E2E test category ${naam}`)
  // The admin requires an archiving source, unlike the fixture-loaded entries.
  await page.locator('#id_bron_bewaartermijn').fill('E2E test')
  await page.locator('input[name="_save"]').click()
  // Django redirects to the changelist and shows a success message.
  await resource.assertOnChangelist(page)
}

/**
 * Fail loud if the `waardelijst` reference categories are missing. They cannot
 * be created via the UI or the API (the admin forces `oorsprong=zelf_toegevoegd`
 * and the category API is read-only), so they are a documented prerequisite:
 * the target environment must ship them (see README "Requirements to run").
 * This turns a missing prerequisite into a clear error at setup time instead of
 * confusing scenario failures. Requires an authenticated admin session.
 */
export async function verifyWaardelijstPresent(page: Page) {
  await page.goto(resource.changelistUrl())
  await page.getByRole('link', { name: 'Waardelijst', exact: true }).click()
  await page.locator('td.field-oorsprong').first().waitFor({ timeout: 10_000 }).catch(() => {})
  if ((await page.locator('td.field-oorsprong').count()) > 0)
    return
  throw new Error(
    '[setup] No `waardelijst` reference information categories found in the '
    + 'publicatiebank. They cannot be created via the UI/API and must be seeded '
    + 'in the target environment. See README "Requirements to run"; locally:\n'
    + '  docker exec <ODRC_CONTAINER> python src/manage.py '
    + 'load_information_categories '
    + 'src/woo_publications/fixtures/information_categories.json',
  )
}

/**
 * List the names of leftover `E2E `-prefixed categories via the admin, so a
 * hard-killed run can be swept clean. All `E2E ` categories are self-added by
 * the suite. Requires an authenticated admin session.
 */
export function listE2ECategoryNames(page: Page, prefix = 'E2E ') {
  return resource.listE2ENames(page, prefix)
}

/**
 * Delete an information category by name via the admin, for scenario cleanup.
 * No-op if it is already gone.
 */
export function deleteCategoryByName(page: Page, naam: string) {
  return resource.remove(page, naam)
}
