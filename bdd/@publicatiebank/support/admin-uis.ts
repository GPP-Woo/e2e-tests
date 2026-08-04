import type { AdminDriverConfig } from './admin-driver'
import { ENV } from '@/bdd/_core/types'

/**
 * Django-admin driver configs — one per publicatiebank noun the @admin
 * scenarios mutate. Kept here (not in the step files) so the
 * `topicAdmin` / `pubAdmin` fixtures in `_core/fixture.ts` are the single place
 * a step receives a ready-built {@link AdminDriver}, instead of every step
 * re-deriving the changelist URL and re-constructing the driver.
 */
const pub = ENV.apps.publicatiebank.replace(/\/$/, '')

export const TOPIC_ADMIN: AdminDriverConfig = {
  noun: 'onderwerp',
  changelist: `${pub}/admin/publications/topic/`,
  add: `${pub}/admin/publications/topic/add/`,
}

export const PUBLICATION_ADMIN: AdminDriverConfig = {
  noun: 'publicatie',
  changelist: `${pub}/admin/publications/publication/`,
  rowLink: 'titel link',
}

export const DOCUMENT_ADMIN: AdminDriverConfig = {
  noun: 'document',
  changelist: `${pub}/admin/publications/document/`,
  rowLink: 'officiële titel link',
}
