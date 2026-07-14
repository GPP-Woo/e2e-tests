Feature: Informatiecategorieën management
  As an administrator of the GPP-publicatiebank
  I want to browse, search, filter and sort information categories
  So that I can manage the metadata catalogue

  # Every scenario creates the self-added information category it needs and
  # deletes it again afterwards (see the `categories` fixture). The `waardelijst`
  # reference categories are a documented prerequisite (they cannot be created
  # via the UI/API); their presence is verified during auth setup.
  Background:
    Given I am logged in to the publicatiebank admin
    And I have added a self-added information category
    And I open the "Informatiecategorieën" metadata page

  Scenario: The table headers are visible and clickable
    Then the "Naam" column header is visible and clickable
    And the "Identificatie" column header is visible and clickable
    And the "Oorsprong" column header is visible and clickable

  Scenario: Move information categories through the actions menu
    When I choose "Move" from the "Acties" menu

  Scenario: Search finds the self-added category
    When I search for the self-added information category
    Then I see the self-added information category in the results

  Scenario: Filter by self-added origin lists the category
    When I filter on "Zelf-toegevoegd item"
    Then every result has "Zelf-toegevoegd item" as its origin
    And the self-added information category is listed

  Scenario: Filter by Waardelijst excludes the self-added category
    When I filter on "Waardelijst"
    Then every result has "Waardelijst" as its origin

  Scenario: The "Alle" filter shows both origins
    When I filter on "Alle"
    Then the results contain both "Waardelijst" and "Zelf-toegevoegd item" origins

  Scenario: Open the self-added category detail view
    When I search for the self-added information category
    And I open the self-added information category
    Then I am on its information category change page

  Scenario: Sort information categories by name
    When I sort ascending by the "Naam" column
    Then the information categories are listed alphabetically by name
