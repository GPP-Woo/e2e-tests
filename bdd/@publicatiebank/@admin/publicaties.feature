# Testscript 9 — Wijzigen of verwijderen van een publicatie (beheer).
# UI mutations run through the Django admin via Stagehand (natural language, no
# hand-written selectors). Publicaties are seeded as `concept` and cleaned up
# through the admin (session auth) — NOT the token API, which woo-publications
# 500s on for the whole time Stagehand drives the admin on the same server (the
# user-less-token bug; see README "Known server flake"). Assertions read the
# admin back through the ordinary session-authenticated page.
#
# Documents are out of scope: this stack has no Documents API configured (see
# PLAN-plateau4-remaining.md), so TS9's document sub-steps and all of TS8 are
# parked.
@ai @mode:serial @timeout:120000
Feature: Publicatie beheer in de GPP-publicatiebank
  As functioneel beheer
  I want to correct, publish and withdraw publicaties in the publicatiebank
  So that mistakes made by end users can be fixed

  # No Background opening the admin: each scenario seeds its publicatie first
  # (deterministically, through the admin add form), and the `When` step drives
  # the mutation under test through Stagehand.

  Scenario: Edit the omschrijving of a publicatie
    Given a concept publicatie
    When I change the publicatie omschrijving through the admin
    Then the publicatie has the new omschrijving

  Scenario: Rename a publicatie
    Given a concept publicatie
    When I rename the publicatie through the admin
    Then the publicatie is known under its new titel and not the old one

  Scenario: Withdraw (intrekken) a published publicatie
    Given a published publicatie
    When I set the publicatiestatus to "Ingetrokken" and save the publicatie
    Then the publicatie has status "ingetrokken"

  Scenario: Delete a publicatie through the admin
    Given a concept publicatie
    When I delete the publicatie through the admin
    Then the publicatie no longer exists

  Scenario: Search finds a publicatie
    Given a concept publicatie
    When I search the admin for the publicatie
    Then the publicatie is shown in the admin results
