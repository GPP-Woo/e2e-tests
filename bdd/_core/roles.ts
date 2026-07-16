/**
 * The role registry: every pre-authenticated session the suite knows, in one
 * table — the storage-state file it lives in and the scenario tag that selects
 * it. Consumed by `setup/auth.setup.ts` (which establishes the sessions), the
 * `storageState` fixture (which selects one per scenario) and
 * `setup/global-teardown.ts` (which reuses the admin session for the sweep).
 * Adding a role = one constant + one row here + a login in auth.setup.ts.
 *
 * Logging in once per role and reusing the session avoids re-running the
 * Keycloak TOTP flow for every scenario — which would otherwise fail, since
 * parallel scenarios sharing one account submit the same one-time code and
 * Keycloak rejects the reuse.
 */

export const adminState = '.auth/admin.json'
export const regularState = '.auth/regular.json'

/**
 * Session for the GPP-burgerportaal beheer (admin config) UI. The beheer app is
 * a separate OIDC client (`odbp`) with a cookie-based session, so it needs its
 * own storage state. The Stagehand-driven `@beheer` scenarios restore this into
 * their (separate) browser context; the config snapshot/restore APIRequestContext
 * uses it too. Produced by `setup/auth.setup.ts` piggybacking the admin SSO
 * session (no extra TOTP).
 */
export const burgerportaalAdminState = '.auth/burgerportaal-admin.json'

/**
 * Scenario tag → session, first match wins (so `@beheer @ai` resolves to the
 * beheer session, not the plain-`@ai` fallback). The Stagehand scenarios adopt
 * the Playwright context over CDP, so the selected session must match what the
 * AI browser needs: `@beheer` → the burgerportaal beheer-admin session, other
 * `@ai` (e.g. gpp-app gebruikersgroepen) → the admin session (its cookies also
 * authenticate the gpp-app).
 */
const TAG_STATES: ReadonlyArray<readonly [tag: string, state: string]> = [
  ['@admin', adminState],
  ['@regular', regularState],
  ['@beheer', burgerportaalAdminState],
  ['@ai', adminState],
]

/**
 * The storage-state file for a scenario's tags, or `undefined` to start
 * signed-out (e.g. the login-flow feature, which signs in live via a step).
 */
export function stateForTags(tags: string[]): string | undefined {
  return TAG_STATES.find(([tag]) => tags.includes(tag))?.[1]
}
