/**
 * Self-check for the `dependsOn` sweep ordering used by setup/global-teardown.ts.
 * Run: node --experimental-strip-types checks/teardown-order.check.ts
 *
 * Lives outside ./bdd so playwright-bdd's step loader doesn't import it.
 */
import assert from 'node:assert/strict'
import { sortByDependsOn } from '../bdd/_core/topo.ts'

const labels = (items: { label: string, dependsOn?: string[] }[]) =>
  sortByDependsOn(items).map(item => item.label)

// The real FK case: a dependency is swept first regardless of declaration order.
assert.deepEqual(
  labels([{ label: 'publicaties', dependsOn: ['documenten'] }, { label: 'documenten' }]),
  ['documenten', 'publicaties'],
)

// Independent rows keep their declaration order.
assert.deepEqual(labels([{ label: 'a' }, { label: 'b' }, { label: 'c' }]), ['a', 'b', 'c'])

// Chains resolve transitively.
assert.deepEqual(
  labels([{ label: 'c', dependsOn: ['b'] }, { label: 'b', dependsOn: ['a'] }, { label: 'a' }]),
  ['a', 'b', 'c'],
)

// Mistakes fail loudly instead of silently skipping a sweep.
assert.throws(() => sortByDependsOn([{ label: 'x', dependsOn: ['nope'] }]), /unknown label/)
assert.throws(
  () => sortByDependsOn([{ label: 'a', dependsOn: ['b'] }, { label: 'b', dependsOn: ['a'] }]),
  /cycle/,
)

console.log('teardown-order.check.ts: OK')
