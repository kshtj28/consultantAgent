/**
 * Answer Sufficiency Classifier — Prompt
 *
 * Implements Pattern 1 from the GenAI Interview Agent Design Patterns reference.
 * Scores an SME answer across six audit-defensibility dimensions and identifies
 * which dimension to probe next when the answer is insufficient.
 *
 * The six dimensions are NOT configurable — they map directly to what an
 * auditor needs to verify a process step (Actor / Action / Input / Output /
 * Decision criteria / SLA-timing). Per-question applicability IS dynamic:
 * a question about volumes won't always require a decisionCriteria score,
 * so the classifier may mark a dimension `applicable: false`.
 */

import { getLanguageInstructions, LanguageCode } from '../services/languageService';

export const SUFFICIENCY_DIMENSIONS = [
    'actor',
    'action',
    'input',
    'output',
    'decisionCriteria',
    'sla',
] as const;

export type SufficiencyDimensionKey = typeof SUFFICIENCY_DIMENSIONS[number];

export const DIMENSION_LABELS: Record<SufficiencyDimensionKey, string> = {
    actor: 'Actor',
    action: 'Action',
    input: 'Input',
    output: 'Output',
    decisionCriteria: 'Decision Criteria',
    sla: 'SLA / Timing',
};

/** Default pass threshold for the overall sufficiency score (0–100).
 *  Regulated banking processes use this floor; informal coordination steps
 *  may be lowered via `processCalibration` in `buildSufficiencyPrompt`. */
export const DEFAULT_SUFFICIENCY_THRESHOLD = 65;

/** When the regex-based fast-path detects an obviously vague reply, we
 *  skip the LLM call and emit this default missing dimension. Action is
 *  the most common gap on short answers ("Manually reviewed", "Standard"). */
export const FAST_PATH_DEFAULT_MISSING: SufficiencyDimensionKey = 'action';

export interface SufficiencyPromptParams {
    question: string;
    answer: string;
    subAreaName: string;
    broadAreaName: string;
    language?: LanguageCode;
    /** "regulated" requires all 6 dimensions; "informal" tolerates missing
     *  decisionCriteria/sla on conversational steps. Defaults to "regulated". */
    processCalibration?: 'regulated' | 'informal';
    /** Optional list of attachment filenames the SME provided alongside
     *  the answer — the LLM should treat them as supporting evidence. */
    attachmentFilenames?: string[];
}

/** Build the classifier prompt. Returns a single user-message string;
 *  callers wrap it as an LLM call with low temperature. */
export function buildSufficiencyPrompt(params: SufficiencyPromptParams): string {
    const {
        question,
        answer,
        subAreaName,
        broadAreaName,
        language = 'en',
        processCalibration = 'regulated',
        attachmentFilenames = [],
    } = params;

    const languageInstructions = getLanguageInstructions(language);
    const calibrationNote = processCalibration === 'regulated'
        ? `This is a REGULATED PROCESS (banking, lending, credit, treasury, compliance). All six dimensions are normally required for an audit-defensible answer. Mark a dimension applicable=false ONLY if the question itself does not concern that dimension (e.g. a question purely about team size doesn't need an SLA score).`
        : `This is an INFORMAL / COORDINATION step. Decision-criteria and SLA may be marked applicable=false more liberally if the step is a discussion or hand-off without a hard rule or deadline.`;

    const attachmentBlock = attachmentFilenames.length > 0
        ? `\nThe SME also attached: ${attachmentFilenames.map(f => `"${f}"`).join(', ')}. Treat their existence as supporting evidence (raises actor/action/output scores moderately) but do NOT assume their content beyond the filename.`
        : '';

    return `You are an audit-grade interview-quality classifier for a process-discovery LLM agent. Your single job is to score the SME's answer against six dimensions that determine whether the answer is sufficient to document a process step in an audit-defensible way.

${languageInstructions}

CRITICAL: All your output (JSON keys, enum values, dimension keys) MUST be in English regardless of the answer's language. Score the answer based on its substance, not its language. The "evidence" field should quote the SME's words verbatim in their original language.

## CONTEXT
Broad Area: ${broadAreaName}
Sub-Area: ${subAreaName}
${calibrationNote}
${attachmentBlock}

## DIMENSIONS TO SCORE (each 0–100, plus an applicable flag)

1. **actor** — Is there a clear role, team, or named system performing the action? Look for: named roles ("Credit Officer", "Treasury Manager"), specific systems ("SAP FSCM module", "Kyriba"), or department names ("Group Risk"). Vague signals: "someone", "the team", "we", "they", "people".

2. **action** — Verb-level clarity on what is actually done. Score high for specific verbs with objects ("matches the invoice line items against the PO", "computes accrued interest using actual/360"). Score low for unspecific verbs ("reviewed", "processed", "handled", "checked", "looked at") with no detail on what is reviewed/checked.

3. **input** — What triggers the step or feeds it data. Score high for named artifacts/events ("vendor invoice in PDF arrives via email", "month-end trigger from SAP", "customer onboarding form completed"). Score low for "stuff", "the file", "things from upstream", or pure passive voice with no source.

4. **output** — What artifact or state-change is produced. Score high for concrete results ("approved invoice posted to FB60 with workflow stamp", "GL journal entry in batch ZX01", "case status moves to 'Approved'"). Score low for "result", "done", "outcome" with no specifics.

5. **decisionCriteria** — IF the step involves a branch, gateway, threshold, or rule: are the rules stated? Score high for explicit thresholds/conditions ("amount ≥ 1M routes to credit committee per policy 4.2", "if credit score < 600 then auto-decline"). Score low for "depends on the case", "we use judgment", "based on policy" (without naming it). If the question/answer clearly does not concern any branching, set applicable=false.

6. **sla** — Expected duration, deadline, or cycle-time. Score high for quantified bounds ("within 2 business days", "by EOD T+1", "DSO target 35 days", "<4 hours"). Score low for "quickly", "fast", "ASAP", "depends". If the question/answer clearly does not concern timing, set applicable=false.

## SCORING RUBRIC
- 90–100: Audit-ready. Specific, verifiable, with named artifacts/roles/numbers.
- 70–89: Solid but could use one more concrete reference (named system, exact number).
- 40–69: Partial. The dimension is touched but not specific enough to document.
- 1–39: Mentioned only in passing or contradicted by hedging language.
- 0: Not addressed at all.

## INTERVIEW Q&A
Question asked: "${question}"
SME's answer: "${answer}"

## OUTPUT FORMAT
Return ONLY a single valid JSON object, no markdown, no commentary. Schema:
{
  "dimensions": {
    "actor":            { "score": 0-100, "applicable": true|false, "evidence": "direct quote from answer or empty string" },
    "action":           { "score": 0-100, "applicable": true|false, "evidence": "..." },
    "input":            { "score": 0-100, "applicable": true|false, "evidence": "..." },
    "output":           { "score": 0-100, "applicable": true|false, "evidence": "..." },
    "decisionCriteria": { "score": 0-100, "applicable": true|false, "evidence": "..." },
    "sla":              { "score": 0-100, "applicable": true|false, "evidence": "..." }
  },
  "overall": 0-100,
  "missingDimension": "actor|action|input|output|decisionCriteria|sla|null",
  "recommendedProbe": "ONE concrete follow-up question (≤25 words) targeting the missingDimension, in the SME's language. Reference what they actually said.",
  "reasoning": "1–2 short sentences explaining the overall score."
}

Rules for the output:
- "overall" is the weighted average ONLY across applicable dimensions, rounded to integer.
- "missingDimension" is the SINGLE applicable dimension with the lowest score. Use null only if every applicable dimension scored ≥ 70.
- "recommendedProbe" must reference the missing dimension explicitly (e.g. "Which team specifically handles..." for actor, "What exact criterion triggers..." for decisionCriteria).
- Set "applicable": false on a dimension only when the question genuinely doesn't concern it. Default to true.
- If the answer is empty or pure filler ("ok", "yes", "manually"), score every applicable dimension ≤ 20 and explain in reasoning.

Output the JSON object only.`;
}
