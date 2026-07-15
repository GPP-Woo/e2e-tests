import type { ConfigSnapshot } from '@/bdd/@burgerportaal/support/beheer-config'
import type { AdminDriver } from '@/bdd/@publicatiebank/support/admin-driver'
import type { Stagehand } from '@browserbasehq/stagehand'
import type { AppName, User } from './types'
import { BeheerConfigClient } from '@/bdd/@burgerportaal/support/beheer-config'
import { createAuthorisedGroup, currentUserId, deleteUsergroupByName, firstInformatiecategorie, resolveOrganisatieUuid, usergroupExists } from '@/bdd/@gpp-app/support/usergroup'
import { adminDriver } from '@/bdd/@publicatiebank/support/admin-driver'
import { DOCUMENT_ADMIN, ORGANISATION_ADMIN, PUBLICATION_ADMIN, TOPIC_ADMIN } from '@/bdd/@publicatiebank/support/admin-uis'
import { deleteDocumentByTitel } from '@/bdd/@publicatiebank/support/document'
import { addSelfAddedCategory, deleteCategoryByName } from '@/bdd/@publicatiebank/support/information-category'
import { OdrcClient } from '@/bdd/@publicatiebank/support/odrc'
import { addSelfAddedOrganisation, deleteOrganisationByName } from '@/bdd/@publicatiebank/support/organisation'
import { addConceptPublication, deletePublicationByTitel } from '@/bdd/@publicatiebank/support/publication'
import { addTopic, deleteTopicByName } from '@/bdd/@publicatiebank/support/topic'
import { signIn as performSignIn } from '@/bdd/_core/signIn'
import { createStagehand, overrideModelForTags, tierForTags } from '@/bdd/_core/stagehand'
import { adminState, burgerportaalAdminState, regularState } from '@/setup/paths'
import { request as apiRequest } from '@playwright/test'
import { test as base, createBdd } from 'playwright-bdd'
import { makeResourceManager } from './resource-manager'
import { DEFAULT_USER, ENV } from './types'

/** Mutable holder so hooks and steps can agree on who logs in. */
export interface CurrentUser {
  value?: User
}

/**
 * Owns the self-added information categories a scenario creates. Every category
 * added through this manager is deleted again during fixture teardown, so
 * scenarios leave no data behind.
 */
export interface CategoryManager {
  /** Create a uniquely-named self-added category; returns its name. */
  add: (naam?: string) => Promise<string>
  /** Name of the most recently added category (throws if none). */
  last: () => string
}

/**
 * Owns the self-added organisaties a scenario creates. Every organisatie added
 * through this manager is deleted again during teardown (via the admin), so
 * scenarios leave no data behind. Mirrors {@link CategoryManager}.
 */
export interface OrganisationManager {
  /**
   * Deterministically create a self-added organisatie (a fast prerequisite for
   * scenarios that manipulate an existing one — not the create action under
   * test); returns its name.
   */
  add: (naam?: string, opts?: { actief?: boolean }) => Promise<string>
  /**
   * Register a name created some other way (e.g. through Stagehand in the
   * scenario under test) so teardown deletes it too. Returns the name.
   */
  track: (naam: string) => string
  /** A fresh unique `E2E …` name, without creating anything. */
  freshName: () => string
  /** Name of the most recently added/tracked organisatie (throws if none). */
  last: () => string
}

/**
 * Owns the onderwerpen (topics) a scenario creates; deleted again in teardown.
 * Mirrors {@link CategoryManager}.
 */
export interface TopicManager {
  /** Deterministically create an onderwerp (prerequisite); returns its titel. */
  add: (titel?: string, opts?: { status?: string, promoot?: boolean, omschrijving?: string }) => Promise<string>
  /** Register a titel created some other way so teardown deletes it. */
  track: (titel: string) => string
  /** A fresh unique `E2E …` titel, without creating anything. */
  freshName: () => string
  /** Officiële titel of the most recently added/tracked onderwerp (throws if none). */
  last: () => string
}

/**
 * Owns the publicaties a scenario creates. Both create and cleanup run through
 * the Django admin (session auth): the token API is unusable while Stagehand
 * drives the admin on the same server. A titel created some other way (e.g. by a
 * Stagehand mutation, or a rename) can be tracked so cleanup deletes it too.
 */
export interface PublicationManager {
  /**
   * Seed a `concept` publicatie through the admin (session auth — the token API
   * is unusable while Stagehand drives the admin); returns its titel.
   */
  seed: (titel?: string) => Promise<string>
  /** Register a titel created some other way so cleanup deletes it. */
  track: (titel: string) => string
  /** A fresh unique `E2E …` titel, without creating anything. */
  freshName: () => string
  /** Titel of the most recently seeded/tracked publicatie (throws if none). */
  last: () => string
}

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

/**
 * Owns the documents a scenario seeds (through the token API) for the document
 * beheer scenarios (TS8). Only tracks + cleans up (via the admin) — creation is
 * bespoke (needs a publisher org + file upload), so it is done in the step with
 * {@link seedPublishedDocument}. Mirrors {@link PublicationManager}.
 */
export interface DocumentManager {
  /** Register an officiële titel seeded through the token API so cleanup deletes it. */
  track: (titel: string) => string
  /** A fresh unique `E2E …` titel, without creating anything. */
  freshName: () => string
  /** Officiële titel of the most recently tracked document (throws if none). */
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

/** One GET against the burgerportaal (status + content type + raw body). */
export interface SitemapResponse {
  path: string
  status: number
  contentType: string
  body: string
}

/**
 * Anonymous HTTP client for the public GPP-burgerportaal sitemap. Uses
 * Playwright's `request` context (no browser, no auth — the Woo-index harvester
 * reads the sitemap signed-out) and remembers the last response so a `When I
 * fetch ...` step and its `Then ...` assertions can share it.
 */
export interface SitemapClient {
  /** GET `path` on the burgerportaal, store and return the response. */
  get: (path: string) => Promise<SitemapResponse>
  /** The most recently fetched response (throws if nothing fetched yet). */
  last: () => SitemapResponse
}

/** Scenario-scoped scratch space shared between a mutating step and its assertion. */
export interface BeheerState {
  /** Expected config values keyed by field (e.g. the unique welcome text set). */
  expected: Map<string, string>
  /** Public image bytes (hex sha) captured before a replacement, keyed by kind. */
  imageBefore: Map<string, string>
}

interface BddFixtures {
  /** Selected identity for a live sign-in; set by the auth hooks (see hooks.ts). */
  currentUser: CurrentUser
  /** Navigate to `app` and sign in live as `currentUser` (falls back to DEFAULT_USER). */
  signIn: (app: AppName) => Promise<void>
  /** Test-owned self-added information categories (created + cleaned up). */
  categories: CategoryManager
  /** Test-owned self-added organisaties (created + cleaned up via the admin). */
  organisations: OrganisationManager
  /** Test-owned onderwerpen/topics (created + cleaned up via the admin). */
  topics: TopicManager
  /** Token-authenticated GPP-publicatiebank (ODRC) API client for read verification (TS6-9). */
  odrc: OdrcClient
  /** Test-owned publicaties (seeded + cleaned up via the admin). */
  publications: PublicationManager
  /** Test-owned documents (seeded via the token API, cleaned up via the admin). */
  documents: DocumentManager
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
  /** Anonymous HTTP client for the public burgerportaal sitemap. */
  sitemap: SitemapClient
  /**
   * AI browser (Stagehand + OpenRouter) for the @beheer scenarios. Runs its own
   * Chromium with the beheer-admin session injected; the model is chosen from
   * the scenario tags. Closed automatically in teardown.
   */
  stagehand: Stagehand
  /**
   * AI browser (Stagehand + OpenRouter) with the publicatiebank Django-admin
   * session injected, for the @admin metadata scenarios that mutate the admin UI
   * from natural language. Model chosen from the scenario tags; closed in teardown.
   */
  adminStagehand: Stagehand
  /**
   * Django-admin CRUD driver for organisaties, bound to `adminStagehand`.
   * Steps receive it ready-built (`async ({ orgAdmin }) => …`) instead of
   * reconstructing the driver each step. See {@link AdminDriver}.
   */
  orgAdmin: AdminDriver
  /** Django-admin CRUD driver for onderwerpen, bound to `adminStagehand`. */
  topicAdmin: AdminDriver
  /** Django-admin CRUD driver for publicaties, bound to `adminStagehand`. */
  pubAdmin: AdminDriver
  /** Django-admin CRUD driver for documenten, bound to `adminStagehand`. */
  docAdmin: AdminDriver
  /**
   * Authenticated burgerportaal beheer config client. Snapshots the config on
   * setup and restores it in teardown, so a scenario owns (and cleans up) every
   * change it makes — safe against shared/production environments.
   */
  beheer: BeheerConfigClient
  /** Scenario-scoped scratch space for the @beheer steps. */
  beheerState: BeheerState
  /** Generic scenario-scoped key/value scratch shared between a step and its assertion. */
  scratch: Map<string, string>
}

export const test = base.extend<BddFixtures>({
  /**
   * Auth-by-tag: reuse a pre-authenticated session based on the scenario tags.
   * `@admin` / `@regular` load the storage state produced by the `setup`
   * project; anything else starts signed-out (e.g. the login-flow feature,
   * which signs in live via a step).
   */
  storageState: async ({ $tags }, use) => {
    if ($tags.includes('@admin'))
      await use(adminState)
    else if ($tags.includes('@regular'))
      await use(regularState)
    else
      await use(undefined)
  },

  // Playwright requires the first arg to be a destructuring pattern; this
  // fixture depends on no others.
  // eslint-disable-next-line no-empty-pattern
  currentUser: async ({}, use) => {
    await use({})
  },
  signIn: async ({ page, currentUser }, use) => {
    await use(async (app: AppName) => {
      const user = currentUser.value ?? ENV.users[DEFAULT_USER]
      await performSignIn(page, app, user)
    })
  },
  categories: async ({ page }, use, testInfo) => {
    const { manager, teardown } = makeResourceManager({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E ',
      emptyMessage: 'No self-added information category created in this scenario',
      create: name => addSelfAddedCategory(page, name),
      remove: name => deleteCategoryByName(page, name),
    })
    await use(manager)
    await teardown()
  },
  organisations: async ({ page }, use, testInfo) => {
    const { manager, teardown } = makeResourceManager<{ actief?: boolean }>({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E ',
      emptyMessage: 'No self-added organisatie created in this scenario',
      create: (name, opts) => addSelfAddedOrganisation(page, name, opts),
      // Deterministic (admin selectors), regardless of how the row was created —
      // the organisatie API has no DELETE.
      remove: name => deleteOrganisationByName(page, name),
    })
    await use(manager)
    await teardown()
  },
  topics: async ({ page }, use, testInfo) => {
    const { manager, teardown } = makeResourceManager<{ status?: string, promoot?: boolean, omschrijving?: string }>({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E ',
      emptyMessage: 'No onderwerp created in this scenario',
      create: (name, opts) => addTopic(page, name, opts),
      remove: name => deleteTopicByName(page, name),
    })
    await use(manager)
    await teardown()
  },
  // Token-authenticated ODRC API client. Each call runs in its own throwaway,
  // cookieless request context (token + audit headers), so it needs no
  // fixture-managed context of its own.
  // eslint-disable-next-line no-empty-pattern
  odrc: async ({}, use) => {
    await use(new OdrcClient())
  },
  publications: async ({ page }, use, testInfo) => {
    // Seed + teardown via the admin (session auth), deterministic regardless of how
    // the row was created; the run-wide sweep in global-teardown catches leftovers.
    const { manager, teardown } = makeResourceManager({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E pub ',
      emptyMessage: 'No publicatie seeded/tracked in this scenario',
      create: name => addConceptPublication(page, name),
      remove: name => deletePublicationByTitel(page, name),
    })
    await use(manager)
    await teardown()
  },
  documents: async ({ page }, use, testInfo) => {
    // Seeded through the token API (see seedPublishedDocument); tracked here and
    // deleted through the admin in teardown (session auth), like publicaties.
    const { manager, teardown } = makeResourceManager({
      workerIndex: testInfo.workerIndex,
      prefix: 'E2E doc ',
      emptyMessage: 'No document seeded/tracked in this scenario',
      remove: name => deleteDocumentByTitel(page, name),
    })
    await use(manager)
    await teardown()
  },
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
  sitemap: async ({ request }, use) => {
    const base = ENV.apps.burgerportaal.replace(/\/$/, '')
    let latest: SitemapResponse | undefined
    await use({
      async get(path) {
        const response = await request.get(base + path)
        latest = {
          path,
          status: response.status(),
          contentType: response.headers()['content-type'] ?? '',
          body: await response.text(),
        }
        return latest
      },
      last() {
        if (!latest)
          throw new Error('No sitemap resource fetched yet in this scenario')
        return latest
      },
    })
  },
  stagehand: async ({ $tags }, use) => {
    const stagehand = await createStagehand({
      tier: tierForTags($tags),
      overrideModel: overrideModelForTags($tags),
      storageStatePath: burgerportaalAdminState,
    })
    await use(stagehand)
    await stagehand.close()
  },
  adminStagehand: async ({ $tags }, use) => {
    const stagehand = await createStagehand({
      tier: tierForTags($tags),
      overrideModel: overrideModelForTags($tags),
      storageStatePath: adminState,
    })
    await use(stagehand)
    await stagehand.close()
  },
  // Page-object drivers bound to the shared adminStagehand browser. Lazy: only
  // the noun a scenario destructures is built, and all three share one browser
  // if a scenario needs more than one.
  orgAdmin: async ({ adminStagehand }, use) => {
    await use(adminDriver(adminStagehand, ORGANISATION_ADMIN))
  },
  topicAdmin: async ({ adminStagehand }, use) => {
    await use(adminDriver(adminStagehand, TOPIC_ADMIN))
  },
  pubAdmin: async ({ adminStagehand }, use) => {
    await use(adminDriver(adminStagehand, PUBLICATION_ADMIN))
  },
  docAdmin: async ({ adminStagehand }, use) => {
    await use(adminDriver(adminStagehand, DOCUMENT_ADMIN))
  },
  // Depends on no other fixtures; builds its own authenticated API context.
  // eslint-disable-next-line no-empty-pattern
  beheer: async ({}, use) => {
    const context = await apiRequest.newContext({ storageState: burgerportaalAdminState })
    const client = new BeheerConfigClient(context)
    let snapshot: ConfigSnapshot | undefined
    try {
      snapshot = await client.snapshot()
      await use(client)
    }
    finally {
      // Own-and-cleanup: put every value back exactly as it was found.
      if (snapshot)
        await client.restore(snapshot).catch(() => {})
      await context.dispose()
    }
  },
  // eslint-disable-next-line no-empty-pattern
  beheerState: async ({}, use) => {
    await use({ expected: new Map(), imageBefore: new Map() })
  },
  // eslint-disable-next-line no-empty-pattern
  scratch: async ({}, use) => {
    await use(new Map<string, string>())
  },
})

export const { Given, When, Then, Before, After } = createBdd(test)
