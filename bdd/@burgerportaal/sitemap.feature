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
