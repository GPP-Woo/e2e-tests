# Testscript 5 — Inrichten van gebruikersgroepen en autorisaties.
#
# A functioneel-beheerder manages gebruikersgroepen in the GPP-app. Every UI
# mutation (create / rename / delete) runs through pure Playwright against the
# ordinary session-authenticated admin `page` — no AI-driven DOM operation. The
# result is verified and cleaned up deterministically through the odpc JSON API
# (/api/gebruikersgroepen). The `@admin` tag selects the admin storage state
# (see `_core/roles.ts`); the admin account carries the AD-beheerder role, so
# the "Gebruikersgroepen" section is available and its cookies also
# authenticate the gpp-app.
#
# Scope note: this covers the gebruikersgroep lifecycle (naam). The per-group
# autorisaties (koppeling aan organisaties/informatiecategorieën/onderwerpen)
# depend on the gpp-app loading the woo-publications "waardelijsten", which it
# fetches through the same service token that intermittently 500s under load
# (see README "Known server flake") and are not exposed on the group list API, so
# they are not asserted here.
#
# @no-webkit — the gpp-app SPA never boots in WebKit on this stack: the app
# serves `Content-Security-Policy: upgrade-insecure-requests`, and unlike
# Chromium/Firefox WebKit applies that to http://localhost too, so every asset
# request is upgraded to https and fails the TLS handshake.
@admin @timeout:120000 @no-webkit
Feature: Gebruikersgroepen beheren in de GPP-app
  As functioneel beheer
  I want to create, rename and delete gebruikersgroepen
  So that I can control who may publish on behalf of which organisations

  Scenario: Create a gebruikersgroep
    When I create a gebruikersgroep through the gpp-app
    Then the gebruikersgroep exists

  Scenario: Rename a gebruikersgroep
    Given a gebruikersgroep
    When I rename the gebruikersgroep through the gpp-app
    Then the gebruikersgroep is known under its new name and not the old one

  Scenario: Delete a gebruikersgroep
    Given a gebruikersgroep
    When I delete the gebruikersgroep through the gpp-app
    Then the gebruikersgroep no longer exists

  # 4b (omschrijving), 4c (gebruiker), 4d/4e/4f (autorisaties), 4g (opslaan).
  Scenario: Create a gebruikersgroep with an omschrijving, a gebruiker and autorisaties
    Given waardelijsten to authorise the gebruikersgroep for
    When I create a gebruikersgroep with a naam and omschrijving through the gpp-app
    And I add myself as a gebruiker to the gebruikersgroep
    And I authorise the gebruikersgroep for one or more organisaties
    And I authorise the gebruikersgroep for one or more informatiecategorieën
    And I authorise the gebruikersgroep for one or more onderwerpen
    And I save the gebruikersgroep
    Then the gebruikersgroep exists
    And the gebruikersgroep has the entered omschrijving, gebruiker and autorisaties

  # Step 5 — the autorisaties actually constrain what a publicatie can be made under.
  Scenario: Autorisaties constrain the nieuwe-publicatie flow
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    When I start a nieuwe publicatie in the gpp-app
    Then I can only select the organisatie and informatiecategorie the gebruikersgroep is authorised for

  # 6a-6c (omschrijving) + 6d (andere gebruiker).
  Scenario: Edit a gebruikersgroep omschrijving and add another gebruiker
    Given a gebruikersgroep
    When I change the gebruikersgroep omschrijving through the gpp-app
    And I add another gebruiker to the gebruikersgroep through the gpp-app
    Then the gebruikersgroep has the changed omschrijving and the added gebruiker

  # 6e-6g (wijzig autorisaties) + 6h (controleer conform stap 5).
  Scenario: Modify a gebruikersgroep autorisaties and verify the change
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    When I change the gebruikersgroep autorisaties through the gpp-app
    Then the gebruikersgroep reflects the changed autorisaties
    And a nieuwe publicatie only offers the changed authorised waardelijsten

  # 6i — an existing publicatie stops matching once its group loses the autorisatie.
  Scenario: An existing publicatie is no longer authorised after its group loses a informatiecategorie
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    And an existing publicatie made under that gebruikersgroep
    When I remove the informatiecategorie autorisatie from the gebruikersgroep through the gpp-app
    And I open the existing publicatie for editing in the gpp-app
    Then I see an error telling me to contact the beheerder
