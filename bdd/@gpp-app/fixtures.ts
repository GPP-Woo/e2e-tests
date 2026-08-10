import type { UsergroupDetail } from './support/usergroup'
import { publicatiebankTest } from '@/bdd/@publicatiebank/fixtures'
import { makeResourceManager } from '@/bdd/_core/resource-manager'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'
import { createAuthorisedGroup, currentUserId, deleteUsergroupByName, getUsergroupDetail, informatiecategorieen, resolveOnderwerpUuid, resolveOrganisatieUuid, usergroupExists } from './support/usergroup'

/**
 * GPP-app-owned fixtures. Extends the publicatiebank test (not core) because
 * `authProfile` seeds its organisatie through the `organisations` fixture.
 */

/**
 * Owns the gpp-app gebruikersgroepen a scenario creates. Groups are mutated
 * through the gpp-app UI (plain Playwright); this manager verifies + cleans up
 * through the odpc JSON API (session-authenticated).
 */
export interface UsergroupManager {
  /** Whether a gebruikersgroep with this naam exists (read over the odpc API). */
  exists: (naam: string) => Promise<boolean>
  /** Register a naam created through the UI so cleanup deletes it. */
  track: (naam: string) => string
  /** A fresh unique `E2E …` naam, without creating anything. */
  freshName: () => string
  /** Naam of the most recently tracked gebruikersgroep (throws if none). */
  last: () => string
  /** Full detail (omschrijving + gekoppelde gebruikers/waardelijsten) of a gebruikersgroep by naam, read over the odpc API. */
  detail: (naam: string) => Promise<UsergroupDetail>
}

/** Seeds an authorised profiel (gebruikersgroep) for the eindgebruiker publicatie flows. */
export interface AuthProfileSeeder {
  /**
   * Create an authorised gebruikersgroep the signed-in admin belongs to (member +
   * one organisatie + one informatiecategorie). Returns the group uuid (the
   * "Profiel" <option> value) and naam (to open it through the gebruikersgroepen
   * UI) plus the organisatie + informatiecategorie uuids — the publicatie form's
   * inputs all carry those uuids as their `value`, so the create flow selects
   * them deterministically.
   *
   * `choices` authorises that many organisaties + informatiecategorieën instead
   * of one. With a single authorised value the form pre-selects it, so a
   * scenario that needs the required-field validation to fire must seed at
   * least two of each; the returned uuids are always the first of each.
   */
  seed: (opts?: { onderwerpTitels?: string[], choices?: number }) => Promise<{ profielUuid: string, naam: string, organisatieUuid: string, informatiecategorieUuid: string }>
}

export interface GppAppFixtures {
  /** Test-owned gpp-app gebruikersgroepen (verified + cleaned up via the odpc API). */
  usergroups: UsergroupManager
  /**
   * Seeds an authorised gebruikersgroep ("profiel") that the signed-in admin is a
   * member of, authorised for one organisatie + one informatiecategorie. This is
   * the prerequisite that lets the gpp-app "Nieuwe publicatie" form render (TS6/7):
   * without an authorised group `/api/mijn-gebruikersgroepen` is empty and the
   * form errors. Seeded over the odpc API (the group *UI* is what TS5 tests);
   * cleaned up in teardown. The org it creates is owned by the `organisations`
   * fixture. Returns the group naam to select as the profiel.
   */
  authProfile: AuthProfileSeeder
}

export const gppAppTest = publicatiebankTest.extend<GppAppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  usergroups: async ({}, use, testInfo) => {
    // Session-authenticated odpc API client (gpp-app cookies live in adminState).
    const ctx = await apiRequest.newContext({ storageState: adminState })
    const { manager, teardown } = makeResourceManager({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E groep ',
      emptyMessage: 'No gebruikersgroep created/tracked in this scenario',
      // Groups are created through the gpp-app UI (plain Playwright), verified +
      // cleaned up over the odpc API.
      remove: naam => deleteUsergroupByName(ctx, naam),
      exists: naam => usergroupExists(ctx, naam),
    })
    try {
      await use({ ...manager, detail: naam => getUsergroupDetail(ctx, naam) })
    }
    finally {
      await teardown()
      await ctx.dispose()
    }
  },
  authProfile: async ({ organisations }, use, testInfo) => {
    // Session-authenticated odpc API context (gpp-app cookies live in adminState).
    const ctx = await apiRequest.newContext({ storageState: adminState })
    const createdUuids: string[] = []
    try {
      await use({
        async seed({ onderwerpTitels = [], choices = 1 } = {}) {
          // Match membership on the caller's real identity claim, read from odpc.
          const gebruikerId = await currentUserId(ctx)
          // Owned + cleaned up by the organisations fixture; must be actief to appear.
          const orgUuids: string[] = []
          for (let i = 0; i < choices; i++)
            orgUuids.push(await resolveOrganisatieUuid(ctx, await organisations.add()))
          const orgUuid = orgUuids[0]
          const cats = await informatiecategorieen(ctx, choices)
          const cat = cats[0]
          // The publicatie form only offers onderwerpen the profiel is
          // authorised for, so a scenario that links one must have it in the
          // group's waardelijsten — its "Onderwerp" section is absent otherwise.
          const onderwerpUuids = await Promise.all(onderwerpTitels.map(titel => resolveOnderwerpUuid(ctx, titel)))
          const naam = `E2E profiel ${testInfo.workerIndex}-${createdUuids.length}-${Date.now()}`
          const uuid = await createAuthorisedGroup(ctx, { naam, gebruikerId, waardelijstUuids: [...orgUuids, ...cats.map(c => c.uuid), ...onderwerpUuids] })
          createdUuids.push(uuid)
          return { profielUuid: uuid, naam, organisatieUuid: orgUuid, informatiecategorieUuid: cat.uuid }
        },
      })
    }
    finally {
      // Own-and-cleanup; the run-wide `E2E ` sweep in global-teardown backs this up.
      for (const uuid of [...createdUuids].reverse())
        await ctx.delete(new URL(`/api/gebruikersgroepen/${uuid}`, ENV.apps.gppApp).href).catch(() => {})
      await ctx.dispose()
    }
  },
})
