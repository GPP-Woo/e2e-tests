# Testscripts 6 & 7 — Creëren / wijzigen / intrekken van een publicatie (eindgebruiker).
#
# An eindgebruiker creates and withdraws a publicatie in the GPP-app. Creating one
# requires the signed-in user to be a member of a gebruikersgroep authorised for an
# organisatie + informatiecategorie (the "profiel"); the `authProfile` fixture
# seeds that prerequisite over the odpc API (the group *UI* is what TS5 covers).
# Plain Playwright locators drive the SPA — root → Mijn publicaties → Nieuwe
# publicatie — and publish "zonder documenten" (this stack has no Documents API;
# documents are TS8). The result is verified by reading the publicatiestatus
# back through the publicatiebank Django admin (session-authenticated, stable): a
# `gepubliceerd` publicatie is what makes it public, and burgerportaal/ES visibility
# lags indexing so it is not asserted here (see README "Known server flake").
# `@admin` loads the admin storage state (adminState) into the ordinary `page`
# fixture: the authorised-group + organisatie seeding and the publicatiestatus
# read-back both go through the session-authenticated publicatiebank admin.
# The withdraw scenario seeds its publicatie through the same (slow) publish
# flow before withdrawing, so the whole feature runs on a 240s budget.
#
# @chromium-only — the SPA publish flow is only exercised on one browser project;
# the scenarios share seeded publicaties and must not run concurrently.
@admin @chromium-only @mode:serial @timeout:240000
Feature: Publicaties creëren en intrekken in de GPP-app

  Scenario: Create a publicatie
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I create and publish a publicatie through the gpp-app
    Then the publicatie is public on the burgerportaal

  Scenario: Withdraw a publicatie
    Given a published publicatie owned by the signed-in user
    When I withdraw the publicatie through the gpp-app
    Then the publicatie is no longer public

  # ==========================================================================
  # --- TS6 gaps: creëren van een publicatie ---
  # Gaps from the manual testscript not covered by the two green scenarios
  # above: onderwerpen selection, automatic document title/date, required-field
  # validation, the save-as-concept flow, and the "Mijn publicaties" list
  # search / filter / sort / open behaviours.
  # ==========================================================================

  Scenario: Select onderwerpen when creating a publicatie
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I select one or more onderwerpen while creating a publicatie
    Then the publicatie is linked to the selected onderwerpen

  Scenario: An uploaded document takes its title and date from the file
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I upload a document to a new publicatie
    Then the document title is derived from the filename
    And the document date is filled in automatically

  Scenario: Publishing with missing required fields shows validation messages
    Given the signed-in user belongs to a gebruikersgroep with several waardelijstwaarden
    When I try to publish a new publicatie with only a titel
    Then the gpp-app shows validation messages for the missing required fields

  Scenario: Save a publicatie as concept via the confirmation dialog
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I save a new publicatie as concept and confirm the concept dialog
    Then I return to the gpp-app homepage
    And the concept publicatie appears in my publicaties list

  Scenario: Reopen a concept publicatie from my publicaties
    Given a concept publicatie owned by the signed-in user
    When I open the concept publicatie from my publicaties list
    Then the concept publicatie opens with its saved details

  Scenario: Search my publicaties by date
    Given a published publicatie owned by the signed-in user
    When I search my publicaties by date
    Then the matching publicatie is shown in my publicaties list

  Scenario: Filter my publicaties by informatiecategorie, onderwerp and status
    Given a published publicatie owned by the signed-in user
    When I filter my publicaties by informatiecategorie, onderwerp and publicatiestatus
    Then only the matching publicaties are shown in my publicaties list

  Scenario: Sort my publicaties by titel
    Given a published publicatie owned by the signed-in user
    When I sort my publicaties by titel
    Then my publicaties are ordered by titel

  Scenario: Sort my publicaties by registratiedatum
    Given a published publicatie owned by the signed-in user
    When I sort my publicaties by registratiedatum
    Then my publicaties are ordered by registratiedatum

  Scenario: Open a publicatie from the search results
    Given a published publicatie owned by the signed-in user
    When I open a publicatie from my publicaties search results
    Then the publicatie opens with its saved details

  # @no-webkit — this scenario searches the burgerportaal SPA, which never
  # boots past its loading splash in WebKit on this stack (see zoeken.feature).
  @no-webkit
  Scenario: A concept publicatie is not visible on the burgerportaal
    Given a concept publicatie owned by the signed-in user
    Then the concept publicatie is not visible on the burgerportaal

  # ==========================================================================
  # --- TS7 gaps: wijzigen of intrekken van een publicatie ---
  # Gaps beyond the green withdraw scenario: opening via "Mijn publicaties",
  # verifying the published state before editing, changing the profiel
  # (gebruikersgroep) business rule, persistence-after-reopen, the withdraw
  # confirmation dialog + withdrawn-state UI, the "Bekijk online" button, and
  # the "Publicaties van collega's" claim flow. Document-level withdraw and
  # colleague claim are implemented.
  # ==========================================================================

  Scenario: Open a published publicatie from Mijn publicaties before editing
    Given a published publicatie owned by the signed-in user
    When I open the publicatie from the Mijn publicaties menu
    Then the publicatie is shown as gepubliceerd before I edit it

  Scenario: Change the profiel (gebruikersgroep) on a publicatie
    Given a published publicatie owned by the signed-in user
    And the signed-in user is authorised for a second gebruikersgroep
    When I change the publicatie profiel to another gebruikersgroep
    Then the publicatie is owned by the newly chosen gebruikersgroep

  Scenario: Reopen an edited publicatie and verify the changes persisted
    Given a published publicatie owned by the signed-in user
    When I edit the titel of the publicatie and save it
    And I reopen the publicatie from my publicaties list
    Then the edited titel of the publicatie has persisted

  # Document withdraw: ODPC→ODRC document list/mutations work once OpenZaak
  # SENDFILE is non-nginx (kind has no X-Accel consumer) and Documenten API is
  # provisioned. Scenario adds a document, withdraws it via "Document intrekken".
  Scenario: A withdrawn document stays withdrawn after reopening
    Given a published publicatie owned by the signed-in user
    When I withdraw a single document on the publicatie and save it
    And I reopen the publicatie from my publicaties list
    Then the withdrawn document is still withdrawn

  # @no-webkit — the popup opens the burgerportaal SPA, which never boots past
  # its loading splash in WebKit on this stack (see zoeken.feature).
  @no-webkit
  Scenario: Open a published publicatie on the burgerportaal via "Bekijk online"
    Given a published publicatie owned by the signed-in user
    When I click the Bekijk online button on the publicatie
    Then the publicatie opens on the burgerportaal

  Scenario: Withdraw a publicatie through the confirmation dialog
    Given a published publicatie owned by the signed-in user
    When I withdraw the publicatie and confirm the intrekken dialog
    Then the publicatie is shown as ingetrokken in my publicaties list
    And the opened publicatie shows the ingetrokken message
    And the Bekijk online button is no longer shown on the publicatie

  Scenario: View a colleague's publicatie owner before claiming it
    Given a published publicatie owned by a colleague in my gebruikersgroep
    When I open a colleague publicatie under the collega publicaties menu and choose a profiel
    Then the current publicatie-eigenaar is shown before I claim it

# Testscript 6: Complete
# Testscript 7: Complete (document-withdraw persistence included).
