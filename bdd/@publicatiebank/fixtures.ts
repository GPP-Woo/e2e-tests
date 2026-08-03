import type { AdminDriver } from './support/admin-driver'
import { coreTest } from '@/bdd/_core/core-fixtures'
import { makeResourceManager } from '@/bdd/_core/resource-manager'
import { adminDriver } from './support/admin-driver'
import { DOCUMENT_ADMIN, ORGANISATION_ADMIN, PUBLICATION_ADMIN, TOPIC_ADMIN } from './support/admin-uis'
import { deleteDocumentByTitel } from './support/document'
import { addSelfAddedCategory, deleteCategoryByName } from './support/information-category'
import { OdrcClient } from './support/odrc'
import { addSelfAddedOrganisation, deleteOrganisationByName } from './support/organisation'
import { addOwnerGroup, deleteOwnerGroupByIdentifier, OWNER_GROUP_PREFIX } from './support/owner-group'
import { addConceptPublication, deletePublicationByTitel } from './support/publication'
import { addTopic, deleteTopicByName } from './support/topic'

/**
 * Publicatiebank-owned fixtures: the metadata resource managers (created +
 * cleaned up per scenario, backed up by the run-wide sweep in
 * setup/global-teardown.ts), the token-API ODRC client and the Django-admin
 * CRUD drivers.
 */

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
 * Owns the documents a scenario seeds (through the token API) for the document
 * beheer scenarios (TS8). Only tracks + cleans up (via the admin) — creation is
 * bespoke (needs a publisher org + file upload), so it is done in the step with
 * `seedPublishedDocument`. Mirrors {@link PublicationManager}.
 */
export interface DocumentManager {
  /** Register an officiële titel seeded through the token API so cleanup deletes it. */
  track: (titel: string) => string
  /** A fresh unique `E2E …` titel, without creating anything. */
  freshName: () => string
  /** Officiële titel of the most recently tracked document (throws if none). */
  last: () => string
}

/**
 * Owns the eigenaar-groepen (`accounts.OrganisationUnit`) a scenario creates;
 * deleted again in teardown. Addressed by *identifier* rather than naam — that is
 * the only field the admin and the publicatie autocomplete search on (see
 * `support/owner-group.ts`).
 */
export interface OwnerGroupManager {
  /** Create an eigenaar groep (prerequisite); returns its identifier. */
  add: (identifier?: string) => Promise<string>
  /** Identifier of the most recently added eigenaar groep (throws if none). */
  last: () => string
}

export interface PublicatiebankFixtures {
  /** Test-owned self-added information categories (created + cleaned up). */
  categories: CategoryManager
  /** Test-owned self-added organisaties (created + cleaned up via the admin). */
  organisations: OrganisationManager
  /** Test-owned onderwerpen/topics (created + cleaned up via the admin). */
  topics: TopicManager
  /** Test-owned eigenaar-groepen (created + cleaned up via the admin). */
  ownerGroups: OwnerGroupManager
  /** Token-authenticated GPP-publicatiebank (ODRC) API client for read verification (TS6-9). */
  odrc: OdrcClient
  /** Test-owned publicaties (seeded + cleaned up via the admin). */
  publications: PublicationManager
  /** Test-owned documents (seeded via the token API, cleaned up via the admin). */
  documents: DocumentManager
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
}

export const publicatiebankTest = coreTest.extend<PublicatiebankFixtures>({
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
  ownerGroups: async ({ page }, use, testInfo) => {
    // The prefix is a slug, not `E2E `: an OrganisationUnit is only searchable by
    // its identifier, so that is the name this manager hands out and sweeps.
    const { manager, teardown } = makeResourceManager({
      workerIndex: testInfo.workerIndex,
      prefix: OWNER_GROUP_PREFIX,
      emptyMessage: 'No eigenaar groep created in this scenario',
      create: identifier => addOwnerGroup(page, identifier),
      remove: identifier => deleteOwnerGroupByIdentifier(page, identifier),
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
  // Page-object drivers bound to the shared adminStagehand browser. Lazy: only
  // the noun a scenario destructures is built, and all four share one browser
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
})
