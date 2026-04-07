@deficiency-detection @weak-answers
Feature: Banking Interview with Weak Answers Detects Deficiencies
  As a process consultant
  I want to conduct a deep interview where the client describes immature processes
  So that the system identifies all deficient areas and generates gap reports

  Background:
    Given I am logged in as an "analyst"
    And the domain is set to "Banking"

  @interview-flow
  Scenario: Complete deep interview with weak answers across all broad areas
    When I start a new interview with depth "deep" and all broad areas selected
    Then I should receive a welcome message and first question
    When I answer all questions using the "weak" answer strategy
    Then all 18 sub-areas should reach "covered" status
    And the session should auto-complete
    And the data pipeline should be triggered

  @coverage-tracking
  Scenario: Coverage progresses correctly during weak-answer interview
    Given a deep interview is in progress with weak answers
    Then each sub-area should transition from "not_started" to "in_progress" to "covered"
    And each broad area should show "covered" only when all its sub-areas are covered
    And the progress sidebar should reflect accurate coverage percentages

  @report-generation
  Scenario: Weak answers generate reports with high gap counts
    Given a completed interview session with weak answers
    When the data pipeline finishes processing
    Then a gap analysis report should exist for each of the 5 broad areas
    And a consolidated report should be generated
    And each report should contain gap inventory, roadmap, and recommendations sections
    And gap severity should skew toward "high" across all broad areas

  @dashboard-metrics
  Scenario: Dashboard reflects low maturity after weak-answer interview
    Given a completed interview session with weak answers and generated reports
    When I navigate to the Dashboard page
    Then the overall maturity scores should be visible
    And gap severity counts should show predominantly "high" severity
    And the automation quotient should be low
    And discovery progress should show "100%"
