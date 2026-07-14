import fs from 'node:fs'
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
 * Stagehand's act()/extract() ask the model for strict JSON and then
 * `JSON.parse` the message content. Some models reachable through OpenRouter
 * (notably Anthropic Claude) ignore `response_format: json_object` and wrap
 * their JSON in a ```json code fence, which breaks the parse. This fetch
 * wrapper post-processes chat-completion responses and unwraps any such fence,
 * so every model — cheap or expensive, OpenAI/Google/Anthropic — yields
 * parseable JSON. It is a no-op for models that already answer cleanly.
 */
async function openRouterFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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

/** Default model when a scenario carries no model tag — good-enough + cheap. */
export const DEFAULT_MODEL = 'google/gemini-2.5-flash'

/**
 * Scenario tag -> OpenRouter model id. A scenario opts into a stronger (or
 * cheaper) model by adding one of these tags; the first match wins, otherwise
 * {@link DEFAULT_MODEL} is used. Add rows here to expose more models.
 */
export const MODEL_BY_TAG: Record<string, string> = {
  '@expensive-ai': 'anthropic/claude-opus-4.1',
  '@anthropic': 'anthropic/claude-sonnet-4.5',
  '@openai': 'openai/gpt-4.1',
  '@cheap-ai': 'google/gemini-2.5-flash-lite',
}

/** Resolve the OpenRouter model id for a scenario's tags. */
export function modelForTags(tags: string[]): string {
  for (const tag of Object.keys(MODEL_BY_TAG)) {
    if (tags.includes(tag))
      return MODEL_BY_TAG[tag]
  }
  return DEFAULT_MODEL
}

/** True when an OpenRouter key is configured (else @beheer scenarios skip). */
export function hasOpenRouterKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

/** Same Keycloak host mapping the main Playwright config uses (chromium only). */
const KEYCLOAK_HOST_MAP = '--host-resolver-rules=MAP keycloak.woo-search.local 127.0.0.1'

export interface StagehandOptions {
  /** OpenRouter model id — usually `modelForTags($tags)`. */
  model: string
  /** Storage-state file whose cookies get injected to restore an auth session. */
  storageStatePath?: string
}

/**
 * Build and initialise a LOCAL Stagehand driven by an OpenRouter model.
 *
 * Stagehand launches its own Chromium (separate from Playwright's `page`
 * fixture), so we (a) add the same Keycloak host-resolver arg the main config
 * uses and (b) inject the saved beheer-admin cookies after init — restoring the
 * authenticated session without re-running the OIDC + TOTP flow inside the AI
 * browser.
 */
export async function createStagehand(opts: StagehandOptions): Promise<Stagehand> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey)
    throw new Error('OPENROUTER_API_KEY is not set (required for the @beheer Stagehand scenarios)')

  const llmClient = new CustomOpenAIClient({
    modelName: opts.model,
    client: new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL, fetch: openRouterFetch }),
  })

  const stagehand = new Stagehand({
    env: 'LOCAL',
    llmClient,
    verbose: 0,
    localBrowserLaunchOptions: {
      headless: !process.env.HEADED,
      args: [KEYCLOAK_HOST_MAP],
    },
  })
  await stagehand.init()

  if (opts.storageStatePath && fs.existsSync(opts.storageStatePath)) {
    const state = JSON.parse(fs.readFileSync(opts.storageStatePath, 'utf-8'))
    if (Array.isArray(state.cookies) && state.cookies.length)
      await stagehand.context.addCookies(state.cookies)
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
