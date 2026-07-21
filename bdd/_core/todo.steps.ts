import { Before, test } from './fixture'

/**
 * `@todo` — a scenario drafted from a Plateau-4 testscript whose coverage gap was
 * identified in the audit (see `test scripts (1).xlsx`), but whose step bodies are
 * not yet implemented. Playwright-bdd has no native "pending" state, so we mirror
 * the repo's `test.skip(reason)` convention: the scenario is generated and its
 * steps are registered (bddgen stays green), but it is skipped-with-reason at run
 * time so it never fakes a pass. Remove the `@todo` tag once the step bodies land.
 */
Before({ tags: '@todo' }, async () => {
  test.skip(true, 'TODO: scenario drafted from Plateau-4 testscript; step implementation pending (@todo)')
})
