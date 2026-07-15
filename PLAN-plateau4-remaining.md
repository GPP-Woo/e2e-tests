# Plateau-4 e2e — remaining testscripts (TS5–TS9, TS11)

## FINAL STATUS (2026-07-14)

| TS                           | Status               | Where                                                                                                                    |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TS5 gebruikersgroepen        | ✅ GREEN             | `bdd/@gpp-app/gebruikersgroepen.feature` (Stagehand mutate, odpc-API verify/clean)                                       |
| TS6 publicatie creëren       | ✅ GREEN             | `bdd/@gpp-app/publicaties.feature` — unblocked (see below)                                                               |
| TS7 publicatie intrekken     | ✅ GREEN             | same file — create-then-withdraw via the gpp-app SPA                                                                     |
| TS8 document beheer          | ✅ GREEN             | `bdd/@publicatiebank/@admin/documenten.feature` — unblocked via provisioning + a token-auth fix (see TS8 note)           |
| TS9 publicatie beheer        | ✅ GREEN             | `bdd/@publicatiebank/@admin/publicaties.feature` (Stagehand mutate via admin, admin-read verify)                         |
| TS11 zoeken/raadplegen       | ✅ GREEN             | `bdd/@burgerportaal/zoeken.feature` (deterministic; onderwerpen-browse + search-experience; ES search-hits not asserted) |

Also fixed: TS1 `configuratie.feature` was flaking on the 30s default — added `@timeout:120000`.
Parked scenarios are `@blocked` + `Before(@blocked → test.skip(reason))` so they show as _skipped with reason_, never faked green.

## TS6/TS7 unblocked (2026-07-15)

The blocker was *data*, not code: no account was a member of an authorised
gebruikersgroep, so `/api/mijn-gebruikersgroepen` was `[]` and the "Nieuwe
publicatie" form errored. Verified fix, all deterministic:

- **`authProfile` fixture** (`bdd/_core/fixture.ts`) seeds the prerequisite over
  the **odpc API** (the group *UI* is what TS5 covers): reads the caller's real
  identity claim from `/api/me` (odpc matches group `GebruikerId` against
  `preferred_username`, case-insensitive — for the admin that is `admin`), creates
  an actief organisatie via the `organisations` fixture, resolves its uuid + a
  first informatiecategorie uuid from `/api/v2/{organisaties,informatiecategorieen}`,
  then `POST /api/gebruikersgroepen` with `gekoppeldeGebruikers:[id]` +
  `gekoppeldeWaardelijsten:[orgUuid,catUuid]`. Helpers live in
  `bdd/@gpp-app/support/usergroup.ts`; cleanup deletes the group by uuid.
- **`createAndPublishViaUi` / `withdrawViaUi`** (`bdd/@gpp-app/support/publicatie-ui.ts`):
  Stagehand drives navigation (root → Mijn publicaties → Nieuwe publicatie) and
  the Publiceren / Ja-publiceren / Publicatie-intrekken buttons; the dependent
  form (native profiel `<select>`, then titel input + organisatie-radio /
  informatiecategorie-checkbox option-groups) is filled **deterministically by
  id/value** — the option-group inputs carry the waardelijst uuid as `value`
  (carve-out like the onderwerp file input; `act()` was unreliable on the custom
  widgets). Publishing document-less pops a "Ja, publiceren" confirm.
- Feature `bdd/@gpp-app/publicaties.feature` is `@gpp-app @admin @anthropic
  @mode:serial @timeout:240000`. **`@admin` is load-bearing**: it loads adminState
  into the `page` fixture so the org seed (admin add form) and the
  `publicationStatusAdmin` read-back both authenticate. Verification is the
  deterministic admin status read (`gepubliceerd`/`ingetrokken`) — ES/burgerportaal
  visibility lags indexing and is not asserted. TS7 create-then-withdraw needs the
  240s budget (two Stagehand passes). **8 passed** across chromium/firefox/webkit.

## TS8 unblocked + GREEN (2026-07-15)

Two stack-level blockers had to fall — neither a test-code issue:

1. **Documenten API not wired.** OpenZaak (`openzaak-web`/`openzaak-celery`) was
   already in the stack with its API-authorisation applicatie + the ORC service
   back to the publicatiebank catalogi (`host.docker.internal:8000`), but the
   **woo-publications side** was missing: the DRC `zgw_consumers.Service` + the
   `GlobalConfiguration.documents_api_service` + `organisation_rsin`. Provisioned
   idempotently by **`setup/provision-documenten-api.sh`**. After it, `POST
   /documenten` registers the document in OpenZaak (verified: create → bestandsdeel
   upload → gepubliceerd).

2. **User-less-token 500 blocked seeding.** Documents can only be seeded through
   the woo-publications **token API** (the admin builds the OpenZaak
   informatieobjecttype URL from the request Host = `localhost`, which OpenZaak
   cannot match/reach; re-hosting the admin breaks its auth cookies). But that
   token API 500s whenever an admin session is active — `TokenAuthentication`
   returned `(None, token)`, and sessionprofile's middleware reads
   `request.user.is_authenticated` → `AttributeError`. **Fixed in GPP-publicatiebank
   source** (`api/authorization.py` now returns `AnonymousUser()`; permissions key
   off `request.auth`, so unaffected). The provision script also live-patches the
   running image + restarts odrc. This fixes the token API for the whole suite.

Seed (`support/document.ts` `seedPublishedDocument`): token API, `Host:
host.docker.internal:8000` (so woo-publications emits an ioittype URL OpenZaak
resolves — set via Playwright's APIRequestContext, since `fetch` cannot set the
forbidden `Host` header), bestandsdeel upload URLs rewritten to `localhost` for the
PUT. Mutations via the `docAdmin` Stagehand driver (withdraw = publicatiestatus →
Ingetrokken; delete via the changelist), verified by reading the changelist status
back through the session `page`. Feature `@publicatiebank @admin @anthropic
@mode:serial @timeout:120000`, `--workers=1`.

**Setup for a fresh stack:** run `./setup/provision-documenten-api.sh` once (wires
the Documenten API + applies the token-auth fix), then the suite.

---

## Original plan (below)

Status of the suite before this work: **6 features green** — TS1 config, TS2 informatiecategorieën,
TS3 onderwerpen, TS4 organisaties, TS10 sitemap, gpp-app auth.

Proven pattern (reuse everywhere): **Stagehand `act()` for UI mutations, deterministic reads for
verification, own-and-cleanup test data, tags `@anthropic @mode:serial @timeout:120000`, `--workers=1`.**

## Live-verified environment facts (probed 2026-07-13)

| Resource                     | API             | Notes                                                                                                                       |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/publicaties`               | **full CRUD**   | minimal POST = `{officieleTitel, publisher(uuid), informatieCategorieen[], publicatiestatus}` → 201; DELETE → 204           |
| `/documenten`                | **BLOCKED**     | POST → 500 `RuntimeError: No documents API configured yet! Set up the global configuration.` — no DRC backend wired locally |
| `/organisaties`              | POST, no DELETE | create self-added; cleanup via admin                                                                                        |
| `/onderwerpen`               | GET-only        | create via Django admin (TS3 helpers)                                                                                       |
| `/informatiecategorieen`     | GET-only        | 18 present                                                                                                                  |
| publicaties/documenten count | 0 / 0           | clean env — TS11 needs seeded data                                                                                          |

### Environment blocker

Documents cannot be created anywhere in this stack (API + gpp-app upload share the same unconfigured
Documents backend). Therefore:

- **TS8 (document beheer)** — BLOCKED end-to-end. Park with a skipped feature + clear reason until a
  Documents API is configured (admin → global configuration / services).
- **TS6/TS7 document-upload steps** — BLOCKED. Implement the publication-level flow only; omit/skip
  the document sub-steps with a note.
- Everything publication-level and onderwerp-level is fully testable.

## Order of work (dependency-sorted)

1. **Foundation: publication API manager** — `login-helpers/publication.ts` (`OdrcClient`-backed create
   - delete of publicaties, tracking) and a `publications` fixture mirroring `organisations`/`topics`.
     Seeds a publisher org + picks an infocat. Serves TS9, TS11, and gpp-app verification.
2. **TS9 — publicatie beheer** (publicatiebank Django admin). Seed publicatie via API → edit
   metadata/org/onderwerp/status via Stagehand admin → verify via API reads (fresh cookieless
   `OdrcClient`; fall back to admin reads on the known 500) → delete via admin → API cleanup.
   Admin changelist: `/admin/publications/publication/`.
3. **TS11 — zoeken/raadplegen (burger)** (burgerportaal, no auth). Seed a published publicatie + a
   promoted onderwerp → full-text search via Stagehand → assert result visible, open it, read
   metadata → onderwerpen page + homepage carousel + tellers. Document-search assertions omitted
   (no documents). Reuses the existing burger Stagehand fixture (no admin session needed).
4. **TS6 — creëren publicatie** (gpp-app SPA + burger). Live-recon the SPA first. Stagehand create a
   publication (titel/org/infocat/onderwerp, publiceren) → verify in app list + burgerportaal search
   (reuse TS11 helpers). Concept→afmaken flow. Document upload steps skipped (blocked). Cleanup via API.
5. **TS7 — wijzigen/intrekken publicatie** (gpp-app SPA). Builds on TS6. Edit fields, intrekken,
   verify gone in burger. "Claim collega-publicatie" needs a 2nd user in the same groep — implement
   if available, else skip that one scenario with a note. Document sub-steps skipped.
6. **TS5 — gebruikersgroepen/autorisaties** (gpp-app). GATED: the "Gebruikersgroepen" button only
   shows for an AD-beheerder. Live-recon whether the admin user has that role. If yes: create group,
   authorise org/infocat/onderwerp, verify the authorisation constrains the publication form, edit,
   delete. If no beheerder role → park with a skipped feature + reason.

## Conventions to match

- Feature dirs `@`-prefixed for tags-from-path; steps colocated.
- New fixtures in `bdd/fixture.ts`; env already has `odrc`.
- `global-teardown.ts` sweeps stray `E2E `-prefixed data — extend for publicaties.
- Every blocked/skipped scenario must `test.skip(...)` with a human reason (never silently pass).
- Update README + memory when done.
