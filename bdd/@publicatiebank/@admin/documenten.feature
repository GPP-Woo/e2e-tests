# Testscript 8 — Wijzigen of verwijderen van een document (beheer).
#
# A published document — seeded through the woo-publications token API (see
# support/document.ts; the Documenten API must be provisioned first via
# setup/provision-documenten-api.sh) — is withdrawn / deleted through the Django
# admin via Stagehand act() behind the `docAdmin` fixture (a ready-built
# AdminDriver bound to `adminStagehand`). Assertions read the admin back through
# the ordinary session-authenticated `page` (stable), exactly like the publicatie
# beheer (TS9).
#
# SETUP PREREQUISITE: run `setup/provision-documenten-api.sh` once per fresh stack.
# It wires the Documenten API (so `POST /documenten` registers in OpenZaak) AND
# live-patches ODRC's token auth to return AnonymousUser instead of None — without
# that patch the cookieless token seed 500s in ODRC's sessionprofile middleware
# ('NoneType' has no attribute 'is_authenticated'). A `docker compose down`/`up`
# resets the container to the unpatched image, so re-run the script after it.
#
# The change page is opened deterministically (changelist search → row click via
# the session `page`, see openDocumentAdmin) — the Stagehand act() row-click did
# not reliably land on the *document* change page. Stagehand still drives the
# save / delete mutations.
@ai @mode:serial @timeout:120000
Feature: Document beheer in de GPP-publicatiebank

  Scenario: Withdraw a document
    Given a published document
    When I withdraw the document through the admin
    Then the document is no longer public

  Scenario: Delete a document
    Given a published document
    When I delete the document through the admin
    Then the document no longer exists
