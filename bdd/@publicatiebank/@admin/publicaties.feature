# Testscript 9 — Wijzigen of verwijderen van een publicatie (beheer).
# Everything here — the mutations as well as the assertions — runs through the
# Django admin on the ordinary session-authenticated page. Unlike the other
# @admin features this one uses no Stagehand: these are plain admin forms with
# stable ids, so natural-language act() added flakiness without adding coverage
# (see the step file's header for what it actually cost). Publicaties are seeded
# as `concept` and cleaned up through the admin (session auth) — NOT the token
# API, which woo-publications 500s on while an admin session is active (the
# user-less-token bug; see README "Known server flake").
#
# Documents are out of scope: this stack has no Documents API configured (see
# PLAN-plateau4-remaining.md), so TS9's document sub-steps and all of TS8 are
# parked.
@chromium-only @mode:serial @timeout:120000
Feature: Publicatie beheer in de GPP-publicatiebank
  As functioneel beheer
  I want to correct, publish and withdraw publicaties in the publicatiebank
  So that mistakes made by end users can be fixed

  # No Background opening the admin: each scenario seeds its publicatie first
  # (through the admin add form), and the `When` step performs the mutation
  # under test on the change form.

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

  # --- Gaps vs manual TS9 (see matrix rows 174-202) -------------------------

  # Edit each remaining metadata field, then reopen to confirm it persisted
  # (covers matrix "Edit information categories / publisher / responsible
  # organisation / owner group / subjects / short title / date fields /
  # retention period / characteristics" + "Save and reopen to verify").
  #
  # `registratiedatum` is not in the table: it — like gepubliceerd op,
  # ingetrokken op and laatst gewijzigd datum — is in the admin's
  # readonly_fields, so there is no edit to test. `datum begin geldigheid`
  # covers the matrix's "date fields" instead.
  Scenario Outline: Edit the <field> of a publicatie and verify it persists
    Given a concept publicatie
    When I change the "<field>" of the publicatie through the admin
    Then the "<field>" persists after reopening the publicatie

    Examples:
      | field                         |
      | informatiecategorieën         |
      | publisher                     |
      | verantwoordelijke organisatie |
      | eigenaar (groep)              |
      | onderwerpen                   |
      | verkorte titel                |
      | datum begin geldigheid        |
      | bewaartermijn                 |
      | kenmerken                     |

  # March 2026 update: the eigenaar (groep) also has a bulk function.
  Scenario: Bulk-change the eigenaar (groep) of a publicatie
    Given a concept publicatie
    When I bulk-change the eigenaar groep from the publicatie changelist
    Then the "eigenaar (groep)" persists after reopening the publicatie

  # Audit logging + Burgerportaal visibility after an edit.
  Scenario: The audit log records an edit to a publicatie
    Given a concept publicatie
    When I change the publicatie omschrijving through the admin
    Then the audit log shows an edit entry for the publicatie

  Scenario: An edited publicatie shows the change in the Burgerportaal
    Given a published publicatie
    When I change the publicatie omschrijving through the admin
    Then the Burgerportaal shows the new omschrijving for the publicatie

  # Explicit concept -> gepubliceerd transition (only allowed status change from
  # concept; reuses the shared status + status-assertion steps). Publishing
  # enforces a publisher and an informatiecategorie, so the concept is seeded
  # with both — otherwise the save is rejected instead of publishing.
  Scenario: Publish a concept publicatie
    Given a concept publicatie with a publisher and informatiecategorie
    When I set the publicatiestatus to "Gepubliceerd" and save the publicatie
    Then the publicatie has status "gepubliceerd"

  # A withdrawn publicatie becomes read-only + the withdrawal is logged.
  Scenario: A withdrawn publicatie can no longer be edited
    Given a published publicatie
    When I set the publicatiestatus to "Ingetrokken" and save the publicatie
    Then the publicatie change form is read-only

  Scenario: The audit log records the withdrawal of a publicatie
    Given a published publicatie
    When I set the publicatiestatus to "Ingetrokken" and save the publicatie
    Then the audit log shows a withdrawal entry for the publicatie

  # Deletion is logged + disappears from the Burgerportaal.
  Scenario: The audit log records the deletion of a publicatie
    Given a concept publicatie
    When I delete the publicatie through the admin
    Then the audit log shows a deletion entry for the publicatie

  Scenario: A deleted publicatie is gone from the Burgerportaal
    Given a published publicatie
    When I delete the publicatie through the admin
    Then the Burgerportaal no longer shows the publicatie

  # Find-then-open flow (manual "Find publication": full-text search then open).
  Scenario: Open a publicatie found through admin search
    Given a concept publicatie
    When I search the admin for the publicatie and open it
    Then the publicatie change form is shown
