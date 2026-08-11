import type { Page } from '@playwright/test'
import type { CategoryManager, OrganisationManager, OwnerGroupManager, TopicManager } from '../fixtures'
import { organisationPk } from './publication'

/**
 * The editable metadata fields of a publicatie, as one table of
 * "how to seed a new value / how to type it / how to read it back".
 *
 * TS9's "edit each metadata field, save and reopen to verify" outline runs the
 * same three beats for nine different widgets — an autocomplete, a raw-id input,
 * a plain text input, a date input, an inline formset. Only the widget differs, so
 * this table holds that difference and `publicaties.steps.ts` keeps one pair of
 * steps instead of nine.
 *
 * Everything here is plain Playwright on the session `page` — these widgets have
 * stable ids, and the field *labels* a natural-language step would have to name
 * are localised, so a phrase would silently drift with a translation update.
 */
export interface FieldDeps {
  /** Session-authenticated page, for prerequisites that need to navigate. */
  page: Page
  categories: CategoryManager
  organisations: OrganisationManager
  topics: TopicManager
  ownerGroups: OwnerGroupManager
}

export interface PublicationField {
  /**
   * Seed or resolve the new value, *before* the change form is opened — creating
   * a prerequisite organisatie, categorie, onderwerp or eigenaar groep navigates
   * the shared tab and would otherwise abandon the open form.
   */
  prepare: (deps: FieldDeps) => Promise<string>
  /** Type the value into the already-open change form. */
  apply: (page: Page, value: string) => Promise<void>
  /** Read the value back from an open change form. */
  read: (page: Page) => Promise<string>
}

const AUTOCOMPLETE_TIMEOUT = 8000

/**
 * Pick an option in a Django admin select2 autocomplete by search term.
 *
 * The option is matched on the term itself, not taken as "the first one": opening
 * the widget fires an unfiltered ajax query, so between typing and the filtered
 * response landing the list still holds the *previous* results — picking
 * positionally silently selects whatever happened to be on top (a waardelijst
 * category, in the run that caught this). Matching on the text both waits for the
 * filtered list and fails loudly if the term never appears.
 */
async function pickAutocomplete(page: Page, field: string, term: string) {
  await page.locator(`.field-${field} .select2-selection`).click()
  await page.locator('.select2-container--open .select2-search__field').fill(term)
  const option = page
    .locator('.select2-container--open .select2-results__option', { hasText: term })
    .first()
  await option.waitFor({ timeout: AUTOCOMPLETE_TIMEOUT })
  await option.click()
}

/**
 * The selected option labels of a (possibly multiple) autocomplete, read from the
 * backing `<select>` — its selected `<option>`s stay in the DOM, so reading them
 * needs no select2 interaction.
 */
async function readSelected(page: Page, id: string): Promise<string> {
  const labels = await page.locator(`#${id} option:checked`).allTextContents()
  return labels.map(l => l.trim()).join(', ')
}

/** A plain `<input>`/`<textarea>` field: fill a fresh value, read it back. */
function textField(id: string, value: () => string): PublicationField {
  return {
    prepare: async () => value(),
    apply: async (page, v) => {
      await page.locator(`#${id}`).fill(v)
    },
    read: page => page.locator(`#${id}`).inputValue(),
  }
}

/** A raw-id organisatie field (publisher/verantwoordelijke): holds the admin PK. */
function organisationRawId(id: string): PublicationField {
  return {
    prepare: async ({ page, organisations }) => organisationPk(page, await organisations.add()),
    apply: async (page, pk) => {
      await page.locator(`#${id}`).fill(pk)
    },
    read: page => page.locator(`#${id}`).inputValue(),
  }
}

/**
 * Feature-file field label → how to edit and verify it. The labels are the ones
 * the Examples table of `publicaties.feature` uses.
 *
 * Deliberately absent: `registratiedatum`, `gepubliceerd op`, `ingetrokken op`
 * and `laatst gewijzigd datum` are in `PublicationAdmin.readonly_fields` — the
 * admin offers no way to edit them, so `datum begin geldigheid` covers the
 * "date fields" row of the manual matrix instead.
 */
export const PUBLICATION_FIELDS: Record<string, PublicationField> = {
  'informatiecategorieën': {
    prepare: ({ categories }) => categories.add(),
    apply: (page, naam) => pickAutocomplete(page, 'informatie_categorieen', naam),
    read: page => readSelected(page, 'id_informatie_categorieen'),
  },
  'onderwerpen': {
    prepare: ({ topics }) => topics.add(),
    apply: (page, titel) => pickAutocomplete(page, 'onderwerpen', titel),
    read: page => readSelected(page, 'id_onderwerpen'),
  },
  // `OrganisationUnitAdmin.search_fields` is `("identifier",)`, so the
  // autocomplete matches on the identifier — which the option label
  // (`naam - (identifier)`) contains too, so it doubles as the expected value.
  'eigenaar (groep)': {
    prepare: ({ ownerGroups }) => ownerGroups.add(),
    apply: (page, identifier) => pickAutocomplete(page, 'eigenaar_groep', identifier),
    read: page => readSelected(page, 'id_eigenaar_groep'),
  },
  'publisher': organisationRawId('id_publisher'),
  'verantwoordelijke organisatie': organisationRawId('id_verantwoordelijke'),
  'verkorte titel': textField('id_verkorte_titel', () => `E2E verkort ${Date.now()}`),
  'bewaartermijn': textField('id_bron_bewaartermijn', () => `E2E selectielijst ${Date.now()}`),
  // The admin runs in Dutch, so its date inputs both accept and render
  // `dd-mm-yyyy` (`DATE_INPUT_FORMATS[0]` for the `nl` locale) — which keeps the
  // written and the read-back value identical.
  'datum begin geldigheid': textField('id_datum_begin_geldigheid', () => '15-01-2026'),
  // Kenmerken are a `PublicationIdentifier` inline with `extra = 0`, so an
  // existing publicatie without identifiers renders no empty row to fill.
  'kenmerken': {
    prepare: async () => `E2E kenmerk ${Date.now()}`,
    apply: async (page, kenmerk) => {
      const first = page.locator('#id_publicationidentifier_set-0-kenmerk')
      if ((await first.count()) === 0)
        await page.locator('#publicationidentifier_set-group .add-row a').click()
      await first.fill(kenmerk)
      // `bron` has no blank=True, so the inline row is only valid with both.
      await page.locator('#id_publicationidentifier_set-0-bron').fill('E2E bron')
    },
    read: page => page.locator('#id_publicationidentifier_set-0-kenmerk').inputValue(),
  },
}

/** The field spec for a feature-file label; throws on an unknown label. */
export function publicationField(label: string): PublicationField {
  const field = PUBLICATION_FIELDS[label]
  if (!field)
    throw new Error(`No publicatie field mapping for "${label}" (see support/publication-fields.ts)`)
  return field
}
