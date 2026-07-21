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

  # --- Gaps vs manual TS9 (see matrix rows 174-202) -------------------------
  # All @todo: skipped by the global Before({tags:'@todo'}) hook in
  # _core/todo.steps.ts until the step bodies are implemented.

  # Edit each remaining metadata field, then reopen to confirm it persisted
  # (covers matrix "Edit information categories / publisher / responsible
  # organisation / owner group / subjects / short title / date fields /
  # retention period / characteristics" + "Save and reopen to verify").
  @todo
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
      | registratiedatum              |
      | bewaartermijn                 |
      | kenmerken                     |

  # March 2026 update: the eigenaar (groep) also has a bulk function.
  @todo
  Scenario: Bulk-change the eigenaar (groep) of a publicatie
    Given a concept publicatie
    When I bulk-change the eigenaar groep from the publicatie changelist
    Then the "eigenaar (groep)" persists after reopening the publicatie

  # Audit logging + Burgerportaal visibility after an edit.
  @todo
  Scenario: The audit log records an edit to a publicatie
    Given a concept publicatie
    When I change the publicatie omschrijving through the admin
    Then the audit log shows an edit entry for the publicatie

  @todo
  Scenario: An edited publicatie shows the change in the Burgerportaal
    Given a published publicatie
    When I change the publicatie omschrijving through the admin
    Then the Burgerportaal shows the new omschrijving for the publicatie

  # Explicit concept -> gepubliceerd transition (only allowed status change
  # from concept; reuses the shared status + status-assertion steps).
  @todo
  Scenario: Publish a concept publicatie
    Given a concept publicatie
    When I set the publicatiestatus to "Gepubliceerd" and save the publicatie
    Then the publicatie has status "gepubliceerd"

  # A withdrawn publicatie becomes read-only + the withdrawal is logged.
  @todo
  Scenario: A withdrawn publicatie can no longer be edited
    Given a published publicatie
    When I set the publicatiestatus to "Ingetrokken" and save the publicatie
    Then the publicatie change form is read-only

  @todo
  Scenario: The audit log records the withdrawal of a publicatie
    Given a published publicatie
    When I set the publicatiestatus to "Ingetrokken" and save the publicatie
    Then the audit log shows a withdrawal entry for the publicatie

  # Deletion is logged + disappears from the Burgerportaal.
  @todo
  Scenario: The audit log records the deletion of a publicatie
    Given a concept publicatie
    When I delete the publicatie through the admin
    Then the audit log shows a deletion entry for the publicatie

  @todo
  Scenario: A deleted publicatie is gone from the Burgerportaal
    Given a published publicatie
    When I delete the publicatie through the admin
    Then the Burgerportaal no longer shows the publicatie

  # Find-then-open flow (manual "Find publication": full-text search then open).
  @todo
  Scenario: Open a publicatie found through admin search
    Given a concept publicatie
    When I search the admin for the publicatie and open it
    Then the publicatie change form is shown
