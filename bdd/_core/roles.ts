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
 * own storage state. The `@beheer` scenarios run their `page` on it; the config
 * snapshot/restore APIRequestContext uses it too. Produced by
 * `setup/auth.setup.ts` piggybacking the admin SSO session (no extra TOTP).
 */
export const burgerportaalAdminState = '.auth/burgerportaal-admin.json'

/**
 * Scenario tag → session, first match wins (so `@admin @beheer` resolves to the
 * admin session). The `@ai` row is the fallback for a future Stagehand scenario
 * that carries no other role tag: its AI browser adopts the Playwright context
 * over CDP, so it needs a session the admin + gpp-app both accept.
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
