# Testscript 11 — Zoeken en raadplegen (burger).
#
# A burger browses the public GPP-burgerportaal. The portal is public and its
# pages are stable, so these scenarios drive it deterministically (no Stagehand /
# no OpenRouter needed) — reading is exactly the kind of verification the suite
# does deterministically. The onderwerp under test is seeded through the
# publicatiebank admin (hence @admin, which authenticates the seed) and cleaned
# up again.
#
# Scope note: the burgerportaal's onderwerpen are served live from the
# publicatiebank, so a freshly published onderwerp is browsable within seconds.
# Full-text SEARCH results and the homepage counters come from woo-search's
# Elasticsearch, whose harvest/index pipeline is a documented environment
# prerequisite that is not active on the test stack (see sitemap.feature) — so we
# assert the search *experience* (the results page opens) but not that freshly
# seeded content is indexed. Documents are out of scope (no Documents API — see
# PLAN-plateau4-remaining.md).
#
# @no-webkit — the burgerportaal SPA never leaves its "wordt geladen…" splash in
# WebKit on this stack (a WebKit-specific boot failure; Chromium and Firefox boot
# it fine), so its steps can never see the search field. Skip on WebKit (see
# bdd/@burgerportaal/zoeken-steps.ts) rather than fail on an app that won't boot.
@admin @mode:serial @timeout:120000 @no-webkit
Feature: Zoeken en raadplegen op het GPP-burgerportaal
  As a burger
  I want to search and browse the public portal
  So that I can find and read openbare onderwerpen and publicaties

  Scenario: The homepage offers full-text search
    Given the burgerportaal homepage is open
    When I search the burgerportaal for "woo"
    Then I land on the search results page

  Scenario: A published onderwerp is browsable on the Onderwerpen page
    Given a promoted, published onderwerp
    When I open the Onderwerpen page on the burgerportaal
    Then the onderwerp is listed with its omschrijving

  Scenario: A published onderwerp can be opened and read
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then its omschrijving is shown
