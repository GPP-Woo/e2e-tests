import { Before, test } from './fixture'

/**
 * `@blocked` — step bodies exist, but a portable prerequisite is missing on this
 * stack (e.g. DiWoo sitemap 23h output cache, landelijke publisher for sitemap
 * inclusion, woo-search ES down so `/api/zoeken` 500s, ODPC session document
 * mutations failing). Skipped-with-reason at run time so the run never fakes a
 * pass. Prefer a scenario-level reason comment in the `.feature` file; this
 * Before hook message is the fallback when the tag is used alone. Remove the
 * tag once the environment can satisfy the scenario deterministically.
 */
Before({ tags: '@blocked' }, async () => {
  test.skip(true, 'BLOCKED: environment prerequisite missing — see scenario comment (@blocked)')
})
