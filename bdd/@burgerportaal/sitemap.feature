Feature: DiWoo sitemap
  As the landelijke Woo-index harvester
  I want to read the GPP-burgerportaal sitemap anonymously
  So that published documents end up findable on https://open.overheid.nl/

  # The sitemap is public XML: robots.txt -> sitemap index -> one sitemap per
  # year/month -> `<url>` entries with DiWoo metadata. These scenarios read it
  # signed-out (no @admin/@regular tag), exactly like the harvester does, so
  # they run against any environment. They validate the sitemap *structure*
  # everywhere and validate document *metadata* whenever documents are present.
  # Populating documents, change propagation and cache tuning are documented
  # prerequisites (see README "Requirements to run" -> sitemap) — not asserted
  # here because they need the ODRC->index pipeline and the 1-minute cache
  # override that the testscript calls out as a testomgeving pre-set.

  Scenario: robots.txt advertises the sitemap index
    When I fetch the burgerportaal robots.txt
    Then the response status is 200
    And it advertises the DiWoo sitemap index location

  Scenario: The sitemap index is served as valid DiWoo XML
    When I fetch the sitemap index
    Then the response status is 200
    And the response is XML with a sitemaps.org "urlset" root
    And every location it lists is a monthly sitemap URL

  Scenario: The current month's sitemap is served as valid XML
    When I fetch the current month's sitemap
    Then the response status is 200
    And the response is XML with a sitemaps.org "urlset" root

  Scenario: Every document in the current month's sitemap carries DiWoo metadata
    When I fetch the current month's sitemap
    Then every document entry carries the required DiWoo metadata

  # ---------------------------------------------------------------------------
  # Gaps vs manual testscript 10 (matrix rows 209-226). Step bodies are
  # implemented (seed via landelijke publisher + collect/lookup helpers), but
  # they are @blocked on the local stack:
  #   1) SITEMAP_CACHE_DURATION_HOURS=23 — membership/metadata after seed needs
  #      the testomgeving short-cache override + SITEMAP_CACHE_WAIT_MS.
  #   2) ODBP skips zelf_toegevoegd publishers; portable organisations.add()
  #      seeds cannot appear. Landelijke activation is used in steps, but cache
  #      still blocks deterministic assertion without a pod restart.
  # Before({tags:'@blocked'}) skips with reason — never fakes green.

  # --- Document set: what is (and isn't) in the sitemaps (rows 209-212) -------

  @blocked
  Scenario: Every published Publicatiebank document appears in a sitemap
    Given the full list of published documents in the Publicatiebank
    When I collect every document entry across all sitemaps
    Then every published document appears in a sitemap

  @blocked
  Scenario: Concept documents are excluded from the sitemap
    Given a concept document in the Publicatiebank
    When I collect every document entry across all sitemaps
    Then the concept document does not appear in any sitemap

  @blocked
  Scenario: Withdrawn documents are excluded from the sitemap
    Given a withdrawn document in the Publicatiebank
    When I collect every document entry across all sitemaps
    Then the withdrawn document does not appear in any sitemap

  @blocked
  Scenario: Documents of a withdrawn publication are excluded from the sitemap
    Given a document belonging to a withdrawn publication in the Publicatiebank
    When I collect every document entry across all sitemaps
    Then that document does not appear in any sitemap

  # --- Metadata values match the Publicatiebank source (rows 213-220) ---------

  @blocked
  Scenario: The sitemap creatiedatum matches the Publicatiebank
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap creatiedatum matches the Publicatiebank

  @blocked
  Scenario: The sitemap identifiers match the Publicatiebank
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap identifiers match the Publicatiebank

  @blocked
  Scenario: The sitemap publisher matches the publication
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap publisher matches the publication

  @blocked
  Scenario: The sitemap verantwoordelijke matches the publication
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap verantwoordelijke matches the publication's responsible organisation

  @blocked
  Scenario: The sitemap titles and description use the document-level values
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap official title, short title and description match the document-level values

  @blocked
  Scenario: The sitemap information categories match the publication
    Given a published document in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap information categories match the publication

  @blocked
  Scenario: Manually added information categories become "inspanningsverplichting art. 3.1 Woo"
    Given a published document with a manually added information category
    When I look up its document entry in the sitemaps
    Then its manually added category appears as "inspanningsverplichting art. 3.1 Woo"

  @blocked
  Scenario: The sitemap soortHandeling is derived from the document dates
    Given a published document with creation, signing and receipt dates in the Publicatiebank
    When I look up its document entry in the sitemaps
    Then its sitemap soortHandeling is derived from those dates

  # --- Changes in the source propagate to the sitemap (rows 221-226) ----------
  # Prerequisite: the testomgeving 1-minute sitemap cache override +
  # SITEMAP_CACHE_WAIT_MS for the refetch step.

  @blocked
  Scenario: A new publication's documents appear in the sitemap
    Given a new publication with documents created in the GPP-app
    When I refetch the current month's sitemap
    Then its documents appear in the current month's sitemap

  @blocked
  Scenario: Documents added to an existing publication appear in the sitemap
    Given documents added to an existing publication in the GPP-app
    When I refetch the current month's sitemap
    Then the added documents appear in the current month's sitemap

  @blocked
  Scenario: Metadata updates appear in the sitemap
    Given a document whose metadata was changed in the GPP-app
    When I refetch the current month's sitemap
    Then the updated metadata appears in the current month's sitemap

  @blocked
  Scenario: A withdrawn document disappears from the sitemap
    Given a published document that is then withdrawn in the GPP-app
    When I refetch the current month's sitemap
    Then the withdrawn document no longer appears in the current month's sitemap

  @blocked
  Scenario: Withdrawing a publication removes its documents from the sitemap
    Given a published publication that is then withdrawn in the GPP-app
    When I refetch the current month's sitemap
    Then its documents no longer appear in the current month's sitemap

  @blocked
  Scenario: A deleted document disappears from the sitemap
    Given a published document that is then deleted in the Publicatiebank
    When I refetch the current month's sitemap
    Then the deleted document no longer appears in the current month's sitemap
