# Plateau-4 e2e — remaining testscripts (TS5–TS9, TS11)

## FINAL STATUS (2026-07-14)

| TS                           | Status               | Where                                                                                                                    |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TS5 gebruikersgroepen        | ✅ GREEN             | `bdd/@gpp-app/gebruikersgroepen.feature` (Stagehand mutate, odpc-API verify/clean)                                       |
| TS6 publicatie creëren       | ⛔ PARKED `@blocked` | `bdd/@gpp-app/publicaties.feature` — no authorised gebruikersgroep membership (`/api/mijn-gebruikersgroepen` = `[]`)     |
| TS7 publicatie wijzig/intrek | ⛔ PARKED `@blocked` | same file — same blocker                                                                                                 |
| TS8 document beheer          | ⛔ PARKED `@blocked` | `bdd/@publicatiebank/@admin/documenten.feature` — no Documents API configured                                            |
| TS9 publicatie beheer        | ✅ GREEN             | `bdd/@publicatiebank/@admin/publicaties.feature` (Stagehand mutate via admin, admin-read verify)                         |
| TS11 zoeken/raadplegen       | ✅ GREEN             | `bdd/@burgerportaal/zoeken.feature` (deterministic; onderwerpen-browse + search-experience; ES search-hits not asserted) |

Also fixed: TS1 `configuratie.feature` was flaking on the 30s default — added `@timeout:120000`.
Full suite: 37 passed + 3 skipped (the @blocked scenarios), `--workers=1`. tsc + eslint clean.
Parked scenarios are `@blocked` + `Before(@blocked → test.skip(reason))` so they show as _skipped with reason_, never faked green.

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
