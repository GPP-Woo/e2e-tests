# Live Keycloak logins can hit a used TOTP code when another login for the same
# account (e.g. the auth setup) shares the 30s window; the helper waits a window
# and retries. On WebKit/Firefox the gpp-app nav can also need a reload to
# hydrate (@gpp-app/support/login.ts). Allow extra time for both.
#
# @chromium-only — the live Keycloak redirect targets keycloak.woo-search.local,
# which only resolves in Chromium via the --host-resolver-rules launch arg
# (playwright.config.ts). Firefox/WebKit ignore that flag and cannot reach the
# host, so this feature runs on Chromium only (skip in bdd/@gpp-app/steps.ts).
@timeout:120000 @chromium-only
Feature: GPP-app authentication
  As a GPP-Woo user
  I want to sign in to the GPP-app via my organisation account
  So that I can manage my publications

  Scenario: Sign in as admin via Keycloak
    Given I am on the GPP-app
    When I sign in to the GPP-app as "admin"
    Then I should see my publications

  Scenario: Sign in as a regular user via Keycloak
    Given I am on the GPP-app
    When I sign in to the GPP-app as "regular"
    Then I should see my publications
