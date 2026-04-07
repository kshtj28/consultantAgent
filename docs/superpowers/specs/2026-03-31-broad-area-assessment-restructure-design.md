# Broad Area Assessment Restructure

**Date:** 2026-03-31
**Status:** Approved

## Summary

Restructure assessment areas from flat, granular process areas into a two-level hierarchy: **broad areas** (user-selectable) containing **sub-areas** (automatically included). Users select one or many broad areas for an interview, and the AI-driven interview covers all relevant sub-areas within those selections. The readiness session system is retired and migrated into the interview session system.

## Decisions

- **Approach:** Nested broad areas in domain JSON (Approach B — clean restructure)
- **Interview navigation:** Hybrid — AI drives fluid conversation across sub-areas; sidebar shows coverage
- **Coverage threshold:** Minimum 2 questions per sub-area + AI confidence signal
- **Migration:** Existing readiness sessions converted to new interview format
- **Reports:** Organized at broad-area level (narrative + single maturity score per broad area)
- **Scope:** All domains (Finance, HR, Manufacturing, Supply Chain, Construction)

---

## 1. Domain Config Structure

Each domain JSON restructures from a flat `areas` array to nested `broadAreas`:

```json
{
  "id": "finance",
  "name": "Banking",
  "description": "...",
  "persona": "...",
  "broadAreas": [
    {
      "id": "procure_to_pay",
      "name": "Procure-to-Pay",
      "icon": "shopping-cart",
      "description": "End-to-end procurement lifecycle from sourcing through payment",
      "order": 2,
      "subAreas": [
        {
          "id": "procurement_sourcing",
          "name": "Procurement & Sourcing",
          "icon": "search",
          "description": "Strategic sourcing, category management, RFQ/RFP process",
          "basePrompt": "Ask questions about strategic sourcing practices...",
          "benchmarks": {
            "maturity_1": "...",
            "maturity_2": "...",
            "maturity_3": "...",
            "maturity_4": "...",
            "maturity_5": "..."
          }
        }
      ]
    }
  ]
}
```

- `broadAreas` replaces the top-level `areas` array
- Each broad area has: `id`, `name`, `icon`, `description`, `order`
- Sub-areas retain all existing fields: `basePrompt`, `benchmarks`, `icon`, `description`
- No broad-area-level `basePrompt` or `benchmarks` — those live on sub-areas only

---

## 2. Broad Area Groupings by Domain

### Finance/Banking

| Broad Area | Sub-Areas |
|---|---|
| **Order-to-Cash (O2C)** | Accounts Receivable |
| **Procure-to-Pay (P2P)** | Procurement & Sourcing, Purchase Order Management, Vendor Management, Accounts Payable, Payment Execution |
| **Record-to-Report (R2R)** | General Ledger, Journal Entries & Accruals, Reconciliation, Period-End Close, Financial Reporting, Financial Consolidation, Management Reporting |
| **Treasury & Cash Management** | Treasury |
| **Compliance & Controls** | Compliance & Controls |

### HR

| Broad Area | Sub-Areas |
|---|---|
| **Hire-to-Retire** | Recruiting & Talent Acquisition, Onboarding, Performance Management, Learning & Development |
| **Payroll & Compensation** | Payroll & Compensation |

### Manufacturing

| Broad Area | Sub-Areas |
|---|---|
| **Plan-to-Produce** | Production Planning, Quality Control, Inventory & Warehouse, Plant Maintenance, Sales & Operations |
| **Procure-to-Pay (P2P)** | Strategic Sourcing, Purchase Order Management, Supplier Management, Goods Receipt & Invoice Verification, Payment Processing |
| **Record-to-Report (R2R)** | Cost Accounting & WIP, Inventory Valuation, Month-End Close, Management Reporting, Financial Controls |
| **Compliance & EHS** | Compliance & EHS |

### Supply Chain

| Broad Area | Sub-Areas |
|---|---|
| **Source-to-Deliver** | Procurement, Inventory Management, Logistics & Distribution, Demand Planning |

### Construction

| Broad Area | Sub-Areas |
|---|---|
| **Project-to-Delivery** | Project Management, Site Operations, Workforce & Labour, Equipment & Asset Management |
| **Procure-to-Pay (P2P)** | Procurement & Contracts, Procurement & Sourcing, Purchase Order Management, Subcontractor & Vendor Management, Payment Certification |
| **Record-to-Report (R2R)** | Project Cost Accounting, Period-End Close, Financial Reporting, Billing & Revenue |
| **Safety & Compliance** | Safety & Compliance, Compliance & Controls |

---

## 3. Interview Flow

### User Journey

1. **Start Interview** — User clicks "Start New Interview" from the Process Analysis page
2. **Select Broad Areas** — Grid of broad area cards (e.g., "Procure-to-Pay", "Record-to-Report"). User selects one or many. Sub-areas are not shown — just broad areas with their description.
3. **Interview Begins** — AI starts a fluid conversation covering all sub-areas within selected broad areas
4. **Sidebar** — Shows:
   - Selected broad areas as collapsible sections
   - Under each: sub-areas with a coverage indicator (empty / partial / covered)
   - AI drives which sub-area to explore; sidebar gives visibility into coverage
5. **Completion** — When AI has sufficient confidence across all sub-areas (minimum 2 questions per sub-area + AI confidence), interview can be completed and report generated

### AI Behavior

- System prompt includes the full list of sub-areas for selected broad areas
- AI flows naturally between sub-areas based on conversation context
- After each answer, backend evaluates coverage: which sub-areas touched, which need depth
- If AI hasn't touched a sub-area after covering others, it's nudged to transition there
- Coverage per sub-area: minimum 2 questions + AI confidence signal

---

## 4. Data Model

### Interview Session

```typescript
interface InterviewSession {
  sessionId: string;
  userId: string;
  domainId: string;
  status: 'in_progress' | 'completed';
  selectedBroadAreas: string[];           // e.g., ["procure_to_pay", "record_to_report"]
  currentSubArea: string | null;          // AI's current focus
  responses: {
    [subAreaId: string]: QuestionAnswer[] // Q&A grouped by sub-area
  };
  coverage: {
    [subAreaId: string]: {
      questionsAnswered: number;
      aiConfident: boolean;               // AI signals sufficient depth
      status: 'not_started' | 'in_progress' | 'covered';
    }
  };
  conversationContext: {
    identifiedGaps: string[];
    transformationOpportunities: string[];
    painPoints: string[];
  };
}
```

### Coverage Status Logic

- `not_started`: 0 questions answered
- `in_progress`: 1+ questions answered, not yet covered
- `covered`: questionsAnswered >= 2 AND aiConfident === true

---

## 5. Migration: Readiness → Interview

Existing readiness sessions converted to interview session format:

1. Map each old `selectedAreas` to the broad area that contains it
2. Move `responses[areaId]` as-is (sub-area IDs unchanged)
3. Build `coverage` from existing question counts
4. Set `aiConfident: true` for sub-areas with 5+ questions (old threshold)
5. Mark migrated sessions with `migratedFrom: 'readiness'` flag
6. Retire readiness routes and service after migration

---

## 6. Reports

Reports organized at the broad-area level:
- One maturity score per broad area (aggregated from sub-area findings)
- Narrative summary per broad area covering gaps, opportunities, pain points
- Sub-areas mentioned within the narrative but not broken out as separate sections

---

## 7. Backend Changes

| File | Change |
|---|---|
| `backend/src/config/domains/*.json` | Restructure from flat `areas` to nested `broadAreas` → `subAreas` |
| `backend/src/services/domainService.ts` | New methods: `getBroadAreas()`, `getSubAreasForBroadArea(id)`. Update all area lookups to navigate hierarchy. |
| `backend/src/services/readinessSessionService.ts` | Retire. Merge relevant logic into `interviewService.ts` |
| `backend/src/services/interviewService.ts` | Add broad area selection, sub-area coverage tracking, AI nudging logic |
| `backend/src/services/questionEngine.ts` | Update system prompt to include all sub-areas for selected broad areas. Add coverage-aware sub-area transition logic. |
| `backend/src/routes/readinessRoutes.ts` | Retire. Migrate needed endpoints into interview routes. |
| `backend/src/routes/interview.ts` | Add endpoints for broad area listing and selection |

## 8. Frontend Changes

| File | Change |
|---|---|
| `frontend/src/pages/ProcessAnalysis.tsx` | Replace area selection grid with broad area cards. Update sidebar to show broad area → sub-area hierarchy with coverage indicators. Remove readiness-specific logic. |
| `frontend/src/services/api.ts` | Remove readiness endpoints. Update interview endpoints to support broad area selection. |
| `frontend/src/pages/ProcessAnalysis.css` | Update styles for broad area cards and hierarchical sidebar |
