# Banking Vertical Extension — Implementation Plan

> **Purpose:** A durable, self-contained brief for a future Claude Code / Antigravity session (or any engineer) to implement the banking-sector extension of the Consultant Agent platform, plus the cross-cutting primitives (AS-IS vs TO-BE, benchmark library, snapshot comparison) that unlock manufacturing and any future vertical.
>
> **Read this alongside:** Anuj's banking client screenshots + demo code (drop them into `/docs/banking-demo/` — see placeholder section at the bottom).

---

## 1. Context — What the client (via Anuj) asked for

A banking client wants the consultant platform to:

1. Surface **operational KPIs** for banking processes — cycle time per loan, cost-to-loan, NPA exposure, straight-through-processing (STP) rate, turnaround time by product.
2. Model **AS-IS vs TO-BE** everywhere — every process step, every gap, every KPI should carry both the current state and the desired/designed state.
3. **Fall back to APQC PCF** (and BIAN for banking) when the client has not defined a TO-BE for a given process.
4. Support **time-based comparison**: "today's TO-BE becomes the AS-IS six months later; compare AS-IS to AS-IS across time to demonstrate optimization." I.e., track continuous improvement, not just a single assessment.
5. Cover adjacent verticals next — **manufacturing** is the near-term target after banking (ISA-95, APQC manufacturing PCF).

Anuj's open question to us: **do we integrate this into the existing consultant agent, or build a new product?**

---

## 2. Architectural Decision — Extend, Don't Rebuild

**Recommendation: one product, pluggable verticals.** The existing platform already has the right primitives; the banking ask is three genuinely new capabilities bolted onto them.

### Mapping: client ask → existing platform primitive

| Client requirement | Already exists as | New work needed |
|---|---|---|
| Process catalogue per vertical | `backend/src/services/domainService.ts` (broad areas / sub-areas) | Banking config file + loader dispatch on `project.industry` |
| KPI dashboard | `backend/src/routes/dashboard.ts` + `frontend/src/pages/Dashboard.tsx` | Banking-specific KPI tiles + connector pulls |
| ERP connector | `backend/src/services/connectors/` (SAP, Dynamics CDM) | Finacle / Temenos / Flexcube adapters mapped to same CDM |
| AS-IS process model | `consultant_reports` index, `content.processFlow` | Add `state: 'as-is' \| 'to-be'` tag + paired view |
| Gap register | `content.gaps[]` | Each gap already has impact/fit; add `toBeReference` field |
| Improvement over time | `maturity-trend` route (just added) | Generalize to full AS-IS snapshot comparison |
| APQC/BIAN fallback | — | New: `backend/src/services/benchmarkLibrary.ts` |

**Three genuinely new things:**

1. **AS-IS / TO-BE dual state** as a first-class schema concept.
2. **Benchmark library** (APQC PCF, BIAN, ISA-95) queryable as the TO-BE when client hasn't defined one.
3. **Snapshot comparison** — persist point-in-time assessments, diff them.

Everything else is config, not code.

---

## 3. Phased Roadmap

### Phase 1 — Banking demo-able (target: 1–2 weeks)

Goal: walk Anuj through a working banking assessment end-to-end.

**1.1 Banking domain config**
- New file: `backend/src/config/domains/banking.ts`
- Broad areas: `Customer Onboarding`, `Loan Origination`, `Payments & Settlement`, `Collections & Recovery`, `Regulatory Reporting`, `Core Banking Ops`.
- Each area: sub-areas (e.g. Loan Origination → `Application Intake`, `Credit Assessment`, `Underwriting`, `Disbursement`, `Post-Disbursement Monitoring`).
- Each sub-area: seed questions tagged with `kpiHints: ['cycle_time', 'cost_per_unit', 'stp_rate']`.
- Follow shape of whatever `domainService.ts` currently loads for the default/ERP domain.

**1.2 Domain dispatch**
- `getProjectContext()` already returns `industry`. In `domainService.ts` (or wherever broad areas are resolved), switch on `industry` → load `banking.ts` vs default config. Keep default as fallback.

**1.3 Banking KPI tiles on dashboard**
- Extend `GET /api/dashboard/stats` with `bankingKpis?: { costToLoan, avgCycleTimeDays, stpRatePct, npaRatioPct }` — only populated when `industry === 'banking'`.
- Derive from `consultant_reports` gap/KPI content; where data missing, return `null` and let tile show "Not captured yet".
- Frontend: add `<BankingKpiRow />` to `Dashboard.tsx`, gated on `projectContext.industry === 'banking'`.

**1.4 Finacle connector stub**
- `backend/src/services/connectors/finacle.ts` — same interface as existing SAP/Dynamics adapters, returns CDM shape.
- Start with a **mock fixture** (`backend/src/services/connectors/fixtures/finacle.sample.json`) so demo works without a real Finacle tenant.

**Deliverable:** Create a banking project, run the interview, see banking-flavoured broad areas and KPI tiles. No AS-IS/TO-BE yet.

---

### Phase 2 — AS-IS / TO-BE as first-class (2–3 weeks)

**2.1 Schema tag**
- Add `state: 'as-is' | 'to-be'` to report `content.processFlow` nodes and each gap.
- Default existing data to `as-is` via a one-time backfill (small script, idempotent).
- `interviewService.ts`: when building dynamic questions, ask the consultant "are you capturing current state or target state?" once per sub-area; thread that into the answer record.

**2.2 Benchmark library**
- New: `backend/src/services/benchmarkLibrary.ts`
- Bundled JSON: `backend/src/data/benchmarks/apqc-pcf.json`, `bian-banking.json`, (later) `isa95-manufacturing.json`.
- API surface:
  ```ts
  resolveBenchmark(industry: string, broadAreaId: string, subAreaId?: string):
    { source: 'APQC'|'BIAN'|'ISA95'; steps: BenchmarkStep[]; kpis: BenchmarkKpi[] } | null
  ```
- Source data: APQC PCF is free to download (CSV); BIAN service domains likewise. Commit a curated subset, not the full dump.

**2.3 TO-BE resolver**
- `reportService.ts`: when generating a gap report, if the sub-area has no consultant-authored TO-BE, call `resolveBenchmark(...)` and fill `toBeReference` with the benchmark source tag.
- Report UI (`ConsolidatedReportModal`): show both columns side-by-side. If TO-BE is from benchmark, badge it `APQC 12.4.2` (or equivalent).

**2.4 Prompt injection**
- Extend the existing `buildReportKBContext()` helper with `buildBenchmarkContext()` — fed into readiness/gap prompts so the LLM can reason against the benchmark explicitly.

**Deliverable:** Every report shows AS-IS vs TO-BE. When consultant hasn't captured TO-BE, APQC/BIAN fills it automatically with a visible badge.

---

### Phase 3 — Snapshot comparison / improvement over time (2 weeks)

**3.1 Snapshots index**
- New OpenSearch index: `consultant_snapshots` (add to `INDICES` in `backend/src/config/database.ts`).
- Document shape:
  ```jsonc
  {
    "snapshotId": "snap-2026-04-14-...",
    "projectId": "...",
    "takenAt": "2026-04-14T00:00:00Z",
    "label": "Q1 Baseline" | "Q2 Post-Automation" | "...",
    "metrics": { ...full /dashboard/stats payload... },
    "reports": [ ...embedded consultant_reports summaries... ],
    "kpis": { costToLoan: 2400, avgCycleTimeDays: 9.2, ... }
  }
  ```

**3.2 Snapshot service**
- `backend/src/services/snapshotService.ts`:
  - `createSnapshot(projectId, label)` — captures current stats + report roll-up.
  - `listSnapshots(projectId)`.
  - `compareSnapshots(aId, bId)` — returns metric deltas, gap open/closed counts, KPI deltas.
- Routes: `POST /api/snapshots`, `GET /api/snapshots`, `GET /api/snapshots/compare?a=...&b=...`.

**3.3 Frontend**
- New page `frontend/src/pages/ProcessOptimization.tsx`:
  - Timeline of snapshots.
  - "Compare A vs B" view: side-by-side KPI bars, gap register diff (opened / closed / unchanged), process-flow delta annotations.
- Add nav entry; hide unless `project.industry` is set (safe default).

**3.4 Scheduler (optional)**
- Cron (once per quarter, admin-triggered) auto-creates a snapshot. For MVP, keep snapshot creation manual.

**Deliverable:** Consultant can say "here's where you were in January, here's now, here's exactly what improved." Anuj's "AS-IS to AS-IS over time" requirement satisfied.

---

### Phase 4 — Manufacturing & future verticals (ongoing)

- New domain config: `backend/src/config/domains/manufacturing.ts` — broad areas per ISA-95 levels (Production, Quality, Maintenance, Inventory, Planning).
- Benchmark: `isa95-manufacturing.json` + APQC manufacturing PCF subset.
- Connector stubs: SAP S/4 PP module, MES adapters (Siemens Opcenter, Rockwell FactoryTalk) — mock fixtures first.
- Dashboard KPI row variant: OEE, throughput, defect rate, MTBF.
- **No platform changes should be needed.** If Phase 4 requires non-config edits, Phases 1–3 abstracted the wrong boundary — fix the abstraction, not the vertical.

---

## 4. Schema Changes Summary

| Change | Where | Migration |
|---|---|---|
| `state: 'as-is'\|'to-be'` on report nodes & gaps | `consultant_reports` mapping | One-time backfill: default `'as-is'` |
| `toBeReference: { source, id }` on gaps | `consultant_reports` mapping | Added on generation; nullable |
| New `consultant_snapshots` index | `backend/src/config/database.ts` INDICES | New index, no migration |
| `industry` on project settings | Already present via `getProjectContext()` | — |

---

## 5. Banking Domain Config — Seed Template

```ts
// backend/src/config/domains/banking.ts
export const bankingDomain: DomainConfig = {
  id: 'banking',
  label: 'Banking & Financial Services',
  broadAreas: [
    {
      id: 'customer-onboarding',
      name: 'Customer Onboarding',
      subAreas: [
        { id: 'kyc', name: 'KYC / AML', kpiHints: ['cycle_time', 'rework_rate'] },
        { id: 'account-opening', name: 'Account Opening', kpiHints: ['stp_rate', 'cycle_time'] },
      ],
    },
    {
      id: 'loan-origination',
      name: 'Loan Origination',
      subAreas: [
        { id: 'application-intake', name: 'Application Intake', kpiHints: ['cycle_time'] },
        { id: 'credit-assessment', name: 'Credit Assessment', kpiHints: ['cycle_time', 'cost_per_unit'] },
        { id: 'underwriting', name: 'Underwriting', kpiHints: ['stp_rate'] },
        { id: 'disbursement', name: 'Disbursement', kpiHints: ['cycle_time'] },
        { id: 'monitoring', name: 'Post-Disbursement Monitoring', kpiHints: ['npa_ratio'] },
      ],
    },
    { id: 'payments', name: 'Payments & Settlement', subAreas: [/* ... */] },
    { id: 'collections', name: 'Collections & Recovery', subAreas: [/* ... */] },
    { id: 'reg-reporting', name: 'Regulatory Reporting', subAreas: [/* ... */] },
    { id: 'core-ops', name: 'Core Banking Ops', subAreas: [/* ... */] },
  ],
  kpis: [
    { id: 'cost_to_loan', label: 'Cost to Loan', unit: 'USD' },
    { id: 'avg_cycle_time_days', label: 'Avg Cycle Time', unit: 'days' },
    { id: 'stp_rate_pct', label: 'Straight-Through Processing', unit: '%' },
    { id: 'npa_ratio_pct', label: 'NPA Ratio', unit: '%' },
  ],
};
```

---

## 6. Benchmark Library Structure

```jsonc
// backend/src/data/benchmarks/apqc-pcf.json (excerpt)
{
  "source": "APQC",
  "version": "7.3.0",
  "entries": [
    {
      "code": "3.5.1",
      "path": "Develop Products and Services > Manage product development",
      "industries": ["cross-industry"],
      "steps": ["Define product vision", "Validate with market", "..."],
      "kpis": ["time_to_market", "dev_cost_per_product"]
    }
  ]
}
```
```jsonc
// backend/src/data/benchmarks/bian-banking.json (excerpt)
{
  "source": "BIAN",
  "version": "v12",
  "entries": [
    {
      "code": "CR-OP-001",
      "serviceDomain": "Consumer Loan",
      "path": "Fulfill > Loan Origination",
      "steps": ["Capture application", "Assess creditworthiness", "Decision", "Disburse"],
      "kpis": ["cycle_time", "stp_rate", "cost_to_loan"]
    }
  ]
}
```

Resolver pseudocode:
```ts
function resolveBenchmark(industry, broadAreaId, subAreaId) {
  const order = industry === 'banking'
    ? ['BIAN', 'APQC']
    : industry === 'manufacturing'
      ? ['ISA95', 'APQC']
      : ['APQC'];
  for (const src of order) {
    const hit = benchmarks[src].find(e => matches(e, broadAreaId, subAreaId));
    if (hit) return { source: src, ...hit };
  }
  return null;
}
```

---

## 7. Snapshot Comparison Service — Signature

```ts
// backend/src/services/snapshotService.ts
export interface Snapshot {
  snapshotId: string;
  projectId: string;
  takenAt: string;
  label: string;
  metrics: DashboardStats;
  kpis: Record<string, number | null>;
  reportSummaries: Array<{ broadAreaId: string; overallScore: number; gapCount: number }>;
}

export interface SnapshotDiff {
  a: Snapshot; b: Snapshot;
  metricDeltas: Record<string, { from: number; to: number; deltaPct: number }>;
  kpiDeltas: Record<string, { from: number|null; to: number|null; deltaPct: number|null }>;
  gapChanges: { opened: Gap[]; closed: Gap[]; unchanged: Gap[] };
}

export async function createSnapshot(projectId: string, label: string): Promise<Snapshot>;
export async function listSnapshots(projectId: string): Promise<Snapshot[]>;
export async function compareSnapshots(aId: string, bId: string): Promise<SnapshotDiff>;
```

---

## 8. Patterns to Follow (existing code to mirror)

| Need | Look at |
|---|---|
| New OpenSearch index wiring | `backend/src/config/database.ts` — `INDICES` constant + ensure-index pattern |
| New service + route pair | `backend/src/services/metricsService.ts` + `backend/src/routes/dashboard.ts` |
| ERP connector interface | `backend/src/services/connectors/` (SAP, Dynamics) |
| Prompt context injection | `buildKnowledgeBaseContext()` in `interviewService.ts`; `buildReportKBContext()` in `reportService.ts` |
| Feature-gated frontend | `Dashboard.tsx` — tile components gated on feature availability |
| SSE live updates | `/api/dashboard/stream` in `routes/dashboard.ts` — same pattern if snapshots need live refresh |
| Industry-conditional logic | `getProjectContext()` returns `industry` — use as dispatch key, not as a sprawling if-chain |

---

## 9. Open Questions for Product Owner

1. **TO-BE authoring UX** — in-line editing on the AS-IS process flow, or a separate "design target" workspace?
2. **Benchmark licensing** — APQC PCF is freely redistributable in excerpt; BIAN service domain catalog likewise. Confirm legal before shipping full text.
3. **Snapshot cadence** — manual only, or scheduled (monthly/quarterly)?
4. **Multi-tenant** — one project per client, or multi-project rollup? (Affects snapshot scoping.)
5. **Connector priority for banking** — Finacle first (Anuj's client) or Temenos (larger TAM)?
6. **Manufacturing timing** — immediately after Phase 3, or gate on banking customer traction?

---

## 10. Anuj's Screenshots & Demo Code

> **Placeholder** — drop artifacts here so the next session can build against the real target.

- `/docs/banking-demo/screenshots/` — UI screenshots from Anuj's banking client demo.
- `/docs/banking-demo/sample-data/` — any sample Finacle / Temenos / core-banking exports.
- `/docs/banking-demo/requirements.md` — Anuj's written requirements (verbatim) with any clarifications.
- `/docs/banking-demo/kpi-catalog.md` — full list of banking KPIs the client wants, with definitions.

When these exist, the next Claude Code / Antigravity session should:

1. Read this plan end-to-end.
2. Read everything in `/docs/banking-demo/`.
3. Reconcile: flag anything in the demo that contradicts Phases 1–3 here, and ask before deviating.
4. Start with **Phase 1** unless the user explicitly asks for a different phase.

---

## 11. Success Criteria

- [ ] **Phase 1:** Create a project with `industry='banking'`, complete an interview, see banking broad areas and at least 2 KPI tiles populated from real answers.
- [ ] **Phase 2:** Generate a gap report where at least one gap's TO-BE column is auto-filled from APQC or BIAN, visibly badged.
- [ ] **Phase 3:** Create two snapshots (one after baseline interview, one after re-interview with updated answers) and view a diff page showing at least one KPI delta and gap open/close counts.
- [ ] **Phase 4:** Repeat Phase 1 success criteria with `industry='manufacturing'` — **without editing any file under `backend/src/services/` or `frontend/src/pages/`.** Config only.

If Phase 4 fails that last constraint, the abstraction is wrong and must be fixed before shipping more verticals.
