# Testscript 4 — Configureren van organisaties.
#
# A functioneel-beheerder manages the organisaties waardelijst in the
# GPP-publicatiebank admin: activating organisations, adding a self-added one,
# renaming it, and deleting it. Every step runs through pure Playwright against
# the ordinary session-authenticated admin `page` — no AI-driven DOM operation.
#
# Test-owned data: each scenario creates the self-added organisatie it needs and
# the `organisations` fixture (bdd/fixture.ts) deletes it again in teardown
# (deterministically, via the admin — the organisatie API has no DELETE). Names
# are unique per worker, so parallel scenarios never collide, and the
# waardelijst reference organisaties are left untouched.

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

  Scenario: Sort the organisaties alphabetically by name
    When I sort the organisatie changelist by the "Naam" column
    Then the organisaties are listed in alphabetical order by name

  Scenario: Filter the organisaties on active state
    Given a self-added organisatie
    When I filter the organisatie changelist on active organisaties
    Then only active organisaties are shown in the results

  Scenario: Active organisaties match the GPP-app waardelijst
    Given a self-added organisatie
    When I list the active organisaties in the admin
    Then the same organisaties are available in the GPP-app gebruikersgroep waardelijst

  Scenario: Editing a self-added organisatie is logged
    Given a self-added organisatie
    When I rename the organisatie and save it
    And I open the organisatie logs via "Toon logs"
    Then the edit is recorded in the organisatie logs

  Scenario: Deleting a self-added organisatie is audit-logged
    Given a self-added organisatie
    When I delete the organisatie through the admin
    And I open the audit log items
    Then the deletion of the organisatie is recorded in the audit log
