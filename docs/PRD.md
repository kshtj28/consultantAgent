# ProcessIQ Discovery — Product Requirements Document (PRD)

**Version:** 3.0
**Date:** 2026-03-24
**Status:** Active Development
**Product:** ProcessIQ Discovery (Readiness Analysis Platform)
**Tagline:** Executive Process Intelligence

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Application Pages — Functional Specifications](#4-application-pages--functional-specifications)
   - 4.1 [Login Page](#41-login-page)
   - 4.2 [Dashboard](#42-dashboard)
   - 4.3 [Process Analysis](#43-process-analysis)
   - 4.4 [Insights](#44-insights)
   - 4.5 [SME Engagement](#45-sme-engagement)
   - 4.6 [Reports](#46-reports)
   - 4.7 [Settings](#47-settings)
   - 4.8 [Admin Pages](#48-admin-pages)
5. [Shared Layout Components](#5-shared-layout-components)
6. [Data Models](#6-data-models)
7. [API Specifications](#7-api-specifications)
8. [AI & LLM Integration](#8-ai--llm-integration)
9. [Domain Configuration](#9-domain-configuration)
10. [Infrastructure & Deployment](#10-infrastructure--deployment)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Design Gap Remediation Tracker](#12-design-gap-remediation-tracker)
13. [Implementation Phases](#13-implementation-phases)
14. [Success Metrics](#14-success-metrics)
15. [Glossary](#15-glossary)

---

## 1. Executive Summary

ProcessIQ Discovery is an AI-driven enterprise SaaS platform for business process assessment and gap analysis. It enables consulting firms and enterprise teams to evaluate operational processes (Order-to-Cash, Record-to-Report, Procure-to-Pay), identify critical bottlenecks, quantify automation opportunities, and track engagement with Subject Matter Experts (SMEs).

The platform combines structured interview-based assessments with AI-powered analysis, document ingestion (RAG), and real-time dashboards to deliver actionable insights. It is **domain-agnostic** — the core engine (interview, document analysis, reporting) remains the same across Finance, HR, Supply Chain, Construction, and Manufacturing, with domain-specific knowledge externalized into configuration files.

**Key Capabilities:**
- AI-generated dynamic interview questions (foundation → probing → discovery → transformation → benchmark modes)
- Multi-provider LLM support (OpenAI, Anthropic, Google Gemini, Ollama)
- Document ingestion with vector embeddings and RAG-augmented analysis
- Real-time dashboards with KPI gauges, process flow visualization, and risk tracking
- Role-based access control (admin / analyst / user) with full audit logging
- SSE-powered real-time notifications
- Global multi-index search
- Multi-language support (English, Hindi, Arabic, French, Spanish)
- PDF report export (Readiness, Gap Analysis, Interview)

---

## 2. Current State Assessment

### 2.1 What Is Built

| Layer | Status | Details |
|-------|--------|---------|
| **Frontend** | ~85% functional | All 7 main pages + 3 admin pages implemented. Layout (Sidebar, TopBar, RightPanel) complete. Charts (Recharts, D3, custom SVG) working. i18n framework in place. |
| **Backend** | ~90% functional | 11 route modules, 15+ services, JWT auth, RBAC middleware, audit middleware, SSE notifications, global search, multi-LLM provider factory. |
| **Infrastructure** | Production-ready | Terraform for AWS (ECS, ECR, ALB, OpenSearch, EFS, Secrets Manager). Docker multi-stage builds. GitHub Actions CI/CD with OIDC. GPU on-demand scaling. |
| **Testing** | E2E coverage | 75+ Playwright E2E tests across ProcessIQ and Consultant Agent flows. Backend has vitest setup. |

### 2.2 Gap Summary (Mockup vs. Implementation)

| Status | Count | Description |
|--------|-------|-------------|
| **GAP** (Missing/Wrong) | 28 | Features in mockups but missing or incorrect in code |
| **PARTIAL** (Differs) | 17 | Features exist but differ from mockup spec |
| **OK** (Matches) | 25 | Implementation matches mockup |
| **EXTRA** | 1 | In code but not in mockup |

**Critical gaps** are itemized in [Section 12](#12-design-gap-remediation-tracker).

---

## 3. User Roles & Personas

### 3.1 User (CXO / Executive / Analyst)

| Capability | Description |
|-----------|-------------|
| View own assessments | Process analysis page shows personal sessions |
| Participate in interviews | AI-driven readiness assessment workflow |
| Review AI insights | Insights page with recommendations and trends |
| Download reports | Readiness, Gap Analysis, Interview reports |
| Manage notifications | View and dismiss personal notifications |
| Upload documents | Supporting evidence for assessments |

### 3.2 Admin (Engagement Lead / Consultant)

All User capabilities, plus:

| Capability | Description |
|-----------|-------------|
| Create/manage users | CRUD operations on user accounts |
| View all sessions | Cross-user session visibility |
| Configure project | Domain, model, project name, assessment period |
| Access audit logs | Full mutation audit trail with filters |
| Manage data | Export, archive, delete project data |
| Generate reports | Reports across all sessions |

### 3.3 Analyst

All User capabilities, plus:

| Capability | Description |
|-----------|-------------|
| View all sessions | Cross-user session visibility |
| Generate reports | Reports across accessible sessions |
| Export data | Data export capability |

### 3.4 RBAC Permission Matrix

| Resource | admin | analyst | user |
|----------|-------|---------|------|
| Create users | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
| Manage users (edit/deactivate) | ✅ | ❌ | ❌ |
| Start assessments | ✅ | ✅ | ✅ |
| View all sessions | ✅ | ✅ | Own only |
| Generate reports | ✅ | ✅ | Own only |
| Upload documents | ✅ | ✅ | ✅ |
| Delete documents | ✅ | ✅ | Own only |
| Change settings (domain, model) | ✅ | ❌ | ❌ |
| Export/Archive data | ✅ | ✅ | ❌ |
| Delete project data | ✅ | ❌ | ❌ |
| View notifications | ✅ | ✅ | ✅ |

**Implementation:**
- Backend: `requireRole(...roles)` middleware on every route (`middleware/auth.ts`)
- Frontend: `<RoleGuard>` component + `useAuth().isAdmin` for conditional rendering
- AuthContext exposes `user.role` for UI decisions

---

## 4. Application Pages — Functional Specifications

### 4.1 Login Page

**Route:** `/login`
**Component:** `pages/Login.tsx`
**Purpose:** Authenticate users with role-based access.

**Layout:**
- **Left panel:** Branding — ProcessIQ Discovery logo (clipboard/document icon), tagline "Executive Process Intelligence", marketing copy, stat badges ("98% Process Coverage", "24/7 Monitoring")
- **Right panel:** Sign-in form with role selector

**Functional Requirements:**

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| LOGIN-01 | Two login mode tabs: "User Login" (subtitle: "View your assessments") and "Admin Login" (subtitle: "View all employees") | P0 | ⚠️ GAP — subtitles missing |
| LOGIN-02 | Email field (placeholder: "you@company.com") + Password field with lock icon inside input | P0 | ⚠️ GAP — lock icon missing, placeholder wrong |
| LOGIN-03 | Demo credentials info box: blue border box showing `User: john@company.com / user123` and `Admin: admin@company.com / admin123` | P1 | ⚠️ GAP — not present |
| LOGIN-04 | JWT-based authentication with 24h token expiration | P0 | ✅ Done |
| LOGIN-05 | Redirect to `/dashboard` on successful login | P0 | ✅ Done |
| LOGIN-06 | Error messaging for invalid credentials (inline red text) | P0 | ✅ Done |
| LOGIN-07 | Loading spinner on Sign In button during authentication | P1 | ✅ Done |
| LOGIN-08 | Tagline must read "Executive Process Intelligence" (not "Intelligent Process Intelligence") | P0 | ⚠️ GAP — wrong text |
| LOGIN-09 | Admin tab icon must be clipboard/document icon (not shield) | P1 | ⚠️ PARTIAL — wrong icon |

**Mockup Reference:** Login screenshot shows the exact layout with demo credentials box between password field and Sign In button.

---

### 4.2 Dashboard

**Route:** `/dashboard`
**Component:** `pages/Dashboard.tsx`
**Purpose:** Executive overview of process discovery progress, risk posture, and key metrics.

**Layout:** Three-column — left sidebar, center content, right panel (Key Risks + SME Heatmap).

#### 4.2.1 KPI Cards Row (4 cards)

| ID | KPI Card | Data Source | Visualization | Status |
|----|----------|------------|---------------|--------|
| DASH-01 | Process Gap Severity | `riskScore` avg across sessions | Half-circle gauge chart (green→red gradient) with "Medium Risk" label + "Avg risk: {score}" | ✅ Done |
| DASH-02 | Critical Issues Identified | `criticalIssues` sum | Large number + trend arrow + "Requires attention" subtitle + "Across all assessments" meta | ✅ Done |
| DASH-03 | Automation Quotient | Calculated from session data | Percentage + "↑ 8% improvement potential" delta + "Current automation level" meta | ✅ Done |
| DASH-04 | Discovery Progress | `completionRate` avg | Circular SVG progress ring + "Est. completion: {date}" | ✅ Done |

#### 4.2.2 Process Flow Section

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| DASH-05 | Title must show specific process type: e.g., "Order-to-Cash Process Flow" (not generic domain name) | P0 | ⚠️ GAP — shows generic domain title |
| DASH-06 | Sequential step cards: Order Entry → Credit Check → Fulfillment → Invoicing → Payment (for O2C) | P0 | ✅ Done |
| DASH-07 | Each step shows: step name, step number, "Avg. Duration" label, duration value | P0 | ✅ Done |
| DASH-08 | Critical steps: red border, red step number text, warning icon badge (⊕) | P0 | ✅ Done |
| DASH-09 | Duration values must show realistic units — mix of "hrs" and "days" (e.g., "4.5 hrs", "3.2 days"). Critical bottleneck steps should show "days" | P0 | ⚠️ GAP — always shows "hrs" |
| DASH-10 | Arrow connectors (→) between steps | P1 | ✅ Done |
| DASH-11 | Summary row below flow: Total Cycle Time, Critical Bottlenecks count, Automation Opportunity level (Low/Medium/High) | P0 | ✅ Done |
| DASH-12 | Legend: grey dot "Normal" + red dot "Critical Issues" | P1 | ✅ Done |

**Duration Calculation Rule:**
```
If questionsAnswered * 1.5 >= 24 → show in days (value / 24, 1 decimal)
If critical step → always show in days (minimum "1.2 days")
Otherwise → show in hours
```

#### 4.2.3 Right Panel — Key Risks & Narratives

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| DASH-13 | Header: "Key Risks & Narratives" with red badge showing unresolved risk count (e.g., "3") | P0 | ⚠️ GAP — badge missing |
| DASH-14 | Top 3 risk cards, each showing: severity badge (HIGH RISK red / MEDIUM RISK yellow), title, timestamp ("2h ago") | P0 | ✅ Done |
| DASH-15 | Each risk card must show: SME contact name + role (e.g., "👤 John Smith, Credit Mgr") | P0 | ⚠️ GAP — shows "Source: {area}" instead |
| DASH-16 | Each risk card must show: dollar impact (e.g., "↗ $2.4M annual impact") | P0 | ⚠️ GAP — not present |
| DASH-17 | "View All Risks ({N} total)" link at bottom — must be clickable and navigate to a risk detail view | P1 | ⚠️ GAP — button exists but no handler |

**Risk Card Data Model** (per mockup):
```typescript
interface RiskCard {
  severity: 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK';
  title: string;                    // e.g., "Manual credit checks causing 3-day delay in O2C"
  smeContact: {
    name: string;                   // e.g., "John Smith"
    role: string;                   // e.g., "Credit Mgr"
  };
  annualImpact: string;            // e.g., "$2.4M annual impact"
  timestamp: string;               // ISO date → rendered as "2h ago"
  sessionId: string;
}
```

#### 4.2.4 Right Panel — SME Engagement Heatmap

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| DASH-18 | Department-level engagement bars (e.g., Sales 90%, Finance 45%, Warehouse 20%) | P0 | ✅ Done |
| DASH-19 | Color coding: green (≥70%), orange/amber (40–69%), red (<40%) | P0 | ✅ Done |
| DASH-20 | "Overall Engagement" average percentage at bottom | P0 | ✅ Done |

---

### 4.3 Process Analysis

**Route:** `/process-analysis`
**Component:** `pages/ProcessAnalysis.tsx`
**Purpose:** View personal process assessments, performance metrics, and assessment details. Entry point for starting/resuming assessments.

#### 4.3.1 Header

- Title: "My Process Assessments"
- Subtitle: "Your personal process analysis and performance metrics"
- Filter button (top-right): "👤 {N} My Assessments"

#### 4.3.2 Summary Stats Row (4 cards)

| ID | Stat | Source | Status |
|----|------|--------|--------|
| PA-01 | Total Assessments | `readinessSessions.length` | ✅ Done |
| PA-02 | Completed | Completed session count (green text) | ✅ Done |
| PA-03 | Critical Issues | Sum of `criticalIssues` across sessions | ✅ Done |
| PA-04 | Avg Risk Score | Average `riskScore` across sessions | ✅ Done |

#### 4.3.3 Charts Section

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| PA-05 | Process Type Distribution — Pie/donut chart showing percentage by process type (Order-to-Cash, Record-to-Report, Procure-to-Pay) | P0 | ✅ Done |
| PA-06 | Process Efficiency Overview — Bar chart showing efficiency (0–100) per process step | P0 | ✅ Done |

#### 4.3.4 Assessment Details Section

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| PA-07 | Assessment cards: process name + status badge (In Progress / Completed / Not Started) + "Last Updated {date}" | P0 | ✅ Done |
| PA-08 | Each card shows: Completion Rate (progress bar + %), Critical Issues (⚠ icon + count), Risk Score (numeric) | P0 | ✅ Done |
| PA-09 | Click assessment → view details or resume interview | P0 | ✅ Done |

#### 4.3.5 Assessment Workflow (on start/resume)

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| PA-10 | Multi-step flow: Select Areas → Interview Questions → Review → Complete | P0 | ✅ Done |
| PA-11 | Area selection grid with checkboxes | P0 | ✅ Done |
| PA-12 | AI-generated questions based on domain context, previous answers, uploaded documents | P0 | ✅ Done |
| PA-13 | Question types: open_ended (textarea + voice), yes_no, single_choice, multi_choice, scale (1–5) | P0 | ✅ Done |
| PA-14 | Progress tracking sidebar showing area completion status | P0 | ✅ Done |
| PA-15 | GPU/LLM warmup handling with retry logic (24 attempts × 15s = 6 min max) and progress indicator | P1 | ✅ Done |
| PA-16 | Document upload zone (drag-and-drop) per area | P1 | ✅ Done |
| PA-17 | "Begin Assessment" button disabled when no areas selected | P0 | ✅ Done |

---

### 4.4 Insights

**Route:** `/insights`
**Component:** `pages/Insights.tsx`
**Purpose:** AI-driven recommendations and performance trend analysis.

**Header:** "AI-Driven Insights" / "Actionable recommendations based on process discovery"

#### 4.4.1 Performance Trends Chart

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| INS-01 | **Dual-axis** line chart: Left Y-axis (0–16 scale), Right Y-axis (0–60 scale) | P0 | ⚠️ GAP — both lines on same Y-axis |
| INS-02 | X-axis: monthly labels (Sep, Oct, Nov, Dec, Jan, Feb) | P0 | ✅ Done |
| INS-03 | Two data lines (green, white/grey) representing different metrics | P0 | ⚠️ PARTIAL |
| INS-04 | "↗ Improving" green badge top-right when trend is positive | P0 | ✅ Done |

**Dual-Axis Implementation:**
```tsx
<ComposedChart>
  <YAxis yAxisId="left" domain={[0, 16]} />
  <YAxis yAxisId="right" orientation="right" domain={[0, 60]} />
  <Line yAxisId="left" dataKey="sessions" stroke="#4ade80" />
  <Line yAxisId="right" dataKey="efficiency" stroke="#94a3b8" />
</ComposedChart>
```

#### 4.4.2 Recommended Actions Section

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| INS-05 | Action cards with: icon (⚡ lightning yellow bg = quick win, $ dollar blue bg = revenue), title, description, Impact tag (High/Medium/Low), Effort tag | P0 | ✅ Done |
| INS-06 | **"View Details" button** on each card (blue, right-aligned) — expands to full analysis | P0 | ⚠️ GAP — shows expand chevron instead |
| INS-07 | Description must include dollar amounts (e.g., "could save $2.4M annually", "targets $890K in recoverable revenue") | P0 | ⚠️ GAP — generic AI text, no dollar amounts |
| INS-08 | AI-generated actions sourced from gap analysis + automation detection | P0 | ✅ Done |
| INS-09 | Static baseline actions ("Automation Quick Win", "Revenue Leakage Opportunity") combined with AI insights | P1 | ⚠️ PARTIAL |

**Action Card Layout (per mockup):**
```
┌─────────────────────────────────────────────────────────┐
│ [⚡ icon]  Automation Quick Win          [View Details]  │
│            Implementing automated credit check           │
│            validation could save $2.4M annually          │
│            Impact: High   Effort: Medium                 │
└─────────────────────────────────────────────────────────┘
```

---

### 4.5 SME Engagement

**Route:** `/sme-engagement`
**Component:** `pages/SMEEngagement.tsx`
**Purpose:** Track Subject Matter Expert participation, engagement levels, and response metrics.

**Header:** "SME Engagement" / "Track subject matter expert participation and insights"

#### 4.5.1 Summary Stats Row (4 cards)

| ID | Stat Card | Label (Mockup) | Subtitle (Mockup) | Current Code | Status |
|----|-----------|----------------|--------------------|--------------|---------
| SME-01 | Card 1 | **"Total SMEs"** | "Across all departments" | "Total Participants" / "from N sessions" | ⚠️ GAP — wrong label + subtitle |
| SME-02 | Card 2 | "Active Participants" | "{N}% participation rate" (green) | Present | ✅ OK |
| SME-03 | Card 3 | **"Total Responses"** | **"This assessment period"** | "Total Responses" / "N% average engagement" | ⚠️ GAP — wrong subtitle |
| SME-04 | Card 4 | "Low Engagement" | "Need follow-up" (red) | Conditional message | ✅ OK |

**Required changes:**
- Card 1: label → "Total SMEs", subtitle → "Across all departments"
- Card 3: subtitle → "This assessment period"

#### 4.5.2 Subject Matter Experts Table

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| SME-05 | Columns: SME (avatar initials + name + role subtitle), Department, Engagement (progress bar + %), Responses (count), Last Active (relative time), Status (badge) | P0 | ✅ Done |
| SME-06 | Avatar: colored circle with initials (e.g., "JS" for John Smith) | P1 | ✅ Done |
| SME-07 | Engagement bar color: green (≥70%), orange (40–69%), red (<40%) | P0 | ✅ Done |
| SME-08 | Status badges: "Active" (green), "Low Activity" (orange), "Inactive" (red) | P0 | ✅ Done |
| SME-09 | Sortable and filterable table | P2 | ❌ Not implemented |

**Engagement Calculation:**
```
Engagement % = (user's questionsAnswered / total session questionsAnswered) × 100
Status:
  - Active: last login < 3 days ago
  - Low Activity: last login 3–7 days ago
  - Inactive: last login > 7 days ago OR never logged in
```

---

### 4.6 Reports

**Route:** `/reports`
**Component:** `pages/Reports.tsx`
**Purpose:** Access generated reports, create new reports, download documentation.

**Header:** "Reports & Documentation" / "Access generated reports and export data"

#### 4.6.1 Controls Row

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| REP-01 | "Date Range" button (left, outline style with calendar icon) | P1 | ⚠️ GAP — not present |
| REP-02 | "Filter" button (outline style with filter icon) | P1 | ⚠️ PARTIAL — has filter tabs instead |
| REP-03 | **"Generate New Report"** button (right, blue/primary, with + icon) | P0 | ⚠️ GAP — not present |

#### 4.6.2 Summary Stats Row (4 cards)

| ID | Stat | Mockup Value | Current Code | Status |
|----|------|-------------|-------------|--------|
| REP-04 | Total Reports | "47" | Shows "Sessions" count | ⚠️ GAP — wrong metric |
| REP-05 | This Month | "12" | Shows "Documents" count | ⚠️ GAP — wrong metric |
| REP-06 | Downloads | "284" | Shows "Completed" count | ⚠️ GAP — wrong metric |
| REP-07 | Storage Used | "1.2 GB" | Shows sessions count | ⚠️ GAP — wrong metric |

**Note:** These stats require a new `reports` data model to track report generation, downloads, and storage. Until implemented, show computed values from existing data or placeholder values.

#### 4.6.3 Recent Reports Table

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| REP-08 | Table rows: report icon, report name, report type, date, file size | P0 | ⚠️ GAP — file size missing |
| REP-09 | Report type labels: "Executive Report", "Detailed Analysis", "Raw Data", "Strategic Report" | P0 | ⚠️ GAP — shows "readiness", "gap", "interview" |
| REP-10 | Status badge: "Ready" (green) or "Generating..." (amber with spinner) | P0 | ⚠️ PARTIAL — uses session status |
| REP-11 | **"Download" button** (blue, with download icon) for each ready report | P0 | ⚠️ GAP — shows "View" eye icon only |
| REP-12 | Report type filter tabs: All / Readiness / Gap Analysis / Interview | P1 | ✅ Done |

**Report Type Mapping:**
```
readiness    → "Executive Report"
gap          → "Detailed Analysis"
interview    → "Raw Data"
automation   → "Strategic Report"
```

#### 4.6.4 Report Generation & Export

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| REP-13 | Generate reports from completed assessment sessions | P0 | ✅ Done |
| REP-14 | Report preview modal with type-specific rendering | P1 | ✅ Done |
| REP-15 | PDF export (html2canvas + jspdf) | P0 | ⚠️ PARTIAL — libraries present, may not be fully wired |
| REP-16 | "Generate New Report" flow: select session → select type → generate → show in table | P0 | ⚠️ GAP |

---

### 4.7 Settings

**Route:** `/settings`
**Component:** `pages/SettingsPage.tsx`
**Purpose:** Configure project preferences, notifications, security, and data management.

**Header:** "Settings" / "Configure your ProcessIQ Discovery preferences"

#### 4.7.1 General Section

| ID | Setting | Type | Mockup | Current Code | Status |
|----|---------|------|--------|-------------|--------|
| SET-01 | Project Name | Text input | "Q3 Global Assessment" | Not present (has Domain dropdown) | ⚠️ GAP |
| SET-02 | Assessment Period | Text input | "Q3 2025 - Q1 2026" | Not present | ⚠️ GAP |
| SET-03 | Time Zone | Dropdown | "UTC-8 (Pacific Time)" | Not present (has Session Timeout here) | ⚠️ GAP |
| SET-04 | Active Domain | Dropdown | Present in mockup as separate | Present in code | ✅ Done (keep) |
| SET-05 | Language | Dropdown | Not in mockup General section | Present in code | ✅ Done (keep) |
| SET-06 | AI Model | Dropdown | Not in mockup General section | Present in code | ✅ Done (keep, admin only) |

**Required:** Add Project Name, Assessment Period, and Time Zone fields to the General section. Keep existing Domain, Language, and Model dropdowns.

#### 4.7.2 Notifications Section

| ID | Setting | Default | Status |
|----|---------|---------|--------|
| SET-07 | Critical Risk Alerts (toggle) | ON | ✅ Done |
| SET-08 | SME Response Updates (toggle) | ON | ✅ Done |
| SET-09 | Weekly Summary (toggle) | OFF | ✅ Done |

Each toggle has a subtitle description (e.g., "Get notified about high-risk findings").

#### 4.7.3 Security & Privacy Section

| ID | Setting | Type | Status |
|----|---------|------|--------|
| SET-10 | Two-Factor Authentication | "Enable" button (green) | ⚠️ PARTIAL — UI present, no handler |
| SET-11 | Session Timeout | Dropdown: 15 min / 30 min / 1 hour | ✅ Done |

#### 4.7.4 Data Management Section (Admin Only)

| ID | Action | Style | Status |
|----|--------|-------|--------|
| SET-12 | Export All Discovery Data | Default button | ⚠️ PARTIAL — button exists, no backend |
| SET-13 | Archive Completed Assessments | Default button | ⚠️ PARTIAL — button exists, no backend |
| SET-14 | Delete Project Data | Destructive red button + confirmation dialog | ⚠️ PARTIAL — button exists, no backend |

#### 4.7.5 Save Action

| ID | Requirement | Status |
|----|------------|--------|
| SET-15 | "Save Changes" button at bottom | ✅ Done |
| SET-16 | Success/error feedback toast on save | ⚠️ PARTIAL |

---

### 4.8 Admin Pages

#### 4.8.1 User Management

**Route:** `/admin/users`
**Component:** `pages/admin/UserManagement.tsx`

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| ADM-01 | Table: name, email, role, department, status, last login | P0 | ✅ Done |
| ADM-02 | Create new user (username, password, role, department) — separate page `/admin/create-user` | P0 | ✅ Done |
| ADM-03 | Edit user role and status (inline or modal) | P1 | ✅ Done |
| ADM-04 | Deactivate/activate users (soft delete) | P1 | ✅ Done |

#### 4.8.2 Audit Logs

**Route:** `/admin/audit-logs`
**Component:** `pages/admin/AuditLogs.tsx`

| ID | Requirement | Priority | Status |
|----|------------|----------|--------|
| ADM-05 | Chronological list of all system mutations | P0 | ✅ Done |
| ADM-06 | Fields: timestamp, user, action, resource, resourceId, IP | P0 | ✅ Done |
| ADM-07 | Filterable by user, action type, date range | P2 | ✅ Done |
| ADM-08 | Pagination | P1 | ✅ Done |

---

## 5. Shared Layout Components

### 5.1 Sidebar Navigation

**Component:** `components/layout/Sidebar.tsx`

| ID | Element | Mockup Spec | Status |
|----|---------|------------|--------|
| SH-01 | Logo: pulse/heartbeat icon + "ProcessIQ" + "Discovery" | ⚠️ PARTIAL — shows hexagon icon |
| SH-02 | 6 nav items: Dashboard, Process Analysis, Insights, SME Engagement, Reports, Settings | ✅ Done |
| SH-03 | Admin section (conditional): User Management, Audit Logs | ✅ Done |
| SH-04 | User card at bottom: avatar (initials), name, role, logout button | ✅ Done |
| SH-05 | Active state: highlighted with blue accent color + icon | ✅ Done |

**Nav Icon Mapping (per mockup):**

| Nav Item | Mockup Icon | Current Icon | Action |
|----------|------------|-------------|--------|
| Dashboard | Grid (4 squares) | LayoutDashboard | ✅ OK |
| Process Analysis | Pulse/activity line | GitBranch | ⚠️ Change to `Activity` |
| Insights | Zigzag/trending | Lightbulb | ⚠️ Change to `TrendingUp` |
| SME Engagement | People/users | Users | ✅ OK |
| Reports | File/document | FileText | ✅ OK |
| Settings | Gear | Settings | ✅ OK |

### 5.2 Top Bar

**Component:** `components/layout/TopBar.tsx`

| ID | Element | Status |
|----|---------|--------|
| SH-06 | "Current Project: {projectName}" + subtitle (process types) | ✅ Done |
| SH-07 | Global search input: "Search processes..." placeholder, debounced 300ms, results dropdown | ✅ Done |
| SH-08 | Notification bell with real-time unread count badge (SSE) | ✅ Done |
| SH-09 | User display: "{firstName} {lastName}" + email | ✅ Done |
| SH-10 | Logout button (exit icon) | ✅ Done |

**Search Results Format:**
```json
{
  "results": [
    { "type": "session", "id": "s-123", "title": "Q3 Readiness", "snippet": "AP assessment...", "url": "/process-analysis" },
    { "type": "document", "id": "d-456", "title": "Invoice Policy.pdf", "snippet": "...approval workflow...", "url": "/sme-engagement" }
  ]
}
```

### 5.3 Right Panel

**Component:** `components/layout/RightPanel.tsx`
**Persistent:** Visible on all authenticated pages.

Contains:
1. **Key Risks & Narratives** (top section) — see [DASH-13 through DASH-17](#423-right-panel--key-risks--narratives)
2. **SME Engagement Heatmap** (bottom section) — see [DASH-18 through DASH-20](#424-right-panel--sme-engagement-heatmap)

---

## 6. Data Models

### 6.1 User

```typescript
interface User {
  userId: string;           // UUID
  username: string;         // email format
  passwordHash: string;     // bcrypt
  role: 'user' | 'admin' | 'analyst';
  firstName: string;
  lastName: string;
  organization: string;
  department: string;
  status: 'active' | 'inactive';
  language: 'en' | 'hi' | 'ar' | 'fr' | 'es';
  createdAt: string;        // ISO8601
  lastLoginAt: string;      // ISO8601
}
```
**Index:** `consultant_users`

### 6.2 Readiness Session

```typescript
interface ReadinessSession {
  sessionId: string;         // UUID
  userId: string;            // FK → User
  domainId?: string;
  language: string;
  sessionType: 'readiness';
  processType: 'Order-to-Cash' | 'Record-to-Report' | 'Procure-to-Pay';
  status: 'draft' | 'in_progress' | 'completed';
  selectedAreas: string[];
  currentArea: string | null;
  responses: {
    [areaId: string]: {
      questionId: string;
      question: string;
      answer: string;
      questionType: string;
      source: 'user' | 'document' | 'ai';
      confidence: number;
      answeredAt: string;
    }[];
  };
  documents: {
    documentId: string;
    areaId: string;
    filename: string;
    uploadedAt: string;
  }[];
  conversationContext: {
    identifiedGaps: string[];
    transformationOpportunities: string[];
    painPoints: string[];
    automationOpportunities: string[];
  };
  riskScore: number;
  completionRate: number;
  criticalIssues: number;
  createdAt: string;
  updatedAt: string;
}
```
**Index:** `readiness_sessions`

### 6.3 Interview Session

```typescript
interface InterviewSession {
  sessionId: string;
  userId: string;
  domainId?: string;
  language: string;
  sessionType: 'interview_session';
  status: 'in_progress' | 'completed';
  currentCategory: string;
  depth: 'quick' | 'standard' | 'deep';
  responses: {
    [categoryId: string]: {
      question: string;
      answer: string;
      insights: string[];
    }[];
  };
  conversationHistory: { role: string; content: string }[];
  createdAt: string;
  updatedAt: string;
}
```
**Index:** `consultant_conversations`

### 6.4 Document

```typescript
interface Document {
  documentId: string;
  filename: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx';
  content: string;           // chunked text
  chunkIndex: number;
  totalChunks: number;
  embedding: number[];        // 768-dim knn_vector
  uploadedBy: string;
  uploadedAt: string;
  metadata: Record<string, any>;
  entities: {
    name: string;
    type: 'process' | 'system' | 'stakeholder' | 'metric' | 'issue';
    relationships: string[];
  }[];
}
```
**Index:** `consultant_documents` (KNN vector search enabled, HNSW, 768-dim)

### 6.5 Notification

```typescript
interface Notification {
  notificationId: string;
  userId: string;
  type: 'session_completed' | 'report_generated' | 'risk_identified' | 'user_created';
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  read: boolean;
  createdAt: string;
}
```
**Index:** `consultant_notifications`

### 6.6 Audit Log

```typescript
interface AuditLog {
  userId: string;
  username: string;
  role: string;
  action: string;           // "POST /api/readiness/start"
  resource: string;         // "session", "document", "user"
  resourceId: string;
  details: string;          // request body summary
  statusCode: number;
  ipAddress: string;
  timestamp: string;
}
```
**Index:** `consultant_audit_logs`

### 6.7 Report (NEW — required for Reports page)

```typescript
interface Report {
  reportId: string;
  name: string;                // e.g., "Q3 Executive Summary"
  type: 'executive_summary' | 'gap_analysis' | 'readiness' | 'interview' | 'strategic';
  sessionId: string;
  generatedBy: string;        // userId
  status: 'generating' | 'ready' | 'failed';
  fileSize: string;           // e.g., "2.4 MB"
  downloadCount: number;
  content: Record<string, any>;  // report-specific structure
  createdAt: string;
}
```
**Index:** `consultant_reports` (NEW — needs to be created)

### 6.8 Risk Item (enhanced)

```typescript
interface RiskItem {
  id: string;
  severity: 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK';
  title: string;
  description: string;
  source: string;
  sessionId: string;
  smeContact: {
    name: string;              // e.g., "John Smith"
    role: string;              // e.g., "Credit Mgr"
  };
  annualImpact: string;        // e.g., "$2.4M"
  timestamp: string;
}
```

### 6.9 Project Settings (NEW — required for Settings page)

```typescript
interface ProjectSettings {
  settingsId: string;
  projectName: string;         // e.g., "Q3 Global Assessment"
  assessmentPeriod: string;    // e.g., "Q3 2025 - Q1 2026"
  timeZone: string;            // e.g., "UTC-8"
  activeDomain: string;
  language: string;
  activeModel: string;
  notifications: {
    criticalRiskAlerts: boolean;
    smeResponseUpdates: boolean;
    weeklySummary: boolean;
  };
  sessionTimeout: number;      // minutes
  updatedBy: string;
  updatedAt: string;
}
```

---

## 7. API Specifications

### 7.1 Authentication (`routes/auth.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| POST | `/api/auth/login` | Public | Login → JWT + user object | ✅ |
| POST | `/api/auth/register` | Public | Self-registration | ✅ |
| POST | `/api/auth/create-user` | Admin | Admin creates user with role | ✅ |
| GET | `/api/auth/validate` | Token | Validate JWT (used by Nginx auth_request) | ✅ |
| PUT | `/api/auth/preferences` | Token | Update language preference | ✅ |

### 7.2 Readiness Assessments (`routes/readinessRoutes.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/readiness/config/languages` | Token | Supported languages list | ✅ |
| GET | `/api/readiness/config/domains` | Token | Available domains | ✅ |
| GET | `/api/readiness/config/domain` | Token | Active domain config | ✅ |
| PUT | `/api/readiness/config/domain` | Admin | Set active domain | ✅ |
| GET | `/api/readiness/areas` | Token | Assessment areas for active domain | ✅ |
| POST | `/api/readiness/start` | Token | Create readiness session (triggers GPU warmup) | ✅ |
| GET | `/api/readiness/:id` | Token | Session details + progress + documents | ✅ |
| PUT | `/api/readiness/:id/areas` | Token | Set selected areas | ✅ |
| PUT | `/api/readiness/:id/area/:areaId` | Token | Switch active area | ✅ |
| GET | `/api/readiness/:id/next-question` | Token | AI-generated next question | ✅ |
| POST | `/api/readiness/:id/answer` | Token | Submit answer with insights | ✅ |
| GET | `/api/readiness/:id/progress` | Token | Progress checklist | ✅ |
| POST | `/api/readiness/:id/documents` | Token | Associate document with area | ✅ |
| GET | `/api/readiness/:id/autofill/:areaId` | Token | Document auto-fill suggestions | ✅ |
| GET | `/api/readiness/:id/documents/search` | Token | Search session documents | ✅ |
| GET | `/api/readiness/:id/report/readiness` | Token | Generate readiness report | ✅ |
| GET | `/api/readiness/:id/report/gap` | Token | Generate gap analysis report | ✅ |

### 7.3 Interview (`routes/interview.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| POST | `/api/interview/start` | Token | Create interview (depth: quick/standard/deep) | ✅ |
| GET | `/api/interview/:id/next-question` | Token | Next question | ✅ |
| POST | `/api/interview/:id/answer` | Token | Submit answer | ✅ |
| POST | `/api/interview/:id/message` | Token | Free-text message | ✅ |
| POST | `/api/interview/:id/category` | Token | Switch category | ✅ |
| POST | `/api/interview/:id/report` | Token | Generate gap report | ✅ |
| GET | `/api/interview/:id/progress` | Token | Progress | ✅ |
| GET | `/api/interview/:id` | Token | Full session | ✅ |
| GET | `/api/interview/categories/list` | Token | Category list | ✅ |

### 7.4 Documents (`routes/documents.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| POST | `/api/documents/upload` | Token | Upload + chunk + embed | ✅ |
| GET | `/api/documents` | Token | List documents | ✅ |
| DELETE | `/api/documents/:id` | Token | Delete document + chunks | ✅ |

### 7.5 Chat & Analysis (`routes/chat.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| POST | `/api/chat/conversations` | Token | Create conversation | ✅ |
| GET | `/api/chat/conversations/:id` | Token | Get conversation | ✅ |
| GET | `/api/chat/conversations` | Token | List conversations | ✅ |
| DELETE | `/api/chat/conversations/:id` | Token | Delete conversation | ✅ |
| POST | `/api/chat/message` | Token | Chat (RAG-augmented) | ✅ |
| POST | `/api/chat/message/stream` | Token | Streaming chat (SSE) | ✅ |
| POST | `/api/chat/analyze/gap` | Token | Gap analysis | ✅ |
| POST | `/api/chat/analyze/plan` | Token | Plan generation | ✅ |
| POST | `/api/chat/analyze/automation` | Token | Automation analysis | ✅ |
| GET | `/api/chat/models` | Token | Available models | ✅ |

### 7.6 Admin (`routes/admin.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/admin/audit-logs` | Admin | Paginated audit logs with filters | ✅ |
| GET | `/api/admin/users` | Admin | List all users | ✅ |
| PUT | `/api/admin/users/:id` | Admin | Update user | ✅ |
| DELETE | `/api/admin/users/:id` | Admin | Soft-delete user | ✅ |

### 7.7 Notifications (`routes/notifications.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/notifications/stream` | Token | SSE real-time stream | ✅ |
| GET | `/api/notifications` | Token | Paginated list | ✅ |
| PUT | `/api/notifications/:id/read` | Token | Mark read | ✅ |
| PUT | `/api/notifications/read-all` | Token | Mark all read | ✅ |

### 7.8 Search (`routes/search.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/search?q=term` | Token | Global multi-index search (sessions, documents, users for admin) | ✅ |

### 7.9 Dashboard & Risks (`routes/dashboard.ts`, `routes/risks.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/dashboard/stats` | Token | KPI metrics | ✅ |
| GET | `/api/risks/summary` | Token | Top risks + engagement metrics | ✅ |

### 7.10 Sessions (`routes/sessions.ts`)

| Method | Endpoint | Auth | Description | Status |
|--------|----------|------|-------------|--------|
| GET | `/api/sessions/all` | Token | All sessions (interview + readiness) | ✅ |

### 7.11 NEW APIs Required

| Method | Endpoint | Auth | Description | For Feature |
|--------|----------|------|-------------|-------------|
| POST | `/api/reports/generate` | Token | Generate and persist a report record | Reports page |
| GET | `/api/reports` | Token | List reports with pagination | Reports page |
| GET | `/api/reports/:id/download` | Token | Download report as PDF | Reports page |
| GET | `/api/reports/stats` | Token | Report stats (total, monthly, downloads, storage) | Reports page |
| GET | `/api/settings/project` | Token | Get project settings | Settings page |
| PUT | `/api/settings/project` | Admin | Update project settings | Settings page |

---

## 8. AI & LLM Integration

### 8.1 Provider Architecture

**Factory pattern** in `services/llm/LLMProvider.ts`:

| Provider | Models | Features | Env Vars |
|----------|--------|----------|----------|
| OpenAI | gpt-4o, gpt-4-turbo | Chat, embeddings (768-dim), streaming | `OPENAI_API_KEY`, `OPENAI_MODELS` |
| Anthropic | Claude 3 Sonnet/Opus | Chat, thinking/reasoning, streaming | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODELS` |
| Google | Gemini 1.5 Pro | Chat (streaming partial) | `GOOGLE_API_KEY`, `GOOGLE_MODELS` |
| Ollama | llama2, mistral, etc. | Chat, local embeddings | `OLLAMA_BASE_URL`, `OLLAMA_MODELS` |
| NginxOllama | Same as Ollama | Ollama behind Nginx proxy | `NGINX_OLLAMA_BASE_URL`, `NGINX_OLLAMA_API_KEY` |

**Default model:** configured via `DEFAULT_MODEL` env var (format: `provider:model`).

### 8.2 Question Generation Engine

**Service:** `services/questionEngine.ts`

**Modes** (progressive, based on conversation state):

| Mode | Trigger | Purpose |
|------|---------|---------|
| `foundation` | Start of area | Establish baseline understanding |
| `probing` | Vague/incomplete answer | Dig deeper into specifics |
| `discovery` | Pain point mentioned | Explore problems and root causes |
| `transformation` | Process gap identified | Explore improvement opportunities |
| `validation` | Document conflict | Confirm discrepancies |
| `benchmark` | Maturity assessment | Compare against industry best practices |

**Question Types:**

| Type | UI Rendering |
|------|-------------|
| `single_choice` | Radio buttons |
| `multi_choice` | Checkboxes |
| `scale` | 1–5 rating slider |
| `open_ended` | Textarea + voice input button |
| `yes_no` | Boolean toggle |

### 8.3 RAG Pipeline

**Service:** `services/knowledgeBase.ts`

```
Upload → Parse (PDF/DOCX/TXT/CSV/XLSX)
       → Chunk (1000 chars, 200 overlap)
       → Embed (768-dim, text-embedding-3-small)
       → Store in OpenSearch (knn_vector)
       → Extract entities (process, system, stakeholder, metric, issue)

Query → Embed query
      → Hybrid search (BM25 full-text + KNN vector similarity)
      → Return top-K relevant chunks
      → Augment LLM prompt with context
```

### 8.4 Mastra AI Agent

**Service:** `mastra/agent.ts`

Tools exposed to the consultant agent:
1. `search_documents` — RAG search
2. `get_related_entities` — Knowledge graph traversal
3. `generate_gap_analysis` — Gap report generation
4. `generate_project_plan` — Implementation roadmap

---

## 9. Domain Configuration

### 9.1 Available Domains

| Domain | Config File | Location |
|--------|------------|----------|
| Finance | `finance.json` | `backend/src/config/domains/` |
| HR | `hr.json` | `backend/src/config/domains/` |
| Supply Chain | `supplychain.json` | `backend/src/config/domains/` |
| Construction | `construction.json` | `backend/src/config/domains/` |
| Manufacturing | `manufacturing.json` | `backend/src/config/domains/` |

### 9.2 Domain Configuration Schema

```typescript
interface DomainConfig {
  id: string;
  name: string;
  description: string;
  persona: string;            // AI consultant expertise descriptor
  areas: {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
    basePrompt: string;       // Interview guidance for AI
    benchmarks: {
      [level: string]: string;  // Maturity levels 1–5
    };
  }[];
}
```

### 9.3 Process Types (Finance Domain)

| Process Type | Steps | Key Metrics |
|-------------|-------|-------------|
| Order-to-Cash (O2C) | Order Entry → Credit Check → Fulfillment → Invoicing → Payment | Cycle time, DSO, credit approval time |
| Record-to-Report (R2R) | Journal Entry → Reconciliation → Consolidation → Reporting → Close | Close cycle, error rate, automation % |
| Procure-to-Pay (P2P) | Requisition → Approval → PO → Receipt → Payment | Cycle time, maverick spend %, early payment % |

---

## 10. Infrastructure & Deployment

### 10.1 Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│     ALB      │────▶│   Backend (ECS)  │
│   (React)    │     │  Path-based  │     │   Express + AI   │
│   ECS Task   │     │  Routing     │     │   ECS Task       │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────┐
                    │                              │                  │
               ┌────▼─────┐            ┌──────────▼────────┐  ┌─────▼──────┐
               │OpenSearch │            │  LLM Providers     │  │    EFS     │
               │ (Vector   │            │ OpenAI/Claude/     │  │  (Shared   │
               │   DB)     │            │ Gemini/Ollama      │  │  Storage)  │
               └───────────┘            └───────────────────┘  └────────────┘
```

### 10.2 AWS Resources (Terraform)

| Resource | Type | Details |
|----------|------|---------|
| VPC | Multi-AZ | 10.0.0.0/16 (staging), 10.1.0.0/16 (prod) |
| ECS Cluster | Fargate + EC2 | Container Insights enabled |
| App Tier | t3.small | Auto-scaling 1–4 instances |
| GPU Tier | g5.2xlarge (Spot) | Scale 0–1, on-demand mode |
| ECR | 2 repos | `consultant-agent/frontend`, `consultant-agent/backend` |
| OpenSearch | t3.small.search | 10GB EBS, encrypted, vector search |
| EFS | 2 access points | `/backend` (uploads), `/ollama` (models) |
| ALB | Path-based routing | Frontend + Backend targets |
| Secrets Manager | 3 secrets | JWT, admin password, OpenSearch password |
| IAM | OIDC for GitHub Actions | Least-privilege CI/CD |

### 10.3 Docker Setup

- **Frontend:** Node 20-alpine → Nginx (multi-stage)
- **Backend:** Node 20-alpine → pnpm production (multi-stage)
- **docker-compose.yml:** OpenSearch 2.11 + Backend + Frontend on `consultant-network`

### 10.4 Environment Configuration

| Variable | Purpose | Required |
|----------|---------|----------|
| `OPENSEARCH_NODE` | OpenSearch endpoint | Yes |
| `OPENSEARCH_USERNAME` | Auth username | Yes |
| `OPENSEARCH_PASSWORD` | Auth password | Yes |
| `JWT_SECRET` | Token signing key | Yes |
| `ADMIN_PASSWORD` | Default admin password | Yes |
| `DEFAULT_MODEL` | Default LLM (e.g., `openai:gpt-4o`) | Yes |
| `OPENAI_API_KEY` | OpenAI provider | At least one provider |
| `ANTHROPIC_API_KEY` | Anthropic provider | At least one provider |
| `GOOGLE_API_KEY` | Google provider | At least one provider |
| `OLLAMA_BASE_URL` | Ollama endpoint | At least one provider |
| `PORT` | Server port (default 3001) | No |
| `GPU_SCALING_MODE` | `on-demand` / `always-on` / `off` | No |

---

## 11. Non-Functional Requirements

### 11.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-01 | API response time (non-AI) | < 500ms p95 |
| NFR-02 | AI question generation | < 10s (cloud), < 30s (local GPU cold) |
| NFR-03 | Document upload + processing | < 30s for 50MB |
| NFR-04 | Dashboard load time | < 2s |
| NFR-05 | Concurrent users | 500+ |
| NFR-06 | SSE notification delivery | < 1s |
| NFR-07 | Search response time | < 500ms |
| NFR-08 | Report generation | < 30s |

### 11.2 Security

| ID | Requirement | Status |
|----|------------|--------|
| NFR-09 | TLS 1.2+ in transit, encrypted at rest | ✅ |
| NFR-10 | JWT auth with 24h expiration | ✅ |
| NFR-11 | bcrypt password hashing | ✅ |
| NFR-12 | RBAC (user, admin, analyst) | ✅ |
| NFR-13 | Full audit logging for all mutations | ✅ |
| NFR-14 | No hardcoded credentials (Secrets Manager) | ✅ |
| NFR-15 | IMDSv2 enforced on EC2 | ✅ |
| NFR-16 | Configurable session timeout | ✅ |
| NFR-17 | Input validation (zod) | ⚠️ Partial |
| NFR-18 | Rate limiting | ❌ Not implemented |

### 11.3 Availability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-19 | Uptime | 99.9% |
| NFR-20 | Multi-AZ deployment | Required (prod) |
| NFR-21 | DR regions | me-central-1 + me-south-1 |
| NFR-22 | GPU warmup retry | 24 × 15s = 6 min max |

### 11.4 Scalability

| ID | Requirement |
|----|------------|
| NFR-23 | Horizontal ECS auto-scaling (1–4 app instances) |
| NFR-24 | GPU tier scales to zero when idle |
| NFR-25 | Spot instances with on-demand fallback |
| NFR-26 | OpenSearch scaling via instance upgrades |

### 11.5 Internationalization

| ID | Requirement | Status |
|----|------------|--------|
| NFR-27 | Languages: English, Hindi, Arabic, French, Spanish | ✅ (en primary) |
| NFR-28 | Language preference persisted per user | ✅ |
| NFR-29 | AI generates in user's selected language | ✅ |
| NFR-30 | RTL support for Arabic/Hebrew | ⚠️ Framework ready |

---

## 12. Design Gap Remediation Tracker

### 12.1 Critical Priority (P0 — Must Fix)

| ID | Page | Gap | Fix Description |
|----|------|-----|-----------------|
| L-01 | Login | Tagline says "Intelligent Process Intelligence" | Change to "Executive Process Intelligence" |
| L-02 | Login | Demo credentials info box missing | Add blue-bordered info box with User + Admin credentials |
| L-03 | Login | Tab subtitles missing | Add "View your assessments" under User Login, "View all employees" under Admin Login |
| D-04 | Dashboard | Risk cards show "Source: {area}" instead of SME contact | Add `smeContact.name` + `smeContact.role` to risk card display |
| D-05 | Dashboard | Dollar impact missing from risk cards | Add "↗ {annualImpact} annual impact" line to risk cards |
| SH-07 | Right Panel | No red badge count on "Key Risks & Narratives" header | Add badge component with risk count |
| I-01 | Insights | Performance chart uses single Y-axis | Implement dual-axis with `yAxisId="left"` and `yAxisId="right"` |
| I-04 | Insights | Expand chevron instead of "View Details" button | Replace with blue "View Details" button |
| S-01 | SME | Card label "Total Participants" | Change to "Total SMEs" with "Across all departments" subtitle |
| R-01–R-09 | Reports | Completely wrong stats, missing controls, wrong labels | Major rework — see Reports page spec above |
| SET-01–03 | Settings | Missing Project Name, Assessment Period, Time Zone | Add 3 fields to General section |

### 12.2 High Priority (P1 — Should Fix)

| ID | Page | Gap | Fix Description |
|----|------|-----|-----------------|
| L-06 | Login | No lock icon in password input | Add `Lock` icon inside password field |
| L-07 | Login | Email placeholder "john@company.com" | Change to "you@company.com" |
| L-09 | Login | Admin tab uses shield icon | Change to clipboard/document icon |
| D-01 | Dashboard | Generic domain title on process flow | Show specific: "Order-to-Cash Process Flow" |
| D-03 | Dashboard | Duration always in "hrs" | Apply mixed units rule (hrs vs days) |
| SH-01 | Sidebar | Hexagon logo icon | Change to pulse/heartbeat icon (`Activity` from Lucide) |
| SH-03 | Sidebar | Wrong nav icons for Process Analysis + Insights | Process Analysis → `Activity`, Insights → `TrendingUp` |
| SH-10 | Right Panel | "View All Risks" not functional | Add click handler → navigate to risk detail view |
| I-05 | Insights | No dollar amounts in action descriptions | Add savings estimates from gap analysis data |
| S-05 | SME | Wrong subtitle on Total Responses card | Change to "This assessment period" |

### 12.3 Medium Priority (P2 — Nice to Have)

| ID | Page | Gap | Fix Description |
|----|------|-----|-----------------|
| SH-11 | Layout | Logout in sidebar (mockup shows it in TopBar) | Consider moving or keeping both |
| PA-02 | Process Analysis | Filter button layout differs from mockup | Adjust to match mockup positioning |
| I-08 | Insights | Grid layout vs vertical list for action cards | Switch to vertical list layout |
| SME-09 | SME | Table not sortable/filterable | Add sort + filter capability |

---

## 13. Implementation Phases

### Phase 1: Design Gap Remediation (Current Priority)

**Goal:** Align implementation with mockups for all P0 and P1 gaps.

| Task | Components Affected | Gaps Resolved |
|------|-------------------|---------------|
| Login page fixes | `pages/Login.tsx` | L-01, L-02, L-03, L-06, L-07, L-09 |
| Dashboard risk cards | `components/layout/RightPanel.tsx` | D-04, D-05, SH-07, SH-10 |
| Dashboard process flow | `pages/Dashboard.tsx` | D-01, D-03 |
| Insights dual-axis chart | `pages/Insights.tsx` | I-01, I-04, I-05 |
| SME stat card labels | `pages/SMEEngagement.tsx` | S-01, S-05 |
| Sidebar icons | `components/layout/Sidebar.tsx` | SH-01, SH-03 |
| Settings general section | `pages/SettingsPage.tsx` | SET-01, SET-02, SET-03 |

### Phase 2: Reports Page Rebuild

**Goal:** Implement Reports page per mockup spec.

| Task | Details |
|------|---------|
| Create `consultant_reports` index | New OpenSearch index for report records |
| Build report generation API | `POST /api/reports/generate`, `GET /api/reports`, `GET /api/reports/:id/download`, `GET /api/reports/stats` |
| Rebuild Reports page UI | Controls row, correct stat cards, report table with download buttons, Generate New Report flow |
| PDF export wiring | Connect html2canvas + jspdf to download button |

### Phase 3: Settings & Project Configuration

**Goal:** Full settings persistence.

| Task | Details |
|------|---------|
| Create project settings model | Store in OpenSearch or a settings index |
| Build settings API | `GET/PUT /api/settings/project` |
| Wire settings to TopBar | Project name + assessment period display |
| Data management backend | Export, archive, delete APIs |

### Phase 4: Polish & Testing

**Goal:** Production readiness.

| Task | Details |
|------|---------|
| Error handling | Toast notifications, error boundaries |
| Loading states | Skeleton screens for all data-fetching pages |
| Form validation | Client-side validation on all forms |
| E2E test updates | Update Playwright tests for new UI |
| Accessibility | ARIA labels, keyboard navigation, semantic HTML |
| Performance | React.lazy, code splitting, API caching |

### Phase 5: Deferred Features

| Feature | Priority | Details |
|---------|----------|---------|
| Multi-language full support | P2 | Complete translations for hi, ar, fr, es |
| 2FA implementation | P2 | TOTP-based two-factor auth |
| Rate limiting | P2 | Express rate limiter middleware |
| Advanced RAG | P2 | Metadata filtering, reranking, multi-hop |
| Mobile responsiveness | P2 | Responsive CSS for tablet/mobile |

---

## 14. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Assessment Completion Rate | > 80% | Completed / Total started |
| Document Auto-Fill Accuracy | > 85% | Accepted suggestions / Total |
| Report Generation Time | < 30s | API latency |
| SME Participation Rate | > 75% | Active SMEs / Total SMEs |
| User Satisfaction (NPS) | > 50 | Post-assessment survey |
| Audit Coverage | 100% | All mutations logged |
| Search Response Time | < 500ms | API p95 latency |
| Notification Delivery | < 2s | SSE event latency |
| Avg Risk Score Reduction | > 20% | Pre vs. post assessment |
| Time to First Insight | < 1 hour | From first SME response |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| O2C | Order-to-Cash — end-to-end sales fulfillment process |
| R2R | Record-to-Report — financial recording and reporting process |
| P2P | Procure-to-Pay — procurement and payment process |
| SME | Subject Matter Expert — domain expert providing assessment input |
| RAG | Retrieval Augmented Generation — AI pattern combining search with LLM generation |
| KPI | Key Performance Indicator |
| Gap Analysis | Systematic comparison of current vs. desired state |
| Readiness Assessment | Structured evaluation of organizational preparedness |
| Automation Quotient | Percentage of processes suitable for or already automated |
| Discovery Progress | Overall completion percentage of the assessment engagement |
| SSE | Server-Sent Events — HTTP-based real-time push from server to client |
| RBAC | Role-Based Access Control |
| KNN | K-Nearest Neighbors — vector similarity search algorithm |
| HNSW | Hierarchical Navigable Small World — approximate nearest neighbor index |
| ECS | Elastic Container Service — AWS container orchestration |
| ALB | Application Load Balancer |
| EFS | Elastic File System — shared NFS storage on AWS |
| ECR | Elastic Container Registry — Docker image registry on AWS |

---

## Appendix A: OpenSearch Index Configuration

| Index | Shards | Replicas | Special Features |
|-------|--------|----------|-----------------|
| `consultant_users` | 1 | 0 | Standard document store |
| `consultant_documents` | 1 | 0 | KNN vector (768-dim, HNSW, L2), full-text |
| `consultant_conversations` | 1 | 0 | Nested messages array |
| `consultant_entities` | 1 | 0 | Nested relationships, entity types |
| `consultant_notifications` | 1 | 0 | userId-scoped, read status |
| `consultant_audit_logs` | 1 | 0 | Timestamp-indexed, IP tracking |
| `readiness_sessions` | 1 | 0 | Complex nested responses |
| `consultant_reports` | 1 | 0 | **NEW** — report records with metadata |

## Appendix B: Visualization Library Usage

| Chart Type | Library | Page |
|-----------|---------|------|
| Gauge (half-circle) | Custom SVG | Dashboard |
| Circular progress ring | Custom SVG | Dashboard |
| Process flow cards | Custom CSS | Dashboard |
| Pie/Donut | Recharts `PieChart` | Process Analysis |
| Bar chart | Recharts `BarChart` | Process Analysis |
| Dual-axis line | Recharts `ComposedChart` | Insights |
| Progress bars | Custom CSS | SME Engagement, Right Panel |
| Radar chart | Recharts `RadarChart` | Report modals |
| Sankey diagram | D3.js custom | Analysis modals |
| Treemap | Recharts `Treemap` | Analysis modals |
| Bubble chart | Recharts `ScatterChart` | Analysis modals |
| Heatmap | Custom CSS/Canvas | Analysis modals |
| Knowledge graph | D3.js force layout | Analysis modals |
