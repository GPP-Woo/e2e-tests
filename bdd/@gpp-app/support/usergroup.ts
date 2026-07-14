import type { APIRequestContext } from '@playwright/test'
import { ENV } from '@/bdd/_core/types'

/**
 * Read/cleanup helpers for gpp-app gebruikersgroepen via the odpc JSON API
 * (`/api/gebruikersgroepen`, session-authenticated). The @beheer scenarios mutate
 * gebruikersgroepen through the gpp-app UI with Stagehand; these helpers verify
 * the result and clean up deterministically — the same split as the publicatie
 * beheer scenarios (Stagehand mutate, deterministic read).
 *
 * The list endpoint returns `[{ naam, uuid }]`; that is enough to assert a group
 * exists / was renamed / was deleted, and to resolve a uuid for cleanup.
 */

interface Usergroup {
  naam: string
  uuid: string
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

/** Naam of leftover `E2E `-prefixed gebruikersgroepen, for the run-wide sweep. */
export async function listE2EUsergroupNames(ctx: APIRequestContext, prefix = 'E2E '): Promise<string[]> {
  return (await listUsergroups(ctx)).map(g => g.naam).filter(n => n.startsWith(prefix))
}
