import type { APIRequestContext } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import { ENV } from '@/bdd/_core/types'

/**
 * The burgerportaal beheer configuration API — read/write the same objects the
 * beheer SPA does, plus the public reflections a burger actually sees. Split out
 * from the beheer *login* flow (`burgerportaal.ts`): this is a data seam, that is
 * an auth seam.
 */

/** Editable homepage config (`/api/beheer/homepage`). Round-tripped verbatim. */
export interface HomepageConfig {
  welcomeText?: string | null
  videoUrl?: string | null
  [key: string]: unknown
}

/** Editable external links config (`/api/beheer/links`). Round-tripped verbatim. */
export interface LinksConfig {
  websiteUrl?: string | null
  privacyUrl?: string | null
  contactUrl?: string | null
  a11yUrl?: string | null
  [key: string]: unknown
}

/** Raw bytes + content type of a public image, for byte-diff asserts and restore. */
export interface ImageSnapshot {
  bytes: Buffer
  contentType: string
}

export type ImageKind = 'logo' | 'favicon' | 'image'
export const IMAGE_KINDS: ImageKind[] = ['logo', 'favicon', 'image']

/** `resources` field holding each image's current public URL. */
const IMAGE_URL_FIELD: Record<ImageKind, string> = {
  logo: 'logoUrl',
  favicon: 'faviconUrl',
  image: 'imageUrl',
}

/**
 * Everything the burgerportaal configuration can hold, captured before a
 * scenario mutates it so the scenario can restore it afterwards (test-owned
 * data: nothing is left changed).
 */
export interface ConfigSnapshot {
  homepage: HomepageConfig
  links: LinksConfig
  images: Record<ImageKind, ImageSnapshot>
}

/**
 * Authenticated client for the burgerportaal beheer config API. Wraps an
 * `APIRequestContext` created with the beheer-admin storage state, so every
 * request carries the OIDC session cookie. Reads/writes the same objects the
 * beheer SPA does, plus the public reflections of them.
 */
export class BeheerConfigClient {
  private readonly base: string

  constructor(private readonly request: APIRequestContext) {
    this.base = ENV.apps.burgerportaal.replace(/\/$/, '')
  }

  /** Public config the burger site renders (`/api/environment/resources`). */
  async getResources(): Promise<Record<string, unknown>> {
    const res = await this.request.get(`${this.base}/api/environment/resources`)
    if (!res.ok())
      throw new Error(`GET /api/environment/resources -> ${res.status()}`)
    return res.json()
  }

  async getHomepage(): Promise<HomepageConfig> {
    const res = await this.request.get(`${this.base}/api/beheer/homepage`)
    if (!res.ok())
      throw new Error(`GET /api/beheer/homepage -> ${res.status()} (is the beheer-admin session valid?)`)
    return res.json()
  }

  async putHomepage(config: HomepageConfig): Promise<void> {
    const res = await this.request.put(`${this.base}/api/beheer/homepage`, { data: config })
    if (!res.ok())
      throw new Error(`PUT /api/beheer/homepage -> ${res.status()}: ${await res.text()}`)
  }

  async getLinks(): Promise<LinksConfig> {
    const res = await this.request.get(`${this.base}/api/beheer/links`)
    if (!res.ok())
      throw new Error(`GET /api/beheer/links -> ${res.status()}`)
    return res.json()
  }

  async putLinks(config: LinksConfig): Promise<void> {
    const res = await this.request.put(`${this.base}/api/beheer/links`, { data: config })
    if (!res.ok())
      throw new Error(`PUT /api/beheer/links -> ${res.status()}: ${await res.text()}`)
  }

  /**
   * Bytes + content type of a public image, fetched from the URL the burger
   * site actually uses. That URL is filename-based and changes on every upload
   * (`/api/afbeeldingen/logo_<uuid>.svg`), so we resolve it from `resources`
   * rather than the static `/api/afbeeldingen/{kind}` alias (which serves a
   * stale/seeded copy and does not reflect uploads).
   */
  async getPublicImage(kind: ImageKind): Promise<ImageSnapshot> {
    const resources = await this.getResources()
    const publicUrl = resources[IMAGE_URL_FIELD[kind]]
    if (typeof publicUrl !== 'string' || !publicUrl)
      throw new Error(`resources.${IMAGE_URL_FIELD[kind]} is not a URL: ${String(publicUrl)}`)
    const res = await this.request.get(this.base + publicUrl)
    if (!res.ok())
      throw new Error(`GET ${publicUrl} -> ${res.status()}`)
    return {
      bytes: await res.body(),
      contentType: res.headers()['content-type'] ?? 'application/octet-stream',
    }
  }

  /** Upload a replacement image (`POST /api/beheer/afbeeldingen/{kind}`, multipart). */
  async uploadImage(kind: ImageKind, file: { name: string, mimeType: string, buffer: Buffer }): Promise<void> {
    const res = await this.request.post(`${this.base}/api/beheer/afbeeldingen/${kind}`, {
      multipart: { file },
    })
    if (!res.ok())
      throw new Error(`POST /api/beheer/afbeeldingen/${kind} -> ${res.status()}: ${await res.text()}`)
  }

  /** Capture the full current config so a scenario can restore it in teardown. */
  async snapshot(): Promise<ConfigSnapshot> {
    const [homepage, links] = await Promise.all([this.getHomepage(), this.getLinks()])
    const images = {} as Record<ImageKind, ImageSnapshot>
    for (const kind of IMAGE_KINDS)
      images[kind] = await this.getPublicImage(kind)
    return { homepage, links, images }
  }

  /** Put a previously captured snapshot back, undoing everything a scenario changed. */
  async restore(snap: ConfigSnapshot): Promise<void> {
    await this.putHomepage(snap.homepage)
    await this.putLinks(snap.links)
    for (const kind of IMAGE_KINDS) {
      const img = snap.images[kind]
      await this.uploadImage(kind, {
        name: `${kind}${extensionFor(img.contentType)}`,
        mimeType: img.contentType,
        buffer: img.bytes,
      })
    }
  }
}

function extensionFor(contentType: string): string {
  if (contentType.includes('svg'))
    return '.svg'
  if (contentType.includes('png'))
    return '.png'
  if (contentType.includes('x-icon') || contentType.includes('vnd.microsoft.icon'))
    return '.ico'
  if (contentType.includes('jpeg') || contentType.includes('jpg'))
    return '.jpg'
  if (contentType.includes('webp'))
    return '.webp'
  return '.bin'
}
