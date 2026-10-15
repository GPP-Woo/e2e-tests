# Concurrent-upload probe — 2 users.
#
# Two DISTINCT, already-provisioned accounts (admin + regular — see
# `_core/roles.ts`) each create and publish their own publicatie with an
# uploaded document AT THE SAME TIME, on two separate Playwright workers. This
# is the smallest concurrency step beyond the single-admin-driven TS6/TS7
# scenarios in publicaties.feature: those all run on one shared account and are
# tagged `@mode:serial`, so they never exercise two real sessions uploading
# together. This feature deliberately carries no `@mode:serial` — the whole
# point is for both scenarios to run in parallel.
#
# Each scenario creates its own gebruikersgroep/organisatie/informatiecategorie
# (unique per worker — see `_core/resource-manager.ts` freshName()) and its own
# publicatie titel, so the two scenarios cannot collide on shared rows. The
# `@admin`/`@regular` tags select which pre-authenticated session the SPA runs
# on (`_core/roles.ts`); "the signed-in user is authorised to upload and
# publish" additionally adds THAT session's real identity (read from
# `/api/me`) as a member of the seeded gebruikersgroep — authProfile's default
# only ever authorises the admin account, which is not enough for a scenario
# that signs in as the regular user and publishes under their own name.
#
# @chromium-only — the SPA publish flow is only exercised on Chromium (same
# constraint as publicaties.feature); run with at least 2 workers so the two
# scenarios actually execute concurrently (CI default: 2, local default: 4 —
# see playwright.config.ts).
#
# All Django-admin work (seeding the organisatie, reading the publicatiestatus
# back) runs through a DEDICATED admin-authenticated page opened in the step
# file — never the scenario's own `page`. `@regular`'s own `page` only ever
# signs into the GPP-app (see `_core/roles.ts`/`setup/auth.setup.ts`); it has no
# session on the publicatiebank Django admin, so any admin-UI helper that took
# the scenario `page` directly (as the TS6/7 steps do) would hit the admin's
# login form and hang. The regular user's own `page` is used for exactly one
# thing: signing into and driving the gpp-app SPA.
@concurrent-upload @chromium-only @timeout:120000
Feature: Twee gebruikers uploaden tegelijk een document

  @admin
  Scenario: Admin uploads a document to a new publicatie
    Given the signed-in user is authorised to upload and publish
    When I upload a document and publish the publicatie
    Then the publicatie shows as gepubliceerd in the admin

  @regular
  Scenario: A regular user uploads a document to a new publicatie
    Given the signed-in user is authorised to upload and publish
    When I upload a document and publish the publicatie
    Then the publicatie shows as gepubliceerd in the admin
