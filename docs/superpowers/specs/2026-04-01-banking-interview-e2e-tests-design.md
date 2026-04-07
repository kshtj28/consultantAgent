# Banking Interview E2E Test Suite — Design Spec

**Date:** 2026-04-01
**Status:** Draft
**Goal:** Validate that ProcessIQ Discovery's end-to-end interview flow correctly identifies deficient processes in a banking firm and produces accurate metrics and reports.

---

## 1. Overview

A BDD-style Playwright test suite that:

1. Conducts two complete deep interviews (8 questions per sub-area) across all 5 banking broad areas (18 sub-areas total)
2. Uses **weak answers** in one session and **mixed answers** (weak + strong per area) in another
3. Validates that the system detects deficiencies, generates gap reports, and produces directionally correct metrics
4. Covers admin flows, RBAC, edge cases (pause/resume, incomplete sessions, auth errors)

### Dependencies

- `playwright-bdd` — compiles Gherkin `.feature` files into Playwright specs
- `@cucumber/cucumber` — peer dependency for step definitions

### Approach

- **BDD with tagged scenarios** — feature files read like business requirements, run subsets via `@tag`
- **Hybrid execution** — interview loop driven via API (speed/reliability), results validated on UI pages
- **Directional assertions** — compare metrics across sessions rather than asserting fixed thresholds

---

## 2. Directory Structure

```
e2e/
├── features/                              # Gherkin feature files
│   ├── interview-weak-answers.feature         @deficiency-detection @weak-answers
│   ├── interview-mixed-answers.feature        @deficiency-detection @mixed-answers
│   ├── interview-comparison.feature           @metrics-comparison
│   ├── interview-edge-cases.feature           @edge-cases
│   ├── admin-flows.feature                    @admin
│   └── reports-validation.feature             @report-generation
├── steps/                                 # Step definitions
│   ├── auth.steps.ts                      # Login/logout/RBAC steps
│   ├── interview.steps.ts                 # Interview flow steps
│   ├── reports.steps.ts                   # Report validation steps
│   ├── dashboard.steps.ts                 # Metrics/dashboard steps
│   └── admin.steps.ts                     # Admin flow steps
├── fixtures/                              # Shared test fixtures
│   ├── test.ts                            # Custom base fixture (auth, API token)
│   ├── answer-strategies.ts               # Weak/mixed/strong answer generators
│   └── api-helpers.ts                     # Direct API call helpers
├── support/
│   └── world.ts                           # BDD world context (shared state)
├── processiq.spec.ts                      # Existing tests (untouched)
└── consultant.spec.ts                     # Existing tests (untouched)
```

---

## 3. Answer Strategies

### 3.1 Weak Answer Strategy

Every answer indicates low maturity (Level 1–2):

| Question Type   | Answer Pattern |
|-----------------|----------------|
| `open_ended`    | "We handle this manually using spreadsheets and email. No formal process or system in place." |
| `single_choice` | Pick the least automated/mature option (keyword match: "manual", "none", "basic"; fallback: first option) |
| `multi_choice`  | Select only 1 option — the least mature one |
| `scale`         | Answer 1 or 2 (out of 5) |
| `yes_no`        | `false` |

### 3.2 Strong Answer Strategy

Every answer indicates high maturity (Level 4–5):

| Question Type   | Answer Pattern |
|-----------------|----------------|
| `open_ended`    | "We use a fully automated system with real-time monitoring, AI-driven analytics, and integrated workflows across all departments." |
| `single_choice` | Pick the most automated/mature option (keyword match: "automated", "AI", "integrated", "real-time"; fallback: last option) |
| `multi_choice`  | Select all options |
| `scale`         | Answer 4 or 5 |
| `yes_no`        | `true` |

### 3.3 Mixed Answer Strategy

Applies weak or strong per broad area:

| Broad Area              | Strategy   | Expected Outcome |
|-------------------------|------------|------------------|
| Order-to-Cash           | **Weak**   | High gaps, low maturity |
| Procure-to-Pay          | **Weak**   | High gaps, low maturity |
| Record-to-Report        | **Strong** | Low gaps, high maturity |
| Treasury & Cash Mgmt    | **Weak**   | High gaps, low maturity |
| Compliance & Controls   | **Strong** | Low gaps, high maturity |

3 broad areas deficient, 2 healthy — creates a clear signal for directional assertions.

---

## 4. Interview Flow Automation

The interview loop runs via direct API calls for speed and reliability:

```
1. POST /interview/start  →  depth: 'deep', all 5 broad areas
2. Loop per sub-area:
   a. GET  /interview/:sessionId/next-question
   b. Apply answer strategy based on question type + broad area
   c. POST /interview/:sessionId/answer
   d. Check response.progress — if sub-area covered, continue to next
3. Session auto-completes when all broad areas covered
4. Pipeline triggers automatically on completion
5. Poll report status until all reports are 'ready' (timeout: 5 min)
6. Navigate to UI pages (Dashboard, Reports, Insights) for final state validation
```

### Coverage Completion Criteria (per sub-area)
- `questionsAnswered >= 2` AND `aiConfident === true` → status becomes `covered`
- Broad area becomes `covered` when ALL its sub-areas are `covered`
- Session auto-completes when ALL selected broad areas are `covered`

---

## 5. Feature Files

### 5.1 `interview-weak-answers.feature` — @deficiency-detection @weak-answers

```gherkin
Feature: Banking Interview with Weak Answers Detects Deficiencies
  As a process consultant
  I want to conduct a deep interview where the client describes immature processes
  So that the system identifies all deficient areas and generates gap reports

  Background:
    Given I am logged in as an analyst
    And the domain is set to "Banking"

  @weak-answers @interview-flow
  Scenario: Complete deep interview with weak answers across all broad areas
    When I start a new interview with depth "deep" and all broad areas selected
    Then I should receive a welcome message and first question
    When I answer all questions using the "weak" answer strategy
    Then all 18 sub-areas should reach "covered" status
    And the session should auto-complete
    And the data pipeline should be triggered

  @weak-answers @coverage-tracking
  Scenario: Coverage progresses correctly during weak-answer interview
    Given a deep interview is in progress with weak answers
    Then each sub-area should transition from "not_started" to "in_progress" to "covered"
    And each broad area should show "covered" only when all its sub-areas are covered
    And the progress sidebar should reflect accurate coverage percentages

  @weak-answers @report-generation
  Scenario: Weak answers generate reports with high gap counts
    Given a completed interview session with weak answers
    When the data pipeline finishes processing
    Then a gap analysis report should exist for each of the 5 broad areas
    And a consolidated report should be generated
    And each report should contain gap inventory, roadmap, and recommendations sections
    And gap severity should skew toward "high" across all broad areas

  @weak-answers @dashboard-metrics
  Scenario: Dashboard reflects low maturity after weak-answer interview
    Given a completed interview session with weak answers and generated reports
    When I navigate to the Dashboard page
    Then the overall maturity scores should be visible
    And gap severity counts should show predominantly "high" severity
    And the automation quotient should be low
    And discovery progress should show 100%
```

### 5.2 `interview-mixed-answers.feature` — @deficiency-detection @mixed-answers

```gherkin
Feature: Banking Interview with Mixed Answers Differentiates Process Maturity
  As a process consultant
  I want to conduct a deep interview with varying process maturity across areas
  So that the system correctly identifies which areas are deficient and which are strong

  Background:
    Given I am logged in as an analyst
    And the domain is set to "Banking"

  @mixed-answers @interview-flow
  Scenario: Complete deep interview with mixed answers
    When I start a new interview with depth "deep" and all broad areas selected
    And I answer O2C questions using the "weak" strategy
    And I answer P2P questions using the "weak" strategy
    And I answer R2R questions using the "strong" strategy
    And I answer Treasury questions using the "weak" strategy
    And I answer Compliance questions using the "strong" strategy
    Then all 18 sub-areas should reach "covered" status
    And the session should auto-complete

  @mixed-answers @report-generation
  Scenario: Reports differentiate between strong and weak broad areas
    Given a completed interview session with mixed answers
    When the data pipeline finishes processing
    Then O2C report should show high gap severity
    And P2P report should show high gap severity
    And R2R report should show low gap severity with few gaps
    And Treasury report should show high gap severity
    And Compliance report should show low gap severity with few gaps
```

### 5.3 `interview-comparison.feature` — @metrics-comparison

```gherkin
Feature: Cross-Scenario Metrics Comparison
  As a QA engineer
  I want to compare metrics between weak-only and mixed interview sessions
  So that I can verify the system correctly differentiates deficiency levels

  @metrics-comparison @directional
  Scenario: Weak-answer session produces worse metrics than mixed-answer session
    Given a completed "weak" interview session with reports
    And a completed "mixed" interview session with reports
    Then the weak session should have more total gaps than the mixed session
    And the weak session should have lower overall maturity than the mixed session
    And the weak session should have higher "high severity" gap count
    And the weak session should have a lower automation quotient
    And the mixed session R2R maturity should be higher than its O2C maturity
```

### 5.4 `interview-edge-cases.feature` — @edge-cases

```gherkin
Feature: Interview Edge Cases and Error Handling
  Background:
    Given I am logged in as an analyst
    And the domain is set to "Banking"

  @edge-cases @pause-resume
  Scenario: Pause and resume an in-progress interview
    Given a deep interview is in progress with 2 broad areas covered
    When I pause the interview session
    Then the data pipeline should trigger for covered areas only
    And partial reports should be generated for covered broad areas
    When I continue the interview by calling next-question on the paused session
    Then the remaining sub-areas should still be available
    And I can continue answering from where I left off

  @edge-cases @incomplete-session
  Scenario: Incomplete interview generates partial reports
    Given a deep interview where only P2P sub-areas are fully covered
    When I pause the session
    Then only the P2P gap analysis report should be generated
    And uncovered broad areas should not have reports

  @edge-cases @unauthenticated
  Scenario: Unauthenticated access is blocked
    Given I am not logged in
    When I try to access the dashboard page
    Then I should be redirected to the login page
    When I try to call the interview API without a token
    Then I should receive a 401 response

  @edge-cases @invalid-api
  Scenario: Invalid API requests return proper errors
    When I submit an answer to a non-existent session
    Then I should receive a 404 response
    When I submit an answer with missing required fields
    Then I should receive a 400 response
```

### 5.5 `admin-flows.feature` — @admin

```gherkin
Feature: Admin Flows and Role-Based Access
  @admin @user-management
  Scenario: Admin can manage users
    Given I am logged in as an admin
    When I navigate to User Management
    Then I should see the user list
    When I create a new analyst user
    Then the user should appear in the list

  @admin @audit-logs
  Scenario: Interview actions are logged in audit trail
    Given a completed interview session exists
    When I log in as admin and navigate to Audit Logs
    Then I should see audit entries for interview start, answers, and completion

  @admin @rbac
  Scenario: Role-based access control is enforced
    Given I am logged in as a regular user
    When I try to navigate to User Management
    Then I should not have access to admin pages
    And admin API endpoints should return 403
```

### 5.6 `reports-validation.feature` — @report-generation

```gherkin
Feature: Report Content and Export Validation
  Background:
    Given a completed interview session with weak answers and generated reports

  @report-generation @structure
  Scenario: All report types are generated with correct structure
    When I navigate to the Reports page
    Then I should see gap analysis reports for all 5 broad areas
    And I should see a consolidated report
    And each report should have status "ready"

  @report-generation @content
  Scenario: Gap analysis reports contain required sections
    When I open a gap analysis report
    Then it should contain a gap inventory section
    And it should contain a roadmap with phases and dependencies
    And it should contain recommendations
    And it should contain maturity level assessment
    And it should contain quick wins section

  @report-generation @export
  Scenario: Reports can be exported to PDF
    When I navigate to the Reports page
    And I click export on a gap analysis report
    Then a PDF download should be triggered

  @report-generation @filtering
  Scenario: Reports page supports filtering
    When I navigate to the Reports page
    And I filter by report type "gap_analysis"
    Then only gap analysis reports should be shown
    When I filter by broad area "Procure-to-Pay"
    Then only P2P reports should be shown
```

---

## 6. Tag Summary

| Tag                      | Purpose                          | Feature Files |
|--------------------------|----------------------------------|---------------|
| `@deficiency-detection`  | Core interview scenarios         | weak-answers, mixed-answers |
| `@weak-answers`          | Weak-only interview              | interview-weak-answers |
| `@mixed-answers`         | Mixed strategy interview         | interview-mixed-answers |
| `@metrics-comparison`    | Cross-session assertions         | interview-comparison |
| `@interview-flow`        | Interview mechanics              | weak-answers, mixed-answers |
| `@coverage-tracking`     | Progress/coverage validation     | weak-answers |
| `@report-generation`     | Report validation                | weak-answers, mixed-answers, reports-validation |
| `@dashboard-metrics`     | Dashboard final state            | weak-answers |
| `@edge-cases`            | Error/pause/resume               | interview-edge-cases |
| `@admin`                 | Admin & RBAC                     | admin-flows |

### Tag-Based Execution

```bash
# Run all BDD tests
npx bddgen && npx playwright test --project=bdd

# Run only deficiency detection
npx bddgen && npx playwright test --project=bdd --grep @deficiency-detection

# Run only admin flows
npx bddgen && npx playwright test --project=bdd --grep @admin

# Run only edge cases
npx bddgen && npx playwright test --project=bdd --grep @edge-cases
```

---

## 7. Fixtures & Shared Infrastructure

### 7.1 BDD World Context (`support/world.ts`)

Shared state across steps within a scenario:

```typescript
interface InterviewWorld {
  // Auth
  apiToken: string;
  userRole: 'admin' | 'analyst' | 'user';

  // Interview sessions keyed by strategy name
  sessions: Record<string, {
    sessionId: string;
    progress: BroadAreaProgress[];
    status: 'in_progress' | 'completed';
  }>;

  // Report data keyed by session strategy
  reports: Record<string, {
    gapReports: Report[];
    consolidatedReport: Report | null;
    metrics: DashboardMetrics;
  }>;

  // Current context
  currentStrategy: 'weak' | 'mixed';
  currentPage: string;
}
```

### 7.2 Custom Playwright Fixture (`fixtures/test.ts`)

Extends the base Playwright `test` with:

- **`authenticatedPage`** — a page already logged in (skips login per scenario)
- **`apiClient`** — pre-authenticated `InterviewApiClient` instance
- **`world`** — the BDD world context instance

### 7.3 Answer Strategy Module (`fixtures/answer-strategies.ts`)

```typescript
type AnswerStrategy = (question: GeneratedQuestion, broadAreaId: string) => AnswerPayload;

const weakStrategy: AnswerStrategy;    // Always low-maturity answers
const strongStrategy: AnswerStrategy;  // Always high-maturity answers
const mixedStrategy: AnswerStrategy;   // Weak for O2C/P2P/Treasury, strong for R2R/Compliance
```

Each strategy inspects `question.type` and `question.options` to select the appropriate answer:

- **`single_choice`**: Scans option text for keywords ("manual", "spreadsheet" for weak; "automated", "AI" for strong)
- **`open_ended`**: Returns pre-defined response strings matching the target maturity level
- **`scale`**: Returns 1–2 for weak, 4–5 for strong
- **`yes_no`**: Returns `false` for weak, `true` for strong
- **`multi_choice`**: Selects 1 least-mature option for weak, all options for strong

### 7.4 API Helper Module (`fixtures/api-helpers.ts`)

```typescript
class InterviewApiClient {
  constructor(private token: string, private baseUrl: string) {}

  async startSession(depth: string, broadAreas: string[]): Promise<StartResponse>
  async getNextQuestion(sessionId: string): Promise<QuestionResponse>
  async submitAnswer(sessionId: string, payload: AnswerPayload): Promise<AnswerResponse>
  async getProgress(sessionId: string): Promise<ProgressResponse>
  async pauseSession(sessionId: string): Promise<PauseResponse>
  async switchCategory(sessionId: string, subAreaId: string): Promise<CategoryResponse>
  async waitForPipelineCompletion(sessionId: string, timeoutMs?: number): Promise<void>
  async getReports(sessionId: string): Promise<Report[]>
  async getDashboardMetrics(): Promise<DashboardMetrics>
}
```

- `waitForPipelineCompletion` polls report status every 5s until all reports reach `ready` or timeout (default 5 minutes)
- All methods include retry logic for 503 responses (LLM warming up) with exponential backoff

---

## 8. Step Definitions

### 8.1 `steps/auth.steps.ts` (~5 steps)

| Step | Action |
|------|--------|
| `Given I am logged in as an {role}` | Login via UI, store token in world |
| `Given I am not logged in` | Ensure no auth state |
| `When I try to access the {page} page` | Navigate without auth |
| `Then I should be redirected to the login page` | Assert URL contains `/login` |
| `Then I should receive a {code} response` | Assert API response status code |

### 8.2 `steps/interview.steps.ts` (~15 steps)

| Step | Action |
|------|--------|
| `Given the domain is set to "Banking"` | PUT `/interview/config/domain` with `finance` |
| `When I start a new interview with depth {depth} and all broad areas selected` | POST `/interview/start` |
| `Then I should receive a welcome message and first question` | Assert response shape |
| `When I answer all questions using the {strategy} answer strategy` | Full interview loop via API |
| `When I answer {broadArea} questions using the {strategy} strategy` | Per-area loop |
| `Then all {count} sub-areas should reach "covered" status` | Assert all coverage statuses |
| `And the session should auto-complete` | Assert session status === `completed` |
| `And the data pipeline should be triggered` | Pipeline starts (reports in `generating` state) |
| `Then each sub-area should transition from "not_started" to "in_progress" to "covered"` | State machine assertion |
| `And each broad area should show "covered" only when all its sub-areas are covered` | Aggregation assertion |
| `And the progress sidebar should reflect accurate coverage percentages` | UI assertion on sidebar |
| `Given a deep interview is in progress with {n} broad areas covered` | Partial interview setup |
| `When I pause the interview session` | POST `/interview/:sessionId/pause` |
| `When I continue the interview by calling next-question on the paused session` | Call GET `/interview/:sessionId/next-question` on paused session (no explicit resume endpoint — just continue the flow) |
| `Then I can continue answering from where I left off` | Assert progress preserved |

### 8.3 `steps/reports.steps.ts` (~12 steps)

| Step | Action |
|------|--------|
| `Given a completed interview session with {strategy} answers` | Run or reuse cached session |
| `When the data pipeline finishes processing` | `waitForPipelineCompletion()` |
| `Then a gap analysis report should exist for each of the {n} broad areas` | Count reports by type |
| `And a consolidated report should be generated` | Assert consolidated report exists |
| `And each report should contain {section} section` | Structural content check |
| `And gap severity should skew toward {level} across all broad areas` | Count severity distribution |
| `Then {area} report should show {high\|low} gap severity` | Per-area severity check |
| `Then the weak session should have more total gaps than the mixed session` | Directional comparison |
| `Then the weak session should have lower overall maturity than the mixed session` | Directional comparison |
| `Then the weak session should have higher "high severity" gap count` | Directional comparison |
| `Then the weak session should have a lower automation quotient` | Directional comparison |
| `Then the mixed session R2R maturity should be higher than its O2C maturity` | Intra-session comparison |

### 8.4 `steps/dashboard.steps.ts` (~6 steps)

| Step | Action |
|------|--------|
| `When I navigate to the {page} page` | Sidebar click + networkidle wait |
| `Then the overall maturity scores should be visible` | Assert gauge/score elements exist |
| `Then gap severity counts should show predominantly {level} severity` | Read severity badges |
| `Then the automation quotient should be {high\|low}` | Read automation metric |
| `Then discovery progress should show {percentage}` | Assert progress indicator |
| `When I open a gap analysis report` | Click first report in list |

### 8.5 `steps/admin.steps.ts` (~6 steps)

| Step | Action |
|------|--------|
| `When I navigate to User Management` | Sidebar admin nav click |
| `Then I should see the user list` | Assert table/list visible |
| `When I create a new analyst user` | Fill form + submit |
| `Then the user should appear in the list` | Assert new row exists |
| `Then I should see audit entries for interview start, answers, and completion` | Check audit log table |
| `Then I should not have access to admin pages` | Assert redirect or 403 |

---

## 9. Timeout & Execution Configuration

### Timeouts

| Scope | Timeout | Rationale |
|-------|---------|-----------|
| Individual step | 30s | Single API call + LLM response |
| Interview scenario (full loop) | 10 min | ~144 Q&A cycles with LLM latency |
| Pipeline wait | 5 min | Report generation for 5 broad areas |
| Comparison scenario | 20 min | Runs both interviews if not cached |
| Edge case / admin scenario | 60s | Quick UI + API checks |
| Global test suite | 45 min | Full suite with retries |

### Playwright Config Changes

A new `bdd` project is added alongside the existing `chromium` project:

```typescript
{
  name: 'bdd',
  testDir: '.features-gen',   // playwright-bdd compiled output
  use: { ...devices['Desktop Chrome'] },
  timeout: 600_000,           // 10 min per scenario
}
```

Existing `chromium` project remains untouched.

### npm Scripts

```json
{
  "test:bdd": "npx bddgen && npx playwright test --project=bdd",
  "test:bdd:deficiency": "npx bddgen && npx playwright test --project=bdd --grep @deficiency-detection",
  "test:bdd:admin": "npx bddgen && npx playwright test --project=bdd --grep @admin",
  "test:bdd:edge": "npx bddgen && npx playwright test --project=bdd --grep @edge-cases",
  "test:bdd:reports": "npx bddgen && npx playwright test --project=bdd --grep @report-generation",
  "test:bdd:compare": "npx bddgen && npx playwright test --project=bdd --grep @metrics-comparison"
}
```

---

## 10. Test Artifacts

Each interview scenario produces artifacts under `test-results/`:

```
test-results/
└── interview-{strategy}-session-{id}/
    ├── transcript.json     # Full Q&A pairs with strategy applied
    ├── progress.json       # Final coverage state per sub-area
    └── reports.json        # Generated report summaries
```

The comparison scenario produces an additional `comparison-summary.json` with side-by-side metrics from both sessions.

### Retry Strategy

- Retries: 1 (matching existing config)
- Each retry starts a fresh interview session — no reuse of stale state
- API helpers include built-in retry for 503 responses (LLM warming up) with exponential backoff

---

## 11. Scenario Summary

| Feature File | Scenarios | Tags | Est. Duration |
|-------------|-----------|------|---------------|
| interview-weak-answers | 4 | @deficiency-detection @weak-answers | ~12 min |
| interview-mixed-answers | 2 | @deficiency-detection @mixed-answers | ~12 min |
| interview-comparison | 1 | @metrics-comparison | ~2 min (uses cached sessions) |
| interview-edge-cases | 4 | @edge-cases | ~3 min |
| admin-flows | 3 | @admin | ~2 min |
| reports-validation | 4 | @report-generation | ~3 min |
| **Total** | **18** | **10 tags** | **~34 min** |

---

## 12. Key Design Decisions

1. **BDD over plain specs** — feature files serve as living documentation of business requirements; tags enable flexible subset execution
2. **API-driven interview, UI-validated results** — avoids flaky chat UI interactions while still proving the full rendering pipeline works
3. **Directional over absolute assertions** — comparing "weak session has more gaps than mixed session" is resilient to scoring changes; fixed thresholds would break on model updates
4. **Two distinct scenarios** — weak-only proves the system catches deficiencies; mixed proves it differentiates — together they validate the core value proposition
5. **Existing tests untouched** — new `bdd` project runs independently; no risk to current test suite
