/**
 * Answer Sufficiency Classifier (Pattern 1)
 *
 * Scores an SME's answer across six audit-defensibility dimensions
 * (actor / action / input / output / decisionCriteria / sla) and identifies
 * the single highest-priority dimension to probe next when the answer falls
 * short of the configured pass threshold.
 *
 * Designed to fail soft — every code path returns a SufficiencyAssessment
 * even when the LLM call errors or returns malformed JSON. Callers use the
 * `errored` and `passed` flags to decide whether to escalate or proceed.
 */

import {
    buildSufficiencyPrompt,
    SufficiencyDimensionKey,
    SUFFICIENCY_DIMENSIONS,
    DEFAULT_SUFFICIENCY_THRESHOLD,
    FAST_PATH_DEFAULT_MISSING,
} from '../prompts/sufficiency.prompt';
import { generateCompletion, LLMMessage } from './llmService';
import { extractJSON } from '../utils/jsonUtils';
import { LanguageCode } from './languageService';

export interface DimensionScore {
    /** 0–100 score against the dimension. Null only if applicable=false. */
    score: number | null;
    /** Whether this dimension applies to the question being asked. */
    applicable: boolean;
    /** Quoted span from the SME's answer that supports the score, if any. */
    evidence: string;
}

export interface SufficiencyAssessment {
    /** Weighted average across applicable dimensions, 0–100. */
    overall: number;
    /** True when overall ≥ threshold AND no applicable dimension scored < 30. */
    passed: boolean;
    /** The threshold used for the pass/fail decision. */
    threshold: number;
    /** Per-dimension breakdown. Always contains all six keys. */
    dimensions: Record<SufficiencyDimensionKey, DimensionScore>;
    /** Single dimension to probe next, or null when the answer is sufficient. */
    missingDimension: SufficiencyDimensionKey | null;
    /** A targeted, ready-to-show follow-up probe for the missingDimension. */
    recommendedProbe: string;
    /** Brief reasoning string for review/audit display. */
    reasoning: string;
    /** ISO timestamp of when the assessment was produced. */
    classifiedAt: string;
    /** Model used (or 'fast-path' when the LLM was bypassed). */
    modelId: string;
    /** True when the classifier failed and the assessment is a heuristic
     *  fallback rather than an LLM judgment. Callers should treat this as
     *  "unknown sufficiency" rather than a confirmed pass or fail. */
    errored: boolean;
    /** Reason text when errored=true. */
    errorReason?: string;
}

export interface ClassifyAnswerParams {
    question: string;
    answer: string;
    subAreaName: string;
    broadAreaName: string;
    language?: LanguageCode;
    processCalibration?: 'regulated' | 'informal';
    attachmentFilenames?: string[];
    /** Override the default 65 pass threshold (0–100). */
    threshold?: number;
    /** Explicit model id; falls back to system default via generateCompletion. */
    modelId?: string;
}

/** Produce an empty per-dimension record with sensible defaults. */
function emptyDimensions(score: number, applicable: boolean): Record<SufficiencyDimensionKey, DimensionScore> {
    const out = {} as Record<SufficiencyDimensionKey, DimensionScore>;
    for (const key of SUFFICIENCY_DIMENSIONS) {
        out[key] = { score: applicable ? score : null, applicable, evidence: '' };
    }
    return out;
}

/** Quick regex check used to short-circuit obviously vague answers without
 *  spending an LLM call. Mirrors the legacy `detectVagueAnswer` heuristic. */
const FAST_PATH_VAGUE = /^(hmm+|uh+|um+|ok|okay|yes|no|maybe|sure|fine|good|alright|idk|i\s+don'?t\s+know|not\s+sure|correct|right|exactly|yeah|yep|nope|n\/a|none|nil|na|nothing|i'?ll?\s+check|let\s+me\s+check|possibly|probably|not\s+really|we'll\s+see|it\s+depends?|it\s+varies?|standard|normal|regular|typical|usual|same\s+as\s+before|manually|like\s+everyone)\.?\s*$/i;

function isObviouslyVague(answer: string): boolean {
    const trimmed = answer.trim();
    if (!trimmed) return true;
    if (trimmed.length < 12) return true;
    if (FAST_PATH_VAGUE.test(trimmed.toLowerCase())) return true;
    return false;
}

/** Coerce one dimension entry from raw LLM JSON into a clean DimensionScore. */
function normalizeDimension(raw: unknown): DimensionScore {
    if (!raw || typeof raw !== 'object') {
        return { score: 0, applicable: true, evidence: '' };
    }
    const obj = raw as Record<string, unknown>;
    const applicable = obj.applicable === false ? false : true;
    let score: number | null = null;
    if (applicable) {
        const n = typeof obj.score === 'number' ? obj.score : Number(obj.score);
        score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    }
    const evidence = typeof obj.evidence === 'string' ? obj.evidence.slice(0, 400) : '';
    return { score, applicable, evidence };
}

/** Compute a deterministic weighted-average overall score and choose the
 *  single missingDimension as the lowest-scoring applicable dimension.
 *  Callers can rely on this even when the LLM omits or miscalculates them. */
function summarize(
    dimensions: Record<SufficiencyDimensionKey, DimensionScore>,
    threshold: number,
): { overall: number; passed: boolean; missingDimension: SufficiencyDimensionKey | null } {
    const applicable = SUFFICIENCY_DIMENSIONS
        .map(k => ({ key: k, dim: dimensions[k] }))
        .filter(({ dim }) => dim.applicable && dim.score !== null);

    if (applicable.length === 0) {
        // No applicable dimensions — treat as a non-process-step answer; pass.
        return { overall: 100, passed: true, missingDimension: null };
    }

    const sum = applicable.reduce((acc, { dim }) => acc + (dim.score ?? 0), 0);
    const overall = Math.round(sum / applicable.length);

    // Lowest-scoring applicable dimension is the probe target.
    const sorted = [...applicable].sort((a, b) => (a.dim.score ?? 0) - (b.dim.score ?? 0));
    const lowest = sorted[0];
    const passed = overall >= threshold && (lowest.dim.score ?? 0) >= 30;
    const missingDimension = passed ? null : lowest.key;

    return { overall, passed, missingDimension };
}

/** Generate a deterministic generic probe when the LLM doesn't supply one. */
const GENERIC_PROBES: Record<SufficiencyDimensionKey, string> = {
    actor: "Which specific team, role, or system performs this step?",
    action: "Walk me through exactly what is checked, calculated, or recorded — verb by verb.",
    input: "What document, event, or data triggers this step, and where does it come from?",
    output: "What artifact, record, or state-change does this step produce?",
    decisionCriteria: "What thresholds or rules decide which path the work follows here?",
    sla: "What is the expected turnaround time or deadline for this step?",
};

function fallbackAssessment(
    answer: string,
    threshold: number,
    modelId: string,
    errorReason?: string,
): SufficiencyAssessment {
    const obviousVague = isObviouslyVague(answer);
    const score = obviousVague ? 10 : 50;
    const dimensions = emptyDimensions(score, true);
    const summary = summarize(dimensions, threshold);
    return {
        overall: summary.overall,
        passed: obviousVague ? false : summary.passed,
        threshold,
        dimensions,
        missingDimension: obviousVague ? FAST_PATH_DEFAULT_MISSING : summary.missingDimension,
        recommendedProbe: GENERIC_PROBES[obviousVague ? FAST_PATH_DEFAULT_MISSING : (summary.missingDimension ?? 'action')],
        reasoning: errorReason
            ? `Heuristic fallback (${errorReason}). LLM classifier unavailable; treat as unknown sufficiency.`
            : 'Heuristic fallback; LLM classifier was bypassed.',
        classifiedAt: new Date().toISOString(),
        modelId,
        errored: !!errorReason,
        errorReason,
    };
}

/** Build a deterministic short-circuit assessment for obviously vague answers. */
function fastPathVagueAssessment(threshold: number): SufficiencyAssessment {
    const dimensions = emptyDimensions(10, true);
    return {
        overall: 10,
        passed: false,
        threshold,
        dimensions,
        missingDimension: FAST_PATH_DEFAULT_MISSING,
        recommendedProbe: GENERIC_PROBES[FAST_PATH_DEFAULT_MISSING],
        reasoning: 'Answer is empty, single-word, or pure filler. No process detail to extract.',
        classifiedAt: new Date().toISOString(),
        modelId: 'fast-path',
        errored: false,
    };
}

/** Skip classification entirely for non-narrative answer types (single_choice
 *  / multi_choice / scale / yes_no) — these have built-in specificity from
 *  the option set and don't benefit from dimensional probing. */
const NON_NARRATIVE_TYPES = new Set(['single_choice', 'multi_choice', 'scale', 'yes_no']);

export function shouldClassifyAnswer(answerType: string, answer: unknown): boolean {
    if (NON_NARRATIVE_TYPES.has(answerType)) return false;
    if (typeof answer !== 'string') return false;
    return true;
}

/** Main entry point. Returns a SufficiencyAssessment for the given Q&A.
 *  Never throws — failures are encoded in `errored` + `errorReason`. */
export async function classifyAnswer(params: ClassifyAnswerParams): Promise<SufficiencyAssessment> {
    const {
        question,
        answer,
        subAreaName,
        broadAreaName,
        language,
        processCalibration,
        attachmentFilenames,
        threshold = DEFAULT_SUFFICIENCY_THRESHOLD,
        modelId,
    } = params;

    // 1. Fast path — obviously vague answers don't justify an LLM round-trip.
    if (isObviouslyVague(answer)) {
        return fastPathVagueAssessment(threshold);
    }

    // 2. LLM classification.
    const prompt = buildSufficiencyPrompt({
        question,
        answer,
        subAreaName,
        broadAreaName,
        language,
        processCalibration,
        attachmentFilenames,
    });

    const messages: LLMMessage[] = [
        { role: 'user', content: prompt },
    ];

    let raw: { content: string };
    try {
        raw = await generateCompletion(modelId || null, messages, { temperature: 0.1, maxTokens: 800 });
    } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown LLM error';
        console.warn('[sufficiencyClassifier] LLM call failed, returning heuristic fallback:', reason);
        return fallbackAssessment(answer, threshold, modelId || 'unknown', reason);
    }

    const parsed = extractJSON<{
        dimensions?: Record<string, unknown>;
        overall?: number;
        missingDimension?: string;
        recommendedProbe?: string;
        reasoning?: string;
    }>(raw.content);

    if (!parsed || !parsed.dimensions) {
        console.warn('[sufficiencyClassifier] LLM returned unparseable JSON; using fallback. Raw:', raw.content?.slice(0, 200));
        return fallbackAssessment(answer, threshold, modelId || 'unknown', 'LLM returned malformed JSON');
    }

    // Normalize each dimension, defaulting any missing key to a zero score.
    const dimensions = {} as Record<SufficiencyDimensionKey, DimensionScore>;
    for (const key of SUFFICIENCY_DIMENSIONS) {
        dimensions[key] = normalizeDimension((parsed.dimensions as Record<string, unknown>)[key]);
    }

    // Recompute overall + missingDimension deterministically — never trust
    // the LLM's arithmetic, but keep its recommendedProbe and reasoning.
    const summary = summarize(dimensions, threshold);

    const llmMissing = typeof parsed.missingDimension === 'string'
        && SUFFICIENCY_DIMENSIONS.includes(parsed.missingDimension as SufficiencyDimensionKey)
        ? (parsed.missingDimension as SufficiencyDimensionKey)
        : null;

    // Prefer LLM's choice when it agrees the answer failed; otherwise use
    // the deterministic lowest-score dimension. If both classifier and our
    // summary agree the answer passed, missingDimension is null.
    const missingDimension = summary.passed
        ? null
        : (llmMissing ?? summary.missingDimension);

    const recommendedProbe = (typeof parsed.recommendedProbe === 'string' && parsed.recommendedProbe.trim())
        ? parsed.recommendedProbe.trim().slice(0, 400)
        : (missingDimension ? GENERIC_PROBES[missingDimension] : '');

    return {
        overall: summary.overall,
        passed: summary.passed,
        threshold,
        dimensions,
        missingDimension,
        recommendedProbe,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 400) : '',
        classifiedAt: new Date().toISOString(),
        modelId: modelId || 'default',
        errored: false,
    };
}

/** Roll up a list of past assessments into a per-sub-area summary used for
 *  coverage badges, reports, and the readiness score. */
export interface SufficiencyAggregate {
    avgScore: number;          // 0–100, average of `overall` across applicable assessments.
    passedCount: number;        // How many answers passed the threshold.
    classifiedCount: number;    // How many answers were classified (excludes errored/skipped).
    answeredCount: number;      // Total answers including non-classified ones.
    dimensionsCovered: SufficiencyDimensionKey[]; // Dimensions that scored ≥ 70 in at least one answer.
    weakestDimension: SufficiencyDimensionKey | null; // Dimension with the lowest aggregate score across all answers.
}

export function aggregateSufficiency(assessments: Array<SufficiencyAssessment | undefined>): SufficiencyAggregate {
    const real = assessments.filter((a): a is SufficiencyAssessment => !!a && !a.errored);
    const dimSums: Record<SufficiencyDimensionKey, { sum: number; n: number }> = {
        actor: { sum: 0, n: 0 },
        action: { sum: 0, n: 0 },
        input: { sum: 0, n: 0 },
        output: { sum: 0, n: 0 },
        decisionCriteria: { sum: 0, n: 0 },
        sla: { sum: 0, n: 0 },
    };
    const covered = new Set<SufficiencyDimensionKey>();

    let overallSum = 0;
    let passedCount = 0;
    for (const a of real) {
        overallSum += a.overall;
        if (a.passed) passedCount++;
        for (const key of SUFFICIENCY_DIMENSIONS) {
            const d = a.dimensions[key];
            if (d && d.applicable && typeof d.score === 'number') {
                dimSums[key].sum += d.score;
                dimSums[key].n += 1;
                if (d.score >= 70) covered.add(key);
            }
        }
    }

    const avgScore = real.length > 0 ? Math.round(overallSum / real.length) : 0;

    let weakest: SufficiencyDimensionKey | null = null;
    let weakestScore = Infinity;
    for (const key of SUFFICIENCY_DIMENSIONS) {
        const { sum, n } = dimSums[key];
        if (n === 0) continue;
        const avg = sum / n;
        if (avg < weakestScore) {
            weakestScore = avg;
            weakest = key;
        }
    }

    return {
        avgScore,
        passedCount,
        classifiedCount: real.length,
        answeredCount: assessments.length,
        dimensionsCovered: Array.from(covered),
        weakestDimension: weakest,
    };
}
