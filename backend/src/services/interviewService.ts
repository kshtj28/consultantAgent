import { v4 as uuidv4 } from 'uuid';
import { extractJSON } from '../utils/jsonUtils';
import { opensearchClient, INDICES } from '../config/database';
import { generateCompletion, LLMMessage } from './llmService';
import {
    getInterviewCategories,
    getInterviewCategory,
    isValidInterviewCategory,
    getActiveDomainId,
    getActiveDomainConfig,
    getBroadAreas,
    getSubAreasForBroadArea,
    getSubArea,
    getBroadAreaForSubArea,
    getBroadArea,
    SubArea,
    getDomainPersona,
} from './domainService';
import { getLanguageInstructions, getYesNoOptions, isValidLanguage, LanguageCode } from './languageService';
import { getProjectContext, getEffectiveModel } from './settingsService';
import { searchKnowledgeBase, searchSessionAttachments } from './knowledgeBase';

/** Retrieve top KB chunks for `query` and format them as a prompt block.
 *  Returns '' on any failure so callers can safely concat unconditionally. */
async function buildKnowledgeBaseContext(query: string, limit: number = 4): Promise<string> {
    try {
        const results = await searchKnowledgeBase(query, limit);
        if (!results || results.length === 0) return '';
        const blocks = results.map((r, i) =>
            `[Doc ${i + 1} — ${r.filename}]\n${r.content.trim()}`
        ).join('\n\n---\n\n');
        return `\n## UPLOADED DOCUMENT CONTEXT (from client knowledge base)\nUse the excerpts below to ground your question in what the client has actually documented. Reference specific systems, processes, or numbers from these docs when relevant.\n\n${blocks}\n`;
    } catch (err) {
        console.warn('[KB] retrieval failed:', (err as Error).message);
        return '';
    }
}

/** Retrieve files attached *during this session* (per-answer uploads) and format them
 *  as a higher-priority prompt block. These are evidence the user volunteered
 *  while answering — the LLM should probe what's in them before moving on. */
async function buildSessionAttachmentContext(
    sessionId: string,
    query: string,
    limit: number = 4
): Promise<string> {
    try {
        const results = await searchSessionAttachments(sessionId, query, limit);
        if (!results || results.length === 0) return '';
        const blocks = results.map((r, i) =>
            `[Attachment ${i + 1} — ${r.filename}]\n${r.content.trim()}`
        ).join('\n\n---\n\n');
        return `\n## ATTACHED EVIDENCE FROM THIS SESSION (priority context)\nThe user has uploaded these files while answering. Treat their content as direct evidence about the client. Your next question SHOULD probe specifics from these documents (numbers, system names, owners, dates, edge cases) before moving to a new topic.\n\n${blocks}\n`;
    } catch (err) {
        console.warn('[KB] session attachment retrieval failed:', (err as Error).message);
        return '';
    }
}

// ─── Types ───────────────────────────────────────────────────────────

export type QuestionType = 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
export type QuestionMode = 'foundation' | 'probing' | 'discovery' | 'transformation' | 'benchmark';
export type InterviewDepth = 'quick' | 'standard' | 'deep';
export type CategoryId = string;

export const DEPTH_THRESHOLDS: Record<InterviewDepth, number> = {
    quick: 3,
    standard: 5,
    deep: 8,
};

export interface GeneratedInterviewQuestion {
    id: string;
    question: string;
    text: string;  // Added for frontend compatibility
    type: QuestionType;
    options?: string[];
    mode: QuestionMode;
    categoryId: CategoryId;
    followUpTopics?: string[];
}

export interface AnswerAttachment {
    documentId: string;
    filename: string;
    excerpt: string;
}

export interface InterviewAnswer {
    questionId: string;
    question: string;
    answer: string | string[] | number | boolean;
    type: QuestionType;
    mode: QuestionMode;
    timestamp: Date;
    attachments?: AnswerAttachment[];
}

// ─── Broad Area / Sub-Area Coverage Types ───────────────────────────

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

// ─── Session Types ───────────────────────────────────────────────────

export interface InterviewSession {
    sessionType: string;
    sessionId: string;
    userId: string;
    domainId?: string;
    language: string;
    createdAt: string;
    updatedAt: string;
    status: 'in_progress' | 'completed';
    selectedBroadAreas: string[];
    currentSubArea: string | null;
    currentCategory?: string;              // Keep for backward compat
    depth: InterviewDepth;
    responses: Record<string, InterviewAnswer[]>;
    coverage: Record<string, {
        questionsAnswered: number;
        aiConfident: boolean;
        status: 'not_started' | 'in_progress' | 'covered';
    }>;
    conversationHistory: Array<{ role: string; content: string }>;
    conversationContext?: {
        identifiedGaps: string[];
        transformationOpportunities: string[];
        painPoints: string[];
    };
    migratedFrom?: 'readiness';
}

export interface CategoryProgress {
    categoryId: CategoryId;
    name: string;
    order: number;
    totalQuestions: number;
    answeredQuestions: number;
    status: 'not_started' | 'in_progress' | 'completed';
}

// ─── Session CRUD ────────────────────────────────────────────────────

export async function createInterviewSession(
    userId: string,
    depth: InterviewDepth = 'standard',
    language: LanguageCode = 'en',
    selectedBroadAreas?: string[],
    selectedSubAreas?: string[]
): Promise<InterviewSession> {
    const sessionId = uuidv4();
    const domainConfig = getActiveDomainConfig();

    const broadAreaIds = selectedBroadAreas || getBroadAreas().map(ba => ba.id);
    let allSubAreas: SubArea[] = [];
    for (const baId of broadAreaIds) {
        allSubAreas.push(...getSubAreasForBroadArea(baId));
    }

    // If specific sub-areas were selected, filter to only those
    if (selectedSubAreas && selectedSubAreas.length > 0) {
        const subAreaSet = new Set(selectedSubAreas);
        allSubAreas = allSubAreas.filter(sa => subAreaSet.has(sa.id));
    }

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
        selectedBroadAreas: broadAreaIds,
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

export async function getInterviewSession(sessionId: string): Promise<InterviewSession | null> {
    try {
        const result = await opensearchClient.get({
            index: INDICES.CONVERSATIONS,
            id: `interview_${sessionId}`,
        });
        return result.body._source as InterviewSession;
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return null;
        throw error;
    }
}

export async function updateInterviewSession(session: InterviewSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    await opensearchClient.index({
        index: INDICES.CONVERSATIONS,
        id: `interview_${session.sessionId}`,
        body: session,
        refresh: true,
    });
}

// ─── Progress ────────────────────────────────────────────────────────

export function getInterviewProgress(session: InterviewSession): BroadAreaProgress[] {
    // Determine which sub-areas are in scope (only those with coverage entries)
    const coveredSubAreaIds = new Set(Object.keys(session.coverage || {}));

    return (session.selectedBroadAreas || []).map(baId => {
        const broadArea = getBroadArea(baId);
        if (!broadArea) return null;

        // Only show sub-areas that are in the session's coverage scope
        // If coverage has specific sub-areas, filter to those; otherwise show all
        const relevantSubAreas = coveredSubAreaIds.size > 0
            ? broadArea.subAreas.filter(sub => coveredSubAreaIds.has(sub.id))
            : broadArea.subAreas;

        // Skip broad areas with no relevant sub-areas
        if (relevantSubAreas.length === 0) return null;

        const subAreas: SubAreaCoverage[] = relevantSubAreas.map(sub => {
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
        const anyStarted = subAreas.some(s => s.status !== 'not_started');

        return {
            broadAreaId: baId,
            name: broadArea.name,
            order: broadArea.order,
            subAreas,
            overallStatus: allCovered ? 'covered' : anyStarted ? 'in_progress' : 'not_started',
        };
    }).filter(Boolean) as BroadAreaProgress[];
}

// ─── Next Incomplete Category (legacy compat) ────────────────────────

export function getNextIncompleteCategory(session: InterviewSession): CategoryId | null {
    const threshold = DEPTH_THRESHOLDS[session.depth ?? 'standard'];
    const categories = getInterviewCategories();

    return categories
        .sort((a, b) => a.order - b.order)
        .find(cat => (session.responses[cat.id] || []).length < threshold)?.id ?? null;
}

// ─── Determine Next Sub-Area ─────────────────────────────────────────

export function determineNextSubArea(session: InterviewSession): string | null {
    const uncovered: { subAreaId: string; questionsAnswered: number }[] = [];

    // Only consider sub-areas that are in the session's coverage scope
    const scopedSubAreaIds = new Set(Object.keys(session.coverage || {}));

    for (const baId of session.selectedBroadAreas || []) {
        const subs = getSubAreasForBroadArea(baId);
        for (const sub of subs) {
            // Skip sub-areas not in scope (user didn't select them)
            if (scopedSubAreaIds.size > 0 && !scopedSubAreaIds.has(sub.id)) continue;

            const cov = session.coverage?.[sub.id];
            if (!cov || cov.status !== 'covered') {
                uncovered.push({ subAreaId: sub.id, questionsAnswered: cov?.questionsAnswered || 0 });
            }
        }
    }

    if (uncovered.length === 0) return null;

    const current = session.currentSubArea;
    if (current) {
        const currentCov = uncovered.find(u => u.subAreaId === current);
        if (currentCov && currentCov.questionsAnswered < 2) return current;
    }

    uncovered.sort((a, b) => a.questionsAnswered - b.questionsAnswered);
    return uncovered[0].subAreaId;
}

// ─── Question Mode ───────────────────────────────────────────────────

function determineQuestionMode(
    questionsAnswered: number,
    lastAnswer: string | undefined,
    hasInsights: boolean,
    threshold: number
): QuestionMode {
    if (questionsAnswered < 2) return 'foundation';
    if (hasInsights) return 'transformation';
    if (lastAnswer && lastAnswer.length < 30) return 'probing';
    if (questionsAnswered >= threshold) return 'benchmark';
    return 'discovery';
}

// ─── KPI Probing Guidance ────────────────────────────────────────────

function buildKPIGuidance(broadAreaName: string, subAreaName: string): string {
    const kpiMap: Record<string, Record<string, string>> = {
        'Order-to-Cash': {
            'Accounts Receivable': `- Days Sales Outstanding (DSO) — what is the current DSO? Industry benchmark: 30-45 days\n- Invoice-to-cash cycle time\n- Percentage of invoices disputed or returned\n- Bad debt write-off rate (% of revenue)\n- Dunning effectiveness rate (% recovered after first notice)\n- Number of FTEs dedicated to collections\n- Percentage of invoices sent electronically vs. paper/email`,
            _default: `- Order-to-cash cycle time (days)\n- Perfect order rate (%)\n- Credit check turnaround time\n- Customer onboarding time`,
        },
        'Procure-to-Pay': {
            'Accounts Payable': `- Invoice processing cost per invoice (benchmark: <$2 for best-in-class)\n- Average invoices processed per FTE per month (benchmark: 5,000+)\n- Percentage of touchless/straight-through invoices\n- Days Payable Outstanding (DPO)\n- Percentage of early payment discount captured\n- 3-way match rate (auto-match vs exception)\n- Duplicate payment rate`,
            'Procurement & Sourcing': `- Spend under management (% of total spend)\n- Contract compliance rate\n- Maverick spend percentage (benchmark: <5%)\n- Average sourcing cycle time (RFQ to contract)\n- Number of suppliers per category\n- Savings achieved vs. target`,
            'Purchase Order Management': `- PO compliance rate (% of spend on PO)\n- Requisition-to-PO cycle time\n- PO change order rate\n- Goods receipt matching rate`,
            'Vendor Management': `- Number of active vendors\n- Vendor onboarding cycle time (days)\n- Vendor performance scorecard completion rate\n- Contract renewal rate\n- Percentage of single-source vendors`,
            'Payment Execution': `- Payment run frequency (daily/weekly/monthly)\n- Percentage of electronic payments vs. cheques\n- Payment error/rejection rate\n- Bank connectivity method (manual upload, H2H, SWIFT, API)\n- Cash forecasting accuracy (variance %)`,
            _default: `- Total P2P cycle time\n- Cost per purchase order\n- Spend visibility percentage`,
        },
        'Record-to-Report': {
            'General Ledger': `- Chart of accounts line items count\n- Percentage of automated vs. manual journal entries\n- Journal entry error/reversal rate\n- Month-end close duration (working days) — benchmark: 4-6 days\n- Number of FTEs involved in close`,
            'Financial Reporting': `- Time to produce management accounts after close (days)\n- Number of manual report adjustments per period\n- Report distribution method (email/portal/BI)\n- Consolidation entity count`,
            'Reconciliation': `- Number of reconciliations per period\n- Auto-match rate for bank reconciliation (benchmark: >90%)\n- Reconciliation exceptions aging\n- Intercompany reconciliation time`,
            'Period-End Close': `- Close calendar duration (working days)\n- Number of close tasks tracked\n- Percentage of tasks automated\n- Soft close vs hard close usage`,
            'Journal Entries & Accruals': `- Volume of manual journal entries per period\n- Percentage of recurring/reversing entries automated\n- Accrual accuracy rate\n- Journal entry approval turnaround time`,
            'Financial Consolidation': `- Number of legal entities consolidated\n- Number of reporting currencies\n- Consolidation cycle time (days)\n- Intercompany elimination automation level`,
            'Management Reporting': `- Board pack preparation time (days after close)\n- Number of KPI dashboards in use\n- Variance analysis automation level\n- Reporting frequency (monthly/weekly/real-time)`,
            _default: `- Month-end close days\n- Financial statement preparation time\n- Audit adjustment count`,
        },
        'Treasury & Cash Management': {
            _default: `- Cash forecasting accuracy (variance %)\n- Idle cash levels\n- Bank account count\n- Cash pooling coverage (% of entities)\n- Interest income/expense optimisation`,
        },
        'Compliance & Controls': {
            _default: `- Number of key controls monitored\n- Control test failure rate\n- Segregation of duties conflicts count\n- Audit findings (internal + external) per year\n- Time to remediate audit findings\n- SOX compliance status`,
        },
    };

    const areaKPIs = kpiMap[broadAreaName];
    if (!areaKPIs) {
        return `Ask about relevant volumes, cycle times, error rates, FTE counts, and cost metrics for this area.`;
    }
    return areaKPIs[subAreaName] || areaKPIs._default || `Ask about relevant volumes, cycle times, error rates, FTE counts, and cost metrics.`;
}

// ─── Dynamic Question Generation ─────────────────────────────────────

export async function generateNextInterviewQuestion(
    session: InterviewSession,
    subAreaId?: string,
    modelId?: string
): Promise<GeneratedInterviewQuestion & { aiConfident?: boolean }> {
    // Determine which sub-area to target
    const targetSubAreaId = subAreaId || determineNextSubArea(session) || session.currentSubArea;
    if (!targetSubAreaId) throw new Error('No sub-area available for questioning');

    const subArea = getSubArea(targetSubAreaId);
    if (!subArea) throw new Error(`Unknown sub-area: ${targetSubAreaId}`);

    const broadArea = getBroadAreaForSubArea(targetSubAreaId);
    const broadAreaName = broadArea?.name || 'Unknown Area';

    const answers = session.responses[targetSubAreaId] || [];
    const questionsAnswered = answers.length;
    const lastAnswer = answers[answers.length - 1]?.answer as string | undefined;
    const hasInsights = session.conversationHistory.length > 4;

    const mode = determineQuestionMode(questionsAnswered, lastAnswer, hasInsights, DEPTH_THRESHOLDS[session.depth ?? 'standard']);

    const previousQA = answers
        .map(a => `Q: ${a.question}\nA: ${JSON.stringify(a.answer)}`)
        .join('\n\n');

    const alreadyAskedList = answers
        .map((a, i) => `${i + 1}. ${a.question}`)
        .join('\n');

    // Build cross-area context from other sub-areas
    const crossAreaContext = Object.entries(session.responses)
        .filter(([areaId]) => areaId !== targetSubAreaId)
        .filter(([, areaAnswers]) => areaAnswers.length > 0)
        .map(([areaId, areaAnswers]) => {
            const sa = getSubArea(areaId);
            const recentQA = areaAnswers.slice(-2)
                .map(a => `  Q: ${a.question}\n  A: ${JSON.stringify(a.answer)}`)
                .join('\n');
            return `${sa?.name ?? areaId} (${areaAnswers.length} answered):\n${recentQA}`;
        })
        .join('\n\n');

    // Build coverage summary (only for sub-areas in scope)
    const scopedIds = new Set(Object.keys(session.coverage || {}));
    const coverageSummary = (session.selectedBroadAreas || []).map(baId => {
        const ba = getBroadArea(baId);
        if (!ba) return '';
        const relevantSubs = scopedIds.size > 0
            ? ba.subAreas.filter(s => scopedIds.has(s.id))
            : ba.subAreas;
        if (relevantSubs.length === 0) return '';
        const subs = relevantSubs.map(s => {
            const cov = session.coverage?.[s.id];
            const status = cov?.status || 'not_started';
            return `  - ${s.name}: ${status} (${cov?.questionsAnswered || 0} questions)`;
        }).join('\n');
        return `${ba.name}:\n${subs}`;
    }).filter(Boolean).join('\n');

    const domainConfig = getActiveDomainConfig();
    const languageInstructions = getLanguageInstructions(session.language as LanguageCode ?? 'en');

    // Fetch project context (ERP path, client, industry) for tailored questions
    const projectCtx = await getProjectContext();
    const erpPath = projectCtx.erpPath || '';
    const targetSystem = erpPath ? (erpPath.split('→').pop()?.trim() ?? erpPath) : '';
    const projectContextBlock = [
        projectCtx.clientName && `Client: ${projectCtx.clientName}`,
        erpPath && `ERP Migration Path: ${erpPath}`,
        projectCtx.industry && `Industry: ${projectCtx.industry}`,
    ].filter(Boolean).join('\n');

    // Build maturity benchmark context from the domain config
    const maturityBenchmarks = subArea.benchmarks
        ? `\nMATURITY BENCHMARKS for "${subArea.name}" (use to calibrate your questions):\n` +
          `  Level 1 (Initial):   ${subArea.benchmarks.maturity_1}\n` +
          `  Level 2 (Developing): ${subArea.benchmarks.maturity_2}\n` +
          `  Level 3 (Defined):   ${subArea.benchmarks.maturity_3}\n` +
          `  Level 4 (Managed):   ${subArea.benchmarks.maturity_4}\n` +
          `  Level 5 (Optimized): ${subArea.benchmarks.maturity_5}\n` +
          `Use these levels to gauge where the client sits and ask questions that reveal their actual maturity.`
        : '';

    // Build KPI probing guidance based on broad area
    const kpiGuidance = buildKPIGuidance(broadAreaName, subArea.name);

    // Pull relevant excerpts from uploaded knowledge base documents (global) AND
    // any files the user attached to answers in *this* session (priority).
    const kbQuery = `${subArea.name} ${broadAreaName} ${subArea.description ?? ''}`.trim();
    const [kbContext, sessionAttachContext] = await Promise.all([
        buildKnowledgeBaseContext(kbQuery, 4),
        buildSessionAttachmentContext(session.sessionId, kbQuery, 4),
    ]);

    const sessionLang = (session.language as LanguageCode) ?? 'en';

    const systemPrompt = `You are a senior ${domainConfig.name} process consultant with 20+ years of ERP transformation and process improvement experience. You are conducting a structured discovery interview.

${languageInstructions}

## CONTEXT
Broad Area: ${broadAreaName}
Focus Sub-Area: ${subArea.name} — ${subArea.description}
Domain Persona: ${domainConfig.persona}
${projectContextBlock ? `\n## PROJECT CONTEXT\n${projectContextBlock}${targetSystem ? `

## MANDATORY ERP MIGRATION FOCUS — ${targetSystem}
This assessment is for a migration to **${targetSystem}**. You MUST incorporate this into EVERY question you generate:
1. **Reference ${targetSystem} capabilities directly** — ask whether the client's current process aligns with ${targetSystem} standard workflows, modules, or out-of-the-box functionality
2. **Probe for migration-specific gaps** — ask about data readiness for ${targetSystem}, custom vs standard processes, integrations that need rearchitecting for ${targetSystem}, and change management readiness
3. **Use ${targetSystem} terminology** — reference specific ${targetSystem} modules, transaction codes, or features relevant to "${subArea.name}" (e.g., for SAP S/4HANA: mention FSCM, SAP Fiori, Universal Journal; for D365 F&O: mention Dynamics modules, Power Platform; for Oracle Cloud: mention Oracle modules, OTBI)
4. **Assess fit-to-standard** — ask whether current processes can be handled by ${targetSystem} standard configuration or will require customisation
5. **Identify migration blockers** — probe for legacy customisations, bolt-on systems, manual workarounds, or data quality issues that would complicate the ${targetSystem} migration
Do NOT ask generic questions that ignore the migration context. Every question should help assess readiness for ${targetSystem} specifically.` : `\nTailor your questions to this specific context where appropriate.`}
` : ''}

## CONSTRAINTS
IMPORTANT: Stay focused ONLY on "${subArea.name}" topics within the "${broadAreaName}" broad area. Do NOT ask about other sub-areas.
${maturityBenchmarks}

## QUESTION MODE: ${mode.toUpperCase()}
- foundation: Establish baseline — current tools, team size, process ownership, volumes, and how work gets done today
- probing: Dig deeper when previous answers were brief or vague — ask for specifics, volumes, frequencies, examples
- discovery: Explore problems, root causes, pain points — ask about workarounds, manual steps, delays, error rates
- transformation: Explore improvement, automation, and modernization opportunities — ask about desired future state
- benchmark: Compare against industry best practices and KPIs — reference standards like APQC, SAP Best Practice, COBIT

## KEY METRICS & KPIs TO PROBE (when relevant)
${kpiGuidance}
${sessionAttachContext}${kbContext}
## CONVERSATION SO FAR
Previous Q&A in ${subArea.name}:
${previousQA || 'No previous questions yet — start with the fundamentals.'}

${alreadyAskedList ? `ALREADY ASKED — do NOT repeat, rephrase, or ask similar versions of these:\n${alreadyAskedList}` : ''}

${crossAreaContext ? `Context from other areas (for reference only — do NOT ask about these topics):\n${crossAreaContext}` : ''}

## COVERAGE
${coverageSummary}

## QUESTION GENERATION INSTRUCTIONS
Generate the next interview question. Your question MUST:
1. Ask about a NEW topic not yet covered in the Q&A above
2. Stay strictly within the scope of "${subArea.name}" under "${broadAreaName}"
3. Build on what we already know (never repeat a question)
4. Uncover hidden inefficiencies, manual processes, or control gaps
5. Where possible, elicit QUANTIFIABLE data (volumes, frequencies, cycle times, error rates, FTE counts)
6. Be specific and consultative — avoid generic questions like "tell me about your process"
7. Use the maturity benchmarks above to probe whether the client is at Level 1-2 (manual) or Level 3-5 (automated)

Return ONLY valid JSON in this exact format:
{
  "question": "The interview question text",
  "type": "single_choice|multi_choice|scale|open_ended|yes_no",
  "options": ["option1", "option2", "option3", "option4"],
  "followUpTopics": ["topic1", "topic2"],
  "subAreaCovered": false
}

Set "subAreaCovered" to true ONLY if you believe enough information has been gathered for "${subArea.name}" to provide a thorough assessment (at least 2 questions answered with substantive responses).

RULES for question types:
- Use "single_choice" with 3-6 specific options when asking about tools, methods, or frequencies
- Use "multi_choice" with 4-8 options when multiple answers apply (e.g., pain points, systems used)
- Use "scale" for maturity/satisfaction ratings (options should be ["1", "2", "3", "4", "5"])
- Use "yes_no" for simple binary questions (options should be ["Yes", "No"])
- Use "open_ended" ONLY when a detailed narrative is truly needed (avoid overusing this)

Prefer structured question types (single_choice, multi_choice, scale, yes_no) over open_ended to make the UX faster and easier.

REMINDER: The "question" text and all "options" MUST be written in the language specified in the LANGUAGE REQUIREMENT section above. Do NOT use English unless the language requirement specifies English.`;

    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate the next ${mode} question for ${subArea.name} (under ${broadAreaName}). Questions answered so far: ${questionsAnswered}. Ask about a new topic not yet covered.` },
    ];

    const completion = await generateCompletion(modelId || null, messages, { temperature: 0.4 });

    const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    const validTypes: QuestionType[] = ['single_choice', 'multi_choice', 'scale', 'open_ended', 'yes_no'];
    const type = validTypes.includes(parsed.type) ? parsed.type : 'open_ended';

    let options = parsed.options || [];
    if (type === 'scale') options = ['1', '2', '3', '4', '5'];
    if (type === 'yes_no') { const [yes, no] = getYesNoOptions(sessionLang); options = [yes, no]; }
    if (type === 'open_ended') options = [];

    if (answers.some(a => a.question === parsed.question)) {
        throw new Error(`LLM generated a duplicate question: "${parsed.question}"`);
    }

    const aiConfident = parsed.subAreaCovered === true;

    return {
        id: uuidv4(),
        question: parsed.question,
        text: parsed.question, // Maps text to question for frontend compatibility
        type,
        options: options.length > 0 ? options : undefined,
        mode,
        categoryId: targetSubAreaId,
        followUpTopics: parsed.followUpTopics || [],
        aiConfident,
    };
}

// ─── Submit Answer ───────────────────────────────────────────────────

export async function submitInterviewAnswer(
    session: InterviewSession,
    answer: {
        questionId: string;
        question: string;
        answer: string | string[] | number | boolean;
        type: QuestionType;
        mode: QuestionMode;
        categoryId?: CategoryId;
        subAreaId?: string;
        aiConfident?: boolean;
        attachments?: AnswerAttachment[];
    }
): Promise<void> {
    const targetId = answer.subAreaId || answer.categoryId || session.currentSubArea || session.currentCategory;

    if (!targetId) {
        throw new Error('No sub-area or category ID provided for answer submission');
    }

    if (!session.responses[targetId]) {
        session.responses[targetId] = [];
    }

    session.responses[targetId].push({
        questionId: answer.questionId,
        question: answer.question,
        answer: answer.answer,
        type: answer.type,
        mode: answer.mode,
        timestamp: new Date(),
        attachments: answer.attachments && answer.attachments.length > 0 ? answer.attachments : undefined,
    });

    const answerText = Array.isArray(answer.answer) ? answer.answer.join(', ') : String(answer.answer);
    session.conversationHistory.push(
        { role: 'assistant', content: answer.question },
        { role: 'user', content: answerText }
    );

    // Update coverage tracking
    if (!session.coverage) {
        session.coverage = {};
    }
    if (!session.coverage[targetId]) {
        session.coverage[targetId] = { questionsAnswered: 0, aiConfident: false, status: 'not_started' };
    }

    const cov = session.coverage[targetId];
    cov.questionsAnswered = (session.responses[targetId] || []).length;

    if (answer.aiConfident !== undefined) {
        cov.aiConfident = answer.aiConfident;
    }

    // Coverage status: 'covered' when questionsAnswered >= 2 AND aiConfident === true
    if (cov.questionsAnswered >= 2 && cov.aiConfident) {
        cov.status = 'covered';
    } else if (cov.questionsAnswered > 0) {
        cov.status = 'in_progress';
    }

    await updateInterviewSession(session);
}

// ─── Legacy: Process free-text interview message ─────────────────────

export async function processInterviewMessage(
    session: InterviewSession,
    userMessage: string,
    modelId?: string
): Promise<{ response: string; extractedData: { categoryId: CategoryId; questionId: string; answer: string } | null }> {
    const currentTarget = session.currentSubArea || session.currentCategory;
    const subArea = currentTarget ? getSubArea(currentTarget) : undefined;
    const broadArea = currentTarget ? getBroadAreaForSubArea(currentTarget) : undefined;
    const answers = session.responses[currentTarget || ''] || [];
    const progress = getInterviewProgress(session);

    const progressSummary = progress
        .map(p => `${p.name}: ${p.subAreas.filter(s => s.status === 'covered').length}/${p.subAreas.length} sub-areas covered ${p.overallStatus === 'covered' ? '✓' : ''}`)
        .join('\n');

    const languageInstructions = getLanguageInstructions(session.language as LanguageCode ?? 'en');
    const areaName = subArea?.name ?? currentTarget ?? 'domain';
    const systemPrompt = `You are a ${broadArea?.name ?? 'domain'} process discovery consultant conducting an interview to understand a company's current processes. Your goal is to gather detailed information to build a GAP analysis report.

${languageInstructions}

Current Interview Status:
- Broad Area: ${broadArea?.name ?? 'Unknown'}
- Sub-Area: ${areaName}
- Questions answered in this sub-area: ${answers.length}
- Progress:
${progressSummary}

Recent conversation context:
${session.conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}

Instructions:
1. Acknowledge the user's response and extract key information
2. Ask a follow-up question if needed
3. When a sub-area has enough data, suggest moving to the next sub-area
4. Keep the conversation natural and professional

Respond in JSON format (ONLY output valid JSON):
{
    "response": "Your conversational response to the user",
    "extractedAnswer": "Key information extracted from their response, or null",
    "suggestNextSubArea": "Next sub-area ID to suggest, or null"
}`;

    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    const completion = await generateCompletion(modelId || null, messages, { temperature: 0.7 });

    let result: { response: string; extractedAnswer?: string; suggestNextSubArea?: string; suggestNextCategory?: string };
    try {
        const jsonMatch = completion.content.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : completion.content);
    } catch {
        result = { response: completion.content };
    }

    session.conversationHistory.push({ role: 'user', content: userMessage });
    session.conversationHistory.push({ role: 'assistant', content: result.response });

    let extractedData = null;
    if (result.extractedAnswer && currentTarget) {
        const questionId = uuidv4();
        extractedData = {
            categoryId: currentTarget,
            questionId,
            answer: result.extractedAnswer,
        };

        if (!session.responses[currentTarget]) {
            session.responses[currentTarget] = [];
        }
        session.responses[currentTarget].push({
            questionId,
            question: 'Free-text response',
            answer: result.extractedAnswer,
            type: 'open_ended',
            mode: 'discovery',
            timestamp: new Date(),
        });
    }

    // Handle sub-area navigation suggestion
    const suggestedNext = result.suggestNextSubArea || result.suggestNextCategory;
    if (suggestedNext) {
        const nextSub = getSubArea(suggestedNext);
        if (nextSub) {
            session.currentSubArea = suggestedNext;
        } else if (isValidInterviewCategory(suggestedNext)) {
            session.currentCategory = suggestedNext;
        }
    }

    await updateInterviewSession(session);
    return { response: result.response, extractedData };
}

// ─── Switch Category / Sub-Area ─────────────────────────────────────

export async function switchCategory(session: InterviewSession, categoryId: CategoryId): Promise<string> {
    // Try as sub-area first, then fall back to broad area / legacy category
    const subArea = getSubArea(categoryId);
    if (subArea) {
        session.currentSubArea = categoryId;
        await updateInterviewSession(session);

        const broadArea = getBroadAreaForSubArea(categoryId);
        const answers = session.responses[categoryId] || [];
        const cov = session.coverage?.[categoryId];

        if (cov?.status === 'covered') {
            return `You've already covered **${subArea.name}** (under ${broadArea?.name ?? 'Unknown'}). Would you like to add more details or move to another sub-area?`;
        }

        return `Let's discuss **${subArea.name}** (under ${broadArea?.name ?? 'Unknown'}) — ${subArea.description}.`;
    }

    // Fall back to broad area check
    const broadArea = getBroadArea(categoryId);
    if (broadArea) {
        // Set to first uncovered sub-area in this broad area
        const firstUncovered = broadArea.subAreas.find(s => {
            const cov = session.coverage?.[s.id];
            return !cov || cov.status !== 'covered';
        }) || broadArea.subAreas[0];

        if (firstUncovered) {
            session.currentSubArea = firstUncovered.id;
        }
        session.currentCategory = categoryId;
        await updateInterviewSession(session);

        return `Let's explore **${broadArea.name}** — starting with **${firstUncovered?.name ?? 'the first sub-area'}**.`;
    }

    // Legacy: try as interview category
    if (!isValidInterviewCategory(categoryId)) {
        throw new Error(`Invalid category or sub-area: ${categoryId}`);
    }

    session.currentCategory = categoryId;
    await updateInterviewSession(session);

    const category = getInterviewCategory(categoryId)!;
    const answers = session.responses[categoryId] || [];

    if (answers.length >= DEPTH_THRESHOLDS[session.depth ?? 'standard']) {
        return `You've already completed **${category.name}**. Would you like to add more details or move to another section?`;
    }

    return `Let's discuss **${category.name}** — ${category.description}.`;
}

// ─── GAP Analysis Report ─────────────────────────────────────────────

/**
 * Stage 1 (Map): Summarize one category's Q&A into a compact digest.
 * Keeps each individual LLM call well within token limits.
 */
async function summarizeCategoryForGap(
    categoryName: string,
    answers: InterviewAnswer[],
    domainName: string,
    modelId?: string,
    language: LanguageCode = 'en'
): Promise<object> {
    // Truncate each answer to avoid runaway token counts
    const truncated = answers.map(a => ({
        q: a.question.substring(0, 200),
        a: String(Array.isArray(a.answer) ? a.answer.join(', ') : a.answer).substring(0, 400),
    }));

    const qaText = truncated.map(({ q, a }) => `• Q: ${q}\n  A: ${a}`).join('\n');

    const languageInstructions = getLanguageInstructions(language);
    const langEnumNote = language !== 'en'
        ? `\nIMPORTANT: Write descriptive text fields (keyFindings, painPoints, gap, currentState, targetState, standard) in the same language as the interview. However, keep ALL enum values EXACTLY as specified in English: maturityLevel must be one of "basic|developing|defined|managed|optimized", type must be "process|technology|capability|data", impact/effort must be "high|medium|low", fit must be "gap|partial|fit". JSON keys must remain in English.\n`
        : '';
    const prompt = `You are a ${domainName} process consultant. Analyze this interview section and produce a concise structured digest for GAP analysis.

${languageInstructions}
${langEnumNote}
Category: ${categoryName}
Interview Q&A (${answers.length} questions):
${qaText}

Output ONLY valid JSON with this exact schema:
{
  "category": "${categoryName}",
  "keyFindings": ["2-4 findings about the current state"],
  "painPoints": ["2-3 pain points or inefficiencies"],
  "maturityLevel": "basic|developing|defined|managed|optimized",
  "gaps": [
    {
      "gap": "Short gap title",
      "area": "Order to Cash|Procure to Pay|Record to Report|General",
      "type": "process|technology|capability|data",
      "currentState": "What exists now (1-2 sentences)",
      "targetState": "Best practice target (1-2 sentences)",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "fit": "gap|partial|fit",
      "standard": "Standard or framework (e.g. SAP Best Practice, APQC, IFRS)"
    }
  ]
}`;

    const completion = await generateCompletion(modelId || null, [
        { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    try {
        const match = completion.content.match(/\{[\s\S]*\}/);
        return JSON.parse(match ? match[0] : completion.content);
    } catch {
        return { category: categoryName, keyFindings: [], painPoints: [], gaps: [] };
    }
}

export async function generateFinanceGapReport(session: InterviewSession, modelId?: string): Promise<object> {
    const progress = getInterviewProgress(session);
    const hasAnyAnswers = progress.some(p => p.subAreas.some(s => s.questionsAnswered > 0));

    if (!hasAnyAnswers) {
        throw new Error('No interview data available. Please complete at least one sub-area.');
    }

    const domainConfig = getActiveDomainConfig();
    const categoryEntries = Object.entries(session.responses).filter(([, a]) => a.length > 0);

    // ── Stage 1 (Map): Summarize each category/sub-area in parallel ──────────
    console.log(`[GAP Report] Stage 1: Summarizing ${categoryEntries.length} areas...`);

    const sessionLanguage = (session.language ?? 'en') as LanguageCode;
    const summaryResults = await Promise.allSettled(
        categoryEntries.map(([areaId, answers]) => {
            // Try sub-area name first, then broad area, then raw ID
            const subArea = getSubArea(areaId);
            const broadArea = getBroadArea(areaId);
            const areaName = subArea?.name ?? broadArea?.name ?? areaId;
            return summarizeCategoryForGap(areaName, answers, domainConfig.name, modelId, sessionLanguage);
        })
    );

    const categorySummaries = summaryResults
        .filter((r): r is PromiseFulfilledResult<object> => r.status === 'fulfilled')
        .map(r => r.value);

    console.log(`[GAP Report] Stage 1 complete: ${categorySummaries.length} digests ready.`);

    // ── Stage 2 (Reduce): Synthesize all digests → final report ─────────────
    const digests = JSON.stringify(categorySummaries, null, 2);

    const synthesisLanguageInstructions = getLanguageInstructions(sessionLanguage);
    const synthesisEnumNote = sessionLanguage !== 'en'
        ? `\nIMPORTANT: Write ALL descriptive text (executiveSummary, gap titles, currentState, targetState, recommendations, risks, roadmap items, etc.) in the same language as the input digests. However, keep ALL enum/classification values EXACTLY in English as specified in the schema: category must be "process|technology|capability|data", impact/effort/likelihood must be "high|medium|low", fit must be "gap|partial|fit", priority must be "high|medium|low". JSON keys must remain in English.\n`
        : '';
    const synthesisPrompt = `You are an expert ${domainConfig.name} consultant. Synthesize these structured category digests into a comprehensive GAP analysis report.

${synthesisLanguageInstructions}
${synthesisEnumNote}

Category Digests:
${digests}

Output ONLY valid JSON with this EXACT schema — do not omit any field:
{
  "executiveSummary": "2-3 sentence summary",
  "gaps": [
    {
      "id": "GAP-001",
      "category": "process|technology|capability|data",
      "area": "Order to Cash|Procure to Pay|Record to Report|General",
      "gap": "Gap title",
      "currentState": "Current state",
      "targetState": "Best practice target",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "fit": "gap|partial|fit",
      "standard": "Standard used (e.g. APQC, SAP Best Practice, ISO 9001)",
      "impactScore": 7,
      "effortScore": 5
    }
  ],
  "quickWins": ["GAP-001", "GAP-002"],
  "roadmap": {
    "phases": [
      { "name": "Phase 1 (0-3 months)", "duration": "3 months", "items": ["Item 1"] },
      { "name": "Phase 2 (3-6 months)", "duration": "3 months", "items": ["Item 1"] },
      { "name": "Phase 3 (6-12 months)", "duration": "6 months", "items": ["Item 1"] }
    ]
  },
  "risks": [
    { "risk": "Risk", "likelihood": "medium", "impact": "high", "mitigation": "Strategy" }
  ]
}`;

    console.log(`[GAP Report] Stage 2: Synthesizing final report...`);
    const synthesis = await generateCompletion(modelId || null, [
        { role: 'user', content: synthesisPrompt },
    ], { temperature: 0.4 });

    let report: object;
    try {
        const jsonMatch = synthesis.content.match(/\{[\s\S]*\}/);
        report = JSON.parse(jsonMatch ? jsonMatch[0] : synthesis.content);
    } catch {
        throw new Error('Failed to parse synthesized GAP analysis report from LLM response');
    }

    console.log(`[GAP Report] Done. Gaps found: ${(report as any).gaps?.length ?? 0}`);
    return report;
}

// ─── Intelligent Question Generation (Mastra Agent) ──────────────────

export async function generateIntelligentQuestion(
    sessionId: string,
    categoryId: CategoryId,
    modelId?: string
): Promise<GeneratedInterviewQuestion & { reasoning: string; categoryComplete: boolean; missedTopics: string[] }> {
    const { mastra } = await import('../mastra');
    const { v4: uuidv4 } = await import('uuid');

    const agent = mastra.getAgent('interviewAgent');
    const session = await getInterviewSession(sessionId);

    if (!session) {
        throw new Error(`Interview session not found: ${sessionId}`);
    }

    // Try sub-area first, then broad area / legacy category
    const subArea = getSubArea(categoryId);
    const broadArea = getBroadArea(categoryId);
    const areaName = subArea?.name ?? broadArea?.name ?? categoryId;
    const areaDescription = subArea?.description ?? broadArea?.description ?? '';

    const answers = session.responses[categoryId] || [];
    const previousQuestions = answers.map((a) => a.question);

    const effectiveModel = await getEffectiveModel(modelId);
    const finalModelId = effectiveModel?.id || 'groq:llama-3.1-8b-instant';

    // Resolve the Mastra-compatible model object
    let mastraModel: any;
    if (effectiveModel?.provider === 'groq') {
        const { groq } = await import('@ai-sdk/groq');
        mastraModel = groq(effectiveModel.model);
    } else if (effectiveModel?.provider === 'openai') {
        const { openai } = await import('@ai-sdk/openai');
        mastraModel = openai(effectiveModel.model);
    } else {
        const { openai } = await import('@ai-sdk/openai');
        mastraModel = openai('gpt-4o');
    }

    const prompt = `Generate the next interview question for session "${sessionId}", area "${categoryId}" (${areaName}).
 
Previous questions asked in this area: ${previousQuestions.length}
Area description: ${areaDescription}
 
Use the following tool sequence:
1. Call get_category_conversation to retrieve the full conversation history for categoryId="${categoryId}" and sessionId="${sessionId}"
2. Call search_domain_knowledge to find relevant context from uploaded documents for categoryId="${categoryId}"
3. Call evaluate_category_completion with the answers collected so far and modelId="${finalModelId}"
4. Call generate_next_question using what you learned from steps 1-3 and modelId="${finalModelId}"
 
After calling all tools, return a JSON object with this structure:
{
  "question": "The next interview question",
  "type": "single_choice | multi_choice | scale | open_ended | yes_no",
  "options": ["option1", "option2"],
  "mode": "foundation | probing | discovery | transformation | benchmark",
  "categoryId": "${categoryId}",
  "followUpTopics": ["topic1"],
  "reasoning": "Why this question was chosen",
  "categoryComplete": false,
  "missedTopics": ["topic1", "topic2"]
}
`;

    let result;
    try {
        result = await agent.generate(
            [{ role: 'user', content: prompt }],
            { model: mastraModel } as any
        );
    } catch (error) {
        console.error('[interviewService] Mastra agent failed, falling back to legacy generation:', error);
        // Fallback to legacy generation
        const legacyQuestion = await generateNextInterviewQuestion(session, categoryId, modelId);
        return {
            ...legacyQuestion,
            reasoning: 'Fallback question generated due to reasoning engine interruption.',
            categoryComplete: false,
            missedTopics: [] // Legacy function does not track missed topics
        };
    }

    const responseText = result.text || '';
    const parsed = extractJSON<{
        question: string;
        type: string;
        options?: string[];
        mode?: string;
        categoryId?: string;
        followUpTopics?: string[];
        reasoning?: string;
        categoryComplete?: boolean;
        missedTopics?: string[];
    }>(responseText);

    if (!parsed) {
        console.error('[interviewService] Failed to extract JSON from agent response:', responseText);
        throw new Error('Malformed AI response (invalid JSON)');
    }

    const validTypes: QuestionType[] = ['single_choice', 'multi_choice', 'scale', 'open_ended', 'yes_no'];
    const validModes: QuestionMode[] = ['foundation', 'probing', 'discovery', 'transformation', 'benchmark'];

    const questionType: QuestionType = validTypes.includes(parsed.type as QuestionType)
        ? (parsed.type as QuestionType)
        : 'open_ended';

    const questionMode: QuestionMode = validModes.includes(parsed.mode as QuestionMode)
        ? (parsed.mode as QuestionMode)
        : answers.length < 2 ? 'foundation' : 'discovery';

    let options = parsed.options || [];
    if (questionType === 'scale') options = ['1', '2', '3', '4', '5'];
    if (questionType === 'yes_no') { const [yes, no] = getYesNoOptions((session.language as LanguageCode) ?? 'en'); options = [yes, no]; }
    if (questionType === 'open_ended') options = [];

    return {
        id: uuidv4(),
        question: parsed.question,
        text: parsed.question,
        type: questionType,
        options: options.length > 0 ? options : undefined,
        mode: questionMode,
        categoryId,
        followUpTopics: parsed.followUpTopics || [],
        reasoning: parsed.reasoning || '',
        categoryComplete: parsed.categoryComplete ?? false,
        missedTopics: parsed.missedTopics || [],
    };
}

// ─── Welcome Message ─────────────────────────────────────────────────

export function getInterviewStartMessage(): string {
    const domainConfig = getActiveDomainConfig();
    const broadAreas = getBroadAreas();

    const areaList = broadAreas
        .map((ba, i) => {
            const subList = ba.subAreas.map(s => `   - ${s.name}`).join('\n');
            return `${i + 1}. **${ba.name}**\n${subList}`;
        })
        .join('\n');

    const firstSubArea = broadAreas[0]?.subAreas[0];

    return `Welcome! I'm here to help you analyze your ${domainConfig.name} processes and identify opportunities for improvement.

We'll go through **${broadAreas.length} key areas**:
${areaList}

Click on any area in the sidebar to switch focus. Let's start with **${firstSubArea?.name ?? broadAreas[0]?.name ?? 'the first area'}**.`;
}
