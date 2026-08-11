/**
 * Own-and-restore guard for shared server-side singleton state (e.g. the
 * burgerportaal beheer config): snapshot before the scenario touches it,
 * best-effort restore afterwards, so every value goes back exactly as it was
 * found — safe against shared/production environments. Captures the pattern
 * once, the way `resource-manager.ts` does for created rows.
 *
 * Contract for every guarded surface: the server holds ONE copy of the state,
 * so scenarios that mutate it must not run concurrently with scenarios that
 * read it — tag them `@mode:serial`, and keep AI mutations chromium-only (see
 * the `grepInvert` in playwright.config.ts).
 */
export interface SingletonGuard<S> {
  /** Capture the full current state so it can be restored in teardown. */
  snapshot: () => Promise<S>
  /** Put a previously captured snapshot back. */
  restore: (snapshot: S) => Promise<void>
}

/** Run `body` with the singleton snapshotted; restore (best-effort) afterwards. */
export async function withSingletonGuard<S>(guard: SingletonGuard<S>, body: () => Promise<void>): Promise<void> {
  const snapshot = await guard.snapshot()
  try {
    await body()
  }
  finally {
    await guard.restore(snapshot).catch(() => {})
  }
}
