# Testscript 1 — Configureren van het burgerportaal.
#
# A functioneel-beheerder configures the public GPP-burgerportaal through its
# beheer interface (welkomsttekst, video, afbeeldingen, externe links) and a
# burger sees the result on the public site. Here an AI agent (Stagehand driven
# by an OpenRouter model) operates the beheer UI, while assertions are made
# deterministically against the public site: the config API
# (/api/environment/resources), the rendered DOM, and raw image bytes.
#
# Test-owned data: the beheer config is snapshotted before each scenario and
# restored afterwards (bdd/_core/fixture.ts `beheer` fixture), so runs — including
# against shared/production environments — leave the portal exactly as found.
#
# Model routing: this feature runs on the cheap default (Gemini Flash). If DOM
# acts prove flaky, add @expensive-ai (Claude Sonnet) or pin a specific model
# with a @model:<openrouter-id> tag (e.g. @model:openai/gpt-4.1). See
# _core/stagehand.ts and the README "AI model routing" table.
#
# @ai — marks this as a Stagehand scenario: shares the @ai guard (skips without
# OPENROUTER_API_KEY, and chromium-only since Stagehand attaches to Chromium's
# CDP port). See _core/stagehand.ts and the README "AI model routing" table.
#
# @mode:serial — the burgerportaal configuration is a single global resource, so
# these scenarios must not run concurrently (a parallel snapshot/restore would
# race). They run sequentially in one worker; the rest of the suite still runs
# in parallel.
#
# @timeout:120000 — each scenario drives the beheer UI through Stagehand (LLM
# round-trips per act) and then publishes, which comfortably exceeds Playwright's
# 30s default; the other Stagehand features carry the same override.

@ai @mode:serial @timeout:120000
Feature: Configureren van het burgerportaal

  Background:
    Given the burgerportaal beheer interface is open

  Scenario: Welkomsttekst wijzigen
    When I set the welcome text to "E2E welkom"
    And I publish the homepage settings
    Then the public homepage shows the new welcome text

  # The beheer form only accepts a YouTube/Vimeo *embed* URL (see the ?-help in
  # the UI); a plain watch?v= link is rejected.
  Scenario: Promotievideo instellen en weer wissen
    When I set the promotion video URL to "https://www.youtube.com/embed/aqz-KE-bpKQ"
    And I publish the homepage settings
    Then the public homepage has a promotion video
    When I clear the promotion video URL
    And I publish the homepage settings
    Then the public homepage has no promotion video

  Scenario: Logo vervangen
    When I replace the "logo" image
    Then the public "logo" image has changed

  Scenario: Favicon vervangen
    When I replace the "favicon" image
    Then the public "favicon" image has changed

  Scenario: Sfeerfoto vervangen
    When I replace the "image" image
    Then the public "image" image has changed

  Scenario: URL van de hoofd-website van de organisatie wijzigen
    When I set the organisation website URL to "https://e2e.example.org/gemeente"
    And I publish the external links
    Then the public organisation website URL matches

  Scenario: Voettekst-links wijzigen en verwijderen
    When I set the "privacy" footer link to "https://e2e.example.org/privacy"
    And I publish the external links
    Then the public "privacy" footer link matches
    When I remove the "privacy" footer link
    And I publish the external links
    Then the public "privacy" footer link is empty
