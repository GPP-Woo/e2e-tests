import process from 'node:process'
import { CustomOpenAIClient, Stagehand } from '@browserbasehq/stagehand'
import OpenAI from 'openai'

/**
 * Stagehand is Browserbase's AI browser-automation layer on top of Playwright:
 * `act()`/`extract()`/`observe()` drive the page from natural-language intent
 * via an LLM. We point it at OpenRouter (an OpenAI-compatible gateway) so a
 * single key reaches many providers, and let each scenario pick a model by tag.
 *
 * OpenRouter is OpenAI-wire-compatible, so we use Stagehand's `CustomOpenAIClient`
 * with `baseURL` swapped — this side-steps the ai-sdk major-version drift
 * between Stagehand's `AISdkClient` (LanguageModelV2) and the newer provider
 * packages.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** Strip a leading/trailing ```json … ``` markdown fence, if present. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```'))
    return text
  return trimmed
    .replace(/^```[a-z]*[ \t]*\n?/i, '') // opening fence (+ optional language)
    .replace(/\n?```$/, '') // closing fence
    .trim()
}

/**
 * Build the fetch OpenRouter is called through. It does two jobs:
 *
 * 1. REQUEST rewrite — Stagehand's `CustomOpenAIClient` was constructed with a
 *    single fixed model, but we route each operation (plan/act/verify) to its
 *    own model. `modelFor()` returns the model for whichever role is active
 *    right now (set by the method wrappers in {@link createStagehand}), and we
 *    overwrite the outgoing request's `model` field with it.
 * 2. RESPONSE unwrap — Stagehand's act()/extract() ask the model for strict
 *    JSON and then `JSON.parse` the message content. Some models reachable
 *    through OpenRouter (notably Anthropic Claude) ignore
 *    `response_format: json_object` and wrap their JSON in a ```json code
 *    fence, which breaks the parse. We strip any such fence so every model —
 *    cheap or expensive, OpenAI/Google/Anthropic — yields parseable JSON. It
 *    is a no-op for models that already answer cleanly.
 */
export function makeOpenRouterFetch(modelFor: () => string) {
  return async function openRouterFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // (1) Rewrite the request's model to the active role's model. Chat requests
    // arrive as a JSON string body carrying a `model` field; leave anything else
    // untouched (it then falls back to the client's constructor model).
    if (init && typeof init.body === 'string') {
      try {
        const reqJson = JSON.parse(init.body)
        if (reqJson && typeof reqJson === 'object' && 'model' in reqJson) {
          reqJson.model = modelFor()
          const headers = new Headers(init.headers)
          headers.delete('content-length') // body length changes; let fetch recompute
          init = { ...init, body: JSON.stringify(reqJson), headers }
        }
      }
      catch {
        // Non-JSON body — pass through unchanged.
      }
    }

    const response = await fetch(input, init)
    if (!(response.headers.get('content-type') ?? '').includes('application/json'))
      return response

    const text = await response.text()
    let body = text
    try {
      const json = JSON.parse(text)
      let changed = false
      for (const choice of json.choices ?? []) {
        const content = choice?.message?.content
        if (typeof content === 'string') {
          const stripped = stripCodeFence(content)
          if (stripped !== content) {
            choice.message.content = stripped
            changed = true
          }
        }
      }
      if (changed)
        body = JSON.stringify(json)
    }
    catch {
      // Not JSON we can post-process (e.g. a streamed/error body) — pass through.
    }

    // Rebuild without the original Content-Length (the body may have shrunk).
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }
}

/**
 * The three roles a browser-automation run splits into, mapped onto Stagehand's
 * primitives:
 *
 *   planner       -> observe()  — "what can I do on this page?" (0 uses today)
 *   worker        -> act()      — click/fill/select a single instruction (~all traffic)
 *   verification  -> extract()  — read page state back to assert against
 *
 * Each role picks a model per {@link Tier}. Worker is where ~98% of the tokens
 * (and cost) go, so its cheap/default tiers use the small Gemini models; only
 * genuinely flaky or critical scenarios pay for `expensive`. Planner is unused
 * until this suite adopts `stagehand.agent()`/`observe()`; its row is kept so
 * that routing is ready the day it is.
 *
 * See README "AI model routing" for which tag to reach for.
 */
export type Role = 'planner' | 'worker' | 'verification'
export type Tier = 'cheap' | 'default' | 'expensive'

export const ROLE_MODELS: Record<Role, Record<Tier, string>> = {
  planner: {
    cheap: 'deepseek/deepseek-chat',
    default: 'deepseek/deepseek-chat',
    expensive: 'anthropic/claude-sonnet-4.5',
  },
  worker: {
    cheap: 'google/gemini-2.5-flash-lite',
    default: 'openai/gpt-4o-mini',
    expensive: 'anthropic/claude-sonnet-4.5',
  },
  verification: {
    cheap: 'google/gemini-2.5-flash-lite',
    default: 'openai/gpt-4o-mini',
    expensive: 'anthropic/claude-sonnet-4.5',
  },
}

/** Tier for a scenario's tags: `@expensive-ai` > `@cheap-ai` > default. */
export function tierForTags(tags: string[]): Tier {
  if (tags.includes('@expensive-ai'))
    return 'expensive'
  if (tags.includes('@cheap-ai'))
    return 'cheap'
  return 'default'
}

/** Prefix of the per-scenario model-override tag, e.g. `@model:openai/gpt-4.1`. */
const MODEL_TAG_PREFIX = '@model:'

/**
 * Explicit model a scenario pins itself to via a `@model:<openrouter-id>` tag
 * (e.g. `@model:openai/gpt-4.1`), or undefined. This overrides tier + role
 * routing for every operation in the scenario. For a single step instead of a
 * whole scenario, use `stagehand.withModel()`.
 */
export function overrideModelForTags(tags: string[]): string | undefined {
  const tag = tags.find(t => t.startsWith(MODEL_TAG_PREFIX))
  return tag ? tag.slice(MODEL_TAG_PREFIX.length) || undefined : undefined
}

/** True when an OpenRouter key is configured (else @beheer scenarios skip). */
export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

/**
 * CDP HTTP endpoint of the Playwright-launched Chromium for a given worker.
 * The chromium project launches with `--remote-debugging-port=<this>` (see
 * playwright.config.ts) and the Stagehand fixtures attach to the same port, so
 * Stagehand drives the SAME browser/page Playwright traces — one unified trace
 * per scenario. Keyed on the worker's parallel index so concurrent workers get
 * distinct ports.
 */
export function cdpEndpointForWorker(parallelIndex: number): string {
  return `http://127.0.0.1:${9330 + parallelIndex}`
}

export interface StagehandOptions {
  /** Cost tier — usually `tierForTags($tags)`. Ignored when `overrideModel` is set. */
  tier: Tier
  /** Whole-scenario model override — usually `overrideModelForTags($tags)`. */
  overrideModel?: string
  /**
   * CDP endpoint of the Playwright-launched Chromium to attach to. Stagehand
   * adopts that browser's existing page instead of launching its own, so the
   * session (storageState) and trace both come from the Playwright context.
   */
  cdpUrl: string
}

/**
 * `withModel` is attached to every Stagehand instance by {@link createStagehand}.
 * Augment Stagehand's own type (rather than a subtype) so `stagehand.withModel`
 * is visible everywhere without a wrapper interface — a subtype would re-trigger
 * TS's "excessively deep" guard on Stagehand's heavily-overloaded `extract()`.
 *
 *   await stagehand.withModel('anthropic/claude-sonnet-4.5', () =>
 *     stagehand.act('the one flaky action'))
 */
declare module '@browserbasehq/stagehand' {
  interface Stagehand {
    withModel: <T>(model: string, fn: () => T | Promise<T>) => Promise<T>
  }
}

/**
 * Build and initialise a LOCAL Stagehand that routes each operation to its
 * role's model (see {@link ROLE_MODELS}).
 *
 * Model resolution per request, highest precedence first:
 *   1. `withModel()` step override   — `active.override`
 *   2. `@model:<id>` scenario tag     — `opts.overrideModel` (seeds `active.override`)
 *   3. role × tier default            — `ROLE_MODELS[role][tier]`
 *
 * Stagehand takes a single `llmClient`, so we make the model per-request rather
 * than per-client: a mutable `active.role` is flipped by thin wrappers around
 * `act`/`extract`/`observe`, and {@link makeOpenRouterFetch} rewrites each
 * outgoing request's `model` to `modelFor(active.role)`.
 *
 * Stagehand attaches to the Playwright-launched Chromium over CDP
 * (`opts.cdpUrl`) instead of launching its own browser: it adopts that
 * browser's existing page, so the authenticated session (the Playwright
 * context's `storageState`) and the Keycloak host-resolver arg already apply,
 * and Playwright's own tracing captures the AI actions — one unified trace per
 * scenario, no cookie injection needed.
 */
export async function createStagehand(opts: StagehandOptions): Promise<Stagehand> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey)
    throw new Error('OPENROUTER_API_KEY is not set (required for the @beheer Stagehand scenarios)')

  // Role starts at `worker`: act() is ~all traffic, and any LLM call Stagehand
  // makes outside a wrapped method (init, self-heal) is worker-ish anyway.
  // `override` is seeded by the scenario's `@model:` tag and swapped by withModel().
  const active: { role: Role, override?: string } = { role: 'worker', override: opts.overrideModel }
  const modelFor = (role: Role) => active.override ?? ROLE_MODELS[role][opts.tier]

  const llmClient = new CustomOpenAIClient({
    modelName: modelFor('worker'), // fallback only; the fetch rewrites per role
    client: new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      fetch: makeOpenRouterFetch(() => modelFor(active.role)),
    }),
  })

  // Resolve the CDP HTTP endpoint to the browser WebSocket URL Stagehand
  // connects to (Stagehand treats cdpUrl as a raw ws target, so the http base
  // alone 404s the handshake). /json/version is served by the chromium project's
  // --remote-debugging-port (see playwright.config.ts).
  const wsUrl = await fetch(`${opts.cdpUrl}/json/version`)
    .then(r => r.json() as Promise<{ webSocketDebuggerUrl: string }>)
    .then(v => v.webSocketDebuggerUrl)
    .catch((cause) => {
      throw new Error(`Could not reach Chromium CDP at ${opts.cdpUrl} (is the chromium project's --remote-debugging-port up?)`, { cause })
    })

  const stagehand = new Stagehand({
    env: 'LOCAL',
    llmClient,
    verbose: 0,
    // Attach to the Playwright-launched Chromium over CDP instead of launching
    // our own browser: Stagehand adopts that browser's existing page, so it
    // drives the SAME target Playwright authenticated (storageState) and traces.
    localBrowserLaunchOptions: {
      cdpUrl: wsUrl,
    },
  })
  await stagehand.init()

  // Route each primitive to its role by flipping `active.role` before delegating.
  // Instance properties shadow the prototype methods, so every `stagehand.act(…)`
  // call site (including captured references) picks this up.
  const withRole = <A extends unknown[], R>(role: Role, fn: (...a: A) => R) => (...a: A): R => {
    active.role = role
    return fn(...a)
  }
  const sh = stagehand as unknown as Record<string, unknown>
  sh.act = withRole('worker', stagehand.act.bind(stagehand))
  sh.extract = withRole('verification', stagehand.extract.bind(stagehand))
  sh.observe = withRole('planner', stagehand.observe.bind(stagehand))

  // Step-level override: force `model` for the calls inside `fn`, then restore.
  sh.withModel = async <T>(model: string, fn: () => T | Promise<T>): Promise<T> => {
    const prev = active.override
    active.override = model
    try {
      return await fn()
    }
    finally {
      active.override = prev
    }
  }

  return stagehand
}

/**
 * The single understudy page Stagehand drives over CDP. It supports
 * `.goto()`/`.locator()`/`.setInputFiles()`/`.waitForLoadState()` but NOT
 * `getByRole` — use the ordinary session `page` fixture for that. Its type comes
 * from Stagehand's bundled playwright-core, distinct from `@playwright/test`'s
 * `Page`, so it is inferred rather than annotated. Shared by every vertical that
 * drives an AI browser (publicatiebank admin, gpp-app, burgerportaal beheer).
 */
export function stagehandPage(stagehand: Stagehand) {
  return stagehand.context.pages()[0]
}

/** The CDP page type Stagehand drives (see {@link stagehandPage}). */
export type StagehandPage = ReturnType<typeof stagehandPage>

/** Wait for the network to go idle, swallowing the timeout (best-effort settle). */
export function settle(page: StagehandPage): Promise<void> {
  return page.waitForLoadState('networkidle').then(() => {}).catch(() => {})
}
