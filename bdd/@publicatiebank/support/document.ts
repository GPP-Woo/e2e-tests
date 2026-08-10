import type { APIRequestContext, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'
import { adminResource } from './admin-resource'

/**
 * Document test-data ownership for the document-beheer scenarios (TS8).
 *
 * Documents can only be seeded through the woo-publications **token API** (an
 * admin-created document does not register in the Documenten API). Requires the
 * Documenten API to be provisioned (setup/provision-documenten-api.sh).
 *
 * Because the token API 500s while any admin session drives the same odrc server
 * (the user-less-token flake — see odrc.ts), TS8 seeds at Given time before its
 * Stagehand admin session starts, and the suite runs `--workers=1` so no other
 * feature drives the admin concurrently. Verification + cleanup then go through
 * the admin (session auth = a real user), exactly like the publicatie beheer (TS9).
 */

// woo-publications builds the informatieobjecttype URL it hands to OpenZaak from
// the request Host, and OpenZaak has to be able to *fetch* that URL. So requests
// connect to the externally reachable origin but carry the in-cluster host as
// their Host header (which is also what setup/provision-documenten-api.sh
// registers as OpenZaak's catalogi Service). Override for a non-kind stack.
// The FQDN, not the bare svc name: Django's URLValidator (OpenZaak side) rejects
// a dotless hostname, so the built URL would come back as "bad-url".
const ODRC_HOST = process.env.ODRC_INTERNAL_HOST ?? 'gpp-publicatiebank-nginx.gpp-e2e.svc.cluster.local'
const EXTERNAL_ORIGIN = new URL(ENV.odrc.baseUrl).origin
const API_BASE = `${EXTERNAL_ORIGIN}/api/v2/`

/** Shared Django-admin changelist mechanics for this entity (also drives its `adminDriver`). */
export const resource = adminResource({
  path: 'publications/document',
  rowMatch: 'result-row',
  changeId: '[0-9a-f-]+',
  deleteVia: 'deletelink',
})

function tokenHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Authorization': `Token ${ENV.odrc.apiKey}`,
    // `fetch` cannot set Host (a forbidden header), so the seed uses Playwright's
    // APIRequestContext, which does.
    'Host': ODRC_HOST,
    'Audit-User-ID': 'e2e',
    'Audit-User-Representation': 'E2E test suite',
    'Audit-Remarks': 'automated e2e document seed',
    ...extra,
  }
}

async function postJson(ctx: APIRequestContext, path: string, data: unknown): Promise<any> {
  const res = await ctx.post(new URL(path, API_BASE).href, {
    headers: tokenHeaders({ 'Content-Type': 'application/json' }),
    data,
  })
  const body = await res.text()
  if (res.status() >= 400)
    throw new Error(`POST ${path} -> ${res.status()}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

/**
 * Status-checked GET returning parsed JSON. Retry once on a transient 5xx, then
 * fail with the actual status + body (a blind `res.json()` would otherwise
 * surface an HTML error page as an opaque `Unexpected token '<'`).
 *
 * NOTE: ODRC 500s this endpoint for token (non-session) requests UNLESS the
 * `provision-documenten-api.sh` auth patch is applied (it makes token auth return
 * AnonymousUser instead of None, so the sessionprofile middleware's
 * `request.user.is_authenticated` doesn't raise). See seedPublishedDocument.
 */
async function getJson(ctx: APIRequestContext, path: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await ctx.get(new URL(path, API_BASE).href, { headers: tokenHeaders() })
    const body = await res.text()
    if (res.status() >= 500 && attempt === 0) {
      await new Promise(r => setTimeout(r, 1500))
      continue
    }
    if (res.status() >= 400)
      throw new Error(`GET ${path} -> ${res.status()}: ${body.slice(0, 400)}`)
    return JSON.parse(body)
  }
}

async function firstInformatieCategorieUuid(ctx: APIRequestContext): Promise<string> {
  const uuid = (await getJson(ctx, 'informatiecategorieen')).results?.[0]?.uuid
  if (!uuid)
    throw new Error('ODRC has no informatiecategorieen — is the value list seeded?')
  return uuid
}

async function organisatieUuidByNaam(ctx: APIRequestContext, naam: string): Promise<string> {
  const uuid = ((await getJson(ctx, 'organisaties')).results ?? []).find((o: { naam: string }) => o.naam === naam)?.uuid
  if (!uuid)
    throw new Error(`Organisatie "${naam}" not found in the ODRC waardelijst`)
  return uuid
}

/**
 * Seed a publicatie owning a document (with real uploaded content) through the
 * token API. Defaults to both `gepubliceerd`. `orgNaam` must be an existing
 * actief organisatie (seed one via the `organisations` fixture first), unless
 * `orgUuid` is provided (e.g. a landelijke waardelijst org the DiWoo sitemap
 * accepts — it skips `zelf_toegevoegd` publishers).
 *
 * Returns the created publicatie/document payloads so callers can compare
 * sitemap metadata without a second read (token GETs flake under admin load).
 *
 * Requires `setup/provision-documenten-api.sh` to have been run on the stack: it
 * wires the Documenten API and patches ODRC token auth to return AnonymousUser,
 * without which these token requests 500 in the sessionprofile middleware (see
 * getJson). A `docker compose down`/`up` reverts the patch — re-run the script.
 */
export async function seedDocument(opts: {
  publicatieTitel: string
  documentTitel: string
  orgNaam?: string
  orgUuid?: string
  publicatieStatus?: 'concept' | 'gepubliceerd' | 'ingetrokken'
  documentStatus?: 'concept' | 'gepubliceerd' | 'ingetrokken'
  creatiedatum?: string
  ontvangstdatum?: string | null
  datumOndertekend?: string | null
  verkorteTitel?: string
  omschrijving?: string
  verantwoordelijkeUuid?: string
  informatieCategorieUuids?: string[]
  /** Topic UUIDs to couple on the publicatie (burgerportaal onderwerp → publicaties). */
  onderwerpen?: string[]
  /** Override the uploaded file bytes (default embeds the document titel). */
  fileContent?: string | Buffer
}): Promise<{ publicatie: any, document: any }> {
  const ctx = await apiRequest.newContext()
  try {
    const orgUuid = opts.orgUuid ?? await organisatieUuidByNaam(ctx, opts.orgNaam!)
    const catUuids = opts.informatieCategorieUuids?.length
      ? opts.informatieCategorieUuids
      : [await firstInformatieCategorieUuid(ctx)]
    const pub = await postJson(ctx, 'publicaties', {
      officieleTitel: opts.publicatieTitel,
      publisher: orgUuid,
      verantwoordelijke: opts.verantwoordelijkeUuid ?? orgUuid,
      informatieCategorieen: catUuids,
      onderwerpen: opts.onderwerpen ?? [],
      publicatiestatus: opts.publicatieStatus ?? 'gepubliceerd',
    })
    const content = Buffer.isBuffer(opts.fileContent)
      ? opts.fileContent
      : Buffer.from(opts.fileContent ?? `E2E document body for ${opts.documentTitel}\n`)
    const creatiedatum = opts.creatiedatum ?? new Date().toISOString().slice(0, 10)
    const doc = await postJson(ctx, 'documenten', {
      publicatie: pub.uuid,
      officieleTitel: opts.documentTitel,
      verkorteTitel: opts.verkorteTitel ?? '',
      omschrijving: opts.omschrijving ?? '',
      bestandsnaam: 'e2e.txt',
      bestandsformaat: 'text/plain',
      bestandsomvang: content.length,
      creatiedatum,
      ontvangstdatum: opts.ontvangstdatum ?? undefined,
      datumOndertekend: opts.datumOndertekend ?? undefined,
      publicatiestatus: opts.documentStatus ?? 'gepubliceerd',
    })
    for (const bd of doc.bestandsdelen ?? []) {
      // The upload URL comes back on ODRC_HOST (the seed's Host); PUT it on the
      // externally reachable origin instead.
      const url = bd.url.replace(`http://${ODRC_HOST}`, EXTERNAL_ORIGIN)
      const up = await ctx.put(url, {
        headers: tokenHeaders({ 'is-api': 'true' }),
        multipart: {
          inhoud: {
            name: 'e2e.txt',
            mimeType: 'text/plain',
            buffer: content.subarray(0, bd.omvang),
          },
        },
      })
      if (!up.ok())
        throw new Error(`PUT bestandsdeel -> ${up.status()}: ${(await up.text()).slice(0, 200)}`)
    }
    return { publicatie: pub, document: doc }
  }
  finally {
    await ctx.dispose()
  }
}

/**
 * PATCH a document or publicatie `publicatiestatus` via the token API.
 *
 * ODRC ignores `publicatiestatus: 'ingetrokken'` on create (file upload still
 * yields `gepubliceerd`), and refuses creating a publicatie directly as
 * `ingetrokken`. Sitemap exclusion scenarios must therefore publish first, then
 * withdraw with this helper.
 */
export async function patchPublicatiestatus(
  kind: 'documenten' | 'publicaties',
  uuid: string,
  publicatiestatus: 'concept' | 'gepubliceerd' | 'ingetrokken',
): Promise<any> {
  const ctx = await apiRequest.newContext()
  try {
    const res = await ctx.patch(new URL(`${kind}/${uuid}`, API_BASE).href, {
      headers: tokenHeaders({ 'Content-Type': 'application/json' }),
      data: { publicatiestatus },
    })
    const body = await res.text()
    if (res.status() >= 400)
      throw new Error(`PATCH ${kind}/${uuid} -> ${res.status()}: ${body.slice(0, 400)}`)
    return JSON.parse(body)
  }
  finally {
    await ctx.dispose()
  }
}

/** PATCH document metadata fields via the token API (omschrijving, verkorteTitel, …). */
export async function patchDocument(
  uuid: string,
  data: Record<string, unknown>,
): Promise<any> {
  const ctx = await apiRequest.newContext()
  try {
    const res = await ctx.patch(new URL(`documenten/${uuid}`, API_BASE).href, {
      headers: tokenHeaders({ 'Content-Type': 'application/json' }),
      data,
    })
    const body = await res.text()
    if (res.status() >= 400)
      throw new Error(`PATCH documenten/${uuid} -> ${res.status()}: ${body.slice(0, 400)}`)
    return JSON.parse(body)
  }
  finally {
    await ctx.dispose()
  }
}

/** DELETE a document via the token API. */
export async function deleteDocumentViaToken(uuid: string): Promise<void> {
  const ctx = await apiRequest.newContext()
  try {
    const res = await ctx.delete(new URL(`documenten/${uuid}`, API_BASE).href, {
      headers: tokenHeaders(),
    })
    if (res.status() >= 400 && res.status() !== 404)
      throw new Error(`DELETE documenten/${uuid} -> ${res.status()}: ${(await res.text()).slice(0, 400)}`)
  }
  finally {
    await ctx.dispose()
  }
}

/** Resolve an informatiecategorie uuid by exact naam (token API). */
export async function informatieCategorieUuidByNaam(naam: string): Promise<string> {
  const ctx = await apiRequest.newContext()
  try {
    let next: string | null = 'informatiecategorieen?pageSize=100'
    while (next) {
      const page = await getJson(ctx, next)
      const hit = (page.results ?? []).find((c: { naam?: string }) => c.naam === naam)
      if (hit?.uuid)
        return hit.uuid as string
      next = page.next
        ? String(page.next).replace(/^https?:\/\/[^/]+\/api\/v2\//, '')
        : null
    }
    throw new Error(`Informatiecategorie "${naam}" not found in ODRC`)
  }
  finally {
    await ctx.dispose()
  }
}

/**
 * Seed a `gepubliceerd` publicatie owning a `gepubliceerd` document (with real
 * uploaded content) through the token API. `orgNaam` must be an existing actief
 * organisatie (seed one via the `organisations` fixture first). Runs in a
 * throwaway cookieless request context so a stray session cookie never turns the
 * token request into a 401.
 *
 * Requires `setup/provision-documenten-api.sh` to have been run on the stack: it
 * wires the Documenten API and patches ODRC token auth to return AnonymousUser,
 * without which these token requests 500 in the sessionprofile middleware (see
 * getJson). A `docker compose down`/`up` reverts the patch — re-run the script.
 */
export async function seedPublishedDocument(
  publicatieTitel: string,
  documentTitel: string,
  orgNaam: string,
): Promise<void> {
  await seedDocument({ publicatieTitel, documentTitel, orgNaam })
}

/**
 * Activate a landelijke (non-`zelf_toegevoegd`) organisatie and return its uuid
 * + naam. The DiWoo sitemap skips zelf_toegevoegd publishers, so sitemap
 * membership scenarios must seed against a landelijke org — the portable
 * `organisations.add()` path cannot satisfy that.
 */
export async function activateLandelijkeOrganisatie(): Promise<{ uuid: string, naam: string }> {
  const ctx = await apiRequest.newContext()
  try {
    let next: string | null = 'organisaties?pageSize=100&isActief=alle'
    while (next) {
      const page = await getJson(ctx, next)
      const hit = (page.results ?? []).find((o: { oorsprong?: string }) => o.oorsprong && o.oorsprong !== 'zelf_toegevoegd')
      if (hit) {
        const patched = await ctx.patch(new URL(`organisaties/${hit.uuid}`, API_BASE).href, {
          headers: tokenHeaders({ 'Content-Type': 'application/json' }),
          data: { isActief: true },
        })
        if (!patched.ok())
          throw new Error(`PATCH organisatie ${hit.uuid} -> ${patched.status()}: ${(await patched.text()).slice(0, 200)}`)
        return { uuid: hit.uuid as string, naam: hit.naam as string }
      }
      next = page.next
        ? String(page.next).replace(/^https?:\/\/[^/]+\/api\/v2\//, '')
        : null
    }
    throw new Error('No landelijke (non-zelf_toegevoegd) organisatie found in ODRC')
  }
  finally {
    await ctx.dispose()
  }
}

// --- Admin reads + cleanup (deterministic while Stagehand drives the admin) -----

/** Whether a document with this officiële titel is listed in the admin changelist. */
export function documentExistsAdmin(page: Page, titel: string): Promise<boolean> {
  return resource.exists(page, titel)
}

/**
 * The publicatiestatus of a document, read (lower-cased) from the admin changelist
 * column. '' if the row is not found.
 */
export async function documentStatusAdmin(page: Page, titel: string): Promise<string> {
  await page.goto(`${resource.changelistUrl()}?q=${encodeURIComponent(titel)}`)
  const row = page.locator('#result_list tbody tr', { hasText: titel })
  if ((await row.count()) === 0)
    return ''
  const cell = await row.first().locator('td.field-publicatiestatus').textContent()
  return (cell ?? '').trim().toLowerCase()
}

/**
 * Open the document's admin change page deterministically (changelist search →
 * row click → change-URL assert). The TS8 mutations use this instead of the
 * Stagehand act() row-click, which did not reliably land on the *document*
 * change page (StagehandElementNotFoundError on #id_publicatiestatus).
 */
export async function openDocumentAdmin(page: Page, titel: string): Promise<void> {
  if (!(await resource.open(page, titel)))
    throw new Error(`Document "${titel}" not found in the admin changelist`)
}

/** Delete a document by exact officiële titel via the admin. No-op if already gone. */
export function deleteDocumentByTitel(page: Page, titel: string) {
  return resource.remove(page, titel)
}

/** Officiële titels of leftover `E2E `-prefixed documents via the admin, for the sweep. */
export function listE2EDocumentTitels(page: Page, prefix = 'E2E '): Promise<string[]> {
  return resource.listE2ENames(page, prefix)
}

/**
 * The UUID of a document, read from the change form's readonly uuid field. The
 * burgerportaal serves a document at `/documenten/<uuid>`, so scenarios that
 * assert portal visibility stash this before a withdraw/delete. '' if not found.
 */
export async function documentUuidAdmin(page: Page, titel: string): Promise<string> {
  if (!(await resource.open(page, titel)))
    return ''
  const text = await page.locator('.form-row.field-uuid .readonly, .field-uuid .readonly').textContent()
  return (text ?? '').trim()
}

/**
 * Whether the change form of a document exposes no way to edit it.
 * `DocumentAdmin.has_change_permission` returns False for an `ingetrokken`
 * document, so Django falls back to its view-only change form.
 */
export async function documentFormIsReadOnly(page: Page, titel: string): Promise<boolean> {
  if (!(await resource.open(page, titel)))
    return false
  return (await page.locator('input[name="_save"]').count()) === 0
    && (await page.locator('#id_officiele_titel').count()) === 0
}

/**
 * Open the document's "Toon logs" view from the changelist (the logging
 * changelist filtered to this object's content type + pk).
 */
export async function openDocumentLogsAdmin(page: Page, titel: string): Promise<void> {
  await page.goto(`${resource.changelistUrl()}?q=${encodeURIComponent(titel)}`)
  const row = page.getByRole('row', { name: titel })
  if ((await row.count()) === 0)
    throw new Error(`Document "${titel}" not found in the admin changelist`)
  await row.first().getByRole('link', { name: 'Toon logs' }).click()
}
