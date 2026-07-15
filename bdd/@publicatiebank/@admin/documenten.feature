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
# Runs with `--workers=1`: the token-API seed 500s while any admin session drives
# the same odrc server (the user-less-token flake — see support/odrc.ts), so no
# other feature may drive the admin concurrently.
@publicatiebank @admin @ai @mode:serial @timeout:120000
Feature: Document beheer in de GPP-publicatiebank

  Scenario: Withdraw a document
    Given a published document
    When I withdraw the document through the admin
    Then the document is no longer public

  Scenario: Delete a document
    Given a published document
    When I delete the document through the admin
    Then the document no longer exists
