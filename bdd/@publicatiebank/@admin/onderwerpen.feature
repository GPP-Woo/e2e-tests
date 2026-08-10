# Testscript 3 — Configureren van onderwerpen.
#
# A functioneel-beheerder manages onderwerpen (topics) in the GPP-publicatiebank
# admin: adding one (with its mandatory afbeelding), promoting it, editing it and
# deleting it. UI *mutations* run through the Dutch Django-admin with plain
# Playwright locators; the mandatory image on the add form is set directly on the
# <input type=file>, since a file-picker cannot be driven any other way.
#
# Assertions read the admin back through the same session-authenticated `page`
# (the token API is unreliable while an admin session mutates the same server —
# see README "Known server flake").
#
# Test-owned data: each scenario's onderwerp is deleted again by the `topics`
# fixture (bdd/fixture.ts) in teardown, deterministically via the admin (the
# onderwerpen API is read-only). Test onderwerpen are created as `concept`, so
# they never surface publicly on the burgerportaal. Names are unique per worker.

# @timeout — admin round-trips plus the changelist polling can exceed the 30s
# default on a loaded stack.
@chromium-only @mode:serial @timeout:120000
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

  Scenario: Sort the onderwerpen alphabetically
    Given an onderwerp
    When I sort the onderwerpen list by titel
    Then the onderwerpen are listed in alphabetical order by titel

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

  Scenario: The onderwerp edit is shown in the logs
    Given an onderwerp
    When I change the onderwerp omschrijving and save it
    And I open the "Toon logs" view for the onderwerp
    Then the omschrijving edit is recorded in the onderwerp logs 

  Scenario: The onderwerp deletion is recorded in the audit log
    Given an onderwerp
    When I delete the onderwerp through the admin
    And I open the onderwerp audit log
    Then the onderwerp deletion is recorded in the audit log
