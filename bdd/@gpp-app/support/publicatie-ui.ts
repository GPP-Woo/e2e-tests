import type { Stagehand } from '@browserbasehq/stagehand'
import { settle, stagehandPage } from '@/bdd/_core/stagehand'
import { ENV } from '@/bdd/_core/types'

/**
 * Stagehand driver for the gpp-app (odpc) eindgebruiker publicatie flows (TS6/7).
 *
 * The gpp-app is a SPA that only hydrates its routes when navigated by clicking
 * from the app root — deep-linking a route leaves the form unrendered (same
 * constraint as the gebruikersgroepen flow). So every action starts at the root
 * and clicks through.
 *
 * The "Nieuwe publicatie" form only renders when the signed-in user belongs to an
 * authorised gebruikersgroep; the `authProfile` fixture seeds one first and hands
 * back the profiel/organisatie/informatiecategorie uuids. The form's inputs carry
 * those uuids as their `value`, so the form is filled deterministically by
 * id/value while Stagehand drives the surrounding navigation + publish action.
 */

const gppApp = ENV.apps.gppApp.replace(/\/$/, '')

async function openMijnPublicaties(stagehand: Stagehand) {
  const page = stagehandPage(stagehand)
  await page.goto(gppApp)
  await settle(page)
  await stagehand.act('Click "Mijn publicaties" in the top navigation')
  await settle(page)
}

export interface PublicatieInput {
  /** UUID of the authorised gebruikersgroep (the "Profiel" <option> value). */
  profielUuid: string
  titel: string
  /** UUID of the authorised organisatie (the "Organisatie" radio's value). */
  organisatieUuid: string
  /** UUID of the authorised informatiecategorie (the checkbox's value). */
  informatiecategorieUuid: string
}

/**
 * Create a publicatie under `profiel` and publish it (no documents — this stack
 * has no Documents API). Stagehand drives the navigation; the form itself is a
 * dependent set of custom widgets (a native profiel <select>, then a titel input
 * plus organisatie-radio / informatiecategorie-checkbox option-groups that only
 * render once a profiel is chosen), so it is filled deterministically by
 * id/value — the same carve-out the onderwerp add form uses for its file input.
 * Publishing a document-less publicatie opens a "Publicatie zonder documenten"
 * confirm dialog ("Ja, publiceren").
 */
export async function createAndPublishViaUi(stagehand: Stagehand, opts: PublicatieInput) {
  const page = stagehandPage(stagehand)
  await openMijnPublicaties(stagehand)
  await stagehand.act('Click the "Nieuwe publicatie" button')
  await settle(page)
  // Choosing a profiel reveals the rest of the form (Vue v-if); fill it deterministically.
  // Each control's value is a uuid; radio/checkbox are toggled with a click (the
  // Stagehand page's Locator has no typed check(), and they start unselected).
  await page.locator('#gebruikersgroep').selectOption(opts.profielUuid)
  await page.locator('#titel').fill(opts.titel)
  await page.locator(`input[type="radio"][value="${opts.organisatieUuid}"]`).click()
  await page.locator(`input[type="checkbox"][value="${opts.informatiecategorieUuid}"]`).click()
  // Publish (the action under test) and confirm the document-less publish.
  await stagehand.act('Click the "Publiceren" button')
  await settle(page)
  await stagehand.act('Click the "Ja, publiceren" button to confirm publishing without documents')
  await settle(page)
}

/**
 * Open a publicatie by titel from "Mijn publicaties" and withdraw it
 * ("Publicatie intrekken"), confirming if prompted.
 */
export async function withdrawViaUi(stagehand: Stagehand, titel: string) {
  const page = stagehandPage(stagehand)
  await openMijnPublicaties(stagehand)
  await stagehand.act(`Open the publicatie titled "${titel}" by clicking it`)
  await settle(page)
  await stagehand.act('Click the "Publicatie intrekken" button')
  await stagehand.act('Confirm the intrekken if a confirmation dialog appears')
  await settle(page)
}
