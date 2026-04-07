# ProcessIQ Discovery — Implementation Tickets

**Created:** 2026-03-24
**Source:** [PRD.md](./PRD.md), [DESIGN_GAPS.md](./DESIGN_GAPS.md)

---

## Ticket Conventions

- **ID format:** `EPIC-NNN` (e.g., `LOGIN-001`)
- **Priority:** P0 (blocker) → P1 (must-have) → P2 (should-have) → P3 (nice-to-have)
- **Size:** XS (<1hr), S (1–3hr), M (3–8hr), L (1–2 days), XL (3+ days)
- **Status:** `TODO` → `IN_PROGRESS` → `REVIEW` → `DONE`
- **Dependencies:** tickets that must complete first

---

## Epic Overview

| Epic | Tickets | Priority | Description |
|------|---------|----------|-------------|
| [LOGIN](#epic-login--login-page-fixes) | 7 | P0 | Login page alignment with mockup |
| [DASH](#epic-dash--dashboard-fixes) | 6 | P0 | Dashboard risk cards, process flow, durations |
| [RIGHT](#epic-right--right-panel-fixes) | 5 | P0 | Key Risks panel: badge, SME contact, dollar impact |
| [NAV](#epic-nav--sidebar--navigation-fixes) | 3 | P1 | Sidebar logo, nav icons |
| [INSIGHT](#epic-insight--insights-page-fixes) | 4 | P0 | Dual-axis chart, View Details button, dollar amounts |
| [SME](#epic-sme--sme-engagement-fixes) | 3 | P1 | Stat card labels, table sorting |
| [REPORT](#epic-report--reports-page-rebuild) | 8 | P0 | Full Reports page rebuild (backend + frontend) |
| [SETTINGS](#epic-settings--settings-page-enhancement) | 6 | P1 | Project settings, timezone, data management |
| [POLISH](#epic-polish--ux-polish--quality) | 7 | P2 | Error handling, loading states, validation, a11y |
| [TEST](#epic-test--testing) | 4 | P2 | E2E updates, unit test coverage |

**Total:** 53 tickets

---

## EPIC: LOGIN — Login Page Fixes

> Align Login page with mockup. All changes in `frontend/src/pages/Login.tsx` and its CSS.

### LOGIN-001: Fix tagline text
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx` |
| **Dependencies** | None |

**Current:** "Intelligent Process Intelligence"
**Required:** "Executive Process Intelligence"

**Acceptance Criteria:**
- [ ] Tagline under logo reads "Executive Process Intelligence"
- [ ] E2E test `processiq.spec.ts` assertion for tagline passes

---

### LOGIN-002: Add demo credentials info box
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx`, CSS |
| **Dependencies** | None |

**Description:** Add a blue-bordered info box between the password field and Sign In button displaying demo credentials.

**Mockup spec:**
```
┌─ Demo Credentials: ──────────────────────┐
│ User: john@company.com / user123         │
│ Admin: admin@company.com / admin123      │
└──────────────────────────────────────────┘
```

**Acceptance Criteria:**
- [ ] Info box visible on login page with blue/info border styling
- [ ] Shows "Demo Credentials:" as bold header
- [ ] Shows User and Admin credentials on separate lines
- [ ] Box styling consistent with dark theme (semi-transparent blue background, blue border)
- [ ] E2E test verifies demo credentials box is present

---

### LOGIN-003: Add tab subtitles
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx` |
| **Dependencies** | None |

**Current:** Tab labels only ("User Login", "Admin Login") with no subtitle.
**Required:** Each tab shows a subtitle below the label.

| Tab | Subtitle |
|-----|----------|
| User Login | "View your assessments" |
| Admin Login | "View all employees" |

**Acceptance Criteria:**
- [ ] "View your assessments" displayed below "User Login" tab text
- [ ] "View all employees" displayed below "Admin Login" tab text
- [ ] Subtitle uses smaller, muted font (opacity 0.7 or `var(--text-muted)`)

---

### LOGIN-004: Add lock icon to password field
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx` |
| **Dependencies** | None |

**Description:** Add a `Lock` icon from lucide-react inside the password input field (left-aligned, like the mockup).

**Acceptance Criteria:**
- [ ] Lock icon visible inside password input (left side)
- [ ] Input text has left padding to avoid overlapping the icon
- [ ] Icon uses muted color (`var(--text-muted)`)

---

### LOGIN-005: Fix email placeholder text
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx` |
| **Dependencies** | None |

**Current:** `john@company.com`
**Required:** `you@company.com`

**Acceptance Criteria:**
- [ ] Email input placeholder reads "you@company.com"

---

### LOGIN-006: Fix Admin tab icon
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Login.tsx` |
| **Dependencies** | None |

**Current:** Shield icon
**Required:** Clipboard/document icon (`ClipboardList` from lucide-react)

**Acceptance Criteria:**
- [ ] Admin Login tab shows `ClipboardList` icon instead of `Shield`

---

### LOGIN-007: Update E2E tests for login changes
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `e2e/processiq.spec.ts` |
| **Dependencies** | LOGIN-001, LOGIN-002, LOGIN-003 |

**Description:** Update existing Playwright tests to verify the new login page elements and add missing test coverage.

**Acceptance Criteria:**
- [ ] Test verifies tagline "Executive Process Intelligence"
- [ ] Test verifies demo credentials box is present with correct text
- [ ] Test verifies tab subtitles ("View your assessments", "View all employees")
- [ ] All login E2E tests pass

---

## EPIC: DASH — Dashboard Fixes

> Fix Dashboard process flow section and KPI display. Primary file: `frontend/src/pages/Dashboard.tsx`.

### DASH-001: Fix process flow title to show specific process type
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Dashboard.tsx` |
| **Dependencies** | None |

**Current:** Shows generic domain name (e.g., "Finance Process Flow")
**Required:** Show specific process type — e.g., "Order-to-Cash Process Flow"

**Logic:** Use the `processType` from the most recent active readiness session. If no session, use the first process type from the domain config.

**Acceptance Criteria:**
- [ ] Process flow section title reads "{ProcessType} Process Flow" (e.g., "Order-to-Cash Process Flow")
- [ ] Title updates when active session changes

---

### DASH-002: Fix duration display with mixed units (hrs/days)
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Dashboard.tsx` |
| **Dependencies** | None |

**Current:** All durations show in "hrs" (e.g., "4.5 hrs")
**Required:** Mix of "hrs" and "days" per mockup rules:

```typescript
function formatDuration(hours: number, isCritical: boolean): string {
  if (isCritical || hours >= 24) {
    const days = hours / 24;
    return `${days.toFixed(1)} days`;
  }
  return `${hours.toFixed(1)} hrs`;
}
```

**Mockup reference values:**
| Step | Duration | Critical |
|------|----------|----------|
| Order Entry | 4.5 hrs | No |
| Credit Check | 3.2 days | Yes |
| Fulfillment | 4.5 hrs | No |
| Invoicing | 3.2 days | Yes |
| Payment | 4.5 hrs | No |

**Acceptance Criteria:**
- [ ] Non-critical steps show duration in "hrs"
- [ ] Critical steps show duration in "days" (red text)
- [ ] Total Cycle Time in summary row shows in "days" when > 24 hrs

---

### DASH-003: Add notification badge count to Risks header
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | None |

**Current:** "Key Risks & Narratives" header with no badge
**Required:** Red circular badge with unresolved risk count (e.g., "3")

**Acceptance Criteria:**
- [ ] Red badge appears next to "Key Risks & Narratives" header
- [ ] Badge shows count of risks returned from `/api/risks/summary`
- [ ] Badge uses same styling as notification bell badge (red background, white text, rounded)

---

### DASH-004: Add SME contact info to risk cards
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **Files** | `frontend/src/components/layout/RightPanel.tsx`, `backend/src/routes/risks.ts` |
| **Dependencies** | None |

**Current:** Risk cards show "📉 Source: {area}"
**Required:** Show "👤 {name}, {role}" per mockup

**Backend change:** Ensure `/api/risks/summary` returns `smeContact: { name, role }` for each risk.

**Frontend change:** Replace source line with SME contact display:
```
👤 John Smith, Credit Mgr
```

**Acceptance Criteria:**
- [ ] Backend risk summary includes `smeContact.name` and `smeContact.role` for each risk
- [ ] Risk card displays person icon + SME name + role
- [ ] Falls back to "Source: {area}" if no SME contact data available

---

### DASH-005: Add dollar impact to risk cards
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **Files** | `frontend/src/components/layout/RightPanel.tsx`, `backend/src/routes/risks.ts` |
| **Dependencies** | DASH-004 |

**Current:** No dollar impact shown
**Required:** Each risk card shows "↗ {amount} annual impact" in green/accent color

**Backend change:** Ensure `/api/risks/summary` returns `annualImpact` string for each risk (e.g., "$2.4M").

**Frontend change:** Add impact line below SME contact:
```
↗ $2.4M annual impact
```

**Acceptance Criteria:**
- [ ] Backend risk summary includes `annualImpact` field per risk
- [ ] Risk card displays trend icon + dollar amount + "annual impact"
- [ ] Impact text uses green/accent color
- [ ] Gracefully hidden if no impact data

---

### DASH-006: Make "View All Risks" link functional
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | None |

**Current:** "View All Risks" button exists but has no click handler
**Required:** Shows total count and navigates to a risk detail view or scrolls to a risk section

**Acceptance Criteria:**
- [ ] Link text shows "View All Risks ({N} total)" with actual count
- [ ] Click navigates to `/insights` or opens a risk detail modal (decide implementation)
- [ ] Link is visually styled as clickable (blue text, hover underline)

---

## EPIC: RIGHT — Right Panel Fixes

> All changes in `frontend/src/components/layout/RightPanel.tsx` unless noted.

### RIGHT-001: Backend — Enhance risk summary API response
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **File** | `backend/src/routes/risks.ts` |
| **Dependencies** | None |

**Description:** Enhance the `/api/risks/summary` endpoint to return complete risk data matching the mockup.

**Current response shape** (approximate):
```json
{
  "risks": [{ "severity": "...", "title": "...", "source": "..." }],
  "engagement": { ... },
  "totals": { ... }
}
```

**Required response shape:**
```json
{
  "risks": [
    {
      "id": "r-001",
      "severity": "HIGH RISK",
      "title": "Manual credit checks causing 3-day delay in O2C",
      "smeContact": { "name": "John Smith", "role": "Credit Mgr" },
      "annualImpact": "$2.4M",
      "timestamp": "2026-03-24T10:00:00Z",
      "sessionId": "s-123"
    }
  ],
  "totalRisks": 15,
  "engagement": {
    "departments": [
      { "name": "Sales", "percentage": 90 },
      { "name": "Finance", "percentage": 45 },
      { "name": "Warehouse", "percentage": 20 }
    ],
    "overall": 52
  }
}
```

**Acceptance Criteria:**
- [ ] Each risk includes `smeContact` object with `name` and `role`
- [ ] Each risk includes `annualImpact` string
- [ ] Response includes `totalRisks` count (for badge and "View All" link)
- [ ] SME contact data derived from session user data or populated with realistic defaults
- [ ] Annual impact calculated from gap analysis data or uses domain-appropriate estimates

---

### RIGHT-002: Risk card — show SME contact
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | RIGHT-001 |

**Acceptance Criteria:**
- [ ] Risk card displays "👤 {name}, {role}" (e.g., "👤 John Smith, Credit Mgr")
- [ ] Uses `User` icon from lucide-react (not emoji)
- [ ] Falls back gracefully if `smeContact` is null

---

### RIGHT-003: Risk card — show dollar impact
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | RIGHT-001 |

**Acceptance Criteria:**
- [ ] Displays "↗ {annualImpact} annual impact" in green below SME contact
- [ ] Uses `TrendingUp` icon from lucide-react
- [ ] Hidden if `annualImpact` is null/empty

---

### RIGHT-004: Risks header badge count
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | RIGHT-001 |

**Acceptance Criteria:**
- [ ] Red circular badge next to "Key Risks & Narratives" header
- [ ] Shows `totalRisks` count from API response
- [ ] Badge matches notification bell styling

---

### RIGHT-005: "View All Risks" link with count
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/RightPanel.tsx` |
| **Dependencies** | RIGHT-001 |

**Acceptance Criteria:**
- [ ] Shows "View All Risks ({totalRisks} total)"
- [ ] Clickable — navigates to risk detail view or opens modal
- [ ] Blue text, hover underline

---

## EPIC: NAV — Sidebar & Navigation Fixes

> Changes in `frontend/src/components/layout/Sidebar.tsx`.

### NAV-001: Change sidebar logo icon
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/Sidebar.tsx` |
| **Dependencies** | None |

**Current:** Hexagon icon
**Required:** Pulse/activity heartbeat icon (`Activity` from lucide-react) — matching the mockup's pulse wave icon

**Acceptance Criteria:**
- [ ] Sidebar logo uses `Activity` icon (or custom SVG matching mockup pulse icon)
- [ ] Icon color matches brand accent (blue/cyan gradient)

---

### NAV-002: Fix nav item icons
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/Sidebar.tsx` |
| **Dependencies** | None |

**Icon changes required:**

| Nav Item | Current | Required |
|----------|---------|----------|
| Process Analysis | `GitBranch` | `Activity` (pulse/line chart) |
| Insights | `Lightbulb` | `TrendingUp` (zigzag trending) |

All other nav icons are correct.

**Acceptance Criteria:**
- [ ] Process Analysis uses `Activity` icon
- [ ] Insights uses `TrendingUp` icon
- [ ] All other nav icons unchanged

---

### NAV-003: Update E2E tests for sidebar changes
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `e2e/processiq.spec.ts` |
| **Dependencies** | NAV-001, NAV-002 |

**Acceptance Criteria:**
- [ ] Sidebar E2E tests pass with new icons
- [ ] Logo assertion updated if needed

---

## EPIC: INSIGHT — Insights Page Fixes

> Changes in `frontend/src/pages/Insights.tsx` and its CSS.

### INSIGHT-001: Implement dual-axis Performance Trends chart
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/pages/Insights.tsx` |
| **Dependencies** | None |

**Current:** Both data lines plotted on a single Y-axis.
**Required:** Dual Y-axis chart per mockup:
- Left Y-axis: scale 0–16 (sessions/cycle-time metric)
- Right Y-axis: scale 0–60 (efficiency score)
- Green line tied to left axis
- Grey/white line tied to right axis
- X-axis: monthly labels (Sep, Oct, Nov, Dec, Jan, Feb)

**Implementation:**
```tsx
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

<ComposedChart data={monthlyData}>
  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
  <XAxis dataKey="month" />
  <YAxis yAxisId="left" domain={[0, 16]} />
  <YAxis yAxisId="right" orientation="right" domain={[0, 60]} />
  <Line yAxisId="left" type="monotone" dataKey="sessions" stroke="#4ade80" />
  <Line yAxisId="right" type="monotone" dataKey="efficiency" stroke="#94a3b8" />
</ComposedChart>
```

**Acceptance Criteria:**
- [ ] Chart has two distinct Y-axes (left 0–16, right 0–60)
- [ ] Green line plots against left axis
- [ ] Grey line plots against right axis
- [ ] X-axis shows 6 monthly labels
- [ ] "↗ Improving" green badge in top-right when trend is positive

---

### INSIGHT-002: Replace expand chevron with "View Details" button
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Insights.tsx` |
| **Dependencies** | None |

**Current:** Expand/collapse chevron button on action cards
**Required:** Blue "View Details" button (right-aligned) per mockup

**Acceptance Criteria:**
- [ ] Each action card has a blue "View Details" button on the right side
- [ ] Button click expands the card to show full AI analysis detail
- [ ] Button text changes to "Hide Details" when expanded
- [ ] Button styled as outlined or solid blue (matching mockup)

---

### INSIGHT-003: Add dollar amounts to action descriptions
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/pages/Insights.tsx` |
| **Dependencies** | None |

**Current:** Generic AI-generated text without dollar amounts
**Required:** Descriptions include specific dollar amounts per mockup:

| Action | Description |
|--------|------------|
| Automation Quick Win | "Implementing automated credit check validation could save **$2.4M annually**" |
| Revenue Leakage Opportunity | "Invoice reconciliation automation targets **$890K** in recoverable revenue" |

**Implementation approach:**
1. Check if gap analysis data contains dollar estimates → use those
2. If AI-generated actions exist → extract/include any monetary values from AI response
3. As fallback → use static baseline amounts matching mockup for the two default action cards

**Acceptance Criteria:**
- [ ] "Automation Quick Win" card description includes dollar savings estimate
- [ ] "Revenue Leakage Opportunity" card description includes dollar recovery target
- [ ] Dollar amounts are bold or highlighted
- [ ] AI-generated actions preserve any monetary values from the LLM response

---

### INSIGHT-004: Fix action card layout to vertical list
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Insights.tsx` |
| **Dependencies** | None |

**Current:** Grid layout for action cards
**Required:** Vertical list layout with full-width cards (per mockup)

**Acceptance Criteria:**
- [ ] Action cards render in a single-column vertical list
- [ ] Each card spans full width of content area
- [ ] Consistent spacing between cards

---

## EPIC: SME — SME Engagement Fixes

> Changes in `frontend/src/pages/SMEEngagement.tsx`.

### SME-001: Fix stat card labels and subtitles
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/SMEEngagement.tsx` |
| **Dependencies** | None |

**Changes needed:**

| Card | Current Label | Required Label | Current Subtitle | Required Subtitle |
|------|--------------|---------------|-----------------|------------------|
| 1 | "Total Participants" | **"Total SMEs"** | "from N sessions" | **"Across all departments"** |
| 3 | "Total Responses" | "Total Responses" (OK) | "N% average engagement" | **"This assessment period"** |

**Acceptance Criteria:**
- [ ] Card 1 label reads "Total SMEs"
- [ ] Card 1 subtitle reads "Across all departments"
- [ ] Card 3 subtitle reads "This assessment period"
- [ ] Card 1 icon is `Users` (people group icon, matching mockup)

---

### SME-002: Fix stat card icons
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/SMEEngagement.tsx` |
| **Dependencies** | None |

**Per mockup, stat cards should have these icons:**

| Card | Icon |
|------|------|
| Total SMEs | `Users` (people outline) |
| Active Participants | `CheckCircle` (green checkmark) |
| Total Responses | `MessageCircle` (speech bubble) |
| Low Engagement | `AlertCircle` (warning circle, red) |

**Acceptance Criteria:**
- [ ] Each stat card uses the correct icon per mockup
- [ ] Icons have appropriate color (green for active, red for low engagement)

---

### SME-003: Add table sorting and filtering
| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/pages/SMEEngagement.tsx` |
| **Dependencies** | None |

**Description:** Make the Subject Matter Experts table sortable by any column and filterable by department/status.

**Acceptance Criteria:**
- [ ] Clicking column headers sorts the table (ascending/descending toggle)
- [ ] Filter dropdown for Department column
- [ ] Filter dropdown for Status column (Active, Low Activity, Inactive)

---

## EPIC: REPORT — Reports Page Rebuild

> Major rework of the Reports page. Requires new backend APIs and OpenSearch index.

### REPORT-001: Create `consultant_reports` OpenSearch index
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `backend/src/config/database.ts` |
| **Dependencies** | None |

**Description:** Add a new OpenSearch index for storing report metadata.

**Index schema:**
```json
{
  "reportId": { "type": "keyword" },
  "name": { "type": "text" },
  "type": { "type": "keyword" },
  "sessionId": { "type": "keyword" },
  "generatedBy": { "type": "keyword" },
  "status": { "type": "keyword" },
  "fileSize": { "type": "keyword" },
  "downloadCount": { "type": "integer" },
  "createdAt": { "type": "date" }
}
```

**Acceptance Criteria:**
- [ ] Index `consultant_reports` created on server startup
- [ ] Schema supports all fields from the Report data model in PRD
- [ ] Index creation is idempotent (skip if exists)

---

### REPORT-002: Build report generation API
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | L |
| **Status** | TODO |
| **Files** | `backend/src/routes/reports.ts` (new), `backend/src/services/reportService.ts` |
| **Dependencies** | REPORT-001 |

**New endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/generate` | Generate report → store record → return report |
| GET | `/api/reports` | List reports (paginated, filterable by type) |
| GET | `/api/reports/:id/download` | Generate PDF and return as download |
| GET | `/api/reports/stats` | Aggregate stats for stat cards |

**POST `/api/reports/generate` request:**
```json
{
  "sessionId": "s-123",
  "type": "readiness",
  "name": "Q3 Executive Summary"
}
```

**GET `/api/reports/stats` response:**
```json
{
  "totalReports": 47,
  "thisMonth": 12,
  "totalDownloads": 284,
  "storageUsed": "1.2 GB"
}
```

**Acceptance Criteria:**
- [ ] All 4 endpoints functional with JWT auth
- [ ] Report generation calls existing `reportService` and stores the record
- [ ] Stats endpoint computes real values from stored reports
- [ ] PDF download uses html2canvas + jspdf to render report content
- [ ] Route registered in Express app (`backend/src/index.ts`)

---

### REPORT-003: Add controls row (Date Range, Filter, Generate button)
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/pages/Reports.tsx` |
| **Dependencies** | REPORT-002 |

**Per mockup, 3 controls above the stat cards:**
1. "Date Range" button (outline, with calendar icon) — opens date picker
2. "Filter" button (outline, with filter icon) — opens filter dropdown
3. "Generate New Report" button (primary blue, with + icon, right-aligned)

**Acceptance Criteria:**
- [ ] Three buttons rendered in a controls row above stat cards
- [ ] "Date Range" opens a date range picker (can use simple from/to inputs initially)
- [ ] "Filter" provides filter by report type
- [ ] "Generate New Report" opens a modal/dialog to select session + report type → calls `POST /api/reports/generate`
- [ ] Layout matches mockup (Date Range + Filter left, Generate right)

---

### REPORT-004: Fix stat cards to show report metrics
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Reports.tsx` |
| **Dependencies** | REPORT-002 |

**Current → Required:**

| Card | Current | Required |
|------|---------|----------|
| 1 | "Sessions" count | **"Total Reports"** count |
| 2 | "Documents" count | **"This Month"** count |
| 3 | "Completed" count | **"Downloads"** total |
| 4 | Sessions count | **"Storage Used"** (e.g., "1.2 GB") |

**Acceptance Criteria:**
- [ ] All 4 stat cards show correct labels per mockup
- [ ] Values fetched from `GET /api/reports/stats`
- [ ] Loading state while fetching

---

### REPORT-005: Fix report type labels
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/Reports.tsx` |
| **Dependencies** | None |

**Type mapping:**

| Internal Type | Display Label |
|--------------|--------------|
| `readiness` | "Executive Report" |
| `gap_analysis` | "Detailed Analysis" |
| `interview` | "Raw Data" |
| `strategic` / `automation` | "Strategic Report" |

**Acceptance Criteria:**
- [ ] Report table shows user-friendly type labels per mapping
- [ ] Filter tabs updated to match: All / Executive / Detailed / Raw Data / Strategic

---

### REPORT-006: Add file size and download button to report rows
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/Reports.tsx` |
| **Dependencies** | REPORT-002 |

**Current:** Eye icon "View" button only, no file size
**Required:** Each row shows file size + blue "Download" button with download icon

**Acceptance Criteria:**
- [ ] File size column shows value (e.g., "2.4 MB")
- [ ] "Download" button with `Download` icon replaces eye/view button
- [ ] Download button calls `GET /api/reports/:id/download` and triggers file save
- [ ] "Ready" status badge (green) or "Generating..." with spinner

---

### REPORT-007: Implement Generate New Report flow
| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/pages/Reports.tsx` |
| **Dependencies** | REPORT-002 |

**Description:** Modal dialog triggered by "Generate New Report" button:
1. Select session (dropdown of completed sessions)
2. Select report type (Executive Report / Detailed Analysis / Raw Data / Strategic)
3. Enter report name (text input, auto-generated default)
4. Click "Generate" → calls API → shows "Generating..." in table → updates to "Ready"

**Acceptance Criteria:**
- [ ] Modal opens on "Generate New Report" click
- [ ] Session dropdown shows completed sessions
- [ ] Report type dropdown with 4 options
- [ ] Name auto-fills with sensible default (e.g., "Q3 Executive Summary")
- [ ] Generate button calls `POST /api/reports/generate`
- [ ] New report appears in table with "Generating..." status
- [ ] Status updates to "Ready" when generation completes (poll or SSE)

---

### REPORT-008: Update E2E tests for Reports page
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `e2e/processiq.spec.ts` |
| **Dependencies** | REPORT-003, REPORT-004, REPORT-006 |

**Acceptance Criteria:**
- [ ] Test verifies "Generate New Report" button presence
- [ ] Test verifies correct stat card labels
- [ ] Test verifies report rows have download buttons
- [ ] Test verifies filter tabs work
- [ ] All Reports E2E tests pass

---

## EPIC: SETTINGS — Settings Page Enhancement

> Changes to `frontend/src/pages/SettingsPage.tsx` and new backend APIs.

### SETTINGS-001: Create project settings backend
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | M |
| **Status** | TODO |
| **Files** | `backend/src/routes/settings.ts` (new), `backend/src/config/database.ts` |
| **Dependencies** | None |

**New endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings/project` | Token | Get project settings |
| PUT | `/api/settings/project` | Admin | Update project settings |

**Settings stored in OpenSearch (singleton document):**
```json
{
  "settingsId": "project-settings",
  "projectName": "Q3 Global Assessment",
  "assessmentPeriod": "Q3 2025 - Q1 2026",
  "timeZone": "UTC-8",
  "activeDomain": "finance",
  "language": "en",
  "activeModel": "openai:gpt-4o",
  "notifications": {
    "criticalRiskAlerts": true,
    "smeResponseUpdates": true,
    "weeklySummary": false
  },
  "sessionTimeout": 30,
  "updatedBy": "admin-user-id",
  "updatedAt": "2026-03-24T00:00:00Z"
}
```

**Acceptance Criteria:**
- [ ] GET returns current settings (or defaults if none exist)
- [ ] PUT validates and updates settings (admin only)
- [ ] Route registered in Express app
- [ ] Audit middleware logs settings mutations

---

### SETTINGS-002: Add Project Name field
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/SettingsPage.tsx` |
| **Dependencies** | SETTINGS-001 |

**Description:** Add "Project Name" text input to General section.

**Acceptance Criteria:**
- [ ] Text input labeled "Project Name" in General section
- [ ] Populated from `GET /api/settings/project` response
- [ ] Saved on "Save Changes" via `PUT /api/settings/project`
- [ ] Admin-only field (disabled/hidden for non-admin users)
- [ ] Value reflected in TopBar "Current Project: {projectName}"

---

### SETTINGS-003: Add Assessment Period field
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | XS |
| **Status** | TODO |
| **File** | `frontend/src/pages/SettingsPage.tsx` |
| **Dependencies** | SETTINGS-001 |

**Description:** Add "Assessment Period" text input to General section.

**Acceptance Criteria:**
- [ ] Text input labeled "Assessment Period" in General section
- [ ] Placeholder: "Q3 2025 - Q1 2026"
- [ ] Persisted via settings API
- [ ] Admin-only field

---

### SETTINGS-004: Add Time Zone dropdown
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/pages/SettingsPage.tsx` |
| **Dependencies** | SETTINGS-001 |

**Description:** Add "Time Zone" dropdown to General section.

**Options:**
- UTC-12 through UTC+14 (or use `Intl.supportedValuesOf('timeZone')`)
- Default: "UTC-8 (Pacific Time)"

**Acceptance Criteria:**
- [ ] Dropdown labeled "Time Zone" in General section
- [ ] Shows timezone with offset format: "UTC-8 (Pacific Time)"
- [ ] Persisted via settings API
- [ ] Available to all users

---

### SETTINGS-005: Wire TopBar to project settings
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/components/layout/TopBar.tsx` |
| **Dependencies** | SETTINGS-001, SETTINGS-002 |

**Description:** TopBar currently displays project name from domain config. Update to read from project settings API.

**Acceptance Criteria:**
- [ ] "Current Project: {projectName}" reads from settings API
- [ ] Subtitle still shows process types from domain config
- [ ] Falls back to domain name if no project name configured

---

### SETTINGS-006: Implement data management backend (stub)
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | L |
| **Status** | TODO |
| **Files** | `backend/src/routes/settings.ts`, `frontend/src/pages/SettingsPage.tsx` |
| **Dependencies** | SETTINGS-001 |

**Description:** Wire the three Data Management buttons to backend actions.

| Button | API | Action |
|--------|-----|--------|
| Export All Discovery Data | `GET /api/settings/export` | Generate ZIP of all sessions, documents, reports → download |
| Archive Completed Assessments | `POST /api/settings/archive` | Mark completed sessions as archived |
| Delete Project Data | `DELETE /api/settings/data` | Delete all project data (with confirmation) |

**Acceptance Criteria:**
- [ ] Export generates a downloadable ZIP/JSON bundle
- [ ] Archive marks sessions as archived (filter them from default views)
- [ ] Delete requires confirmation dialog → deletes data → redirects to dashboard
- [ ] All 3 endpoints admin-only with audit logging
- [ ] Delete shows a destructive confirmation dialog ("Type project name to confirm")

---

## EPIC: POLISH — UX Polish & Quality

> Cross-cutting improvements for production readiness.

### POLISH-001: Add toast notification system
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | M |
| **Status** | TODO |
| **Files** | `frontend/src/components/shared/Toast.tsx` (new), integration across pages |
| **Dependencies** | None |

**Description:** Create a toast notification component for success/error/warning messages across the app.

**Acceptance Criteria:**
- [ ] Toast component with variants: success (green), error (red), warning (amber), info (blue)
- [ ] Auto-dismiss after 5 seconds with manual close option
- [ ] Positioned top-right
- [ ] Used for: save settings, report generation, login errors, API errors

---

### POLISH-002: Add skeleton loading screens
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | M |
| **Status** | TODO |
| **Files** | `frontend/src/components/shared/Skeleton.tsx` (new), all pages |
| **Dependencies** | None |

**Description:** Replace spinner-only loading states with skeleton screens that match page layout.

**Acceptance Criteria:**
- [ ] Skeleton component (animated pulse, dark grey blocks)
- [ ] Dashboard shows KPI card skeletons + process flow skeleton while loading
- [ ] Reports page shows stat card skeletons + table skeleton
- [ ] SME page shows stat card skeletons + table skeleton

---

### POLISH-003: Client-side form validation
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | M |
| **Status** | TODO |
| **Files** | `frontend/src/pages/Login.tsx`, `frontend/src/pages/admin/CreateUser.tsx`, `frontend/src/pages/SettingsPage.tsx` |
| **Dependencies** | None |

**Description:** Add proper client-side validation to all forms.

**Acceptance Criteria:**
- [ ] Login: email format validation, password required
- [ ] Create User: all required fields validated, email format, password min length
- [ ] Settings: project name required (if admin), valid timezone selection
- [ ] Inline error messages below fields (red text)
- [ ] Submit button disabled when form is invalid

---

### POLISH-004: Error boundary component
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/components/shared/ErrorBoundary.tsx` (new) |
| **Dependencies** | None |

**Description:** React error boundary to catch rendering errors and show fallback UI.

**Acceptance Criteria:**
- [ ] Catches JS errors in child component tree
- [ ] Shows fallback UI: "Something went wrong" + "Try Again" button
- [ ] Wraps each page route independently
- [ ] Logs error details to console

---

### POLISH-005: Accessibility improvements
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | L |
| **Status** | TODO |
| **Files** | All frontend components |
| **Dependencies** | None |

**Description:** Add ARIA labels, keyboard navigation, and semantic HTML improvements.

**Acceptance Criteria:**
- [ ] All interactive elements have `aria-label` or associated `<label>`
- [ ] Tab navigation works through sidebar → topbar → main content
- [ ] Charts have `aria-describedby` with text descriptions
- [ ] Tables use proper `<thead>`, `<th scope>`, `<tbody>` structure
- [ ] Focus visible indicators on all interactive elements
- [ ] Color contrast meets WCAG AA (4.5:1 for text)

---

### POLISH-006: React.lazy code splitting
| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Size** | S |
| **Status** | TODO |
| **File** | `frontend/src/App.tsx` |
| **Dependencies** | None |

**Description:** Lazy-load page components to reduce initial bundle size.

**Acceptance Criteria:**
- [ ] All page components loaded via `React.lazy()` + `<Suspense>`
- [ ] Suspense fallback shows loading spinner
- [ ] Admin pages only loaded when admin route accessed
- [ ] Build output shows separate chunks per page

---

### POLISH-007: API response caching
| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Size** | M |
| **Status** | TODO |
| **File** | `frontend/src/services/api.ts` |
| **Dependencies** | None |

**Description:** Add simple client-side caching for stable API responses.

**Acceptance Criteria:**
- [ ] Domain config, languages, models cached for session duration
- [ ] Dashboard stats cached for 30 seconds
- [ ] Cache invalidated on relevant mutations (e.g., settings save clears domain cache)
- [ ] No caching on authentication or mutation endpoints

---

## EPIC: TEST — Testing

> E2E test updates and backend test coverage.

### TEST-001: Update E2E tests for all UI changes
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | L |
| **Status** | TODO |
| **File** | `e2e/processiq.spec.ts` |
| **Dependencies** | All LOGIN, DASH, NAV, INSIGHT, SME, REPORT tickets |

**Description:** Comprehensive update to Playwright tests covering all design gap fixes.

**Acceptance Criteria:**
- [ ] Login page tests cover tagline, demo box, subtitles
- [ ] Dashboard tests verify risk card SME contact and dollar impact
- [ ] Reports tests verify new controls, stat labels, download buttons
- [ ] Settings tests verify new Project Name, Period, Timezone fields
- [ ] All 75+ existing tests still pass
- [ ] New tests added for all changed elements

---

### TEST-002: Backend unit tests for new report APIs
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | M |
| **Status** | TODO |
| **File** | `backend/src/__tests__/reports.test.ts` (new) |
| **Dependencies** | REPORT-001, REPORT-002 |

**Acceptance Criteria:**
- [ ] Tests for `POST /api/reports/generate` (success, invalid session, auth)
- [ ] Tests for `GET /api/reports` (pagination, type filter)
- [ ] Tests for `GET /api/reports/stats` (correct aggregation)
- [ ] Tests for `GET /api/reports/:id/download` (PDF generation, not found)

---

### TEST-003: Backend unit tests for project settings API
| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Size** | S |
| **Status** | TODO |
| **File** | `backend/src/__tests__/settings.test.ts` (new) |
| **Dependencies** | SETTINGS-001 |

**Acceptance Criteria:**
- [ ] Tests for `GET /api/settings/project` (default values, existing values)
- [ ] Tests for `PUT /api/settings/project` (success, non-admin rejected, validation)

---

### TEST-004: Run full E2E suite and fix failures
| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Size** | M |
| **Status** | TODO |
| **File** | `e2e/` |
| **Dependencies** | All implementation tickets |

**Description:** Final verification — run full Playwright suite against all changes and fix any regressions.

**Acceptance Criteria:**
- [ ] `npx playwright test` passes with 0 failures
- [ ] HTML report generated and reviewed
- [ ] Any flaky tests identified and stabilized

---

## Implementation Order (Dependency Graph)

```
Phase 1: Foundation & Quick Wins (parallel tracks)
├── Track A: Login Page (LOGIN-001 → LOGIN-007)
├── Track B: Backend Risk API (RIGHT-001)
├── Track C: Sidebar Icons (NAV-001, NAV-002)
└── Track D: SME Labels (SME-001, SME-002)

Phase 2: Dashboard & Right Panel (depends on RIGHT-001)
├── RIGHT-002, RIGHT-003, RIGHT-004, RIGHT-005
├── DASH-001, DASH-002
└── DASH-003 → DASH-006

Phase 3: Insights Page (parallel with Phase 2)
├── INSIGHT-001 (dual-axis chart)
├── INSIGHT-002 (View Details button)
├── INSIGHT-003 (dollar amounts)
└── INSIGHT-004 (layout)

Phase 4: Reports Page Rebuild (largest epic)
├── REPORT-001 (index) → REPORT-002 (API)
├── REPORT-003 (controls) ─┐
├── REPORT-004 (stats)     ├── depends on REPORT-002
├── REPORT-005 (labels)    │
├── REPORT-006 (download)  │
├── REPORT-007 (generate) ─┘
└── REPORT-008 (tests)

Phase 5: Settings Enhancement
├── SETTINGS-001 (backend) → SETTINGS-002, 003, 004
├── SETTINGS-005 (TopBar wiring)
└── SETTINGS-006 (data management)

Phase 6: Polish & Testing
├── POLISH-001 through POLISH-007
└── TEST-001 through TEST-004
```

---

## Quick Reference: All Tickets by Status

| Ticket | Epic | Priority | Size | Status |
|--------|------|----------|------|--------|
| LOGIN-001 | LOGIN | P0 | XS | TODO |
| LOGIN-002 | LOGIN | P0 | S | TODO |
| LOGIN-003 | LOGIN | P0 | XS | TODO |
| LOGIN-004 | LOGIN | P1 | XS | TODO |
| LOGIN-005 | LOGIN | P1 | XS | TODO |
| LOGIN-006 | LOGIN | P1 | XS | TODO |
| LOGIN-007 | LOGIN | P1 | S | TODO |
| DASH-001 | DASH | P0 | S | TODO |
| DASH-002 | DASH | P0 | S | TODO |
| DASH-003 | DASH | P0 | XS | TODO |
| DASH-004 | DASH | P0 | M | TODO |
| DASH-005 | DASH | P0 | S | TODO |
| DASH-006 | DASH | P1 | S | TODO |
| RIGHT-001 | RIGHT | P0 | M | TODO |
| RIGHT-002 | RIGHT | P0 | S | TODO |
| RIGHT-003 | RIGHT | P0 | XS | TODO |
| RIGHT-004 | RIGHT | P0 | XS | TODO |
| RIGHT-005 | RIGHT | P1 | S | TODO |
| NAV-001 | NAV | P1 | XS | TODO |
| NAV-002 | NAV | P1 | XS | TODO |
| NAV-003 | NAV | P1 | XS | TODO |
| INSIGHT-001 | INSIGHT | P0 | M | TODO |
| INSIGHT-002 | INSIGHT | P0 | S | TODO |
| INSIGHT-003 | INSIGHT | P0 | M | TODO |
| INSIGHT-004 | INSIGHT | P2 | S | TODO |
| SME-001 | SME | P1 | XS | TODO |
| SME-002 | SME | P1 | XS | TODO |
| SME-003 | SME | P3 | M | TODO |
| REPORT-001 | REPORT | P0 | S | TODO |
| REPORT-002 | REPORT | P0 | L | TODO |
| REPORT-003 | REPORT | P0 | M | TODO |
| REPORT-004 | REPORT | P0 | S | TODO |
| REPORT-005 | REPORT | P1 | XS | TODO |
| REPORT-006 | REPORT | P0 | S | TODO |
| REPORT-007 | REPORT | P0 | M | TODO |
| REPORT-008 | REPORT | P1 | S | TODO |
| SETTINGS-001 | SETTINGS | P1 | M | TODO |
| SETTINGS-002 | SETTINGS | P1 | S | TODO |
| SETTINGS-003 | SETTINGS | P1 | XS | TODO |
| SETTINGS-004 | SETTINGS | P1 | S | TODO |
| SETTINGS-005 | SETTINGS | P1 | S | TODO |
| SETTINGS-006 | SETTINGS | P2 | L | TODO |
| POLISH-001 | POLISH | P2 | M | TODO |
| POLISH-002 | POLISH | P2 | M | TODO |
| POLISH-003 | POLISH | P2 | M | TODO |
| POLISH-004 | POLISH | P2 | S | TODO |
| POLISH-005 | POLISH | P2 | L | TODO |
| POLISH-006 | POLISH | P3 | S | TODO |
| POLISH-007 | POLISH | P3 | M | TODO |
| TEST-001 | TEST | P2 | L | TODO |
| TEST-002 | TEST | P2 | M | TODO |
| TEST-003 | TEST | P2 | S | TODO |
| TEST-004 | TEST | P1 | M | TODO |

**Summary:**
- **P0 tickets:** 21 (must fix before any release)
- **P1 tickets:** 16 (should fix for quality release)
- **P2 tickets:** 12 (polish and testing)
- **P3 tickets:** 4 (nice-to-have)
- **Total effort estimate:** ~120–160 hours
