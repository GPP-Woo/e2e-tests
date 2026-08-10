# Testscript 8 — Wijzigen of verwijderen van een document (beheer).
#
# A published document — seeded through the woo-publications token API (see
# support/document.ts; the Documenten API must be provisioned first via
# setup/provision-documenten-api.sh) — is withdrawn / deleted through the Django
# admin behind the `docAdmin` fixture (a ready-built AdminDriver over the session
# `page`). Assertions read the admin back through that same page, exactly like
# the publicatie beheer (TS9).
#
# SETUP PREREQUISITE: run `setup/provision-documenten-api.sh` once per fresh stack.
# It wires the Documenten API (so `POST /documenten` registers in OpenZaak) AND
# live-patches ODRC's token auth to return AnonymousUser instead of None — without
# that patch the cookieless token seed 500s in ODRC's sessionprofile middleware
# ('NoneType' has no attribute 'is_authenticated'). A `docker compose down`/`up`
# resets the container to the unpatched image, so re-run the script after it.
#
#
# @chromium-only — these scenarios mutate a document shared with the publicatie
# beheer feature on the same stack; only one browser project may drive them.
@chromium-only @mode:serial @timeout:120000
Feature: Document beheer in de GPP-publicatiebank

  Scenario: Withdraw a document
    Given a published document
    When I withdraw the document through the admin
    Then the document is no longer public

  Scenario: Delete a document
    Given a published document
    When I delete the document through the admin
    Then the document no longer exists

  @todo
  Scenario: Search for a document in the admin
    Given a published document
    When I search the admin for the document
    Then the document is shown in the admin results

  @todo
  Scenario: Edit a document's metadata
    Given a published document
    When I edit the document metadata through the admin
    Then the document shows the edited metadata when reopened

  @todo
  Scenario: Edit a document's kenmerken
    Given a published document
    When I edit the document kenmerken through the admin
    Then the document shows the edited kenmerken when reopened

  @todo
  Scenario: View a document's logs
    Given a published document
    When I open the document logs through the admin
    Then the document logs list the document

  @todo
  Scenario: Edited document metadata is visible in the Burgerportaal
    Given a published document
    When I edit the document metadata through the admin
    Then the edited metadata is visible in the Burgerportaal

  @todo
  Scenario: A withdrawn document is read-only
    Given a published document
    When I withdraw the document through the admin
    Then the document can no longer be edited

  @todo
  Scenario: Withdrawing a document is recorded in the audit log
    Given a published document
    When I withdraw the document through the admin
    Then the withdrawal is recorded in the audit log

  @todo
  Scenario: A withdrawn document disappears from the Burgerportaal
    Given a published document
    When I withdraw the document through the admin
    Then the document is no longer visible in the Burgerportaal

  @todo
  Scenario: Deleting a document is recorded in the audit log
    Given a published document
    When I delete the document through the admin
    Then the deletion is recorded in the audit log

  @todo
  Scenario: Edit a document from within its publication
    Given a published document
    When I edit the document from within its publication through the admin
    Then the document shows the edited metadata when reopened

  @todo
  Scenario: Delete a document from within its publication
    Given a published document
    When I delete the document from within its publication through the admin
    Then the document no longer exists
