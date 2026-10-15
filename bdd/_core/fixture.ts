import { burgerportaalTest } from '@/bdd/@burgerportaal/fixtures'
import { createBdd } from 'playwright-bdd'

/**
 * Composition root for the BDD test: chains the per-app fixture modules onto
 * the app-agnostic core and derives the step-definition functions.
 *
 * Chain: core-fixtures → @publicatiebank → @gpp-app → @burgerportaal.
 * @gpp-app extends @publicatiebank because `authProfile` seeds through its
 * `organisations` fixture; @burgerportaal's position is arbitrary.
 *
 * Adding or changing a fixture: edit your app's `fixtures.ts` (or
 * `_core/core-fixtures.ts` for app-agnostic ones), not this file.
 */
export const test = burgerportaalTest

export type { CoreFixtures, CurrentUser } from './core-fixtures'

export const { Given, When, Then, Before, After } = createBdd(test)
