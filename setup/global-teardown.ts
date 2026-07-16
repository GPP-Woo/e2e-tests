import type { Page } from '@playwright/test'
import { deleteUsergroupByName, listE2EUsergroupNames } from '@/bdd/@gpp-app/support/usergroup'
import { deleteDocumentByTitel, listE2EDocumentTitels } from '@/bdd/@publicatiebank/support/document'
import { deleteCategoryByName, listE2ECategoryNames } from '@/bdd/@publicatiebank/support/information-category'
import { deleteOrganisationByName, listE2EOrganisationNames } from '@/bdd/@publicatiebank/support/organisation'
import { deletePublicationByTitel, listE2EPublicationTitels } from '@/bdd/@publicatiebank/support/publication'
import { deleteTopicByName, listE2ETopicNames } from '@/bdd/@publicatiebank/support/topic'
import { adminState } from '@/bdd/_core/roles'
import { sortByDependsOn } from '@/bdd/_core/topo'
import { request as apiRequest, chromium } from '@playwright/test'

/**
 * One admin-swept resource: how to list `E2E `-prefixed leftovers and how to
 * delete one. Adding a new metadata resource is one row here, not a new block;
 * FK ordering is declared per row via `dependsOn` and topo-sorted, never
 * hand-maintained through array position.
 */
interface AdminSweep {
  label: string
  /** Labels that must be swept before this one (their rows block deletion). */
  dependsOn?: string[]
  list: (page: Page) => Promise<string[]>
  remove: (page: Page, name: string) => Promise<void>
}

const ADMIN_SWEEPS: AdminSweep[] = sortByDependsOn([
  { label: 'categories', list: listE2ECategoryNames, remove: deleteCategoryByName },
  { label: 'organisaties', list: listE2EOrganisationNames, remove: deleteOrganisationByName },
  { label: 'onderwerpen', list: listE2ETopicNames, remove: deleteTopicByName },
  { label: 'documenten', list: listE2EDocumentTitels, remove: deleteDocumentByTitel },
  // A document belongs to a publicatie, so documenten must be swept first.
  { label: 'publicaties', dependsOn: ['documenten'], list: listE2EPublicationTitels, remove: deletePublicationByTitel },
])

/**
 * Safety net for data ownership: scenarios delete the `E2E `-prefixed rows they
 * create in fixture teardown, but a hard-killed run (SIGTERM/CI cancel) skips
 * that. This sweeps any leftovers after the whole run so test data never
 * accumulates.
 *
 * The metadata resources are swept through the Django admin with the saved admin
 * session (`.auth/admin.json`) — no shell/`docker exec` access required.
 * Gebruikersgroepen are swept over the odpc JSON API (they have no admin here).
 * Best-effort — never fails the run.
 */
async function globalTeardown() {
  const browser = await chromium.launch({
    // Reach the local Keycloak issuer host in case the session needs a refresh.
    args: ['--host-resolver-rules=MAP keycloak.woo-search.local 127.0.0.1'],
  })
  try {
    const context = await browser.newContext({ storageState: adminState })
    const page = await context.newPage()

    const counts: string[] = []
    for (const sweep of ADMIN_SWEEPS) {
      const names = await sweep.list(page)
      for (const name of names)
        await sweep.remove(page, name)
      counts.push(`${sweep.label}: ${names.length}`)
    }

    // Gebruikersgroepen live behind the odpc API, not this admin.
    const apiCtx = await apiRequest.newContext({ storageState: adminState })
    try {
      const groups = await listE2EUsergroupNames(apiCtx)
      for (const naam of groups)
        await deleteUsergroupByName(apiCtx, naam)
      counts.push(`gebruikersgroepen: ${groups.length}`)
    }
    finally {
      await apiCtx.dispose()
    }

    // eslint-disable-next-line no-console
    console.log(`[global-teardown] removed stray E2E data — ${counts.join(', ')}`)
  }
  catch {
    // Non-fatal: the admin session may be absent (auth setup failed) or the
    // environment unreachable. Leftovers, if any, are swept on the next run.
  }
  finally {
    await browser.close()
  }
}

export default globalTeardown
