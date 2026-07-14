/**
 * Storage-state files produced by `setup/auth.setup.ts` and consumed by the BDD
 * `storageState` fixture (see bdd/fixture.ts). Logging in once per role and
 * reusing the session avoids re-running the Keycloak TOTP flow for every
 * scenario — which would otherwise fail, since parallel scenarios sharing one
 * account submit the same one-time code and Keycloak rejects the reuse.
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
