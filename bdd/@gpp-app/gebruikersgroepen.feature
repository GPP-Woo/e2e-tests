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
