# Testscript 3 — Configureren van onderwerpen.
#
# A functioneel-beheerder manages onderwerpen (topics) in the GPP-publicatiebank
# admin: adding one (with its mandatory afbeelding), promoting it, editing it and
# deleting it. UI *mutations* are driven by an AI agent (Stagehand + an OpenRouter
# model) operating the Dutch Django-admin from natural-language intent — no
# hand-written selectors. The one exception is the mandatory image on the add
# form: a CDP browser cannot drive the OS file-picker, so the file bytes are set
# directly on the <input type=file> (the same carve-out the @beheer feature makes
# for image uploads); every other field is still driven by Stagehand.
#
# Assertions are made deterministically by reading the admin back through a
# separate, session-authenticated Playwright browser (the token API is
# unreliable while Stagehand drives the same server — see README "Known server
# flake").
#
# Test-owned data: each scenario's onderwerp is deleted again by the `topics`
# fixture (bdd/fixture.ts) in teardown, deterministically via the admin (the
# onderwerpen API is read-only). Test onderwerpen are created as `concept`, so
# they never surface publicly on the burgerportaal. Names are unique per worker.
#
# Requires OPENROUTER_API_KEY (else every scenario skips) — see README.

# @timeout — Stagehand act() calls (each an LLM round-trip) plus API polling
# comfortably exceed the 30s default.
@ai @mode:serial @timeout:120000
Feature: Configureren van onderwerpen
  As a functioneel-beheerder of the GPP-publicatiebank
  I want to add, promote, edit and delete onderwerpen
  So that publications can be bundled under locally relevant topics

  Background:
    Given the publicatiebank onderwerp admin is open

  Scenario: Add an onderwerp
    When I add an onderwerp through the admin
    Then the onderwerp exists in the API

  Scenario: Promote an onderwerp
    Given an onderwerp
    When I tick the "Promoot" checkbox and save the onderwerp
    Then the onderwerp is promoted in the API

  # @expensive-ai — the omschrijving edit act flakes on the default model (field
  # left blank); Claude Sonnet applies it reliably.
  @expensive-ai
  Scenario: Edit the omschrijving of an onderwerp
    Given an onderwerp
    When I change the onderwerp omschrijving and save it
    Then the onderwerp has the new omschrijving in the API

  Scenario: Delete an onderwerp
    Given an onderwerp
    When I delete the onderwerp through the admin
    Then the onderwerp no longer exists in the API

  Scenario: Search finds the onderwerp
    Given an onderwerp
    When I search the admin for the onderwerp
    Then the onderwerp is shown in the admin results

  # --- @todo: gaps vs. manual testscript 3 (not yet implemented) --------------

  # Manual step 3d: "Klik op de kolomtitels om te sorteren op alfabetische volgorde."
  @todo
  Scenario: Sort the onderwerpen alphabetically
    Given an onderwerp
    When I sort the onderwerpen list by titel
    Then the onderwerpen are listed in alphabetical order by titel

  # Manual step 3d: "Probeer de filters (rechterzijde)."
  @todo
  Scenario: Filter the onderwerpen in the admin
    Given an onderwerp
    When I filter the onderwerpen list in the admin
    Then only onderwerpen matching the filter remain visible

  # Manual step 4 (3e/5c): cross-application — the onderwerpen must match the
  # onderwerpen shown under a gebruikersgroep in the GPP-app.
  @todo
  Scenario: Onderwerpen match the GPP-app gebruikersgroep
    Given an onderwerp
    When I open a GPP-app gebruikersgroep to compare onderwerpen
    Then the onderwerp appears in the gebruikersgroep onderwerpen in the GPP-app

  # Manual step 8: "Controleer de logging ... knop 'Toon logs'." (after an edit)
  @todo
  Scenario: The onderwerp edit is shown in the logs
    Given an onderwerp
    When I change the onderwerp omschrijving and save it
    And I open the "Toon logs" view for the onderwerp
    Then the omschrijving edit is recorded in the onderwerp logs

  # Manual step 10: "Controleer de logging ... (audit)logitems." (after a delete)
  @todo
  Scenario: The onderwerp deletion is recorded in the audit log
    Given an onderwerp
    When I delete the onderwerp through the admin
    And I open the onderwerp audit log
    Then the onderwerp deletion is recorded in the audit log
