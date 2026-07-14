import { Before, Given, test, Then, When } from '../../_core/fixture'

/**
 * Testscript 8 (document beheer) is parked: this stack has no Documents API
 * configured, so no document can exist to manage (see documenten.feature and
 * PLAN-plateau4-remaining.md). The @blocked scenario is skipped-with-reason so it
 * stays visible in the report; these step bodies exist only so bddgen can resolve
 * it and never run. If a Documents API is configured later, replace them with
 * real admin mutations mirroring publicaties-steps.ts.
 */

const BLOCKED = 'TS8 is blocked: no Documents API configured on this stack (see documenten.feature)'

Before({ tags: '@blocked' }, async () => {
  test.skip(true, BLOCKED)
})

Given('the Documents API is configured', async () => {
  throw new Error(BLOCKED)
})

When('I withdraw the document through the admin', async () => {
  throw new Error(BLOCKED)
})

Then('the document is no longer public', async () => {
  throw new Error(BLOCKED)
})
