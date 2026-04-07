@report-generation
Feature: Report Content and Export Validation

  Background:
    Given a completed interview session with weak answers and generated reports
    And I am logged in as an "analyst"

  @structure
  Scenario: All report types are generated with correct structure
    When I navigate to the Reports page
    Then I should see gap analysis reports for all 5 broad areas
    And I should see a consolidated report
    And each report should have status "ready"

  @content
  Scenario: Gap analysis reports contain required sections
    When I navigate to the Reports page
    And I open a gap analysis report
    Then it should contain a gap inventory section
    And it should contain a roadmap with phases and dependencies
    And it should contain recommendations
    And it should contain maturity level assessment
    And it should contain quick wins section

  @export
  Scenario: Reports can be exported to PDF
    When I navigate to the Reports page
    And I click export on a gap analysis report
    Then a PDF download should be triggered

  @filtering
  Scenario: Reports page supports filtering
    When I navigate to the Reports page
    And I filter by report type "gap_analysis"
    Then only gap analysis reports should be shown
    When I filter by broad area "Procure-to-Pay"
    Then only P2P reports should be shown
