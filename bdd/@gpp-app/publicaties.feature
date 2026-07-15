# Testscripts 6 & 7 — Creëren / wijzigen / intrekken van een publicatie (eindgebruiker).
#
# An eindgebruiker creates and withdraws a publicatie in the GPP-app. Creating one
# requires the signed-in user to be a member of a gebruikersgroep authorised for an
# organisatie + informatiecategorie (the "profiel"); the `authProfile` fixture
# seeds that prerequisite over the odpc API (the group *UI* is what TS5 covers).
# Stagehand `act()` drives the SPA — root → Mijn publicaties → Nieuwe publicatie —
# and publishes "zonder documenten" (this stack has no Documents API; documents are
# TS8). The result is verified *deterministically* by reading the publicatiestatus
# back through the publicatiebank Django admin (session-authenticated, stable): a
# `gepubliceerd` publicatie is what makes it public, and burgerportaal/ES visibility
# lags indexing so it is not asserted here (see README "Known server flake").
# `@admin` loads the admin storage state (adminState) into the ordinary `page`
# fixture: the authorised-group + organisatie seeding and the publicatiestatus
# read-back both go through the session-authenticated publicatiebank admin.
# The withdraw scenario seeds its publicatie through the same (slow) Stagehand
# publish flow before withdrawing, so the whole feature runs on a 240s budget.
@gpp-app @admin @anthropic @mode:serial @timeout:240000
Feature: Publicaties creëren en intrekken in de GPP-app

  Scenario: Create a publicatie
    Given the signed-in user belongs to an authorised gebruikersgroep
    When I create and publish a publicatie through the gpp-app
    Then the publicatie is public on the burgerportaal

  Scenario: Withdraw a publicatie
    Given a published publicatie owned by the signed-in user
    When I withdraw the publicatie through the gpp-app
    Then the publicatie is no longer public
