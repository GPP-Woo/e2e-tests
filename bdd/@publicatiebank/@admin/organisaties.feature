# Testscript 4 — Configureren van organisaties.
#
# A functioneel-beheerder manages the organisaties waardelijst in the
# GPP-publicatiebank admin: activating organisations, adding a self-added one,
# renaming it, and deleting it. Every UI *mutation* is driven by an AI agent
# (Stagehand + an OpenRouter model) operating the Dutch Django-admin from
# natural-language intent — no hand-written selectors. Assertions are made
# deterministically by reading the admin back through a separate,
# session-authenticated Playwright browser (the token API is unreliable while
# Stagehand drives the same server — see README "Known server flake").
#
# Test-owned data: each scenario creates the self-added organisatie it needs and
# the `organisations` fixture (bdd/fixture.ts) deletes it again in teardown
# (deterministically, via the admin — the organisatie API has no DELETE). Names
# are unique per worker, so parallel scenarios never collide, and the
# waardelijst reference organisaties are left untouched.
#
# Requires OPENROUTER_API_KEY (else every scenario skips) — see README.
#
# @ai — marks this as a Stagehand scenario (skipped without OPENROUTER_API_KEY).
# Runs on the cheap default (Gemini Flash). If the admin DOM acts prove flaky,
# add @expensive-ai (Claude Sonnet) or pin one model with @model:<openrouter-id>.
# See the README "AI model routing" table.
#
# @mode:serial — like the @beheer feature, the AI DOM operations are more
# reliable one-at-a-time, and it keeps concurrent load off the publicatiebank
# (its user-less-token API path 500s intermittently under parallel load).

# @timeout — each scenario drives several Stagehand act() calls (each an LLM
# round-trip) plus API polling, which comfortably exceeds the 30s default.
@ai @mode:serial @timeout:120000
Feature: Configureren van organisaties
  As a functioneel-beheerder of the GPP-publicatiebank
  I want to activate, add, edit and delete organisaties
  So that end users can publish on behalf of the right organisations

  Background:
    Given the publicatiebank organisatie admin is open

  Scenario: Add a self-added organisatie
    When I add a self-added organisatie through the admin
    Then the organisatie exists in the API and is active

  Scenario: Activate a deactivated organisatie
    Given a self-added organisatie that is not active
    When I tick the "Actief" checkbox and save the organisatie
    Then the organisatie is active in the API

  Scenario: Rename a self-added organisatie
    Given a self-added organisatie
    When I rename the organisatie and save it
    Then the API knows the organisatie under its new name and not the old one

  Scenario: Delete a self-added organisatie
    Given a self-added organisatie
    When I delete the organisatie through the admin
    Then the organisatie no longer exists in the API

  Scenario: Search finds the self-added organisatie
    Given a self-added organisatie
    When I search the admin for the self-added organisatie
    Then the self-added organisatie is shown in the admin results
