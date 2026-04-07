# Broad Area Assessment Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure flat assessment areas into a two-level hierarchy (broad areas → sub-areas), migrate the readiness flow into the interview system, and update the frontend to select broad areas with a hybrid AI-driven interview covering all sub-areas.

**Architecture:** Domain JSON configs get a new `broadAreas` array containing nested `subAreas` (existing areas with their prompts/benchmarks). The `domainService` gains hierarchy-aware methods. The interview service is extended with broad-area selection and sub-area coverage tracking. The readiness system is retired and sessions migrated. The frontend replaces area selection with broad-area cards and adds a hierarchical sidebar.

**Tech Stack:** TypeScript, Express, React, OpenSearch, LLM (question generation)

---

## File Map

### New Files
- None (all changes are modifications to existing files)

### Modified Files

| File | Responsibility |
|---|---|
| `backend/src/config/domains/finance.json` | Restructure `areas` → `broadAreas[].subAreas[]` |
| `backend/src/config/domains/hr.json` | Same restructure |
| `backend/src/config/domains/manufacturing.json` | Same restructure |
| `backend/src/config/domains/supplychain.json` | Same restructure |
| `backend/src/config/domains/construction.json` | Same restructure |
| `backend/src/services/domainService.ts` | New types + methods for broad area hierarchy |
| `backend/src/services/interviewService.ts` | Add broad area selection, coverage tracking, sub-area transitions |
| `backend/src/services/questionEngine.ts` | Update prompts to use broad area context |
| `backend/src/routes/interview.ts` | Add broad area endpoints, update session flow |
| `backend/src/services/reportService.ts` | Update imports from domainService instead of readinessSessionService |
| `backend/src/services/metricsService.ts` | Update imports from domainService |
| `backend/src/services/documentAutoFill.ts` | Update imports from domainService |
| `backend/src/index.ts` | Remove readiness route registration |
| `frontend/src/pages/ProcessAnalysis.tsx` | Broad area selection, hierarchical sidebar, interview flow |
| `frontend/src/pages/ProcessAnalysis.css` | Styles for broad area cards, hierarchical sidebar |
| `frontend/src/services/api.ts` | Remove readiness endpoints, add broad area interview endpoints |

### Files to Retire
- `backend/src/routes/readinessRoutes.ts` — endpoints merged into interview routes
- `backend/src/services/readinessSessionService.ts` — logic merged into interviewService

---

## Task 1: Restructure Domain JSON Configs

**Files:**
- Modify: `backend/src/config/domains/finance.json`
- Modify: `backend/src/config/domains/hr.json`
- Modify: `backend/src/config/domains/manufacturing.json`
- Modify: `backend/src/config/domains/supplychain.json`
- Modify: `backend/src/config/domains/construction.json`

- [ ] **Step 1: Restructure finance.json**

Replace the top-level `areas` array with `broadAreas`. Each broad area wraps existing sub-areas. Remove `interview_categories` (broad areas replace them).

The new structure for `finance.json`:

```json
{
    "id": "finance",
    "name": "Banking",
    "description": "Banking and financial services process readiness assessment",
    "persona": "You are a senior banking and financial services consultant with 20 years of experience in ERP transformations, core banking modernisation, procure-to-pay optimisation, and record-to-report automation. You have deep expertise in IFRS/GAAP consolidation, treasury operations, regulatory compliance (SOX, Basel III, IFRS 9), and digital finance transformation. You specialise in identifying process inefficiencies, control gaps, and automation opportunities across the full finance function, and you recommend modern best practices tailored to banking and financial services organisations.",
    "broadAreas": [
        {
            "id": "order_to_cash",
            "name": "Order-to-Cash",
            "icon": "dollar-sign",
            "description": "End-to-end revenue cycle from customer order through billing and cash collection",
            "order": 1,
            "subAreas": [
                <MOVE the existing "accounts_receivable" area object here>
            ]
        },
        {
            "id": "procure_to_pay",
            "name": "Procure-to-Pay",
            "icon": "shopping-cart",
            "description": "End-to-end procurement lifecycle from sourcing through payment",
            "order": 2,
            "subAreas": [
                <MOVE existing areas: "procurement_sourcing", "purchase_order_management", "vendor_management", "accounts_payable", "payment_execution">
            ]
        },
        {
            "id": "record_to_report",
            "name": "Record-to-Report",
            "icon": "book",
            "description": "End-to-end accounting cycle from journal entries through financial reporting",
            "order": 3,
            "subAreas": [
                <MOVE existing areas: "general_ledger", "journal_entries_accruals", "reconciliation", "period_end_close", "financial_reporting", "financial_consolidation", "management_reporting">
            ]
        },
        {
            "id": "treasury_cash_management",
            "name": "Treasury & Cash Management",
            "icon": "briefcase",
            "description": "Cash management, liquidity planning, and treasury operations",
            "order": 4,
            "subAreas": [
                <MOVE existing "treasury" area object here>
            ]
        },
        {
            "id": "compliance_controls",
            "name": "Compliance & Controls",
            "icon": "shield",
            "description": "Regulatory compliance, internal controls, audit readiness, and SOX",
            "order": 5,
            "subAreas": [
                <MOVE existing "compliance_controls" area object here>
            ]
        }
    ]
}
```

Each sub-area retains its full existing structure (`id`, `name`, `icon`, `description`, `order`, `basePrompt`, `benchmarks`). The sub-area `order` field is now relative within its broad area.

- [ ] **Step 2: Restructure hr.json**

```json
{
    "id": "hr",
    "name": "Human Resources",
    "description": "HR process readiness assessment",
    "persona": "<existing persona>",
    "broadAreas": [
        {
            "id": "hire_to_retire",
            "name": "Hire-to-Retire",
            "icon": "users",
            "description": "End-to-end employee lifecycle from recruitment through development and retention",
            "order": 1,
            "subAreas": [
                <MOVE: "recruiting", "onboarding", "performance", "learning">
            ]
        },
        {
            "id": "payroll_compensation",
            "name": "Payroll & Compensation",
            "icon": "credit-card",
            "description": "Salary processing, benefits administration, and compensation management",
            "order": 2,
            "subAreas": [
                <MOVE: "payroll">
            ]
        }
    ]
}
```

- [ ] **Step 3: Restructure manufacturing.json**

```json
"broadAreas": [
    {
        "id": "plan_to_produce",
        "name": "Plan-to-Produce",
        "icon": "settings",
        "description": "Production planning through quality control and inventory management",
        "order": 1,
        "subAreas": [ <MOVE: "production_planning", "quality_control", "inventory_warehouse", "plant_maintenance", "sales_operations"> ]
    },
    {
        "id": "procure_to_pay",
        "name": "Procure-to-Pay",
        "icon": "shopping-cart",
        "description": "Strategic sourcing through supplier management and payment processing",
        "order": 2,
        "subAreas": [ <MOVE: "strategic_sourcing", "purchase_order_management", "supplier_management", "goods_receipt_invoice_verification", "payment_processing"> ]
    },
    {
        "id": "record_to_report",
        "name": "Record-to-Report",
        "icon": "book",
        "description": "Cost accounting through month-end close and management reporting",
        "order": 3,
        "subAreas": [ <MOVE: "cost_accounting_wip", "inventory_valuation", "month_end_close", "management_reporting", "financial_controls"> ]
    },
    {
        "id": "compliance_ehs",
        "name": "Compliance & EHS",
        "icon": "shield",
        "description": "Regulatory compliance, environmental health, and safety management",
        "order": 4,
        "subAreas": [ <MOVE: "compliance_ehs"> ]
    }
]
```

- [ ] **Step 4: Restructure supplychain.json**

```json
"broadAreas": [
    {
        "id": "source_to_deliver",
        "name": "Source-to-Deliver",
        "icon": "truck",
        "description": "End-to-end supply chain from procurement through logistics and delivery",
        "order": 1,
        "subAreas": [ <MOVE: "procurement", "inventory", "logistics", "demand_planning"> ]
    }
]
```

- [ ] **Step 5: Restructure construction.json**

```json
"broadAreas": [
    {
        "id": "project_to_delivery",
        "name": "Project-to-Delivery",
        "icon": "hard-hat",
        "description": "Project management, site operations, workforce, and equipment management",
        "order": 1,
        "subAreas": [ <MOVE: "project_management", "site_operations", "workforce_labour", "equipment_asset_management"> ]
    },
    {
        "id": "procure_to_pay",
        "name": "Procure-to-Pay",
        "icon": "shopping-cart",
        "description": "Procurement, subcontractor management, and payment certification",
        "order": 2,
        "subAreas": [ <MOVE: "procurement_contracts", "procurement_sourcing", "purchase_order_management", "subcontractor_vendor_management", "payment_certification"> ]
    },
    {
        "id": "record_to_report",
        "name": "Record-to-Report",
        "icon": "book",
        "description": "Project cost accounting through financial reporting",
        "order": 3,
        "subAreas": [ <MOVE: "project_cost_accounting", "period_end_close", "financial_reporting", "billing_revenue"> ]
    },
    {
        "id": "safety_compliance",
        "name": "Safety & Compliance",
        "icon": "shield",
        "description": "Safety management and regulatory compliance",
        "order": 4,
        "subAreas": [ <MOVE: "safety_compliance", "compliance_controls"> ]
    }
]
```

- [ ] **Step 6: Verify all JSON configs are valid**

Run:
```bash
cd /home/ankur/workspace/consultantAgent
node -e "const fs = require('fs'); ['finance','hr','manufacturing','supplychain','construction'].forEach(d => { const p = 'backend/src/config/domains/' + d + '.json'; JSON.parse(fs.readFileSync(p, 'utf8')); console.log(d + '.json: valid'); });"
```

Expected: All 5 files print "valid" with no parse errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/domains/finance.json backend/src/config/domains/hr.json backend/src/config/domains/manufacturing.json backend/src/config/domains/supplychain.json backend/src/config/domains/construction.json
git commit -m "refactor: restructure domain configs from flat areas to broadAreas hierarchy"
```

---

## Task 2: Update domainService.ts Types and Methods

**Files:**
- Modify: `backend/src/services/domainService.ts`

- [ ] **Step 1: Update type definitions**

Replace the existing `DomainArea`, `DomainInterviewCategory`, and `DomainConfig` interfaces (lines 10-42) with:

```typescript
export interface SubArea {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
    basePrompt: string;
    benchmarks: {
        maturity_1: string;
        maturity_2: string;
        maturity_3: string;
        maturity_4: string;
        maturity_5: string;
    };
}

export interface BroadArea {
    id: string;
    name: string;
    icon: string;
    description: string;
    order: number;
    subAreas: SubArea[];
}

export interface DomainConfig {
    id: string;
    name: string;
    description: string;
    persona: string;
    broadAreas: BroadArea[];
}
```

Keep `DomainArea` as a type alias for backward compatibility during migration:
```typescript
/** @deprecated Use SubArea instead */
export type DomainArea = SubArea;
export type DomainInterviewCategory = { id: string; name: string; order: number; description: string };
```

- [ ] **Step 2: Update existing functions to use new hierarchy**

Replace `getDomainAreas()` (line 123-126) with:

```typescript
export function getBroadAreas(): BroadArea[] {
    const config = getActiveDomainConfig();
    return [...config.broadAreas].sort((a, b) => a.order - b.order);
}

export function getBroadArea(broadAreaId: string): BroadArea | undefined {
    const config = getActiveDomainConfig();
    return config.broadAreas.find(ba => ba.id === broadAreaId);
}

export function getSubAreasForBroadArea(broadAreaId: string): SubArea[] {
    const broadArea = getBroadArea(broadAreaId);
    return broadArea ? [...broadArea.subAreas].sort((a, b) => a.order - b.order) : [];
}

export function getAllSubAreas(): SubArea[] {
    const config = getActiveDomainConfig();
    return config.broadAreas.flatMap(ba => ba.subAreas).sort((a, b) => a.order - b.order);
}

export function getSubArea(subAreaId: string): SubArea | undefined {
    const config = getActiveDomainConfig();
    for (const ba of config.broadAreas) {
        const sub = ba.subAreas.find(s => s.id === subAreaId);
        if (sub) return sub;
    }
    return undefined;
}

export function getBroadAreaForSubArea(subAreaId: string): BroadArea | undefined {
    const config = getActiveDomainConfig();
    return config.broadAreas.find(ba => ba.subAreas.some(s => s.id === subAreaId));
}
```

- [ ] **Step 3: Keep backward-compatible wrappers**

Keep `getDomainAreas`, `getDomainArea`, `getAreaBasePrompt`, `getAreaBenchmarks` working by delegating to the new functions:

```typescript
/** @deprecated Use getAllSubAreas() */
export function getDomainAreas(): SubArea[] {
    return getAllSubAreas();
}

/** @deprecated Use getSubArea() */
export function getDomainArea(areaId: string): SubArea | undefined {
    return getSubArea(areaId);
}

/** @deprecated Use getSubArea()?.basePrompt */
export function getAreaBasePrompt(areaId: string): string {
    return getSubArea(areaId)?.basePrompt || '';
}

/** @deprecated Use getSubArea()?.benchmarks */
export function getAreaBenchmarks(areaId: string): SubArea['benchmarks'] | null {
    return getSubArea(areaId)?.benchmarks || null;
}
```

- [ ] **Step 4: Remove interview category functions**

Remove `getInterviewCategories()`, `getInterviewCategoryMap()`, `getInterviewCategory()`, `isValidInterviewCategory()` (lines 201-225). These are replaced by broad areas.

Check who imports them first:
- `backend/src/mastra/interviewAgent.ts` imports `getInterviewCategory` — will be updated in Task 5.
- `backend/src/routes/interview.ts` uses `getInterviewCategories` — will be updated in Task 5.

For now, keep them but mark as deprecated so the build doesn't break mid-task:

```typescript
/** @deprecated Broad areas replace interview categories */
export function getInterviewCategories(): DomainInterviewCategory[] {
    // Return broad areas mapped to category shape for backward compat
    return getBroadAreas().map(ba => ({ id: ba.id, name: ba.name, order: ba.order, description: ba.description }));
}

/** @deprecated */
export function getInterviewCategory(id: string): DomainInterviewCategory | undefined {
    const ba = getBroadArea(id);
    return ba ? { id: ba.id, name: ba.name, order: ba.order, description: ba.description } : undefined;
}

/** @deprecated */
export function isValidInterviewCategory(id: string): boolean {
    return !!getBroadArea(id);
}
```

- [ ] **Step 5: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/domainService.ts
git commit -m "refactor: update domainService with broad area hierarchy types and methods"
```

---

## Task 3: Update Interview Service with Broad Area Support

**Files:**
- Modify: `backend/src/services/interviewService.ts`

- [ ] **Step 1: Update types for broad area support**

Add coverage tracking types after existing interfaces (around line 72):

```typescript
export interface SubAreaCoverage {
    subAreaId: string;
    name: string;
    questionsAnswered: number;
    aiConfident: boolean;
    status: 'not_started' | 'in_progress' | 'covered';
}

export interface BroadAreaProgress {
    broadAreaId: string;
    name: string;
    order: number;
    subAreas: SubAreaCoverage[];
    overallStatus: 'not_started' | 'in_progress' | 'covered';
}
```

Update the `InterviewSession` interface (lines 48-63) — add new fields:

```typescript
export interface InterviewSession {
    sessionType: string;
    sessionId: string;
    userId: string;
    domainId?: string;
    language: string;
    createdAt: string;
    updatedAt: string;
    status: 'in_progress' | 'completed';
    selectedBroadAreas: string[];           // NEW: e.g., ["procure_to_pay"]
    currentSubArea: string | null;          // RENAMED from currentCategory
    currentCategory?: string;              // Keep for backward compat during migration
    depth: InterviewDepth;
    responses: Record<string, InterviewAnswer[]>;
    coverage: Record<string, {             // NEW: sub-area coverage tracking
        questionsAnswered: number;
        aiConfident: boolean;
        status: 'not_started' | 'in_progress' | 'covered';
    }>;
    conversationHistory: Array<{ role: string; content: string }>;
    conversationContext?: {                 // NEW: from readiness system
        identifiedGaps: string[];
        transformationOpportunities: string[];
        painPoints: string[];
    };
    migratedFrom?: 'readiness';            // NEW: migration marker
}
```

- [ ] **Step 2: Update createInterviewSession**

Update `createInterviewSession` (lines 76-103) to accept broad area selection:

```typescript
export async function createInterviewSession(
    userId: string,
    depth: InterviewDepth = 'standard',
    language: LanguageCode = 'en',
    selectedBroadAreas?: string[]
): Promise<InterviewSession> {
    const sessionId = uuidv4();
    const domainConfig = getActiveDomainConfig();

    // Resolve sub-areas from selected broad areas
    const broadAreas = selectedBroadAreas || getBroadAreas().map(ba => ba.id);
    const allSubAreas: SubArea[] = [];
    for (const baId of broadAreas) {
        const subs = getSubAreasForBroadArea(baId);
        allSubAreas.push(...subs);
    }

    // Initialize coverage for each sub-area
    const coverage: InterviewSession['coverage'] = {};
    for (const sub of allSubAreas) {
        coverage[sub.id] = { questionsAnswered: 0, aiConfident: false, status: 'not_started' };
    }

    const session: InterviewSession = {
        sessionType: 'interview_session',
        sessionId,
        userId,
        domainId: domainConfig.id,
        language,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'in_progress',
        selectedBroadAreas: broadAreas,
        currentSubArea: allSubAreas.length > 0 ? allSubAreas[0].id : null,
        depth,
        responses: {},
        coverage,
        conversationHistory: [],
        conversationContext: { identifiedGaps: [], transformationOpportunities: [], painPoints: [] },
    };

    await opensearchClient.index({
        index: INDICES.CONVERSATIONS,
        id: `interview_${sessionId}`,
        body: session,
        refresh: 'wait_for',
    });

    return session;
}
```

Add imports at the top of the file:

```typescript
import { getBroadAreas, getSubAreasForBroadArea, getSubArea, getBroadAreaForSubArea, getBroadArea, SubArea } from './domainService';
```

- [ ] **Step 3: Update getInterviewProgress to return BroadAreaProgress**

Replace `getInterviewProgress` (lines 130-156) with:

```typescript
export function getInterviewProgress(session: InterviewSession): BroadAreaProgress[] {
    return (session.selectedBroadAreas || []).map(baId => {
        const broadArea = getBroadArea(baId);
        if (!broadArea) return null;

        const subAreas: SubAreaCoverage[] = broadArea.subAreas.map(sub => {
            const cov = session.coverage?.[sub.id];
            return {
                subAreaId: sub.id,
                name: sub.name,
                questionsAnswered: cov?.questionsAnswered || (session.responses[sub.id]?.length || 0),
                aiConfident: cov?.aiConfident || false,
                status: cov?.status || (session.responses[sub.id]?.length ? 'in_progress' : 'not_started'),
            };
        });

        const allCovered = subAreas.every(s => s.status === 'covered');
        const anyCovered = subAreas.some(s => s.status !== 'not_started');

        return {
            broadAreaId: baId,
            name: broadArea.name,
            order: broadArea.order,
            subAreas,
            overallStatus: allCovered ? 'covered' : anyCovered ? 'in_progress' : 'not_started',
        };
    }).filter(Boolean) as BroadAreaProgress[];
}
```

- [ ] **Step 4: Update submitInterviewAnswer with coverage tracking**

Update `submitInterviewAnswer` (lines 306-339) to track coverage:

```typescript
export async function submitInterviewAnswer(
    session: InterviewSession,
    answer: {
        questionId: string;
        question: string;
        answer: string | string[] | number;
        type: QuestionType;
        mode: QuestionMode;
        subAreaId: string;          // Changed from categoryId
        aiConfident?: boolean;      // NEW: AI signals coverage
    }
): Promise<void> {
    const subAreaId = answer.subAreaId;

    if (!session.responses[subAreaId]) {
        session.responses[subAreaId] = [];
    }

    session.responses[subAreaId].push({
        questionId: answer.questionId,
        question: answer.question,
        answer: answer.answer,
        type: answer.type,
        mode: answer.mode,
        timestamp: new Date().toISOString(),
    });

    // Update coverage
    if (!session.coverage) session.coverage = {};
    if (!session.coverage[subAreaId]) {
        session.coverage[subAreaId] = { questionsAnswered: 0, aiConfident: false, status: 'not_started' };
    }
    session.coverage[subAreaId].questionsAnswered += 1;
    if (answer.aiConfident) {
        session.coverage[subAreaId].aiConfident = true;
    }

    // Determine coverage status
    const cov = session.coverage[subAreaId];
    if (cov.questionsAnswered >= 2 && cov.aiConfident) {
        cov.status = 'covered';
    } else if (cov.questionsAnswered > 0) {
        cov.status = 'in_progress';
    }

    session.updatedAt = new Date().toISOString();
    await updateInterviewSession(session);
}
```

- [ ] **Step 5: Add sub-area transition logic**

Add a new function after `submitInterviewAnswer`:

```typescript
export function determineNextSubArea(session: InterviewSession): string | null {
    // Find sub-areas that haven't reached coverage yet
    const uncovered: { subAreaId: string; questionsAnswered: number }[] = [];

    for (const baId of session.selectedBroadAreas || []) {
        const subs = getSubAreasForBroadArea(baId);
        for (const sub of subs) {
            const cov = session.coverage?.[sub.id];
            if (!cov || cov.status !== 'covered') {
                uncovered.push({
                    subAreaId: sub.id,
                    questionsAnswered: cov?.questionsAnswered || 0,
                });
            }
        }
    }

    if (uncovered.length === 0) return null;

    // Prefer the current sub-area if it's not covered yet and has fewer than 2 questions
    const current = session.currentSubArea;
    if (current) {
        const currentCov = uncovered.find(u => u.subAreaId === current);
        if (currentCov && currentCov.questionsAnswered < 2) {
            return current;
        }
    }

    // Otherwise pick the sub-area with fewest questions (ensure coverage breadth)
    uncovered.sort((a, b) => a.questionsAnswered - b.questionsAnswered);
    return uncovered[0].subAreaId;
}
```

- [ ] **Step 6: Update generateNextInterviewQuestion for sub-area context**

Update `generateNextInterviewQuestion` (lines 186-302) to use sub-areas and include broad area context in the system prompt. The key changes:

Replace references to `categoryId` with `subAreaId`. Update the system prompt construction to include:
- The broad area name and description
- All sub-areas within the selected broad areas
- Coverage status for each sub-area
- Instruction for AI to determine which sub-area to ask about next
- Instruction for AI to signal `aiConfident: true` when a sub-area has enough coverage

The function should return an additional `aiConfident` field and `subAreaId` field in the response so the caller knows which sub-area was addressed:

```typescript
export async function generateNextInterviewQuestion(
    session: InterviewSession,
    subAreaId?: string,
    modelId?: string
): Promise<GeneratedInterviewQuestion & { aiConfident?: boolean }> {
    const targetSubArea = subAreaId || determineNextSubArea(session) || session.currentSubArea;
    if (!targetSubArea) {
        throw new Error('No sub-areas available for questions');
    }

    const subArea = getSubArea(targetSubArea);
    const broadArea = getBroadAreaForSubArea(targetSubArea);
    if (!subArea || !broadArea) {
        throw new Error(`Sub-area ${targetSubArea} not found`);
    }

    // Build coverage summary for AI context
    const coverageSummary = (session.selectedBroadAreas || []).map(baId => {
        const ba = getBroadArea(baId);
        if (!ba) return '';
        const subs = ba.subAreas.map(s => {
            const cov = session.coverage?.[s.id];
            return `  - ${s.name}: ${cov?.status || 'not_started'} (${cov?.questionsAnswered || 0} questions)`;
        }).join('\n');
        return `${ba.name}:\n${subs}`;
    }).join('\n\n');

    // Build previous Q&A context for this sub-area
    const previousAnswers = (session.responses[targetSubArea] || [])
        .map(a => `Q: ${a.question}\nA: ${typeof a.answer === 'object' ? JSON.stringify(a.answer) : a.answer}`)
        .join('\n\n');

    const questionsAnswered = session.coverage?.[targetSubArea]?.questionsAnswered || 0;
    const threshold = DEPTH_THRESHOLDS[session.depth] || 5;
    const mode = determineQuestionMode(questionsAnswered, undefined, questionsAnswered > 0, threshold);

    const domainConfig = getActiveDomainConfig();
    const persona = domainConfig.persona;

    const systemPrompt = `${persona}

You are conducting an interview about "${broadArea.name}" — specifically the sub-area "${subArea.name}": ${subArea.description}

${subArea.basePrompt}

COVERAGE STATUS:
${coverageSummary}

PREVIOUS Q&A FOR ${subArea.name}:
${previousAnswers || 'No questions asked yet for this sub-area.'}

INSTRUCTIONS:
- Generate a ${mode} question for the "${subArea.name}" sub-area
- The question should flow naturally from previous answers
- If you believe you have sufficient information about this sub-area (clear picture of current state, pain points, and maturity level), set "subAreaCovered" to true in your response
- Focus on understanding the current process, tools, pain points, and maturity level
- Do NOT repeat questions already asked

Respond with ONLY valid JSON:
{
    "question": "your question text",
    "type": "single_choice|multi_choice|scale|open_ended|yes_no",
    "options": ["option1", "option2"] or null,
    "mode": "${mode}",
    "subAreaId": "${targetSubArea}",
    "subAreaCovered": true/false,
    "followUpTopics": ["topic1"]
}`;

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: 'Generate the next interview question.' }];

    const response = await generateCompletion(messages, { modelId });
    const content = response.content || response;

    try {
        const jsonMatch = (typeof content === 'string' ? content : '').match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        const parsed = JSON.parse(jsonMatch[0]);

        // Update session's current sub-area
        session.currentSubArea = targetSubArea;

        return {
            id: uuidv4(),
            question: parsed.question,
            type: parsed.type || 'open_ended',
            options: parsed.options || undefined,
            mode: parsed.mode || mode,
            categoryId: targetSubArea,  // Keep categoryId for backward compat
            followUpTopics: parsed.followUpTopics,
            aiConfident: parsed.subAreaCovered === true,
        };
    } catch {
        return {
            id: uuidv4(),
            question: `Tell me about your current ${subArea.name} process and any challenges you face.`,
            type: 'open_ended',
            mode: 'foundation',
            categoryId: targetSubArea,
            aiConfident: false,
        };
    }
}
```

- [ ] **Step 7: Update switchCategory to work with sub-areas**

Update `switchCategory` (lines 433-449):

```typescript
export async function switchCategory(session: InterviewSession, subAreaId: string): Promise<string> {
    const subArea = getSubArea(subAreaId);
    if (!subArea) throw new Error(`Sub-area ${subAreaId} not found`);

    session.currentSubArea = subAreaId;
    session.updatedAt = new Date().toISOString();
    await updateInterviewSession(session);

    return `Switched to ${subArea.name}. Let's explore this area.`;
}
```

- [ ] **Step 8: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

Expected: No type errors (there may be some from routes — those are fixed in Task 5).

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/interviewService.ts
git commit -m "feat: add broad area selection and sub-area coverage tracking to interview service"
```

---

## Task 4: Update Question Engine

**Files:**
- Modify: `backend/src/services/questionEngine.ts`

- [ ] **Step 1: Update imports**

Replace readinessSessionService imports (line 1-3) with domainService imports:

```typescript
import { getSubArea, getBroadAreaForSubArea, getBroadArea, SubArea, getActiveDomainConfig } from './domainService';
import { getLanguageInstructions } from './languageService';
import { searchKnowledgeBase } from './knowledgeBase';
import { generateCompletion, LLMMessage } from './llmService';
import { v4 as uuidv4 } from 'uuid';
```

- [ ] **Step 2: Update generateNextQuestion to use sub-areas**

The function at lines 57-153 currently takes a `ReadinessSession`. Since this is only used by the readiness routes (which we're retiring), we can update it to work with the interview session or simply leave it as-is since it will be unused after migration.

Mark as deprecated:

```typescript
/** @deprecated Use interviewService.generateNextInterviewQuestion instead */
export async function generateNextQuestion(
    sessionId: string,
    areaId?: string,
    modelId?: string
): Promise<any> {
    // ... existing code unchanged for now
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/questionEngine.ts
git commit -m "refactor: update questionEngine imports to use domainService sub-areas"
```

---

## Task 5: Update Interview Routes

**Files:**
- Modify: `backend/src/routes/interview.ts`

- [ ] **Step 1: Update imports**

Add broad area imports:

```typescript
import { getBroadAreas, getSubAreasForBroadArea, getBroadArea, getActiveDomainConfig } from '../services/domainService';
```

- [ ] **Step 2: Update POST /start to accept broad areas**

Update the `/start` endpoint (lines 38-92):

```typescript
router.post('/start', async (req, res) => {
    try {
        const userId = (req as any).user?.userId || req.body.userId;
        const depth = req.body.depth || 'standard';
        const language = req.body.language;
        const selectedBroadAreas = req.body.selectedBroadAreas;  // NEW

        await ensureGpuWarm();

        const session = await createInterviewSession(userId, depth, language, selectedBroadAreas);
        const progress = getInterviewProgress(session);

        const question = await generateNextInterviewQuestion(session);

        const message = getInterviewStartMessage();

        res.json({
            sessionId: session.sessionId,
            message,
            question,
            progress,
            currentSubArea: session.currentSubArea,
            selectedBroadAreas: session.selectedBroadAreas,
        });
    } catch (err: any) {
        if (err instanceof LLMWarmingUpError) {
            return res.status(503).json({ error: err.message, code: 'LLM_WARMING_UP', retryAfter: 30 });
        }
        console.error('Failed to start interview:', err);
        res.status(500).json({ error: 'Failed to start interview session' });
    }
});
```

- [ ] **Step 3: Update POST /:sessionId/answer**

Update the `/answer` endpoint (lines 127-191) to pass `subAreaId` and `aiConfident`:

```typescript
router.post('/:sessionId/answer', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { questionId, question, answer, type, mode, categoryId, subAreaId, model, aiConfident } = req.body;

        const session = await getInterviewSession(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const targetSubArea = subAreaId || categoryId;  // Support both field names

        await submitInterviewAnswer(session, {
            questionId,
            question,
            answer,
            type: type || 'open_ended',
            mode: mode || 'discovery',
            subAreaId: targetSubArea,
            aiConfident: aiConfident || false,
        });

        // Check if all sub-areas are covered
        const progress = getInterviewProgress(session);
        const allCovered = progress.every(ba => ba.overallStatus === 'covered');

        if (allCovered) {
            session.status = 'completed';
            await updateInterviewSession(session);
            return res.json({ progress, currentSubArea: session.currentSubArea, completed: true });
        }

        // Generate next question
        const nextQuestion = await generateNextInterviewQuestion(session, undefined, model);
        const updatedProgress = getInterviewProgress(session);

        res.json({
            nextQuestion,
            progress: updatedProgress,
            currentSubArea: session.currentSubArea,
        });
    } catch (err: any) {
        if (err instanceof LLMWarmingUpError) {
            return res.status(503).json({ error: err.message, code: 'LLM_WARMING_UP', retryAfter: 30 });
        }
        console.error('Failed to submit answer:', err);
        res.status(500).json({ error: 'Failed to submit answer' });
    }
});
```

- [ ] **Step 4: Update GET /categories/list to return broad areas**

Replace the `/categories/list` endpoint (lines 363-377):

```typescript
router.get('/categories/list', async (_req, res) => {
    try {
        const broadAreas = getBroadAreas().map(ba => ({
            id: ba.id,
            name: ba.name,
            description: ba.description,
            order: ba.order,
            icon: ba.icon,
            subAreas: ba.subAreas.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
            })),
        }));
        res.json({ broadAreas });
    } catch (err) {
        console.error('Failed to get broad areas:', err);
        res.status(500).json({ error: 'Failed to load broad areas' });
    }
});
```

- [ ] **Step 5: Add config endpoints migrated from readiness routes**

Add these endpoints before the export (these were on readiness routes and are needed by the frontend):

```typescript
// Domain config endpoints (migrated from readiness routes)
router.get('/config/languages', async (_req, res) => {
    try {
        const { getSupportedLanguages } = await import('../services/languageService');
        res.json({ languages: getSupportedLanguages() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

router.get('/config/domains', async (_req, res) => {
    try {
        const { getAvailableDomains } = await import('../services/domainService');
        res.json({ domains: getAvailableDomains() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load domains' });
    }
});

router.get('/config/domain', async (_req, res) => {
    try {
        const { getActiveDomainConfig, getBroadAreas } = await import('../services/domainService');
        const config = getActiveDomainConfig();
        res.json({
            domain: { id: config.id, name: config.name, description: config.description },
            broadAreas: getBroadAreas(),
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load domain config' });
    }
});

router.put('/config/domain', async (req, res) => {
    try {
        const { setActiveDomain, getActiveDomainConfig } = await import('../services/domainService');
        const { domainId } = req.body;
        setActiveDomain(domainId);
        const config = getActiveDomainConfig();
        res.json({ success: true, domain: { id: config.id, name: config.name, description: config.description } });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});
```

- [ ] **Step 6: Update remaining endpoints**

Update `GET /:sessionId/next-question` to use `subAreaId` query param:
- Change `req.query.categoryId` to `req.query.subAreaId || req.query.categoryId`

Update `POST /:sessionId/category` to call `switchCategory` with subAreaId:
- Change body field from `categoryId` to accept both `subAreaId || categoryId`

Update `GET /:sessionId/progress` to return broad area progress.

Update `GET /:sessionId` to include coverage and selectedBroadAreas.

- [ ] **Step 7: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/interview.ts
git commit -m "feat: update interview routes with broad area endpoints and sub-area support"
```

---

## Task 6: Update Dependent Services

**Files:**
- Modify: `backend/src/services/reportService.ts`
- Modify: `backend/src/services/documentAutoFill.ts`
- Modify: `backend/src/services/metricsService.ts`

- [ ] **Step 1: Update reportService.ts imports**

At the top of `reportService.ts` (lines 1-5), replace:
```typescript
import {
    getReadinessSession,
    AreaId,
    ReadinessSession
} from './readinessSessionService';
```
With:
```typescript
import { getInterviewSession, InterviewSession } from './interviewService';
```

Update `getDomainArea` import to `getSubArea`:
```typescript
import { getSubArea, getBroadAreaForSubArea } from './domainService';
```

Then update all references:
- `getReadinessSession` → `getInterviewSession`
- `getDomainArea` → `getSubArea`
- `ReadinessSession` → `InterviewSession`
- `AreaId` → `string`

In the `ReadinessScore` interface, keep `areaId` as `string`.

- [ ] **Step 2: Update documentAutoFill.ts**

Replace any imports from `readinessSessionService` with equivalent imports from `domainService` and `interviewService`. Specifically:
- `AreaId` → `string`
- `getDomainArea`/`getDomainAreas` → `getSubArea`/`getAllSubAreas`

- [ ] **Step 3: Update metricsService.ts**

Replace `getDomainAreas` import with `getAllSubAreas` from domainService. Update any calls accordingly.

- [ ] **Step 4: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reportService.ts backend/src/services/documentAutoFill.ts backend/src/services/metricsService.ts
git commit -m "refactor: update dependent services to use new domainService and interviewService"
```

---

## Task 7: Retire Readiness System

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/readinessRoutes.ts` (mark deprecated)
- Modify: `backend/src/services/readinessSessionService.ts` (mark deprecated)

- [ ] **Step 1: Remove readiness route registration from index.ts**

In `backend/src/index.ts`, remove line 9:
```typescript
import readinessRoutes from './routes/readinessRoutes';
```

And remove line 98:
```typescript
app.use('/api/readiness', authenticateToken, auditMiddleware, readinessRoutes);
```

- [ ] **Step 2: Add deprecation comments to readinessRoutes.ts**

Add at the top of the file:
```typescript
/**
 * @deprecated This file is no longer registered in the app.
 * All functionality has been migrated to interview routes.
 * Kept for reference during migration period — safe to delete after migration is verified.
 */
```

- [ ] **Step 3: Add deprecation comments to readinessSessionService.ts**

Add at the top of the file:
```typescript
/**
 * @deprecated All session management has been migrated to interviewService.ts.
 * Kept for reference during migration period — safe to delete after migration is verified.
 */
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.ts backend/src/routes/readinessRoutes.ts backend/src/services/readinessSessionService.ts
git commit -m "refactor: retire readiness routes and service, migrate to interview system"
```

---

## Task 8: Update Frontend API Service

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add broad area types**

After the existing type definitions (around line 93), add:

```typescript
export interface BroadAreaInfo {
    id: string;
    name: string;
    description: string;
    order: number;
    icon: string;
    subAreas: { id: string; name: string; description: string }[];
}

export interface SubAreaCoverage {
    subAreaId: string;
    name: string;
    questionsAnswered: number;
    aiConfident: boolean;
    status: 'not_started' | 'in_progress' | 'covered';
}

export interface BroadAreaProgressInfo {
    broadAreaId: string;
    name: string;
    order: number;
    subAreas: SubAreaCoverage[];
    overallStatus: 'not_started' | 'in_progress' | 'covered';
}
```

- [ ] **Step 2: Replace readiness endpoints with interview-based equivalents**

Replace `fetchAreas()` (lines 103-105):
```typescript
export async function fetchBroadAreas(): Promise<{ broadAreas: BroadAreaInfo[] }> {
    return request('/api/interview/categories/list');
}
```

Replace `startReadinessSession` (lines 107-112):
```typescript
export async function startInterviewSession(userId: string, selectedBroadAreas: string[], model?: string): Promise<any> {
    return request('/api/interview/start', {
        method: 'POST',
        body: JSON.stringify({ userId, selectedBroadAreas, model }),
    });
}
```

Replace `setSessionAreas` (lines 114-119) — no longer needed, broad areas are set at session creation.

Replace `getSession` (lines 121-125):
```typescript
export async function getInterviewSessionData(sessionId: string): Promise<any> {
    return request(`/api/interview/${sessionId}`);
}
```

Replace `getNextQuestion` (lines 127-132):
```typescript
export async function getNextInterviewQuestion(sessionId: string, model?: string): Promise<any> {
    const params = model ? `?model=${encodeURIComponent(model)}` : '';
    return request(`/api/interview/${sessionId}/next-question${params}`);
}
```

Replace `submitAnswer` (lines 134-150):
```typescript
export async function submitInterviewAnswer(sessionId: string, payload: {
    questionId: string;
    question: string;
    answer: string | string[] | number;
    type: string;
    mode?: string;
    subAreaId: string;
    aiConfident?: boolean;
    model?: string;
}): Promise<any> {
    return request(`/api/interview/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
```

Replace `switchArea` (lines 152-157):
```typescript
export async function switchSubArea(sessionId: string, subAreaId: string): Promise<any> {
    return request(`/api/interview/${sessionId}/category`, {
        method: 'POST',
        body: JSON.stringify({ subAreaId }),
    });
}
```

Remove `getSessionProgress` (lines 159-163) — use `getInterviewProgress` instead:
```typescript
export async function getInterviewProgressData(sessionId: string): Promise<any> {
    return request(`/api/interview/${sessionId}/progress`);
}
```

- [ ] **Step 3: Update config endpoints to use interview routes**

Replace `fetchLanguages` (line 241-243):
```typescript
export async function fetchLanguages(): Promise<{ languages: Language[] }> {
    return request('/api/interview/config/languages');
}
```

Replace `fetchDomains` (line 245-247):
```typescript
export async function fetchDomains(): Promise<{ domains: Domain[] }> {
    return request('/api/interview/config/domains');
}
```

Replace `getActiveDomain` (line 249-251):
```typescript
export async function getActiveDomain(): Promise<{ domain: Domain; broadAreas: BroadAreaInfo[] }> {
    return request('/api/interview/config/domain');
}
```

Replace `setActiveDomain` (line 253-258):
```typescript
export async function setActiveDomain(domainId: string): Promise<{ success: boolean; domain: Domain }> {
    return request('/api/interview/config/domain', {
        method: 'PUT',
        body: JSON.stringify({ domainId }),
    });
}
```

- [ ] **Step 4: Keep deprecated wrappers for any other consumers**

Keep the old function names as wrappers with `@deprecated` JSDoc comments so other pages that may call them don't break immediately:

```typescript
/** @deprecated Use fetchBroadAreas */
export const fetchAreas = fetchBroadAreas;
/** @deprecated Use startInterviewSession */
export async function startReadinessSession(userId: string, model?: string) {
    return startInterviewSession(userId, [], model);
}
```

- [ ] **Step 5: Verify frontend build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: update frontend API service with broad area interview endpoints"
```

---

## Task 9: Update ProcessAnalysis.tsx — Broad Area Selection

**Files:**
- Modify: `frontend/src/pages/ProcessAnalysis.tsx`

- [ ] **Step 1: Update imports and types**

Replace readiness-specific imports with new API functions:

```typescript
import {
    fetchBroadAreas,
    startInterviewSession,
    getInterviewSessionData,
    getNextInterviewQuestion,
    submitInterviewAnswer,
    switchSubArea,
    fetchDashboardStats,
    fetchRiskSummary,
    fetchSessions,
    subscribeToDashboardStream,
    BroadAreaInfo,
    BroadAreaProgressInfo,
} from '../services/api';
```

Update the `Step` type (line 25):
```typescript
type Step = 'overview' | 'select_broad_areas' | 'interview' | 'complete';
```

- [ ] **Step 2: Update state variables**

Replace area-related state (lines 32-50):

```typescript
// Overview state
const [sessions, setSessions] = useState<SessionSummary[]>([]);
const [broadAreas, setBroadAreas] = useState<BroadAreaInfo[]>([]);
const [risks, setRisks] = useState<RiskItem[]>([]);
const [totalRisks, setTotalRisks] = useState(0);
const [loading, setLoading] = useState(true);
const [metrics, setMetrics] = useState<DashboardStats | null>(null);
const esRef = useRef<EventSource | null>(null);

// Interview state
const [step, setStep] = useState<Step>('overview');
const [selectedBroadAreas, setSelectedBroadAreas] = useState<string[]>([]);
const [sessionId, setSessionId] = useState<string | null>(null);
const [progress, setProgress] = useState<BroadAreaProgressInfo[]>([]);
const [currentQuestion, setCurrentQuestion] = useState<GeneratedQuestion | null>(null);
const [answer, setAnswer] = useState<string | string[] | number>('');
const [questionLoading, setQuestionLoading] = useState(false);
const [submitLoading, setSubmitLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 3: Update useEffect to fetch broad areas**

Update the initialization (lines 52-71):

```typescript
useEffect(() => {
    const init = async () => {
        try {
            const [sessRes, areaRes, riskRes, statsRes] = await Promise.all([
                fetchSessions(),
                fetchBroadAreas(),
                fetchRiskSummary(),
                fetchDashboardStats(),
            ]);
            setSessions(sessRes.sessions || []);
            setBroadAreas(areaRes.broadAreas || []);
            setRisks(riskRes.risks || []);
            setTotalRisks(riskRes.totalRisks || 0);
            setMetrics(statsRes);
        } catch (e) {
            console.error('Init error:', e);
        } finally {
            setLoading(false);
        }
    };
    init();

    const cleanup = subscribeToDashboardStream(
        (stats) => setMetrics(stats),
        (err) => console.error('SSE error:', err)
    );
    esRef.current = cleanup as any;
    return () => { if (esRef.current) (esRef.current as any)(); };
}, []);
```

- [ ] **Step 4: Update handleStartNew**

```typescript
const handleStartNew = () => {
    setStep('select_broad_areas');
    setSelectedBroadAreas([]);
    setError(null);
};
```

- [ ] **Step 5: Update handleBeginInterview**

```typescript
const handleBeginInterview = async () => {
    if (selectedBroadAreas.length === 0) {
        setError('Please select at least one area');
        return;
    }
    try {
        setQuestionLoading(true);
        setError(null);
        const userId = localStorage.getItem('userId') || 'anonymous';
        const res = await startInterviewSession(userId, selectedBroadAreas);
        setSessionId(res.sessionId);
        setProgress(res.progress || []);
        setCurrentQuestion(res.question);
        setStep('interview');
    } catch (err: any) {
        setError(err.message || 'Failed to start interview');
    } finally {
        setQuestionLoading(false);
    }
};
```

- [ ] **Step 6: Update handleSubmitAnswer**

```typescript
const handleSubmitAnswer = async () => {
    if (!sessionId || !currentQuestion) return;
    try {
        setSubmitLoading(true);
        setError(null);

        const res = await submitInterviewAnswer(sessionId, {
            questionId: currentQuestion.id,
            question: currentQuestion.text || (currentQuestion as any).question,
            answer,
            type: currentQuestion.type || 'open_ended',
            mode: currentQuestion.mode,
            subAreaId: currentQuestion.areaId || currentQuestion.categoryId || '',
            aiConfident: (currentQuestion as any).aiConfident,
        });

        setProgress(res.progress || []);
        setAnswer('');

        if (res.completed) {
            setStep('complete');
        } else {
            setCurrentQuestion(res.nextQuestion);
        }
    } catch (err: any) {
        setError(err.message || 'Failed to submit answer');
    } finally {
        setSubmitLoading(false);
    }
};
```

- [ ] **Step 7: Update select_broad_areas JSX**

Replace the `select_areas` step JSX (lines 193-236) with:

```tsx
{step === 'select_broad_areas' && (
    <div className="process-analysis">
        <div className="page-header">
            <h2 className="page-header__title">Select Assessment Areas</h2>
            <p className="page-header__subtitle">Choose the broad process areas you want to assess</p>
        </div>
        {error && <div className="pa-error">{error}</div>}
        <div className="pa-broad-area-grid">
            {broadAreas.map((ba) => (
                <div
                    key={ba.id}
                    className={`pa-broad-area-card ${selectedBroadAreas.includes(ba.id) ? 'pa-broad-area-card--selected' : ''}`}
                    onClick={() => setSelectedBroadAreas(prev =>
                        prev.includes(ba.id) ? prev.filter(id => id !== ba.id) : [...prev, ba.id]
                    )}
                >
                    <div className="pa-broad-area-card__header">
                        <input
                            type="checkbox"
                            checked={selectedBroadAreas.includes(ba.id)}
                            onChange={() => {}}
                        />
                        <strong>{ba.name}</strong>
                    </div>
                    <p className="pa-broad-area-card__desc">{ba.description}</p>
                    <div className="pa-broad-area-card__subs">
                        {ba.subAreas.map(s => (
                            <span key={s.id} className="pa-sub-area-tag">{s.name}</span>
                        ))}
                    </div>
                </div>
            ))}
        </div>
        <div className="pa-actions">
            <button className="pa-btn pa-btn--secondary" onClick={() => setStep('overview')}>Back</button>
            <button
                className="pa-btn pa-btn--primary"
                onClick={handleBeginInterview}
                disabled={selectedBroadAreas.length === 0 || questionLoading}
            >
                Begin Assessment
            </button>
        </div>
    </div>
)}
```

- [ ] **Step 8: Update interview sidebar JSX**

Replace the progress sidebar (lines 254-267) with a hierarchical sidebar:

```tsx
<div className="pa-progress-sidebar">
    <h4>Coverage</h4>
    {progress.map((ba) => (
        <div key={ba.broadAreaId} className="pa-sidebar-broad-area">
            <div className={`pa-sidebar-broad-area__header ${ba.overallStatus === 'covered' ? 'pa-sidebar-broad-area__header--done' : ''}`}>
                <span className={`pa-progress-dot pa-progress-dot--${ba.overallStatus}`} />
                <span className="pa-sidebar-broad-area__name">{ba.name}</span>
            </div>
            <div className="pa-sidebar-sub-areas">
                {ba.subAreas.map((sub) => (
                    <button
                        key={sub.subAreaId}
                        className={`pa-progress-item ${sub.status === 'covered' ? 'pa-progress-item--done' : ''} ${currentQuestion?.areaId === sub.subAreaId ? 'pa-progress-item--active' : ''}`}
                        onClick={() => handleSwitchSubArea(sub.subAreaId)}
                    >
                        <span className={`pa-progress-dot pa-progress-dot--${sub.status}`} />
                        <span>{sub.name}</span>
                        <span className="pa-progress-count">{sub.questionsAnswered}</span>
                    </button>
                ))}
            </div>
        </div>
    ))}
</div>
```

- [ ] **Step 9: Update handleSwitchArea to handleSwitchSubArea**

```typescript
const handleSwitchSubArea = async (subAreaId: string) => {
    if (!sessionId) return;
    try {
        setQuestionLoading(true);
        await switchSubArea(sessionId, subAreaId);
        const qRes = await getNextInterviewQuestion(sessionId);
        setCurrentQuestion(qRes.question);
    } catch (err: any) {
        setError(err.message || 'Failed to switch area');
    } finally {
        setQuestionLoading(false);
    }
};
```

- [ ] **Step 10: Update fetchQuestion helper**

```typescript
const fetchQuestion = async (sid: string) => {
    try {
        setQuestionLoading(true);
        const res = await getNextInterviewQuestion(sid);
        setCurrentQuestion(res.question);
    } catch (err: any) {
        setError(err.message || 'Failed to fetch question');
        setCurrentQuestion(null);
    } finally {
        setQuestionLoading(false);
    }
};
```

- [ ] **Step 11: Verify frontend build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/frontend && npx tsc --noEmit
```

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/ProcessAnalysis.tsx
git commit -m "feat: update ProcessAnalysis with broad area selection and hierarchical sidebar"
```

---

## Task 10: Update ProcessAnalysis.css

**Files:**
- Modify: `frontend/src/pages/ProcessAnalysis.css`

- [ ] **Step 1: Add broad area card styles**

Add after the existing `.pa-area-grid` styles (around line 214):

```css
/* Broad Area Selection */
.pa-broad-area-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
}

.pa-broad-area-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
}

.pa-broad-area-card:hover {
    border-color: var(--border-light);
}

.pa-broad-area-card--selected {
    border-color: var(--primary);
    background: rgba(var(--primary-rgb, 59, 130, 246), 0.06);
}

.pa-broad-area-card__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.pa-broad-area-card__header strong {
    font-size: 1rem;
    color: var(--text);
}

.pa-broad-area-card__header input[type="checkbox"] {
    accent-color: var(--primary);
}

.pa-broad-area-card__desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
}

.pa-broad-area-card__subs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
}

.pa-sub-area-tag {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    background: var(--surface-light);
    border-radius: 9999px;
    color: var(--text-secondary);
}
```

- [ ] **Step 2: Add hierarchical sidebar styles**

Add after existing sidebar styles:

```css
/* Hierarchical Sidebar */
.pa-sidebar-broad-area {
    margin-bottom: 0.75rem;
}

.pa-sidebar-broad-area__header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text);
}

.pa-sidebar-broad-area__header--done {
    color: var(--success);
}

.pa-sidebar-broad-area__name {
    flex: 1;
}

.pa-sidebar-sub-areas {
    padding-left: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}

.pa-sidebar-sub-areas .pa-progress-item {
    font-size: 0.72rem;
    padding: 0.3rem 0.4rem;
}

/* Coverage dot colors */
.pa-progress-dot--not_started {
    background: var(--border-light);
}

.pa-progress-dot--in_progress {
    background: var(--primary);
}

.pa-progress-dot--covered {
    background: var(--success);
}
```

- [ ] **Step 3: Verify frontend build**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProcessAnalysis.css
git commit -m "feat: add broad area card and hierarchical sidebar styles"
```

---

## Task 11: Migration Script for Existing Readiness Sessions

**Files:**
- Create: `backend/src/scripts/migrateReadinessSessions.ts`

- [ ] **Step 1: Write migration script**

```typescript
import { opensearchClient, INDICES } from '../config/database';
import { getBroadAreas, getBroadAreaForSubArea } from '../services/domainService';

interface LegacyReadinessSession {
    sessionId: string;
    userId: string;
    domainId?: string;
    language: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    selectedAreas: string[];
    currentArea: string | null;
    responses: Record<string, any[]>;
    documents?: any[];
    conversationContext?: {
        identifiedGaps: string[];
        transformationOpportunities: string[];
        painPoints: string[];
    };
}

async function migrateReadinessSessions() {
    console.log('Starting readiness → interview migration...');

    // Fetch all readiness sessions
    let hits: any[] = [];
    try {
        const result = await opensearchClient.search({
            index: 'readiness_sessions',
            body: { query: { match_all: {} }, size: 10000 },
        });
        hits = result.body.hits.hits;
    } catch (err: any) {
        if (err.meta?.statusCode === 404) {
            console.log('No readiness_sessions index found. Nothing to migrate.');
            return;
        }
        throw err;
    }

    console.log(`Found ${hits.length} readiness sessions to migrate.`);

    for (const hit of hits) {
        const old: LegacyReadinessSession = hit._source;

        // Map old areas to broad areas
        const broadAreaIds = new Set<string>();
        for (const areaId of old.selectedAreas || []) {
            const ba = getBroadAreaForSubArea(areaId);
            if (ba) broadAreaIds.add(ba.id);
        }

        // Build coverage from old responses
        const coverage: Record<string, any> = {};
        for (const [areaId, answers] of Object.entries(old.responses || {})) {
            const count = Array.isArray(answers) ? answers.length : 0;
            coverage[areaId] = {
                questionsAnswered: count,
                aiConfident: count >= 5,
                status: count === 0 ? 'not_started' : count >= 5 ? 'covered' : 'in_progress',
            };
        }

        const migrated = {
            sessionType: 'interview_session',
            sessionId: old.sessionId,
            userId: old.userId,
            domainId: old.domainId,
            language: old.language || 'en',
            createdAt: old.createdAt,
            updatedAt: old.updatedAt,
            status: old.status,
            selectedBroadAreas: Array.from(broadAreaIds),
            currentSubArea: old.currentArea,
            depth: 'standard',
            responses: old.responses || {},
            coverage,
            conversationHistory: [],
            conversationContext: old.conversationContext || {
                identifiedGaps: [],
                transformationOpportunities: [],
                painPoints: [],
            },
            migratedFrom: 'readiness',
        };

        // Index into conversations index
        await opensearchClient.index({
            index: INDICES.CONVERSATIONS,
            id: `interview_${old.sessionId}`,
            body: migrated,
            refresh: 'wait_for',
        });

        console.log(`Migrated session ${old.sessionId} → interview_${old.sessionId}`);
    }

    console.log(`Migration complete. ${hits.length} sessions migrated.`);
}

migrateReadinessSessions()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
```

- [ ] **Step 2: Add run script to package.json**

Add to `backend/package.json` scripts:

```json
"migrate:readiness": "npx tsx src/scripts/migrateReadinessSessions.ts"
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/migrateReadinessSessions.ts backend/package.json
git commit -m "feat: add readiness-to-interview session migration script"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Build backend**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/backend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Build frontend**

Run:
```bash
cd /home/ankur/workspace/consultantAgent/frontend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Start backend and test broad area endpoint**

Run:
```bash
cd /home/ankur/workspace/consultantAgent && npm run dev &
sleep 5
curl -s http://localhost:3001/api/interview/categories/list | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('Broad areas:', j.broadAreas?.length || 0); j.broadAreas?.forEach(ba => console.log(' -', ba.name, '(' + ba.subAreas?.length + ' sub-areas)'))"
```

Expected: Lists all broad areas for the active domain with their sub-area counts.

- [ ] **Step 4: Verify domain config endpoint**

Run:
```bash
curl -s http://localhost:3001/api/interview/config/domain | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log('Domain:', j.domain?.name); console.log('Broad areas:', j.broadAreas?.length)"
```

Expected: Shows active domain name and broad area count.

- [ ] **Step 5: Manual UI test**

Open the app in a browser:
1. Navigate to Process Analysis page
2. Click "Start New Assessment"
3. Verify broad area cards display (not individual areas)
4. Select one or more broad areas
5. Click "Begin Assessment"
6. Verify sidebar shows broad areas with sub-areas
7. Answer a few questions
8. Verify coverage indicators update

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification of broad area restructure"
```
