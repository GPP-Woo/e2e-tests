# Testscript 8 — Wijzigen of verwijderen van een document (beheer).
#
# PARKED / BLOCKED — not runnable on this stack. Documents cannot be created
# anywhere: woo-publications has no Documents API configured, so `/documenten`
# POST (and the gpp-app upload, which shares that backend) return
# 500 "No documents API configured yet! Set up the global configuration."
# (See PLAN-plateau4-remaining.md.) With no documents to edit/withdraw/delete,
# every TS8 step is a no-op, so the scenario is @skip-ped rather than faked green.
#
# To unblock: configure a Documents API (Django admin → global configuration /
# services) so `/documenten` accepts creates, then implement seeding + admin
# mutations mirroring publicaties.feature (TS9).
@blocked @publicatiebank @admin
Feature: Document beheer in de GPP-publicatiebank (geblokkeerd)

  Scenario: Withdraw a document (blocked: no Documents API configured)
    Given the Documents API is configured
    When I withdraw the document through the admin
    Then the document is no longer public
