import type { AdminDriverConfig } from './admin-driver'
import { resource as documentResource } from './document'
import { resource as publicationResource } from './publication'
import { resource as topicResource } from './topic'

/**
 * Django-admin driver configs — one per publicatiebank noun the @admin
 * scenarios mutate. Kept here (not in the step files) so the
 * `topicAdmin` / `pubAdmin` / `docAdmin` fixtures in `fixtures.ts` are the single
 * place a step receives a ready-built {@link AdminDriver}. Each reuses the
 * {@link AdminResource} its support module already defines, so the changelist
 * selectors have exactly one home.
 */

export const TOPIC_ADMIN: AdminDriverConfig = { noun: 'onderwerp', resource: topicResource }
export const PUBLICATION_ADMIN: AdminDriverConfig = { noun: 'publicatie', resource: publicationResource }
export const DOCUMENT_ADMIN: AdminDriverConfig = { noun: 'document', resource: documentResource }
