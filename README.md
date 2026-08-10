# End to end tests for GPP-WOO

We will work on end to end tests for the different GPP-WOO components here.

Please use vscode and install the recommended extensions.

To run the tests, you will need a `.env` file in the root of this repository. See `.env.example` for an example.

These tests use [**playwright-bdd**](https://vitalets.github.io/playwright-bdd/):
Gherkin `.feature` files run through the Playwright test runner. `bddgen`
generates specs from the features into `.features-gen/` (git-ignored) before
each run — `npm test` does both.

To run the tests, you will need a `.env` file in the root of this repository.
See `.env.example` for an example.

```sh
npm install
npx playwright install --with-deps
npm run test        # bddgen && playwright test
npm run test:ui     # interactive UI mode
```

### Cross-browser

The suite runs on **chromium, firefox and webkit**. Two features are scoped
because of local-environment limits (they still run fully on chromium):

- **`@chromium-only`** — the gpp-app live Keycloak login redirects to
  `keycloak.woo-search.local`, which resolves only in chromium via the
  `--host-resolver-rules` launch arg (a Chrome-only flag; firefox/webkit ignore
  it and cannot reach the host). See `bdd/@gpp-app/authentication.feature`.
- **`@no-webkit`** — the burgerportaal SPA never leaves its loading splash in
  webkit on this stack (a webkit-specific boot failure; chromium and firefox
  boot it fine). See `bdd/@burgerportaal/zoeken.feature`.

Both are enforced by tagged `Before` hooks that `test.skip(...)` with a reason,
so the skips stay visible in the report rather than silently passing. SPA nav
that is merely slow to hydrate on non-chromium engines is handled by
`bdd/@gpp-app/support/hydrate.ts` (`waitForWithReload`, a reload-retry).

## Requirements to run

Setup and teardown use **only the UI and API** so the suite runs against any
environment (local, staging, production) — they never shell into a container.
One thing the UI/API genuinely cannot create must therefore be present already:

- **`waardelijst` reference information categories.** The category API is
  read-only (`GET` only) and the Django admin forces `oorsprong=zelf_toegevoegd`
  on manual adds, so there is no UI/API path to create `waardelijst`-origin
  categories. The target environment must ship them. Real environments already
  do; to seed a fresh **local** stack, run the app's own fixture command inside
  the ODRC (publicatiebank) container:

  ```sh
  docker exec <ODRC_CONTAINER> python src/manage.py \
    load_information_categories \
    src/woo_publications/fixtures/information_categories.json
  ```

  (`<ODRC_CONTAINER>` is typically `gpp-woo-odrc-django-1`.) The command is
  idempotent — fixed UUIDs, safe to re-run.

Their presence is **verified during auth setup**
([`setup/auth.setup.ts`](./setup/auth.setup.ts) →
[`verifyWaardelijstPresent`](./bdd/@publicatiebank/support/information-category.ts)); if they
are missing the run fails immediately with a pointer back here, instead of
producing confusing scenario failures.

### DiWoo sitemap

The `@burgerportaal` sitemap scenarios read the public DiWoo sitemap
anonymously (robots.txt → sitemap index → one sitemap per month → `<url>`
entries), exactly like the landelijke Woo-index harvester. They need:

- **`GPP_BURGERPORTAAL_BASE_URL`** in `.env` (see `.env.example`).
- **The burgerportaal wired to ODRC.** The sitemap reads document data straight
  from the ODRC API, so the burgerportaal must have `ODRC_BASE_URL` +
  `ODRC_API_KEY` configured and that token must have API **read** authorization.
  Without it the sitemap index degrades to empty and the per-month sitemap
  `500`s. (In the local `deploy/` stack this is set on the `odbp` service; the
  token needs the audit headers the burgerportaal already sends.)

The scenarios validate the sitemap **structure** on any environment (they pass
against an empty sitemap) and validate document **metadata** for whatever
documents are present. The parts of testscript 10 that need populated,
published+indexed documents are **not** asserted automatically and remain
manual / future work, because they depend on prerequisites the tests cannot
provision portably:

- **Published document content + metadata sampling** — needs documents created
  through the GPP-app and pushed through the ODRC → index pipeline.
- **Change propagation** (create/modify/withdraw/delete → sitemap updates) and
  the **1-minute cache override** the testscript calls out as a testomgeving
  pre-set (sitemaps are cached ~24h by default).

### Burgerportaal beheer (Testscript 1 — deterministic beheer UI)

The `@beheer` scenarios configure the burgerportaal (welkomsttekst, video, logo,
favicon, sfeerfoto, organisatie-URL, voettekst-links) through its **beheer**
interface and verify the result on the public site. Both halves run through the
ordinary Playwright `page` with locators on the beheer form's Dutch labels
(`#videoUrl`, `getByLabel('URL Privacy-verklaring')`, the CKEditor
contenteditable for the Welkomsttekst). They need:

- The **burgerportaal wired to ODRC** (same as the sitemap, above) and the
  **beheer admin session** — established automatically by `setup/auth.setup.ts`
  (it piggybacks the admin SSO session, so no extra TOTP) and saved to
  `.auth/burgerportaal-admin.json`.

Run them: `npm run test:beheer` (add `--no-deps` to skip auth setup).

**How it stays portable + test-owned.** Assertions go against the public site —
the config API (`/api/environment/resources`), the rendered homepage `<article>`,
and raw image bytes. The `beheer` fixture ([`bdd/_core/fixture.ts`](./bdd/_core/fixture.ts))
snapshots the full config before each scenario and restores it afterwards, so
runs — including against shared/production environments — leave the portal
exactly as found. Image _replacement_ uses the authenticated upload API (the same
endpoint the beheer UI calls), because a browser cannot drive an OS file-picker
dialog.

### AI browser automation (Stagehand + OpenRouter — wired, currently unused)

Every scenario in this suite drives the UI with plain Playwright locators. The
apps under test are a Django admin and two Vue SPAs whose fields carry stable
ids and labelled inputs, so hand-written locators are both cheaper and steadier
than natural-language actions — the AI layer was the source of essentially every
flake it was measured against.

The [**Stagehand**](https://docs.stagehand.dev) plumbing is nevertheless kept
intact and ready, for a future flow where the DOM genuinely is not addressable:

- [`bdd/_core/stagehand.ts`](./bdd/_core/stagehand.ts) — the
  [OpenRouter](https://openrouter.ai) client, the role × tier model table, and
  the CDP attach that makes Stagehand adopt the *same* page Playwright traces.
- The `stagehand` / `adminStagehand` fixtures in
  [`bdd/_core/core-fixtures.ts`](./bdd/_core/core-fixtures.ts). A Playwright
  fixture is only built when a step destructures it, so these cost nothing while
  unused.
- The `@ai` `Before` guard in
  [`bdd/@publicatiebank/@admin/_shared.steps.ts`](./bdd/@publicatiebank/@admin/_shared.steps.ts):
  skips without `OPENROUTER_API_KEY` (so the suite stays green without a model
  key) and off Chromium (Stagehand attaches over CDP, which only Chromium
  exposes — the `--remote-debugging-port` is already open in
  `playwright.config.ts`).

**To use it:** put `OPENROUTER_API_KEY` in `.env` (<https://openrouter.ai/keys>),
tag the scenario `@ai`, take the `stagehand` (or `adminStagehand`) fixture in the
step, and call `act()` / `extract()` / `observe()`.

#### AI model routing (cost control)

Each Stagehand operation maps to a **role**, and each role picks a model by the
scenario's **tier** tag. The table lives in `ROLE_MODELS`; a run routes each call
to its own model automatically — no per-step wiring.

| Role (Stagehand op)            | `@cheap-ai`             | _(no tag)_ — default | `@expensive-ai`     |
| ------------------------------ | ----------------------- | -------------------- | ------------------- |
| **worker** — `act()`           | `gemini-2.5-flash-lite` | `gpt-4o-mini`        | `claude-sonnet-4.5` |
| **verification** — `extract()` | `gemini-2.5-flash-lite` | `gpt-4o-mini`        | `claude-sonnet-4.5` |
| **planner** — `observe()`      | `deepseek-chat` (V3)    | `deepseek-chat` (V3) | `claude-sonnet-4.5` |

Override a specific model when a tier isn't what you want: a
`@model:<openrouter-id>` tag (e.g. `@model:openai/gpt-4.1`) for a whole
scenario, or `stagehand.withModel()` around a single step — the model is
restored after the callback.

```ts
await stagehand.withModel('anthropic/claude-sonnet-4.5', () =>
  stagehand.act('the one flaky action'))
```

Self-check the routing table with
`node --experimental-strip-types checks/stagehand-routing.check.ts`.

### Metadata beheer (Testscripts 3 & 4 — admin UI + admin reads)

The `@publicatiebank/@admin` **organisaties** (Testscript 4) and **onderwerpen**
(Testscript 3) scenarios drive the Dutch Django-admin UI for every _mutation_
(add / activate / promote / rename / edit / delete / search) and assert by
**reading the admin back through the same session-authenticated `page`**, whose
reads are stable (unlike the token API — see the flake note below).

The shared changelist script (search a row, open it, save, delete-with-confirm)
lives once in [`support/admin-resource.ts`](./bdd/@publicatiebank/support/admin-resource.ts);
[`support/admin-driver.ts`](./bdd/@publicatiebank/support/admin-driver.ts) binds
it to a noun and is handed to steps as the `topicAdmin` / `pubAdmin` / `docAdmin`
fixtures. Bespoke per-field work (a select2, an inline formset) stays in the step.

The [`OdrcClient`](./bdd/@publicatiebank/support/odrc.ts) (token + `Audit-*` headers,
`ODRC_BASE_URL`/`ODRC_API_KEY` from `.env`) is **not** used to verify these two
features — see the flake note — but is the foundation for the upcoming
publicatie/document scenarios, whose resources expose full create/delete.

**Carve-outs, honestly.** Reality forced two:

- **Onderwerp afbeelding upload.** The add form requires an image and a browser
  cannot drive an OS file-picker, so the file bytes are set straight on the
  `<input type=file>` (same carve-out `@beheer` makes for images).
- **Cleanup is deterministic.** The organisatie API has no `DELETE` and the
  onderwerp API is `GET`-only, so the `organisations`/`topics` fixtures
  ([`bdd/_core/fixture.ts`](./bdd/_core/fixture.ts)) delete their rows through the admin, and
  `globalTeardown` sweeps stray `E2E `-prefixed rows of both kinds.

**Known server flake (worked around).** The publicatiebank token authenticates
as a _user-less_ token, and woo-publications' `SessionProfileMiddleware`
dereferences a `None` user (500 `AttributeError`) whenever a token API request
runs while an admin session is active on the _same_ server — exactly the case
here, because these scenarios drive that admin. So they **verify by reading the
admin back through the session-authenticated `page`** (reads authenticate as a
real user, so they never hit the `None`-user path) rather than through the token
API. `@mode:serial` (and running these `--workers=1`) keeps concurrent load down.
This is a server-side bug, not a test bug. The same lesson applies to
**Testscript 9** below: under a real run the token API 500s _persistently_ while
an admin session is open, so publicaties are seeded, verified and cleaned up
through the admin UI too — never the token API.

### Publicatie beheer (Testscript 9 — admin UI + admin reads)

`@publicatiebank/@admin` **publicaties** (`publicaties.feature`) mirror
Testscripts 3 & 4: the Django-admin mutations (edit omschrijving, rename,
withdraw, delete, search) verified by reading the admin back through the same
`page`. Publicaties are seeded through the admin add form (a `concept` needs only
a titel; the withdraw scenario seeds a `gepubliceerd` one — publisher is a raw-id
field filled with the org's admin PK, informatiecategorie a select2) and cleaned
up through the admin ([`bdd/@publicatiebank/support/publication.ts`](./bdd/@publicatiebank/support/publication.ts),
`publications` fixture).

### Gebruikersgroepen (Testscript 5 — GPP-app SPA + odpc API)

`@gpp-app` **gebruikersgroepen** (`gebruikersgroepen.feature`): the GPP-app SPA
is driven through the ordinary `page` (create / rename / delete a group);
verification and cleanup go through the odpc JSON API `/api/gebruikersgroepen`
([`bdd/@gpp-app/support/usergroup.ts`](./bdd/@gpp-app/support/usergroup.ts),
`usergroups` fixture). The GPP-app is cookie-authenticated, so the `@admin`
storage state signs it in; the SPA hydrates routes only via click-navigation from
the app root (deep-links render nothing). The admin account carries the
AD-beheerder role.

### Burger zoeken en raadplegen (Testscript 11 — deterministic, public)

`@burgerportaal` **zoeken** (`zoeken.feature`) is read-only against the public
portal, so it runs read-only through the ordinary `page`. It seeds a promoted, published onderwerp (served live from the
publicatiebank, browsable in seconds) and asserts onderwerpen-browsing plus the
search _experience_ (the `/zoeken` results page opens).

### Parked (environment-blocked) — Testscripts 6, 7, 8

These are present as `@blocked` features that **skip with a reason** (visible in
the report — never faked green):

- **Testscript 8** (document beheer, `documenten.feature`) — implemented, seed
  works, but needs **`setup/provision-documenten-api.sh`
  run once per fresh stack** (wires the Documenten API + live-patches ODRC token
  auth to `AnonymousUser`, without which the cookieless token seed 500s in the
  sessionprofile middleware; a `docker compose down`/`up` reverts it — re-run the
  script). See [`support/document.ts`](./bdd/@publicatiebank/support/document.ts).
- **Testscripts 6 & 7** (gpp-app publicatie create / wijzig / intrek,
  `@gpp-app/publicaties.feature`) — no available account is a member of an
  **authorised gebruikersgroep** (`/api/mijn-gebruikersgroepen` = `[]`), so the
  GPP-app "Nieuwe publicatie" form errors and renders nothing to drive. (All
  backing API calls return 200; the blocker is missing membership, not a server
  error.) Unblock by giving a test account membership of a group authorised for an
  organisatie + informatiecategorie, then implement the flow (documents remain
  blocked by the Documents-API gap above).

Search _hit_ indexing and the homepage counters on the burgerportaal are likewise
not asserted anywhere: they come from woo-search's Elasticsearch, whose
harvest/index pipeline is a documented environment prerequisite not active here
(see the sitemap note).

## Test data ownership

Apart from the `waardelijst` prerequisite above, the suite makes and cleans up
all the data it needs — through the UI/API, portable across environments.

- **Self-added categories** — each scenario that needs one creates it through
  the Django admin via the `categories` fixture ([`bdd/_core/fixture.ts`](./bdd/_core/fixture.ts)),
  which deletes everything it created in teardown. Names are unique per worker,
  so parallel scenarios don't interfere.
- **Self-added organisaties & onderwerpen** — the `organisations` / `topics`
  fixtures ([`bdd/_core/fixture.ts`](./bdd/_core/fixture.ts)) create rows through the admin
  and delete them in teardown (unique per worker). See the metadata-beheer
  section above for why these are admin-owned rather than API-owned.
- **Safety net** — `globalTeardown` ([`setup/global-teardown.ts`](./setup/global-teardown.ts))
  drives the admin UI with the saved admin session to sweep any `E2E `-prefixed
  categories, organisaties and onderwerpen left by a hard-killed run, so data
  never accumulates. No container access needed.

The API exposes full create/delete for `publicaties` and `documenten` (unlike
`organisaties`, which has no `DELETE`, and `onderwerpen`, which is `GET`-only),
so future publicatie/document features should own those directly via the
[`OdrcClient`](./bdd/@publicatiebank/support/odrc.ts) following the same create-then-clean-up
pattern.

## Directory structure

The code is organised **vertically**: each GPP-Woo bounded context is a folder
holding its features, steps _and_ its support code (page/API helpers), so code
that changes together lives together. Directories whose name starts with `@`
become [tags-from-path](https://vitalets.github.io/playwright-bdd/#/writing-features/tags-from-path),
so a feature's location determines its tags; folders **without** `@` (`_core/`
and each vertical's `support/`) are plain modules, not tags.

```
bdd/
├── _core/                        # test harness + cross-cutting primitives (not a tag)
│   ├── fixture.ts                # createBdd() + tag-driven storageState + signIn + resource managers
│   ├── types.ts                  # zod-parsed ENV (apps + users + odrc)
│   ├── resource-manager.ts       # makeResourceManager() — shared own-and-cleanup lifecycle
│   ├── signIn.ts                 # app-dispatching Keycloak sign-in
│   ├── keycloak.ts               # Keycloak login form + TOTP + SSO-or-redirect race
│   └── stagehand.ts              # Stagehand/OpenRouter wiring (unused — see "AI browser automation")
├── @gpp-app/                     # tag: @gpp-app
│   ├── support/                  # login.ts · usergroup.ts (odpc API) · hydrate.ts
│   ├── authentication.feature
│   ├── steps.ts
│   ├── gebruikersgroepen.feature       # Testscript 5 — SPA + odpc API
│   ├── gebruikersgroepen-steps.ts
│   ├── publicaties.feature             # Testscripts 6 & 7 — PARKED (@blocked)
│   └── publicaties-steps.ts
├── @burgerportaal/               # tag: @burgerportaal (public, signed-out)
│   ├── support/                  # login.ts · beheer-config.ts · sitemap.ts
│   ├── sitemap.feature
│   ├── steps.ts
│   ├── zoeken.feature                  # Testscript 11 — deterministic (no AI)
│   ├── zoeken-steps.ts
│   └── @beheer/                  # tag: @beheer (burgerportaal config UI)
│       ├── configuratie.feature
│       ├── steps.ts
│       └── fixtures/            # test images (logo.svg, favicon.png, sfeerfoto.png)
└── @publicatiebank/              # tag: @publicatiebank
    ├── support/                  # admin-resource.ts · admin-driver.ts · odrc.ts · poll.ts
    │                             #   login.ts · information-category/organisation/topic/publication.ts
    ├── steps.ts
    └── @admin/                   # tag: @admin (in addition to @publicatiebank)
        ├── informatiecategorieen.feature   # deterministic Playwright (no AI)
        ├── organisaties.feature            # Testscript 4 — admin UI + admin reads
        ├── onderwerpen.feature             # Testscript 3 — admin UI + admin reads
        ├── publicaties.feature             # Testscript 9 — admin UI + admin reads
        ├── documenten.feature              # Testscript 8 — PARKED (@blocked)
        ├── steps.ts                        # organisatie steps
        ├── onderwerpen-steps.ts            # onderwerp steps
        ├── publicaties-steps.ts            # publicatie steps
        ├── documenten-steps.ts             # parked-skip steps
        └── fixtures/                       # onderwerp.png (topic afbeelding)

setup/                            # kept out of ./bdd so bddgen ignores it
├── auth.setup.ts                 # signs in once per role -> .auth/*.json; verifies waardelijst
├── paths.ts                      # storage-state file paths
└── global-teardown.ts            # sweeps leftover E2E test data (admin UI + odpc API)
```

A vertical's `support/` code is meant to be imported by that vertical's steps
(and by the composition roots — `_core/fixture.ts`, `_core/signIn.ts`,
`setup/`). `_core/` holds only things genuinely shared across verticals
(Keycloak, the Stagehand plumbing, the ENV parser, the fixture graph); it never
imports _from_ a vertical except in those composition roots.

## Authentication by tag

Sign-in is Keycloak OIDC (+ TOTP). To avoid re-running TOTP for every scenario —
which fails when parallel scenarios share one account and submit the same
one-time code — the `setup` project ([`setup/auth.setup.ts`](./setup/auth.setup.ts))
signs in **once per role** and saves the session to `.auth/*.json`. It runs as a
project dependency before the tests.

**The scenario's tags then select which saved session to restore** (in
[`bdd/_core/fixture.ts`](./bdd/_core/fixture.ts), via the `storageState` fixture keyed on
playwright-bdd's `$tags`):

| Tag         | Restored session      |
| ----------- | --------------------- |
| `@admin`    | `ADMIN_*` (both apps) |
| `@regular`  | `DEFAULT_*` (GPP-app) |
| _(neither)_ | none — signed out     |

The `@beheer` scenarios are a special case: the burgerportaal beheer app is a
separate OIDC client (`odbp`) with its own cookie session, so `@beheer` selects
the saved `.auth/burgerportaal-admin.json` state instead of `@admin`'s (see
[`bdd/_core/roles.ts`](./bdd/_core/roles.ts)).

Because `@admin` comes from the folder name, a feature placed in
`bdd/@publicatiebank/@admin/` runs as admin without any tag in the `.feature`
file. The `Given I am logged in to ...` steps then just navigate — the session
is already present.

> **Don't repeat folder-name tags on the `Feature:` line.** tags-from-path
> already applies every `@`-prefixed path segment, so a feature under
> `bdd/@publicatiebank/@admin/` is `@publicatiebank @admin` automatically —
> writing `@publicatiebank @admin` again on the feature line is redundant noise.
> Only put tags there that the path does **not** give you: `@chromium-only`,
> `@mode:serial`, `@timeout:…`, `@no-webkit`, `@fixme`, `@ai`, or a functional
> `@admin`/`@regular` when the folder isn't already one of those. The GPP-app **authentication** feature is the exception: it
> is untagged (no restored session) and signs in **live** through a step, so it
> actually exercises the login flow. `ENV.users` lives in
> [`bdd/_core/types.ts`](./bdd/_core/types.ts).

```gherkin
Feature: Informatiecategorieën management
  Background:
    Given I am logged in to the publicatiebank admin   # @admin (from path) -> admin user
    And I open the "Informatiecategorieën" metadata page
```

Run a subset by tag:

```sh
npm run test:admin            # bddgen && playwright test --grep @admin
npm run test:gpp-app
npm run test:publicatiebank
npm run test:burgerportaal      # public sitemap; add --no-deps to skip auth setup
npm run test:beheer             # burgerportaal config UI
npx playwright test --grep "@publicatiebank and not @admin"
```
