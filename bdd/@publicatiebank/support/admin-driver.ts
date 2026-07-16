import type { StagehandPage } from '@/bdd/_core/stagehand'
import type { Stagehand } from '@browserbasehq/stagehand'
import { settle, stagehandPage } from '@/bdd/_core/stagehand'

/**
 * A Django-admin resource driven from natural language via Stagehand `act()`.
 *
 * The organisatie/onderwerp/publicatie beheer scenarios all run the same
 * changelist CRUD script — open the changelist, search a row and open it, save
 * with "Opslaan", delete-with-confirm — differing only in the Dutch noun and the
 * changelist path. This binds that script to one `{ noun, changelist }` so the
 * step files express intent (`open`, `save`, `rename`, `remove`) instead of
 * re-typing the goto→act→networkidle mechanics. Assertions still read the admin
 * back through the ordinary session `page` (see {@link adminResource}); this
 * seam only owns the *mutations*.
 */
export interface AdminDriverConfig {
  /** Dutch singular used in the act() phrasing, e.g. `organisatie`, `onderwerp`, `publicatie`. */
  noun: string
  /** Absolute changelist URL (no trailing `?q=`), e.g. `${pub}/admin/metadata/organisation/`. */
  changelist: string
  /** Absolute add-form URL. Optional — only needed by flows that add through the admin. */
  add?: string
  /** How the row link reads in the act() phrasing. Defaults to `link`; publicaties use `titel link`. */
  rowLink?: string
}

export interface AdminDriver {
  /** The understudy page Stagehand drives (for file carve-outs / navigation). */
  readonly page: StagehandPage
  /** Pass an instruction straight to Stagehand `act()`. */
  act: (instruction: string) => Promise<unknown>
  /** Wait for the network to settle (best-effort). */
  settle: () => Promise<void>
  /** Open the changelist and settle. */
  openList: () => Promise<void>
  /** Open the add form and settle. */
  openAdd: () => Promise<void>
  /** Search for `name` and open its row in the changelist. */
  open: (name: string) => Promise<void>
  /** Click "Opslaan" and settle. */
  save: () => Promise<void>
  /** Delete-with-confirm the currently open change page, and settle. */
  removeCurrent: () => Promise<void>
  /** Search the changelist for `name` via the admin search box, and settle. */
  search: (name: string) => Promise<void>
}

export function adminDriver(stagehand: Stagehand, config: AdminDriverConfig): AdminDriver {
  const { noun, changelist, add, rowLink = 'link' } = config
  const page = stagehandPage(stagehand)
  const act = (instruction: string) => stagehand.act(instruction)
  const settleHere = () => settle(page)

  return {
    page,
    act,
    settle: settleHere,
    async openList() {
      await page.goto(changelist)
      await settleHere()
    },
    async openAdd() {
      if (!add)
        throw new Error(`adminDriver for "${noun}" has no add URL configured`)
      await page.goto(add)
      await settleHere()
    },
    async open(name) {
      await page.goto(`${changelist}?q=${encodeURIComponent(name)}`)
      await act(`Open the ${noun} by clicking its ${rowLink} in the results table`)
      // Settle the change page before returning — callers interact with its form
      // fields deterministically (e.g. #id_publicatiestatus) via the Stagehand
      // understudy locator, which has no auto-wait; without this it can query
      // before the change page renders (StagehandElementNotFoundError).
      await settleHere()
    },
    async save() {
      await act(`Click the "Opslaan" button to save the ${noun}`)
      await settleHere()
    },
    async removeCurrent() {
      await act(`Click the "Verwijderen" button to delete this ${noun}`)
      await act('Confirm the deletion by clicking the "Ja, ik weet het zeker" button')
      await settleHere()
    },
    async search(name) {
      await page.goto(changelist)
      await act(`Type "${name}" in the search box and submit the search`)
      await settleHere()
    },
  }
}
