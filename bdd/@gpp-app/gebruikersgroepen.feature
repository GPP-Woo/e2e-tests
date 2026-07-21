# Testscript 5 — Inrichten van gebruikersgroepen en autorisaties.
#
# A functioneel-beheerder manages gebruikersgroepen in the GPP-app. An AI agent
# (Stagehand) performs the UI mutations (create / rename / delete) exactly as a
# beheerder would; the result is verified and cleaned up deterministically
# through the odpc JSON API (/api/gebruikersgroepen). The admin account carries
# the AD-beheerder role, so the "Gebruikersgroepen" section is available.
#
# Scope note: this covers the gebruikersgroep lifecycle (naam). The per-group
# autorisaties (koppeling aan organisaties/informatiecategorieën/onderwerpen)
# depend on the gpp-app loading the woo-publications "waardelijsten", which it
# fetches through the same service token that intermittently 500s under load
# (see README "Known server flake") and are not exposed on the group list API, so
# they are not asserted here.
# @expensive-ai — every scenario is a short Stagehand act and the default model
# flakes on them (create/rename left unapplied); since they run serially, a
# first-scenario flake skips the rest, so the whole feature runs on Claude Sonnet.
@ai @expensive-ai @mode:serial @timeout:120000
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

  # --- Gap coverage (TS5 steps 4b-4g, 5, 6a-6i) — @todo, skipped by the global hook ---

  # 4b (omschrijving), 4c (gebruiker), 4d/4e/4f (autorisaties), 4g (opslaan).
  @todo
  Scenario: Create a gebruikersgroep with an omschrijving, a gebruiker and autorisaties
    When I create a gebruikersgroep with a naam and omschrijving through the gpp-app
    And I add myself as a gebruiker to the gebruikersgroep
    And I authorise the gebruikersgroep for one or more organisaties
    And I authorise the gebruikersgroep for one or more informatiecategorieën
    And I authorise the gebruikersgroep for one or more onderwerpen
    And I save the gebruikersgroep
    Then the gebruikersgroep exists
    And the gebruikersgroep has the entered omschrijving, gebruiker and autorisaties

  # Step 5 — the autorisaties actually constrain what a publicatie can be made under.
  @todo
  Scenario: Autorisaties constrain the nieuwe-publicatie flow
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    When I start a nieuwe publicatie in the gpp-app
    Then I can only select the organisatie and informatiecategorie the gebruikersgroep is authorised for

  # 6a-6c (omschrijving) + 6d (andere gebruiker).
  @todo
  Scenario: Edit a gebruikersgroep omschrijving and add another gebruiker
    Given a gebruikersgroep
    When I change the gebruikersgroep omschrijving through the gpp-app
    And I add another gebruiker to the gebruikersgroep through the gpp-app
    Then the gebruikersgroep has the changed omschrijving and the added gebruiker

  # 6e-6g (wijzig autorisaties) + 6h (controleer conform stap 5).
  @todo
  Scenario: Modify a gebruikersgroep autorisaties and verify the change
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    When I change the gebruikersgroep autorisaties through the gpp-app
    Then the gebruikersgroep reflects the changed autorisaties
    And a nieuwe publicatie only offers the changed authorised waardelijsten

  # 6i — an existing publicatie stops matching once its group loses the autorisatie.
  @todo
  Scenario: An existing publicatie is no longer authorised after its group loses a informatiecategorie
    Given a gebruikersgroep authorised for one organisatie and one informatiecategorie
    And an existing publicatie made under that gebruikersgroep
    When I remove the informatiecategorie autorisatie from the gebruikersgroep through the gpp-app
    And I open the existing publicatie for editing in the gpp-app
    Then I see an error telling me to contact the beheerder
