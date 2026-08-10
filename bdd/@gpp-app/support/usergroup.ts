import type { APIRequestContext } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'

/**
 * Read/cleanup helpers for gpp-app gebruikersgroepen via the odpc JSON API
 * (`/api/gebruikersgroepen`, session-authenticated). Testscript 5 mutates
 * gebruikersgroepen through the gpp-app UI with plain Playwright; these helpers
 * verify the result and clean up deterministically.
 *
 * The list endpoint returns `[{ naam, uuid }]`; that is enough to assert a group
 * exists / was renamed / was deleted, and to resolve a uuid for cleanup. The
 * detail endpoint (`/api/gebruikersgroepen/{uuid}`) additionally carries
 * `omschrijving`, `gekoppeldeGebruikers` and `gekoppeldeWaardelijsten` — see
 * {@link getUsergroupDetail}.
 */

interface Usergroup {
  naam: string
  uuid: string
}

export interface UsergroupDetail extends Usergroup {
  omschrijving: string
  gekoppeldeGebruikers: string[]
  gekoppeldeWaardelijsten: string[]
}

function endpoint() {
  return new URL('/api/gebruikersgroepen', ENV.apps.gppApp).href
}

/** All gebruikersgroepen visible to the signed-in user. */
export async function listUsergroups(ctx: APIRequestContext): Promise<Usergroup[]> {
  const res = await ctx.get(endpoint())
  if (!res.ok())
    throw new Error(`GET gebruikersgroepen -> ${res.status()}: ${await res.text()}`)
  const body = await res.json()
  return Array.isArray(body) ? body : (body.results ?? [])
}

/** Whether a gebruikersgroep with exactly this naam exists. */
export async function usergroupExists(ctx: APIRequestContext, naam: string): Promise<boolean> {
  return (await listUsergroups(ctx)).some(g => g.naam === naam)
}

/** Delete a gebruikersgroep by exact naam via the API. No-op if already gone. */
export async function deleteUsergroupByName(ctx: APIRequestContext, naam: string): Promise<void> {
  const group = (await listUsergroups(ctx)).find(g => g.naam === naam)
  if (!group)
    return
  const res = await ctx.delete(`${endpoint()}/${group.uuid}`)
  if (!res.ok() && res.status() !== 404)
    throw new Error(`DELETE gebruikersgroep ${group.uuid} -> ${res.status()}`)
}

/**
 * Full detail (omschrijving + gekoppelde gebruikers/waardelijsten) of a
 * gebruikersgroep by exact naam. Throws if no group with that naam exists.
 */
export async function getUsergroupDetail(ctx: APIRequestContext, naam: string): Promise<UsergroupDetail> {
  const group = (await listUsergroups(ctx)).find(g => g.naam === naam)
  if (!group)
    throw new Error(`Gebruikersgroep "${naam}" not found`)
  const res = await ctx.get(`${endpoint()}/${group.uuid}`)
  if (!res.ok())
    throw new Error(`GET gebruikersgroep ${group.uuid} -> ${res.status()}: ${await res.text()}`)
  return res.json()
}

/** Naam of leftover `E2E `-prefixed gebruikersgroepen, for the run-wide sweep. */
export async function listE2EUsergroupNames(ctx: APIRequestContext, prefix = 'E2E '): Promise<string[]> {
  return (await listUsergroups(ctx)).map(g => g.naam).filter(n => n.startsWith(prefix))
}

// --- Authorised-group seeding (unblocks the eindgebruiker publicatie flows) ----
//
// Creating/editing a publicatie in the gpp-app requires the signed-in user to be
// a member of a gebruikersgroep that is authorised for at least one organisatie
// and one informatiecategorie (the "profiel" a publicatie is made under). TS6/TS7
// need that as a *prerequisite*, so it is seeded deterministically over the odpc
// JSON API (the group create/edit UI itself is what TS5 tests). odpc matches a
// group member's `gebruikerId` against the caller's identity claim
// (preferred_username, case-insensitive — see ODPC.Server MijnGebruikersgroepen),
// so we read that claim back from `/api/me` rather than guessing it.

function apiUrl(path: string): string {
  return new URL(path, ENV.apps.gppApp).href
}

async function firstPage<T>(ctx: APIRequestContext, path: string): Promise<T[]> {
  const res = await ctx.get(apiUrl(path))
  if (!res.ok())
    throw new Error(`GET ${path} -> ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return Array.isArray(body) ? body : (body.results ?? [])
}

/** The identity claim odpc matches group membership on (e.g. `admin`). */
export async function currentUserId(ctx: APIRequestContext): Promise<string> {
  const res = await ctx.get(apiUrl('/api/me'))
  if (!res.ok())
    throw new Error(`GET /api/me -> ${res.status()}`)
  const me = await res.json()
  if (!me?.id)
    throw new Error(`/api/me returned no id: ${JSON.stringify(me).slice(0, 200)}`)
  return me.id as string
}

/** UUID of an organisatie by exact naam, from the gpp-app waardelijst. Throws if absent. */
export async function resolveOrganisatieUuid(ctx: APIRequestContext, naam: string): Promise<string> {
  const orgs = await firstPage<{ uuid: string, naam: string }>(ctx, '/api/v2/organisaties')
  const uuid = orgs.find(o => o.naam === naam)?.uuid
  if (!uuid)
    throw new Error(`Organisatie "${naam}" not visible in the gpp-app waardelijst (${orgs.length} present)`)
  return uuid
}

/** UUID of an onderwerp by exact officiële titel, from the gpp-app waardelijst. Throws if absent. */
export async function resolveOnderwerpUuid(ctx: APIRequestContext, titel: string): Promise<string> {
  const onderwerpen = await firstPage<{ uuid: string, officieleTitel: string }>(ctx, '/api/v2/onderwerpen')
  const uuid = onderwerpen.find(o => o.officieleTitel === titel)?.uuid
  if (!uuid)
    throw new Error(`Onderwerp "${titel}" not visible in the gpp-app waardelijst (${onderwerpen.length} present)`)
  return uuid
}

/** The first available informatiecategorie (uuid + naam) from the gpp-app waardelijst. Throws if none. */
export async function firstInformatiecategorie(ctx: APIRequestContext): Promise<{ uuid: string, naam: string }> {
  return (await informatiecategorieen(ctx, 1))[0]
}

/** The first `count` informatiecategorieën from the gpp-app waardelijst. Throws if there are fewer. */
export async function informatiecategorieen(ctx: APIRequestContext, count: number): Promise<{ uuid: string, naam: string }[]> {
  const cats = await firstPage<{ uuid: string, naam: string }>(ctx, '/api/v2/informatiecategorieen')
  if (cats.length < count)
    throw new Error(`Need ${count} informatiecategorieën in the gpp-app waardelijst, found ${cats.length}`)
  return cats.slice(0, count).map(({ uuid, naam }) => ({ uuid, naam }))
}

/**
 * Create a gebruikersgroep with the given member(s) and authorised waardelijst
 * uuids (organisatie + informatiecategorie) over the odpc API. Returns its uuid.
 * The caller must have the odpc-admin role (the admin session does).
 */
export async function createAuthorisedGroup(
  ctx: APIRequestContext,
  opts: { naam: string, gebruikerId: string, waardelijstUuids: string[] },
): Promise<string> {
  const res = await ctx.post(apiUrl('/api/gebruikersgroepen'), {
    data: {
      naam: opts.naam,
      omschrijving: 'E2E authorised profiel (prerequisite for publicatie flows)',
      gekoppeldeWaardelijsten: opts.waardelijstUuids,
      gekoppeldeGebruikers: [opts.gebruikerId],
    },
  })
  if (!res.ok())
    throw new Error(`POST gebruikersgroepen -> ${res.status()}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return body.uuid as string
}
