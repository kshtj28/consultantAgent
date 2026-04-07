@deficiency-detection @mixed-answers
Feature: Banking Interview with Mixed Answers Differentiates Process Maturity
  As a process consultant
  I want to conduct a deep interview with varying process maturity across areas
  So that the system correctly identifies which areas are deficient and which are strong

  Background:
    Given I am logged in as an "analyst"
    And the domain is set to "Banking"

  @interview-flow
  Scenario: Complete deep interview with mixed answers
    When I start a new interview with depth "deep" and all broad areas selected
    And I answer O2C questions using the "weak" strategy
    And I answer P2P questions using the "weak" strategy
    And I answer R2R questions using the "strong" strategy
    And I answer Treasury questions using the "weak" strategy
    And I answer Compliance questions using the "strong" strategy
    Then all 18 sub-areas should reach "covered" status
    And the session should auto-complete

  @report-generation
  Scenario: Reports differentiate between strong and weak broad areas
    Given a completed interview session with mixed answers
    When the data pipeline finishes processing
    Then O2C report should show high gap severity
    And P2P report should show high gap severity
    And R2R report should show low gap severity with few gaps
    And Treasury report should show high gap severity
    And Compliance report should show low gap severity with few gaps
