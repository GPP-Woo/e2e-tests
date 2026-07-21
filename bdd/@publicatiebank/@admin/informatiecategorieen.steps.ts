import type { Page } from '@playwright/test'
import { openBeheer } from '@/bdd/@publicatiebank/support/login'
import { Given, Then, When } from '@/bdd/_core/fixture'
import { expect } from '@playwright/test'

function stripWs(s: string) {
  return s.replace(/\s+/g, '')
}
function compareIgnoringWhitespace(a: string, b: string) {
  return stripWs(a).localeCompare(stripWs(b))
}

async function search(page: Page, query: string) {
  await page.getByRole('textbox', { name: 'Search' }).fill(query)
  await page.getByRole('button', { name: 'Zoeken' }).click()
}

async function assertOnChangePage(page: Page, naam: string) {
  await expect(page).toHaveURL(/\/admin\/metadata\/informationcategory\/\d+\/change\/(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'informatiecategorie wijzigen' })).toBeVisible()
  await expect(page.getByRole('heading', { name: naam })).toBeVisible()
}

Given('I am logged in to the publicatiebank admin', async ({ page }) => {
  // Session is restored from storage state (the @admin tag); just open the admin.
  await openBeheer(page)
})

Given('I have added a self-added information category', async ({ categories }) => {
  await categories.add()
})

Given('I open the {string} metadata page', async ({ page }, name: string) => {
  await page.locator('#header').getByText('Metadata').click()
  await page.locator('#header').getByRole('link', { name }).click()
})

Then('the {string} column header is visible and clickable', async ({ page }, header: string) => {
  const headerElement = page.getByRole('link', { name: header })
  await expect(headerElement).toBeVisible()
  await expect(headerElement).toHaveText(header)
  await headerElement.click()
})

When('I choose {string} from the {string} menu', async ({ page }, action: string, menu: string) => {
  await page.getByText(menu).click()
  await page.getByText(action).click()
})

When('I search for the self-added information category', async ({ page, categories }) => {
  await search(page, categories.last())
})

Then('I see the self-added information category in the results', async ({ page, categories }) => {
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toHaveCount(1)
})

Then('the self-added information category is listed', async ({ page, categories }) => {
  await expect(page.getByRole('link', { name: categories.last(), exact: true })).toBeVisible()
})

When('I open the self-added information category', async ({ page, categories }) => {
  await page.getByRole('link', { name: categories.last(), exact: true }).click()
})

Then('I am on its information category change page', async ({ page, categories }) => {
  await assertOnChangePage(page, categories.last())
})

When('I filter on {string}', async ({ page }, filterName: string) => {
  await page.getByRole('link', { name: filterName, exact: true }).click()
  await page.locator('td.field-oorsprong').first().waitFor()
})

Then('every result has {string} as its origin', async ({ page }, origin: string) => {
  const cells = page.locator('td.field-oorsprong')
  const count = await cells.count()
  for (let i = 0; i < count; i++) {
    expect((await cells.nth(i).textContent())?.trim()).toBe(origin)
  }
})

Then(
  'the results contain both {string} and {string} origins',
  async ({ page }, first: string, second: string) => {
    const cells = page.locator('td.field-oorsprong')
    const count = await cells.count()
    const values: string[] = []
    for (let i = 0; i < count; i++) {
      const text = (await cells.nth(i).textContent())?.trim()
      if (text)
        values.push(text)
    }
    expect(values).toContain(first)
    expect(values).toContain(second)
  },
)

When('I sort ascending by the {string} column', async ({ page }, column: string) => {
  await page.getByRole('link', { name: column }).click()
  const sortLink = page.getByRole('link', { name: 'Sortering aan/uit' })
  await sortLink.click()
  await sortLink.click()
})

Then('the information categories are listed alphabetically by name', async ({ page }) => {
  const naamLinks = await page.locator('th.field-naam a').all()
  const names = await Promise.all(
    naamLinks.map(async el => (await el.textContent())?.trim() || ''),
  )
  const sorted = [...names].sort(compareIgnoringWhitespace)
  expect(names).toEqual(sorted)
})

// ---------------------------------------------------------------------------
// TS2 gap coverage (@todo — skipped by the global Before({tags:'@todo'}) hook).
// Stubs only; the phrasing is registered so bddgen stays green. Prerequisite
// steps (Background, "I filter on", "I search for", "I open the self-added")
// are reused verbatim from above.
// ---------------------------------------------------------------------------

// --- Default catalogue present + coexistence (admin read via `page`) --------

Then('all 18 default information categories from the landelijke waardelijst are present', async () => {
  // Admin read: after filtering on "Waardelijst", count `td.field-oorsprong`
  // rows and expect 18 (17 statutory + 1 inspanningsverplichting).
  throw new Error('TODO: assert exactly 18 Waardelijst rows in the changelist')
})

Then('both the default categories and my self-added category are listed', async () => {
  // Admin read: on the "Alle" filter, assert >= 18 Waardelijst rows exist AND
  // categories.last() is present, proving default + self-added coexist.
  throw new Error('TODO: assert the default list and categories.last() coexist')
})

// --- Add through the UI (mutation via the admin form on `page`) -------------

When('I add an information category through the admin form', async () => {
  // Mutation: reuse addSelfAddedCategory(page, categories.freshName()) but drive
  // it as the action under test, then categories.track(name) for teardown.
  throw new Error('TODO: fill and submit the informatiecategorie add form, then track the name')
})

Then('the new information category is listed on the overview', async () => {
  // Admin read: search the changelist for categories.last() and expect one row.
  throw new Error('TODO: assert categories.last() appears once on the overview')
})

// --- Restricted fields on a Waardelijst category (admin read) ---------------

When('I open a Waardelijst information category', async () => {
  // Navigate: filter on "Waardelijst" and open the first row's change page.
  throw new Error('TODO: open the change page of the first Waardelijst category')
})

Then('only the omschrijving and archivering fields are editable', async () => {
  // Admin read: assert #id_omschrijving and the bewaartermijn/archivering inputs
  // are enabled (not readonly/disabled).
  throw new Error('TODO: assert omschrijving and archivering fields are editable')
})

Then('the oorsprong, identificatie and UUID fields are read-only', async () => {
  // Admin read: assert the oorsprong, identificatie and UUID fields render as
  // read-only (.readonly div, or disabled inputs) for a Waardelijst category.
  throw new Error('TODO: assert oorsprong, identificatie and UUID are read-only')
})

// --- Edit a self-added category (mutation via admin form on `page`) ---------

When('I change its omschrijving and save the information category', async ({ scratch }) => {
  // Mutation: replace #id_omschrijving with a fresh value, remember it via
  // scratch.set('cat:omschrijving', value), then click _save.
  scratch.set('cat:omschrijving', `E2E gewijzigd ${Date.now()}`)
  throw new Error('TODO: edit #id_omschrijving to scratch value and save')
})

Then('the updated omschrijving is shown on the change page', async ({ scratch }) => {
  // Admin read: reopen the change page and assert #id_omschrijving equals the
  // value stored in scratch.get('cat:omschrijving').
  scratch.get('cat:omschrijving')
  throw new Error('TODO: assert #id_omschrijving equals the saved value')
})

// --- Logging after edit ("Toon logs") ---------------------------------------

Given('I have changed the omschrijving of the self-added information category', async () => {
  // Prerequisite mutation: open categories.last() and save a changed
  // omschrijving so there is an edit entry to find in the logs.
  throw new Error('TODO: open categories.last() and save a changed omschrijving')
})

When('I open the {string} view from the change page', async (_, linkName: string) => {
  // Navigate: click the "Toon logs" button (linkName) on the category change
  // page to reach its logging view.
  throw new Error(`TODO: click the "${linkName}" button on the change page`)
})

Then('the omschrijving change is listed in the category logs', async () => {
  // Admin read: assert the logs table shows a "gewijzigd"/wijziging entry for
  // categories.last().
  throw new Error('TODO: assert a wijziging log entry exists for the category')
})

// --- Delete through the UI with confirmation --------------------------------

When('I start deleting the information category', async () => {
  // Navigate: on the category change page, click the red "verwijderen" link to
  // reach Django's delete-confirmation page (no confirm yet).
  throw new Error('TODO: click the "verwijderen" link to open the confirmation page')
})

Then('a confirmation page lists the consequences of the deletion', async () => {
  // Admin read: assert the delete-confirmation page shows the "Weet u het zeker"
  // summary of related objects that would be removed.
  throw new Error('TODO: assert the delete-confirmation consequences are shown')
})

When('I confirm the deletion', async () => {
  // Mutation: click the confirmation submit button ("Ja, ik weet het zeker").
  throw new Error('TODO: submit the delete confirmation form')
})

Then('the information category is no longer listed on the overview', async () => {
  // Admin read: search the changelist for categories.last() and expect no rows.
  throw new Error('TODO: assert categories.last() is absent from the overview')
})

// --- Audit log after delete --------------------------------------------------

Given('I have deleted the self-added information category through the UI', async () => {
  // Prerequisite mutation: delete categories.last() via the admin delete flow so
  // there is a deletion entry to find in the audit log.
  throw new Error('TODO: delete categories.last() through the admin UI')
})

When('I open the {string} via the {string} tab', async (_, section: string, tab: string) => {
  // Navigate: open the top "Logging" tab (tab) and its "(audit)logitems"
  // changelist (section).
  throw new Error(`TODO: open "${section}" under the "${tab}" tab`)
})

Then('the deletion of the information category is recorded in the audit log', async () => {
  // Admin read: search the audit log for categories.last() and assert a
  // verwijderd/deletion entry exists.
  throw new Error('TODO: assert a deletion audit-log entry exists for the category')
})
