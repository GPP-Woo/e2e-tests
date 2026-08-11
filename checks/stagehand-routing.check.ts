/**
 * Self-check for the model-routing logic in bdd/_core/stagehand.ts.
 * Run: node --experimental-strip-types checks/stagehand-routing.check.ts
 *
 * Lives outside ./bdd so playwright-bdd's step loader doesn't import it (its
 * top-level await would otherwise break `bddgen`). Covers the corner-cutting
 * bits: tier + @model: tag resolution, the role×tier table, and the fetch that
 * rewrites each request's `model` (override beats role×tier).
 */
import assert from 'node:assert/strict'
import {
  cdpEndpointForWorker,
  makeOpenRouterFetch,
  overrideModelForTags,
  ROLE_MODELS,
  tierForTags,
} from '../bdd/_core/stagehand.ts'

// --- CDP endpoint (must match the --remote-debugging-port in playwright.config.ts) ---
assert.equal(cdpEndpointForWorker(0), 'http://127.0.0.1:9330')
assert.equal(cdpEndpointForWorker(3), 'http://127.0.0.1:9333')

// --- tag resolution ---------------------------------------------------------
assert.equal(tierForTags([]), 'default')
assert.equal(tierForTags(['@cheap-ai']), 'cheap')
assert.equal(tierForTags(['@expensive-ai']), 'expensive')
// @expensive-ai wins over @cheap-ai
assert.equal(tierForTags(['@cheap-ai', '@expensive-ai']), 'expensive')

// per-scenario @model:<id> override tag
assert.equal(overrideModelForTags([]), undefined)
assert.equal(overrideModelForTags(['@ai', '@expensive-ai']), undefined)
assert.equal(overrideModelForTags(['@model:openai/gpt-4.1']), 'openai/gpt-4.1')
assert.equal(overrideModelForTags(['@model:']), undefined) // empty value → ignored

// worker default is the cheap-ish OpenAI model we want ~all traffic on
// (gpt-4o-mini: reliable Stagehand action JSON, unlike gemini-2.5-flash which
// intermittently fails Stagehand's Zod schema — see README "AI model routing")
assert.equal(ROLE_MODELS.worker.default, 'openai/gpt-4o-mini')
assert.equal(ROLE_MODELS.worker.cheap, 'google/gemini-2.5-flash-lite')

// --- fetch rewrites the outgoing model; override beats role -----------------
let sent: any
const realFetch = globalThis.fetch
// @ts-expect-error stub
globalThis.fetch = async (_url: any, init: any) => {
  sent = JSON.parse(init.body)
  return new Response('{"choices":[]}', { headers: { 'content-type': 'application/json' } })
}
try {
  // Mirror createStagehand: override (withModel / @model tag) beats role×tier.
  const active: { role: 'worker' | 'verification' | 'planner', override?: string } = { role: 'worker' }
  const f = makeOpenRouterFetch(() => active.override ?? ROLE_MODELS[active.role].default)
  const body = JSON.stringify({ model: 'PLACEHOLDER', messages: [] })
  const call = () => f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body, headers: { 'content-length': String(body.length) } })

  await call()
  assert.equal(sent.model, 'openai/gpt-4o-mini', 'worker act() → worker model')

  active.role = 'verification'
  await call()
  assert.equal(sent.model, 'openai/gpt-4o-mini', 'extract() → verification model')

  active.role = 'planner'
  await call()
  assert.equal(sent.model, 'deepseek/deepseek-chat', 'observe() → planner model')

  // withModel/@model override wins regardless of role
  active.override = 'anthropic/claude-sonnet-4.5'
  active.role = 'worker'
  await call()
  assert.equal(sent.model, 'anthropic/claude-sonnet-4.5', 'override beats role×tier')
}
finally {
  globalThis.fetch = realFetch
}

console.log('stagehand.check.ts: OK')
