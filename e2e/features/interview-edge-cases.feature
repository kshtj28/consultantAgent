@edge-cases
Feature: Interview Edge Cases and Error Handling

  @pause-resume
  Scenario: Pause and resume an in-progress interview
    Given I am logged in as an "analyst"
    And the domain is set to "Banking"
    And a deep interview is in progress with 2 broad areas covered
    When I pause the interview session
    Then the data pipeline should trigger for covered areas only
    And partial reports should be generated for covered broad areas
    When I continue the interview by calling next-question on the paused session
    Then the remaining sub-areas should still be available
    And I can continue answering from where I left off

  @incomplete-session
  Scenario: Incomplete interview generates partial reports
    Given I am logged in as an "analyst"
    And the domain is set to "Banking"
    And a deep interview where only P2P sub-areas are fully covered
    When I pause the session
    Then only the P2P gap analysis report should be generated
    And uncovered broad areas should not have reports

  @unauthenticated
  Scenario: Unauthenticated access is blocked
    Given I am not logged in
    When I try to access the dashboard page
    Then I should be redirected to the login page
    When I try to call the interview API without a token
    Then I should receive a 401 response

  @invalid-api
  Scenario: Invalid API requests return proper errors
    Given I am logged in as an "analyst"
    And the domain is set to "Banking"
    When I submit an answer to a non-existent session
    Then I should receive a 404 response
    When I submit an answer with missing required fields
    Then I should receive a 400 response
