import { Before, Given, test, Then, When } from '../_core/fixture'

/**
 * Testscripts 6 & 7 (eindgebruiker publicatie flows) are parked: no available
 * account is a member of an authorised gebruikersgroep, so the gpp-app "Nieuwe
 * publicatie" form errors and renders nothing to drive (see publicaties.feature
 * and PLAN-plateau4-remaining.md). The @blocked scenario is skipped-with-reason
 * so it stays visible; these step bodies exist only so bddgen can resolve it and
 * never run. Implement them once a test account has authorised-group membership.
 */

const BLOCKED = 'TS6/TS7 blocked: signed-in user is not a member of an authorised gebruikersgroep (see publicaties.feature)'

Before({ tags: '@blocked' }, async () => {
  test.skip(true, BLOCKED)
})

Given('the signed-in user belongs to an authorised gebruikersgroep', async () => {
  throw new Error(BLOCKED)
})

Given('a published publicatie owned by the signed-in user', async () => {
  throw new Error(BLOCKED)
})

When('I create and publish a publicatie through the gpp-app', async () => {
  throw new Error(BLOCKED)
})

When('I withdraw the publicatie through the gpp-app', async () => {
  throw new Error(BLOCKED)
})

Then('the publicatie is public on the burgerportaal', async () => {
  throw new Error(BLOCKED)
})

Then('the publicatie is no longer public', async () => {
  throw new Error(BLOCKED)
})
