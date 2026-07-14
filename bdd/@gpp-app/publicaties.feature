# Testscripts 6 & 7 — Creëren / wijzigen / intrekken van een publicatie (eindgebruiker).
#
# PARKED / BLOCKED — not runnable as the test stack is provisioned. Creating or
# editing a publicatie in the GPP-app requires the signed-in user to be a member
# of a gebruikersgroep that is authorised for at least one organisatie and
# informatiecategorie (the "profiel" a publicatie is made under). On this stack
# `/api/mijn-gebruikersgroepen` returns `[]` for every available account (incl.
# the admin), so "Nieuwe publicatie" shows "Er is iets misgegaan bij het ophalen
# van de gegevens" and renders no form — there is nothing to drive. (All backing
# API calls return 200; the blocker is missing authorised-group membership, not a
# server error.) Documents would be blocked regardless (no Documents API — see
# PLAN-plateau4-remaining.md).
#
# To unblock: give a test account membership of a gebruikersgroep authorised for
# an organisatie + informatiecategorie (extend TS5: create group → "Gebruiker
# toevoegen" → authorise org/categorie). Then implement create/edit/withdraw via
# Stagehand (the SPA hydrates only via click-navigation from the app root — see
# gebruikersgroepen-steps.ts) with "Publicatie zonder documenten" for publishing,
# verifying + cleaning up through the publicatiebank admin (publication.ts).
@blocked @gpp-app
Feature: Publicaties creëren en wijzigen in de GPP-app (geblokkeerd)

  Scenario: Create a publicatie (blocked: no authorised gebruikersgroep membership)
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I create and publish a publicatie through the gpp-app
    Then the publicatie is public on the burgerportaal

  Scenario: Withdraw a publicatie (blocked: no authorised gebruikersgroep membership)
    Given a published publicatie owned by the signed-in user
    When I withdraw the publicatie through the gpp-app
    Then the publicatie is no longer public
