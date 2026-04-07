# ProcessIQ Discovery - Project Requirements Document

## 1. Executive Summary

**Product Name:** ProcessIQ Discovery
**Tagline:** Executive Process Intelligence
**Version:** 2.0

ProcessIQ Discovery is an AI-driven enterprise platform for business process assessment and gap analysis. It enables consulting firms and enterprise teams to evaluate operational processes (Order-to-Cash, Record-to-Report, Procure-to-Pay), identify critical bottlenecks, quantify automation opportunities, and track engagement with Subject Matter Experts (SMEs) throughout the discovery phase.

The platform combines structured interview-based assessments with AI-powered analysis, document ingestion (RAG), and real-time dashboards to deliver actionable insights for process improvement.

---

## 2. User Roles & Personas

### 2.1 User (CXO / Executive / Analyst)
- Views their own process assessments and progress
- Participates in SME interviews and readiness assessments
- Reviews AI-driven insights and recommendations
- Downloads reports
- Manages personal notification preferences

### 2.2 Admin (Engagement Lead / Consultant)
- All User capabilities
- Creates and manages user accounts
- Configures project settings (domain, assessment period, timezone)
- Views all employees and their engagement metrics
- Generates and manages reports across the project
- Accesses audit logs
- Manages data (export, archive, delete)

---

## 3. Application Pages & Functional Requirements

### 3.1 Login Page

**Purpose:** Authenticate users with role-based access.

**UI Elements:**
- Left panel: Branding (ProcessIQ Discovery logo, tagline, marketing copy about O2C/R2R/P2P coverage)
- Stat badges: "98% Process Coverage", "24/7 Monitoring"
- Right panel: Sign-in form with role selector

**Functional Requirements:**

| ID | Requirement | Priority |
|----|------------|----------|
| LOGIN-01 | Two login modes: "User Login" (view your assessments) and "Admin Login" (view all employees) | P0 |
| LOGIN-02 | Email address and password fields with form validation | P0 |
| LOGIN-03 | Demo credentials displayed in an info box (User: john@company.com / user123, Admin: admin@company.com / admin123) | P1 |
| LOGIN-04 | JWT-based authentication with 24h token expiration | P0 |
| LOGIN-05 | Redirect to Dashboard on successful login | P0 |
| LOGIN-06 | Error messaging for invalid credentials | P0 |
| LOGIN-07 | Loading state during authentication | P1 |

---

### 3.2 Dashboard

**Purpose:** Executive overview of process discovery progress, risk posture, and key metrics.

**Layout:** Three-column layout — left sidebar navigation, center content area, right panel (Key Risks & SME Heatmap).

**Header Bar:**
- Current Project name and subtitle (e.g., "Q3 Global Assessment — Order-to-Cash, Record-to-Report, Procure-to-Pay")
- Global search bar ("Search processes...")
- User profile (name, email, avatar)
- Notification bell with unread count badge
- Logout button

**KPI Cards Row (4 cards):**

| ID | KPI Card | Data | Visualization |
|----|----------|------|---------------|
| DASH-01 | Process Gap Severity | Risk level (Low/Medium/High/Critical), Avg risk score | Half-circle gauge chart with color gradient (green → red) |
| DASH-02 | Critical Issues Identified | Count of critical issues, trend arrow | Numeric display with trend indicator |
| DASH-03 | Automation Quotient | Current automation %, improvement potential delta | Percentage with delta indicator (e.g., "↑ 8% improvement potential") |
| DASH-04 | Discovery Progress | Completion %, estimated completion date | Circular progress ring (SVG) |

**Process Flow Section:**

| ID | Requirement | Priority |
|----|------------|----------|
| DASH-05 | Visual process flow showing sequential steps for the active assessment type (e.g., Order-to-Cash: Order Entry → Credit Check → Fulfillment → Invoicing → Payment) | P0 |
| DASH-06 | Each step shows: step name, step number, average duration | P0 |
| DASH-07 | Critical issue steps highlighted with red border and warning icon | P0 |
| DASH-08 | Normal steps shown in default card style, critical steps shown in red/highlighted style | P0 |
| DASH-09 | Arrow connectors between steps | P1 |
| DASH-10 | Summary row below flow: Total Cycle Time, Critical Bottlenecks count, Automation Opportunity level (Low/Medium/High) | P0 |

**Right Panel — Key Risks & Narratives:**

| ID | Requirement | Priority |
|----|------------|----------|
| DASH-11 | Badge showing total unresolved risk count (e.g., "3") | P0 |
| DASH-12 | Top 3 risk cards showing: severity badge (HIGH RISK red / MEDIUM RISK yellow / LOW RISK green), title, source SME name and role, dollar impact estimate, relative timestamp | P0 |
| DASH-13 | "View All Risks (N total)" link | P1 |

**Right Panel — SME Engagement Heatmap:**

| ID | Requirement | Priority |
|----|------------|----------|
| DASH-14 | Department-level engagement bars (e.g., Sales 90%, Finance 45%, Warehouse 20%) | P0 |
| DASH-15 | Color coding: green (>=70%), orange/amber (40-69%), red (<40%) | P0 |
| DASH-16 | Overall Engagement average percentage | P0 |

---

### 3.3 Process Analysis

**Purpose:** View personal process assessments, performance metrics, and assessment details. Entry point for starting new assessments.

**Header:** "My Process Assessments" with subtitle "Your personal process analysis and performance metrics". Filter button "N My Assessments".

**Summary Stats Row (4 cards):**

| ID | Stat Card | Description |
|----|-----------|-------------|
| PA-01 | Total Assessments | Count of assessments assigned to or created by the user |
| PA-02 | Completed | Count of completed assessments (green text) |
| PA-03 | Critical Issues | Total critical issues across all assessments |
| PA-04 | Avg Risk Score | Average risk score across assessments |

**Charts Section:**

| ID | Requirement | Priority |
|----|------------|----------|
| PA-05 | Process Type Distribution — Pie/donut chart showing percentage breakdown by process type (Order-to-Cash, Record-to-Report, Procure-to-Pay) | P0 |
| PA-06 | Process Efficiency Overview — Bar chart showing efficiency percentage (0-100) for each process step (Order Entry, Credit Check, Fulfillment, Invoicing, Payment) | P0 |

**Assessment Details Section:**

| ID | Requirement | Priority |
|----|------------|----------|
| PA-07 | List of assessments with: process name, status badge (In Progress / Completed / Not Started), last updated date | P0 |
| PA-08 | Each assessment shows: Completion Rate (progress bar with percentage), Critical Issues count (with icon), Risk Score (numeric) | P0 |
| PA-09 | Click on assessment to view details or resume | P0 |

**Assessment Workflow (on starting/resuming an assessment):**

| ID | Requirement | Priority |
|----|------------|----------|
| PA-10 | Multi-step flow: Select Areas → Interview Questions → Review → Complete | P0 |
| PA-11 | Area selection grid with checkboxes for assessment domains | P0 |
| PA-12 | Dynamic AI-generated questions based on domain context | P0 |
| PA-13 | Question types: open-ended (textarea + voice input), yes/no, single choice, multi choice, scale (1-5) | P0 |
| PA-14 | Progress tracking sidebar showing area completion status | P0 |
| PA-15 | GPU/LLM warmup handling with retry logic and progress indicator | P1 |
| PA-16 | Document upload zone for supporting evidence | P1 |

---

### 3.4 Insights

**Purpose:** AI-driven recommendations and performance trend analysis based on completed assessments.

**Header:** "AI-Driven Insights" with subtitle "Actionable recommendations based on process discovery".

**Performance Trends Chart:**

| ID | Requirement | Priority |
|----|------------|----------|
| INS-01 | Dual-axis line chart showing performance metrics over time (monthly: Sep, Oct, Nov, Dec, Jan, Feb) | P0 |
| INS-02 | Left Y-axis: sessions/cycle-time metric; Right Y-axis: secondary metric (e.g., efficiency score) | P1 |
| INS-03 | Trend status badge (e.g., "↗ Improving" in green) | P0 |

**Recommended Actions Section:**

| ID | Requirement | Priority |
|----|------------|----------|
| INS-04 | Action cards with: icon (lightning bolt for quick wins, dollar sign for revenue), title, description, Impact level (High/Medium/Low), Effort level (High/Medium/Low) | P0 |
| INS-05 | "View Details" button on each action card expanding to full analysis | P0 |
| INS-06 | AI-generated actions sourced from gap analysis and automation detection | P0 |
| INS-07 | Static baseline actions combined with AI-generated insights | P1 |
| INS-08 | Example actions: "Automation Quick Win" (with savings estimate), "Revenue Leakage Opportunity" (with recovery target) | P0 |

---

### 3.5 SME Engagement

**Purpose:** Track Subject Matter Expert participation, engagement levels, and response metrics.

**Header:** "SME Engagement" with subtitle "Track subject matter expert participation and insights".

**Summary Stats Row (4 cards):**

| ID | Stat Card | Description | Detail |
|----|-----------|-------------|--------|
| SME-01 | Total SMEs | Count of all SMEs | "Across all departments" |
| SME-02 | Active Participants | Count of active SMEs | Participation rate percentage (e.g., "75% participation rate") in green |
| SME-03 | Total Responses | Total response count | "This assessment period" |
| SME-04 | Low Engagement | Count of low-engagement SMEs | "Need follow-up" in red |

**Subject Matter Experts Table:**

| ID | Requirement | Priority |
|----|------------|----------|
| SME-05 | Table columns: SME (avatar + name + role), Department, Engagement (progress bar with percentage), Responses count, Last Active (relative time), Status badge | P0 |
| SME-06 | Avatar shows initials with colored background | P1 |
| SME-07 | Engagement bar color coding: green (>=70%), orange (40-69%), red (<40%) | P0 |
| SME-08 | Status badges: "Active" (green), "Low Activity" (orange), "Inactive" (red) | P0 |
| SME-09 | Sortable and filterable table | P2 |

**Engagement Calculation Logic:**

| ID | Requirement | Priority |
|----|------------|----------|
| SME-10 | Engagement % = (user's response share / session share) × 100 | P0 |
| SME-11 | Status derived from user activity: Active (recent login), Low Activity (>3 days), Inactive (>7 days or no login) | P0 |

---

### 3.6 Reports

**Purpose:** Access generated reports, create new reports, and download documentation.

**Header:** "Reports & Documentation" with subtitle "Access generated reports and export data".

**Controls Row:**
- Date Range picker button
- Filter button
- "Generate New Report" button (primary action, blue)

**Summary Stats Row (4 cards):**

| ID | Stat Card | Description |
|----|-----------|-------------|
| REP-01 | Total Reports | Count of all generated reports |
| REP-02 | This Month | Reports generated in current month |
| REP-03 | Downloads | Total download count |
| REP-04 | Storage Used | Total storage consumed by reports (e.g., "1.2 GB") |

**Recent Reports Table:**

| ID | Requirement | Priority |
|----|------------|----------|
| REP-05 | Table rows showing: report icon, report name, report type (Executive Report / Detailed Analysis / Raw Data / Strategic Report), date, file size | P0 |
| REP-06 | Status badge: "Ready" (green) or "Generating..." (amber/spinner) | P0 |
| REP-07 | Download button for each ready report | P0 |
| REP-08 | Report types: Readiness Report, Gap Analysis Report, Interview Report, Executive Summary | P0 |

**Report Generation:**

| ID | Requirement | Priority |
|----|------------|----------|
| REP-09 | Generate reports from completed assessment sessions | P0 |
| REP-10 | Report preview modal with type-specific rendering (readiness report view, gap analysis view) | P1 |
| REP-11 | PDF export functionality (html2canvas + jspdf) | P0 |
| REP-12 | Report filtering by type (All, Readiness, Gap Analysis, Interview) | P1 |

---

### 3.7 Settings

**Purpose:** Configure project preferences, notifications, security, and data management.

**Header:** "Settings" with subtitle "Configure your ProcessIQ Discovery preferences".

**General Section:**

| ID | Setting | Type | Access |
|----|---------|------|--------|
| SET-01 | Project Name | Text input (e.g., "Q3 Global Assessment") | Admin |
| SET-02 | Assessment Period | Text input (e.g., "Q3 2025 - Q1 2026") | Admin |
| SET-03 | Time Zone | Dropdown (e.g., "UTC-8 (Pacific Time)") | All |
| SET-04 | Active Domain | Dropdown (HR, Finance, Construction, etc.) | Admin |
| SET-05 | Language | Dropdown (English, Hindi, Arabic) | All |
| SET-06 | AI Model | Dropdown (model provider selection) | Admin |

**Notifications Section:**

| ID | Setting | Type | Default |
|----|---------|------|---------|
| SET-07 | Critical Risk Alerts | Toggle | ON |
| SET-08 | SME Response Updates | Toggle | ON |
| SET-09 | Weekly Summary | Toggle | OFF |

**Security & Privacy Section:**

| ID | Setting | Type | Priority |
|----|---------|------|----------|
| SET-10 | Two-Factor Authentication | Enable button | P2 |
| SET-11 | Session Timeout | Dropdown (15 min / 30 min / 1 hour) | P1 |

**Data Management Section (Admin only):**

| ID | Action | Type | Priority |
|----|--------|------|----------|
| SET-12 | Export All Discovery Data | Button | P1 |
| SET-13 | Archive Completed Assessments | Button | P2 |
| SET-14 | Delete Project Data | Destructive button (with confirmation dialog) | P1 |

**Save Action:**

| ID | Requirement | Priority |
|----|------------|----------|
| SET-15 | "Save Changes" button at bottom of page | P0 |
| SET-16 | Success/error feedback message on save | P0 |

---

### 3.8 Admin Pages (Admin Role Only)

**3.8.1 User Management:**

| ID | Requirement | Priority |
|----|------------|----------|
| ADM-01 | List all users with: name, email, role, department, status, last login | P0 |
| ADM-02 | Create new user (username, password, role, department) | P0 |
| ADM-03 | Edit user role and status | P1 |
| ADM-04 | Deactivate/activate users | P1 |

**3.8.2 Audit Logs:**

| ID | Requirement | Priority |
|----|------------|----------|
| ADM-05 | Chronological list of all system mutations | P0 |
| ADM-06 | Fields: timestamp, user, action, resource, resource ID, IP address | P0 |
| ADM-07 | Filterable by user, action type, date range | P2 |

---

## 4. Shared Components

### 4.1 Sidebar Navigation
- Logo: ProcessIQ Discovery icon + text
- Nav items: Dashboard, Process Analysis, Insights, SME Engagement, Reports, Settings
- Admin section (conditional): User Management, Audit Logs
- User card at bottom: avatar (initials), name, role, logout button
- Active state: highlighted with accent color (blue)

### 4.2 Top Bar
- Project name + process types subtitle
- Global search with debounced (300ms) multi-index search (sessions, documents, users)
- Search results dropdown with type icons, titles, snippets
- Notification bell with real-time unread count (SSE-powered)
- User profile display

### 4.3 Right Panel (persistent across all pages)
- Key Risks & Narratives (top 3 risks with severity, title, source, impact, timestamp)
- SME Engagement Heatmap (department-level bars with color coding)
- "View All Risks" link

### 4.4 Notification System
- Real-time SSE stream for notification count updates
- Notification types: session_completed, report_generated, risk_identified, user_created
- Mark as read (individual and bulk)
- Paginated notification list

---

## 5. Data Models

### 5.1 User
```
{
  userId: UUID
  username: string (email format)
  passwordHash: string (bcrypt)
  role: 'user' | 'admin' | 'analyst'
  firstName: string
  lastName: string
  organization: string
  department: string
  status: 'active' | 'inactive'
  language: 'en' | 'hi' | 'ar'
  createdAt: ISO8601
  lastLoginAt: ISO8601
}
```

### 5.2 Assessment / Readiness Session
```
{
  sessionId: UUID
  userId: UUID
  sessionType: 'readiness' | 'interview_session'
  processType: 'Order-to-Cash' | 'Record-to-Report' | 'Procure-to-Pay'
  status: 'not_started' | 'in_progress' | 'completed'
  areas: [
    {
      areaId: string
      name: string
      status: 'not_started' | 'in_progress' | 'completed'
      questionsAnswered: number
      insights: string[]
    }
  ]
  context: {
    identifiedGaps: string[]
    painPoints: string[]
    automationOpportunities: string[]
  }
  riskScore: number
  completionRate: number
  criticalIssues: number
  createdAt: ISO8601
  updatedAt: ISO8601
}
```

### 5.3 Document
```
{
  documentId: UUID
  filename: string
  fileType: 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx'
  content: string (chunked)
  chunkIndex: number
  totalChunks: number
  embedding: float[768] (knn_vector)
  uploadedBy: UUID
  uploadedAt: ISO8601
  metadata: object
  entities: [{ name, type, relationships[] }]
}
```

### 5.4 Risk Item
```
{
  id: string
  severity: 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK'
  title: string
  description: string
  source: string (SME name or area)
  sessionId: UUID
  annualImpact: string (e.g., "$2.4M")
  smeContact: { name: string, role: string }
  timestamp: ISO8601
}
```

### 5.5 Notification
```
{
  notificationId: UUID
  userId: UUID
  type: 'session_completed' | 'report_generated' | 'risk_identified' | 'user_created'
  title: string
  message: string
  resourceType: string
  resourceId: UUID
  read: boolean
  createdAt: ISO8601
}
```

### 5.6 Report
```
{
  reportId: UUID
  name: string
  type: 'executive_summary' | 'gap_analysis' | 'readiness' | 'interview' | 'strategic'
  sessionId: UUID
  generatedBy: UUID
  status: 'generating' | 'ready' | 'failed'
  fileSize: string
  downloadCount: number
  content: object (report-specific structure)
  createdAt: ISO8601
}
```

### 5.7 Audit Log
```
{
  userId: UUID
  username: string
  role: string
  action: string
  resource: string
  resourceId: string
  details: string
  ipAddress: string
  timestamp: ISO8601
}
```

---

## 6. API Specifications

### 6.1 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register new user |
| POST | `/api/auth/create-user` | Admin | Admin creates user with role |
| POST | `/api/auth/login` | Public | Login, returns JWT + user |
| GET | `/api/auth/validate` | Token | Validate JWT token |
| PUT | `/api/auth/preferences` | Token | Update language preference |

### 6.2 Dashboard & Analytics

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | Token | KPI metrics (gap severity, critical issues, automation %, discovery %) |
| GET | `/api/risks/summary` | Token | Top risks + department engagement data |
| GET | `/api/search?q=term` | Token | Global multi-index search |

### 6.3 Documents

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/documents/upload` | Token | Upload file (multipart) with chunking + embedding |
| GET | `/api/documents` | Token | List documents (optionally by userId) |
| DELETE | `/api/documents/:id` | Token | Delete document and all chunks |

### 6.4 Readiness Assessments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/readiness/areas` | Token | List assessment areas |
| POST | `/api/readiness/start` | Token | Start new readiness session |
| PUT | `/api/readiness/areas` | Token | Set selected areas for session |
| GET | `/api/readiness/progress` | Token | Get session progress |
| GET | `/api/readiness/next-question` | Token | Get next AI-generated question |
| POST | `/api/readiness/answer` | Token | Submit answer |

### 6.5 Interview Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/interview/start` | Token | Start interview (depth: quick/standard/deep) |
| GET | `/api/interview/:id/next-question` | Token | Get next question |
| POST | `/api/interview/:id/answer` | Token | Submit answer (auto-advances on threshold) |
| GET | `/api/interview/:id/progress` | Token | Get progress |
| GET | `/api/interview/:id` | Token | Get full session details |
| POST | `/api/interview/:id/category` | Token | Switch interview category |
| POST | `/api/interview/:id/report` | Token | Generate gap analysis report |
| GET | `/api/interview/categories/list` | Token | List all categories |

### 6.6 Chat & Analysis

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/chat/conversations` | Token | Create conversation |
| POST | `/api/chat/message` | Token | Send message (RAG-powered) |
| POST | `/api/chat/message/stream` | Token | Stream message response (SSE) |
| GET | `/api/chat/models` | Token | List available AI models |
| POST | `/api/chat/analyze/gap` | Token | Run gap analysis |
| POST | `/api/chat/analyze/automation` | Token | Run automation opportunity analysis |

### 6.7 Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications/stream` | Token | SSE real-time notification stream |
| GET | `/api/notifications` | Token | Paginated notification list |
| PUT | `/api/notifications/:id/read` | Token | Mark notification as read |
| PUT | `/api/notifications/read-all` | Token | Mark all as read |

### 6.8 Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| PUT | `/api/admin/users/:id` | Admin | Update user |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |
| GET | `/api/admin/audit-logs` | Admin | List audit logs |

### 6.9 Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/sessions` | Token | List all sessions |
| GET | `/api/sessions/:id` | Token | Get session details |

---

## 7. Technical Architecture

### 7.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI Libraries | Recharts, D3.js, Lucide React icons |
| Routing | React Router v7 |
| State | React Context (Auth, Language) |
| Backend | Express.js + TypeScript |
| AI Framework | Mastra AI (agentic workflows + RAG) |
| LLM Providers | OpenAI GPT-4o, Anthropic Claude, Google Gemini, Ollama (local) |
| Embeddings | text-embedding-3-small (768-dim) |
| Database | OpenSearch 2.x (vector search + document store) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File Processing | pdf-parse, mammoth (DOCX), csv-parse |
| PDF Export | html2canvas + jspdf |
| Infrastructure | AWS ECS (Fargate + EC2), ALB, EFS, ECR |
| IaC | Terraform |
| CI/CD | GitHub Actions (OIDC auth) |
| Containerization | Docker |
| Monorepo | pnpm workspaces |

### 7.2 System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   ALB        │────▶│   Backend (ECS)  │
│   (React)    │     │  Path-based  │     │   Express + AI   │
│   ECS Task   │     │  Routing     │     │   ECS Task       │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                         ┌─────────────────────────┼──────────────────┐
                         │                         │                  │
                    ┌────▼─────┐          ┌───────▼────────┐  ┌─────▼──────┐
                    │OpenSearch│          │  LLM Providers  │  │    EFS     │
                    │ (Vector  │          │ OpenAI/Claude/  │  │  (Shared   │
                    │   DB)    │          │ Gemini/Ollama   │  │  Storage)  │
                    └──────────┘          └────────────────┘  └────────────┘
```

### 7.3 OpenSearch Indices

| Index | Purpose |
|-------|---------|
| `consultant_users` | User accounts and profiles |
| `consultant_documents` | Chunked documents with vector embeddings |
| `consultant_conversations` | Chat conversations and interview sessions |
| `consultant_entities` | Knowledge graph entities from documents |
| `consultant_notifications` | User notification records |
| `consultant_audit_logs` | Mutation audit trail |
| `readiness_sessions` | Readiness assessment session data |

### 7.4 Infrastructure Tiers

**App Tier (Always-on):**
- t3.small EC2 instances
- Frontend + Backend ECS services
- Auto-scaling: 1-4 instances

**GPU Tier (Cold-start, on-demand):**
- g5.2xlarge instances (Spot with on-demand fallback)
- Ollama LLM service for local inference
- Auto-scaling: 0-1 instances, triggered by assessment start
- EFS-backed model weight persistence

**Storage Tier:**
- OpenSearch Service (encrypted, multi-AZ)
- EFS with access points (/backend, /ollama)

---

## 8. Non-Functional Requirements

### 8.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-01 | API response time (non-AI endpoints) | < 500ms p95 |
| NFR-02 | AI question generation latency | < 10s (cloud), < 30s (local GPU cold start) |
| NFR-03 | Document upload + processing | < 30s for files up to 50MB |
| NFR-04 | Dashboard load time | < 2s |
| NFR-05 | Concurrent users supported | 500+ |
| NFR-06 | SSE notification delivery | < 1s |

### 8.2 Security

| ID | Requirement |
|----|------------|
| NFR-07 | All data encrypted in transit (TLS 1.2+) and at rest |
| NFR-08 | JWT-based authentication with token expiration |
| NFR-09 | bcrypt password hashing |
| NFR-10 | Role-based access control (user, admin, analyst) |
| NFR-11 | Full audit logging for all mutations |
| NFR-12 | No hardcoded credentials (Secrets Manager for production) |
| NFR-13 | IMDSv2 enforced on EC2 instances |
| NFR-14 | SigV4 signed requests to OpenSearch |
| NFR-15 | Session timeout configurable (15min / 30min / 1hr) |

### 8.3 Availability & Reliability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-16 | System uptime | 99.9% |
| NFR-17 | Multi-AZ deployment | Required for production |
| NFR-18 | Disaster recovery regions | me-central-1 + me-south-1 |
| NFR-19 | GPU warmup retry tolerance | 24 attempts × 15s (6 min max) |

### 8.4 Scalability

| ID | Requirement |
|----|------------|
| NFR-20 | Horizontal scaling of app tier via ECS auto-scaling |
| NFR-21 | GPU tier scales to zero when idle (cost optimization) |
| NFR-22 | Spot instance support with on-demand fallback |
| NFR-23 | OpenSearch scaling via instance type upgrades |

### 8.5 Internationalization

| ID | Requirement |
|----|------------|
| NFR-24 | Multi-language support: English, Hindi, Arabic |
| NFR-25 | Language preference persisted per user |
| NFR-26 | AI question generation respects language preference |

---

## 9. Domain Configuration

The platform supports multiple industry domains, each with specialized assessment templates:

| Domain | Config File | Focus Areas |
|--------|------------|-------------|
| Finance | Finance.json | O2C, R2R, P2P, Treasury, Tax |
| HR | HR.json | Recruitment, Payroll, Benefits, Compliance |
| Manufacturing | Manufacturing.json | Production, Quality, Supply Chain |
| Construction | Construction.json | Project Management, Safety, Procurement |
| Supply Chain | SupplyChain.json | Logistics, Inventory, Vendor Management |

Each domain provides:
- Industry-specific assessment questions
- Maturity framework definitions
- Risk categorization templates
- Automation opportunity patterns

---

## 10. Process Types & Assessment Flow

### 10.1 Supported Process Types

| Process Type | Steps | Key Metrics |
|-------------|-------|-------------|
| Order-to-Cash (O2C) | Order Entry → Credit Check → Fulfillment → Invoicing → Payment | Cycle time, DSO, credit approval time |
| Record-to-Report (R2R) | Journal Entry → Reconciliation → Consolidation → Reporting → Close | Close cycle, error rate, automation % |
| Procure-to-Pay (P2P) | Requisition → Approval → PO → Receipt → Payment | Cycle time, maverick spend %, early payment % |

### 10.2 Assessment Lifecycle

```
1. Create Assessment → Select Process Type → Select Areas
2. AI generates domain-specific questions
3. SME answers questions (structured + open-ended)
4. System identifies gaps, pain points, automation opportunities
5. Risk scores calculated per area and overall
6. Reports generated (readiness, gap analysis, interview)
7. Insights and recommendations surfaced
```

---

## 11. Visualization Requirements

| Chart | Page | Library | Description |
|-------|------|---------|-------------|
| Gauge Chart | Dashboard | Custom SVG | Half-circle risk severity gauge (green → red gradient) |
| Circular Progress | Dashboard | Custom SVG | Discovery completion ring |
| Process Flow | Dashboard | Custom CSS | Sequential step cards with arrow connectors |
| Pie/Donut Chart | Process Analysis | Recharts | Process type distribution |
| Bar Chart | Process Analysis | Recharts | Process step efficiency comparison |
| Line Chart | Insights | Recharts | Performance trends over time (dual-axis) |
| Progress Bars | SME Engagement | Custom CSS | Engagement percentage with color coding |
| Heatmap Bars | Right Panel | Custom CSS | Department engagement levels |
| Knowledge Graph | Analysis (modal) | D3.js | Entity relationship visualization |
| Radar Chart | Analysis (modal) | Recharts | Maturity assessment across dimensions |
| Sankey Diagram | Analysis (modal) | D3.js | Process flow analysis |
| Bubble Chart | Analysis (modal) | Recharts | Impact vs. effort prioritization |
| Heatmap | Analysis (modal) | Custom | Gap severity across areas |
| Treemap | Analysis (modal) | Recharts | Hierarchical data visualization |

---

## 12. Testing Strategy

| Level | Tool | Scope |
|-------|------|-------|
| Unit Tests | Vitest | Backend services, utility functions |
| Integration Tests | Vitest | API endpoint testing with OpenSearch |
| E2E Tests | Playwright | Full user flow testing (login → assessment → report) |
| Type Checking | TypeScript | Compile-time type safety |

---

## 13. Deployment Environments

| Environment | Region | Purpose | Cost Optimization |
|-------------|--------|---------|-------------------|
| Staging | us-east-1 | Development and testing | Single NAT gateway, minimal instances |
| Production | me-central-1 | Primary production | Multi-AZ, auto-scaling |
| DR | me-south-1 | Disaster recovery | Warm standby |

---

## 14. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Assessment Completion Rate | > 80% | Completed / Total started |
| SME Participation Rate | > 75% | Active SMEs / Total SMEs |
| Average Risk Score Reduction | > 20% over assessment period | Pre vs. post assessment scores |
| Time to First Insight | < 1 hour from first SME response | Timestamp delta |
| Report Generation Success | > 99% | Successful / Attempted |
| User Satisfaction (NPS) | > 50 | Post-assessment survey |

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
