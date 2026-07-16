import { publicatiebankTest } from '@/bdd/@publicatiebank/fixtures'
import { makeResourceManager } from '@/bdd/_core/resource-manager'
import { adminState } from '@/bdd/_core/roles'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'
import { createAuthorisedGroup, currentUserId, deleteUsergroupByName, firstInformatiecategorie, resolveOrganisatieUuid, usergroupExists } from './support/usergroup'

/**
 * GPP-app-owned fixtures. Extends the publicatiebank test (not core) because
 * `authProfile` seeds its organisatie through the `organisations` fixture.
 */

/**
 * Owns the gpp-app gebruikersgroepen a scenario creates. Groups are mutated
 * through the gpp-app UI (Stagehand); this manager verifies + cleans up through
 * the odpc JSON API (session-authenticated).
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
}

/** Seeds an authorised profiel (gebruikersgroep) for the eindgebruiker publicatie flows. */
export interface AuthProfileSeeder {
  /**
   * Create an authorised gebruikersgroep the signed-in admin belongs to (member +
   * one organisatie + one informatiecategorie). Returns the group uuid (the
   * "Profiel" <option> value) plus the organisatie + informatiecategorie uuids —
   * the publicatie form's inputs all carry those uuids as their `value`, so the
   * create flow selects them deterministically.
   */
  seed: () => Promise<{ profielUuid: string, organisatieUuid: string, informatiecategorieUuid: string }>
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
      // Groups are created through the gpp-app UI (Stagehand), verified + cleaned
      // up over the odpc API.
      remove: naam => deleteUsergroupByName(ctx, naam),
      exists: naam => usergroupExists(ctx, naam),
    })
    try {
      await use(manager)
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
        async seed() {
          // Match membership on the caller's real identity claim, read from odpc.
          const gebruikerId = await currentUserId(ctx)
          // Owned + cleaned up by the organisations fixture; must be actief to appear.
          const orgNaam = await organisations.add()
          const orgUuid = await resolveOrganisatieUuid(ctx, orgNaam)
          const cat = await firstInformatiecategorie(ctx)
          const naam = `E2E profiel ${testInfo.workerIndex}-${createdUuids.length}-${Date.now()}`
          const uuid = await createAuthorisedGroup(ctx, { naam, gebruikerId, waardelijstUuids: [orgUuid, cat.uuid] })
          createdUuids.push(uuid)
          return { profielUuid: uuid, organisatieUuid: orgUuid, informatiecategorieUuid: cat.uuid }
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
