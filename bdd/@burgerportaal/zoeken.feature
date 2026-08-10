# Testscript 11 — Zoeken en raadplegen (burger).
#
# A burger browses the public GPP-burgerportaal. The portal is public and its
# pages are stable, so these scenarios drive it deterministically (no Stagehand /
# no OpenRouter needed) — reading is exactly the kind of verification the suite
# does deterministically. The onderwerp under test is seeded through the
# publicatiebank admin (hence @admin, which authenticates the seed) and cleaned
# up again.
#
# Scope note: the burgerportaal's onderwerpen are served live from the
# publicatiebank, so a freshly published onderwerp is browsable within seconds.
# Full-text SEARCH results and the homepage counters come from woo-search's
# Elasticsearch, whose harvest/index pipeline is a documented environment
# prerequisite that is not active on the test stack (see sitemap.feature) — so we
# assert the search *experience* (the results page opens) but not that freshly
# seeded content is indexed. Documents are out of scope (no Documents API — see
# PLAN-plateau4-remaining.md).
#
# @no-webkit — the burgerportaal SPA never leaves its "wordt geladen…" splash in
# WebKit on this stack (a WebKit-specific boot failure; Chromium and Firefox boot
# it fine), so its steps can never see the search field. Skip on WebKit (see
# bdd/@burgerportaal/zoeken-steps.ts) rather than fail on an app that won't boot.
@admin @mode:serial @timeout:120000 @no-webkit
Feature: Zoeken en raadplegen op het GPP-burgerportaal
  As a burger
  I want to search and browse the public portal
  So that I can find and read openbare onderwerpen and publicaties

  Scenario: The homepage offers full-text search
    Given the burgerportaal homepage is open
    When I search the burgerportaal for "woo"
    Then I land on the search results page

  Scenario: A published onderwerp is browsable on the Onderwerpen page
    Given a promoted, published onderwerp
    When I open the Onderwerpen page on the burgerportaal
    Then the onderwerp is listed with its omschrijving

  Scenario: A published onderwerp can be opened and read
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then its omschrijving is shown

  # --- Homepage (manual step 1) ----------------------------------------------

  # Manual step 1 (UPDATE maart 2026): "Onderaan de homepage is een info-blokje
  # toegevoegd met de aantallen onderwerpen, publicaties en documenten."
  # @blocked: counts come from POST /api/zoeken (woo-search ES facets); on this
  # stack that endpoint 500s and the UI shows "Er zijn geen statistieken
  # beschikbaar..." — asserting numeric counts would fake a pass.
  @blocked
  Scenario: The homepage shows an info block with content counts
    Given the burgerportaal homepage is open
    Then the homepage shows counts of onderwerpen, publicaties and documenten

  # Manual step 1: "Ter info ... De huisstijl (kleuren, fonts), het logo, de
  # video op de homepage" — the configured branding is rendered.
  Scenario: The homepage reflects the organisation branding
    Given the burgerportaal homepage is open
    Then the homepage shows the configured branding

  # --- Full-text search (manual step 2) --------------------------------------

  # Manual step 2: "Je kunt het zoekveld ook leeg laten."
  Scenario: An empty search still opens the results page
    Given the burgerportaal homepage is open
    When I submit an empty burgerportaal search
    Then I land on the search results page

  # Manual step 2: "Boolean operators (AND / OR) worden ondersteund."
  Scenario: Full-text search supports boolean operators
    Given the burgerportaal homepage is open
    When I search the burgerportaal with the boolean query "woo AND besluit"
    Then I land on the search results page

  # Manual step 2: "Gebruik van aanhalingstekens worden ondersteund."
  Scenario: Full-text search supports quoted phrases
    Given the burgerportaal homepage is open
    When I search the burgerportaal for the exact phrase "open overheid"
    Then I land on the search results page

  # Manual step 2: "Prominent op de homepage staat een zoekveld met een knop
  # Zoeken" — submitting via the button, not only Enter.
  Scenario: The Zoeken button submits the search
    Given the burgerportaal homepage is open
    When I search the burgerportaal by clicking the Zoeken button
    Then I land on the search results page

  # Manual step 2: relevance — "gevonden wanneer de zoektermen voorkomen in het
  # bestand". @blocked: needs an active Elasticsearch index with document hits.
  @blocked
  Scenario: A result is found by the contents of its document
    Given the burgerportaal homepage is open
    When I search the burgerportaal for a term in a document's contents
    Then the matching publicatie appears in the search results

  # Manual step 2: relevance — "gevonden wanneer de zoektermen voorkomen in de
  # titel en/of de omschrijving". @blocked: needs an active Elasticsearch index.
  @blocked
  Scenario: A result is found by its titel or omschrijving
    Given the burgerportaal homepage is open
    When I search the burgerportaal for a term in an onderwerp's titel
    Then the matching onderwerp appears in the search results

  # --- Navigating the search results (manual step 3) -------------------------

  # Manual step 3: "De zoekresultaten worden gesorteerd op relevantie (standaard)."
  Scenario: Results are ordered by relevance by default
    Given the burgerportaal search results page is open
    Then the search results are ordered by relevance by default

  # Manual step 3: "De ingevoerde zoektermen kunnen gewijzigd worden."
  Scenario: The search query can be edited on the results page
    Given the burgerportaal search results page is open
    When I edit the search query on the results page
    Then the results page reflects the edited query

  # Manual step 3: "gesorteerd op relevantie (standaard) of chronologisch."
  # @blocked: selecting Chronologisch is UI-only; asserting result date order
  # needs indexed hits (POST /api/zoeken 500s on this stack).
  @blocked
  Scenario: Search results can be sorted chronologically
    Given the burgerportaal search results page is open
    When I sort the search results chronologically
    Then the search results are ordered by date

  # Manual step 3: "gefilterd op datum, type, organisatie en/of informatiecategorie."
  # @blocked: type/org/categorie facets only appear when /api/zoeken returns
  # facet buckets; the endpoint 500s here.
  @blocked
  Scenario: Search results can be filtered
    Given the burgerportaal search results page is open
    When I filter the search results by type
    Then only search results matching the filter remain

  # Manual step 3: "Wanneer een filter geactiveerd wordt, worden de andere filters
  # bijgewerkt. Alleen opties die tot resultaten leiden worden getoond."
  # @blocked: same ES/facets dependency as the filter scenario above.
  @blocked
  Scenario: Activating a filter updates the other filters
    Given the burgerportaal search results page is open
    When I activate a search result filter
    Then the remaining search filters only offer options that yield results

  # Manual step 3: "Er worden max 10 zoekresultaten getoond ... kan gebladerd worden."
  # @blocked: pagination only renders when count > page size; needs indexed hits.
  @blocked
  Scenario: Long result sets are paginated
    Given the burgerportaal search results page is open
    Then the search results are paginated at ten per page

  # --- Inspecting a search result (manual step 4) ----------------------------

  # Manual step 4: "Een zoekresultaat kan aangeklikt worden om te openen.
  # Bovenaan worden de metadata getoond." @blocked: needs an indexed hit.
  @blocked
  Scenario: A search result can be opened and shows its metadata
    Given the burgerportaal search results page is open
    When I open a search result
    Then the opened result shows its metadata

  # Manual step 4: "Als het zoekresultaat een document betreft, dan staat er een
  # download-knop." @blocked: needs an indexed document hit.
  @blocked
  Scenario: A document result offers a download
    Given the burgerportaal search results page is open
    When I open a document search result
    Then the document result offers a download button

  # Manual step 4: "Als het zoekresultaat een document betreft, dan staat onderaan
  # de publicatie waaraan het gekoppeld is." @blocked: needs an indexed document hit.
  @blocked
  Scenario: A document result links to its publicatie
    Given the burgerportaal search results page is open
    When I open a document search result
    Then I can navigate from the document to its publicatie

  # Manual step 4: "Als het zoekresultaat een publicatie betreft, dan staan onderaan
  # de gekoppelde documenten." @blocked: needs an indexed publicatie hit.
  @blocked
  Scenario: A publicatie result lists its coupled documents
    Given the burgerportaal search results page is open
    When I open a publicatie search result
    Then the publicatie result lists its coupled documenten

  # --- Onderwerp detail page (manual step 4f) --------------------------------

  # Manual step 4f: "Als het zoekresultaat een onderwerp betreft, dan wordt een
  # kleine foto / afbeelding getoond."
  Scenario: An opened onderwerp shows its illustration image
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then the onderwerp shows an illustration image

  # Manual step 4f: "worden de overige metadata getoond."
  Scenario: An opened onderwerp shows its metadata
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then the onderwerp metadata is shown

  # Manual step 4f: "worden onderaan de publicaties getoond die eraan gekoppeld zijn."
  # @blocked: the onderwerp detail lists coupled publicaties via SearchGrid →
  # POST /api/zoeken, which 500s without ES; also needs a coupled publicatie seed.
  @blocked
  Scenario: An opened onderwerp lists its coupled publicaties
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then the onderwerp lists its coupled publicaties

  # Manual step 4f: "Deze [publicaties] kunnen doorzocht, gesorteerd en geopend worden."
  Scenario: Publicaties within an onderwerp can be searched and sorted
    Given a promoted, published onderwerp
    When I open that onderwerp on the burgerportaal
    Then I can search and sort the publicaties within the onderwerp

  # --- Onderwerpen page (manual step 5) --------------------------------------

  # Manual step 5: "Van ieder onderwerp wordt ter illustratie een afbeelding getoond."
  Scenario: Each onderwerp on the Onderwerpen page shows an illustration image
    Given a promoted, published onderwerp
    When I open the Onderwerpen page on the burgerportaal
    Then each listed onderwerp shows an illustration image

  # Manual step 5: "Bovenaan worden de gepromote onderwerpen getoond. Daaronder
  # staan alle onderwerpen."
  Scenario: Promoted onderwerpen are shown at the top of the Onderwerpen page
    Given a promoted, published onderwerp
    When I open the Onderwerpen page on the burgerportaal
    Then the promoted onderwerpen are shown at the top of the Onderwerpen page

  # --- Homepage promoted-onderwerpen carousel (manual step 5) ----------------

  # Manual step 5: "Onderaan [de homepage] worden alleen de gepromote onderwerpen
  # getoond. Er worden max drie onderwerpen tegelijkertijd getoond."
  Scenario: The homepage carousel shows at most three promoted onderwerpen
    Given a promoted, published onderwerp
    And the burgerportaal homepage is open
    Then the homepage carousel shows at most three promoted onderwerpen

  # Manual step 5: "Er wordt automatisch door de onderwerpen gebladerd. Het
  # automatisch bladeren kan gepauseerd worden en er kan handmatig gebladerd worden."
  # Needs >3 gepromote onderwerpen so carousel nav/pause controls render.
  Scenario: The homepage carousel auto-scrolls and can be paused
    Given several promoted, published onderwerpen
    And the burgerportaal homepage is open
    When I pause the homepage onderwerpen carousel
    Then I can browse the carousel onderwerpen manually

  # Manual step 5: "Een onderwerp kan aangeklikt en geopend worden (Zie stap 4f)."
  Scenario: A promoted onderwerp can be opened from the homepage carousel
    Given a promoted, published onderwerp
    And the burgerportaal homepage is open
    When I open a promoted onderwerp from the homepage carousel
    Then its omschrijving is shown
