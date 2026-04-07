@metrics-comparison
Feature: Cross-Scenario Metrics Comparison
  As a QA engineer
  I want to compare metrics between weak-only and mixed interview sessions
  So that I can verify the system correctly differentiates deficiency levels

  @directional
  Scenario: Weak-answer session produces worse metrics than mixed-answer session
    Given a completed "weak" interview session with reports
    And a completed "mixed" interview session with reports
    Then the weak session should have more total gaps than the mixed session
    And the weak session should have lower overall maturity than the mixed session
    And the weak session should have higher "high severity" gap count
    And the weak session should have a lower automation quotient
    And the mixed session R2R maturity should be higher than its O2C maturity
