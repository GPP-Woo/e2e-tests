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

  Scenario: The default statutory information categories are present
    When I filter on "Waardelijst"
    Then all 18 default information categories from the landelijke waardelijst are present

  Scenario: Default and self-added categories coexist in the overview
    When I filter on "Alle"
    Then both the default categories and my self-added category are listed

  Scenario: Add an information category through the UI
    When I add an information category through the admin form
    Then the new information category is listed on the overview

  Scenario: A Waardelijst category exposes only its editable fields
    When I open a Waardelijst information category
    Then only the omschrijving and archivering fields are editable
    And the oorsprong, identificatie and UUID fields are read-only

  Scenario: Fully edit a self-added information category
    When I search for the self-added information category
    And I open the self-added information category
    And I change its omschrijving and save the information category
    Then the updated omschrijving is shown on the change page

  Scenario: The edit is recorded and visible via "Toon logs"
    Given I have changed the omschrijving of the self-added information category
    When I open the "Toon logs" view from the change page
    Then the omschrijving change is listed in the category logs

  Scenario: Delete a self-added category through the UI with confirmation
    When I search for the self-added information category
    And I open the self-added information category
    And I start deleting the information category
    Then a confirmation page lists the consequences of the deletion
    When I confirm the deletion
    Then the information category is no longer listed on the overview

  Scenario: The deletion is recorded in the audit log
    Given I have deleted the self-added information category through the UI
    When I open the "(audit)logitems" via the "Logging" tab
    Then the deletion of the information category is recorded in the audit log

  # Manual TS2: the overview lists a "Toon logs" link per row, distinct from the
  # detail page's own "Toon logs" button (already covered above).
  Scenario: The overview "Toon logs" link opens the self-added category's audit trail
    When I open the "Toon logs" link for the self-added information category from the overview
    Then I see audit log entries for the self-added information category

  # Manual TS2: "Je kunt de logitems: Doorzoeken, Sorteren, Filteren."
  Scenario: The audit logitems can be searched, filtered and sorted
    Given I have deleted the self-added information category through the UI
    When I open the "(audit)logitems" via the "Logging" tab
    And I search the audit log for the self-added information category
    Then only entries mentioning the self-added information category are shown
    When I filter the audit log by the "Record verwijderd" event
    Then every audit log result is a "Record verwijderd" event
    When I filter the audit log by the "Alle" event
    And I sort the audit log by "Datum en tijd"
    Then the audit log order changes
