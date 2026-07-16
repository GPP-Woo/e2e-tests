import type { APIRequestContext, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { ENV } from '@/bdd/_core/types'
import { request as apiRequest } from '@playwright/test'
import { adminResource } from './admin-resource'

/**
 * Document test-data ownership for the document-beheer scenarios (TS8).
 *
 * Documents can only be seeded through the woo-publications **token API** (the
 * Django admin add form builds the informatieobjecttype URL from the request
 * Host = `localhost`, which OpenZaak — configured for `host.docker.internal:8000`
 * — can neither match nor reach, so an admin-created document fails to register in
 * the Documenten API). So the seed posts to the token API with the Host header
 * OpenZaak expects, and rewrites the returned bestandsdeel upload URLs back to the
 * externally reachable host for the PUT. Requires the Documenten API to be
 * provisioned (setup/provision-documenten-api.sh).
 *
 * Because the token API 500s while any admin session drives the same odrc server
 * (the user-less-token flake — see odrc.ts), TS8 seeds at Given time before its
 * Stagehand admin session starts, and the suite runs `--workers=1` so no other
 * feature drives the admin concurrently. Verification + cleanup then go through
 * the admin (session auth = a real user), exactly like the publicatie beheer (TS9).
 */

// OpenZaak resolves the informatieobjecttype URL woo-publications emits from the
// request Host; it is configured for the publicatiebank catalogi at this host. So
// requests connect to the externally reachable origin but carry this Host header
// (host.docker.internal is not resolvable from the test host, only inside Docker).
const ODRC_HOST = 'host.docker.internal:8000'
const EXTERNAL_ORIGIN = new URL(ENV.odrc.baseUrl).origin
const API_BASE = `${EXTERNAL_ORIGIN}/api/v2/`

const resource = adminResource({
  path: 'publications/document',
  rowMatch: 'result-row',
  changeId: '[0-9a-f-]+',
  deleteVia: 'deletelink',
})

function tokenHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Authorization': `Token ${ENV.odrc.apiKey}`,
    // Host must be set so woo-publications emits an informatieobjecttype URL on
    // ODRC_HOST. `fetch` cannot set Host (a forbidden header), so the seed uses
    // Playwright's APIRequestContext, which does.
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
  const ctx = await apiRequest.newContext()
  try {
    const orgUuid = await organisatieUuidByNaam(ctx, orgNaam)
    const catUuid = await firstInformatieCategorieUuid(ctx)
    const pub = await postJson(ctx, 'publicaties', {
      officieleTitel: publicatieTitel,
      publisher: orgUuid,
      informatieCategorieen: [catUuid],
      publicatiestatus: 'gepubliceerd',
    })
    const content = Buffer.from(`E2E document body for ${documentTitel}\n`)
    const creatiedatum = new Date().toISOString().slice(0, 10)
    const doc = await postJson(ctx, 'documenten', {
      publicatie: pub.uuid,
      officieleTitel: documentTitel,
      bestandsnaam: 'e2e.txt',
      bestandsformaat: 'text/plain',
      bestandsomvang: content.length,
      creatiedatum,
      publicatiestatus: 'gepubliceerd',
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

/** Delete a document by exact officiële titel via the admin. No-op if already gone. */
export function deleteDocumentByTitel(page: Page, titel: string) {
  return resource.remove(page, titel)
}

/** Officiële titels of leftover `E2E `-prefixed documents via the admin, for the sweep. */
export function listE2EDocumentTitels(page: Page, prefix = 'E2E '): Promise<string[]> {
  return resource.listE2ENames(page, prefix)
}
