@admin
Feature: Admin Flows and Role-Based Access

  @user-management
  Scenario: Admin can manage users
    Given I am logged in as an admin
    When I navigate to User Management
    Then I should see the user list
    When I create a new analyst user
    Then the user should appear in the list

  @audit-logs
  Scenario: Interview actions are logged in audit trail
    Given a completed interview session exists
    And I am logged in as an admin
    When I log in as admin and navigate to Audit Logs
    Then I should see audit entries for interview start, answers, and completion

  @rbac
  Scenario: Role-based access control is enforced
    Given I am logged in as a regular user
    When I try to navigate to User Management
    Then I should not have access to admin pages
    And admin API endpoints should return 403
