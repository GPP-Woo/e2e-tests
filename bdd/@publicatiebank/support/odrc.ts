import type { APIRequestContext } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'

/**
 * Token-authenticated client for the GPP-publicatiebank (ODRC / woo-publications)
 * REST API at `/api/v2`. This is the create/read/delete backend the publicatie &
 * document lifecycle scenarios (TS6–9) own their test data through, portably —
 * no container/`docker exec` access required.
 *
 * Two hard-won constraints shape the design (see README "Known server flake"):
 *
 *  - **User-less token → intermittent 500s.** The `insecure` service token
 *    authenticates as a token with no user; woo-publications'
 *    `SessionProfileMiddleware` dereferences `request.user` and 500s for as long
 *    as an admin session is active on the same server (which a Stagehand-driven
 *    run always causes). So every call can transiently 5xx; callers wrap reads
 *    in {@link waitForOdrc} (poll.ts) to ride the flake out.
 *
 *  - **No shared cookies.** Each call runs in its own throwaway, cookieless
 *    `APIRequestContext` so a stray session cookie never turns a token request
 *    into a 401 (the API is token-only).
 *
 * woo-publications also enforces audit headers on every write; they are sent on
 * all requests for simplicity.
 */

/** Thrown when ODRC returns a 5xx — the signal {@link waitForOdrc} retries on. */
export class Odrc5xxError extends Error {
  readonly odrc5xx = true
  constructor(public readonly status: number, public readonly body: string) {
    super(`ODRC responded ${status}: ${body.slice(0, 500)}`)
    this.name = 'Odrc5xxError'
  }
}

/** Whether an error is a persistent/transient ODRC 5xx (see {@link Odrc5xxError}). */
export function isOdrc5xx(err: unknown): err is Odrc5xxError {
  return typeof err === 'object' && err !== null && (err as { odrc5xx?: unknown }).odrc5xx === true
}

/** Audit-trail identity woo-publications stamps on every mutation. */
export interface OdrcAudit {
  userId?: string
  userRepresentation?: string
  remarks?: string
}

interface Page<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export class OdrcClient {
  private readonly base: string

  constructor(private readonly audit: OdrcAudit = {}) {
    // The v2 API lives under /api/v2/ on the ODRC host.
    this.base = new URL('/api/v2/', ENV.odrc.baseUrl).href
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Token ${ENV.odrc.apiKey}`,
      'Content-Type': 'application/json',
      'Audit-User-ID': this.audit.userId ?? 'e2e',
      'Audit-User-Representation': this.audit.userRepresentation ?? 'E2E test suite',
      'Audit-Remarks': this.audit.remarks ?? 'automated e2e test data',
    }
  }

  private url(pathOrUrl: string): string {
    // Absolute URLs (e.g. a pagination `next`) pass through untouched.
    return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl.replace(/^\//, ''), this.base).href
  }

  /** Run `fn` against a fresh, cookieless request context and always dispose it. */
  private async withContext<T>(fn: (ctx: APIRequestContext) => Promise<T>): Promise<T> {
    const ctx = await apiRequest.newContext()
    try {
      return await fn(ctx)
    }
    finally {
      await ctx.dispose()
    }
  }

  /** GET a single resource. Throws {@link Odrc5xxError} on a 5xx (retryable). */
  async get<T = unknown>(pathOrUrl: string): Promise<T> {
    return this.withContext(async (ctx) => {
      const res = await ctx.get(this.url(pathOrUrl), { headers: this.headers() })
      const status = res.status()
      const body = await res.text()
      if (status >= 500)
        throw new Odrc5xxError(status, body)
      if (!res.ok())
        throw new Error(`GET ${pathOrUrl} -> ${status}: ${body.slice(0, 500)}`)
      return body ? JSON.parse(body) as T : (undefined as T)
    })
  }

  /** GET all pages of a list endpoint, following `next` links. */
  async list<T = unknown>(path: string, query: Record<string, string | number | boolean> = {}): Promise<T[]> {
    const first = new URL(this.url(path))
    for (const [k, v] of Object.entries(query))
      first.searchParams.set(k, String(v))

    const items: T[] = []
    let next: string | null = first.href
    while (next) {
      const page = await this.get<Page<T>>(next)
      items.push(...(page?.results ?? []))
      next = page?.next ?? null
    }
    return items
  }

  private async send<T>(method: 'post' | 'patch' | 'put', path: string, data: unknown): Promise<T> {
    return this.withContext(async (ctx) => {
      const res = await ctx[method](this.url(path), { headers: this.headers(), data })
      const status = res.status()
      const body = await res.text()
      if (status >= 500)
        throw new Odrc5xxError(status, body)
      if (!res.ok())
        throw new Error(`${method.toUpperCase()} ${path} -> ${status}: ${body.slice(0, 500)}`)
      return body ? JSON.parse(body) as T : (undefined as T)
    })
  }

  post<T = unknown>(path: string, data: unknown): Promise<T> {
    return this.send<T>('post', path, data)
  }

  patch<T = unknown>(path: string, data: unknown): Promise<T> {
    return this.send<T>('patch', path, data)
  }

  /** DELETE a resource. No-op semantics are left to the caller (404 is surfaced). */
  async delete(pathOrUrl: string): Promise<void> {
    return this.withContext(async (ctx) => {
      const res = await ctx.delete(this.url(pathOrUrl), { headers: this.headers() })
      const status = res.status()
      if (status >= 500)
        throw new Odrc5xxError(status, await res.text())
      if (!res.ok() && status !== 404)
        throw new Error(`DELETE ${pathOrUrl} -> ${status}: ${(await res.text()).slice(0, 500)}`)
    })
  }

  /**
   * The UUID of the first available informatiecategorie — a `gepubliceerd`
   * publicatie requires one, and the value list is a fixed prerequisite of the
   * environment, so any of them serves for seeding. Throws if none exist.
   */
  async firstInformatieCategorie(): Promise<string> {
    const cats = await this.list<{ uuid: string }>('informatiecategorieen')
    const uuid = cats[0]?.uuid
    if (!uuid)
      throw new Error('ODRC has no informatiecategorieen — is the value list seeded?')
    return uuid
  }
}
