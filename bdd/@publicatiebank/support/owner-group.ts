import type { Page } from '@playwright/test'
import { adminResource } from './admin-resource'

/**
 * Eigenaar-groepen (`accounts.OrganisationUnit`) owned by a scenario, through the
 * Django admin.
 *
 * Unlike the other metadata resources these are addressed by a *slug identifier*
 * rather than by naam: `OrganisationUnitAdmin.search_fields` is `("identifier",)`
 * only, so both the changelist search (`?q=`) and the publicatie form's
 * eigenaar-groep autocomplete match on the identifier and never on the naam. The
 * identifier is therefore what the `ownerGroups` resource manager hands out and
 * what the run-wide sweep looks for, and the naam is derived from it.
 *
 * A group is editable only on the add form — `get_readonly_fields` freezes the
 * identifier once the row exists — which is fine, no scenario renames one.
 */
const resource = adminResource({ path: 'accounts/organisationunit' })

/** Prefix of every scenario-owned eigenaar groep identifier (a slug, so no `E2E `). */
export const OWNER_GROUP_PREFIX = 'e2e-groep-'

/** Display naam of a scenario-owned eigenaar groep, derived from its identifier. */
export function ownerGroupNaam(identifier: string): string {
  return `E2E groep ${identifier}`
}

/**
 * How an eigenaar groep reads as an option label — `OrganisationUnit.__str__`.
 * Needed to pick one in the plain `<select>` of the bulk "eigenaar groep
 * wijzigen" action (that form is a ModelChoiceField, not an autocomplete).
 */
export function ownerGroupLabel(identifier: string): string {
  return `${ownerGroupNaam(identifier)} - (${identifier})`
}

/**
 * Create an eigenaar groep through the admin (deterministic prerequisite, never
 * the action under test). Requires an authenticated admin session on `page`.
 */
export async function addOwnerGroup(page: Page, identifier: string): Promise<void> {
  await page.goto(resource.addFormUrl())
  await page.locator('#id_identifier').fill(identifier)
  await page.locator('#id_naam').fill(ownerGroupNaam(identifier))
  await page.locator('input[name="_save"]').click()
  await resource.assertOnChangelist(page)
}

/** Delete an eigenaar groep by identifier via the admin. No-op if already gone. */
export function deleteOwnerGroupByIdentifier(page: Page, identifier: string): Promise<void> {
  return resource.remove(page, identifier)
}

/** Identifiers of leftover scenario-owned eigenaar groepen, for the run-wide sweep. */
export function listE2EOwnerGroupIdentifiers(page: Page, prefix = OWNER_GROUP_PREFIX): Promise<string[]> {
  return resource.listE2ENames(page, prefix)
}
