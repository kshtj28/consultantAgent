/**
 * Prompts for multi-SME process consolidation. Each SME's interview transcript is
 * turned into an ordered list of process steps; conflicting versions of the same
 * step are merged via the LLM with a senior-weighted rationale.
 */

export interface ExtractedStep {
  order: number;
  label: string;
  description: string;
  quote: string;
}

export function buildStepExtractionPrompt(transcript: string, smeRole: string, processName: string): string {
  return `You are extracting process steps for "${processName}" from a subject-matter expert's (SME) interview transcript. The transcript is in Q&A format — interview questions followed by the SME's answers.

## SME ROLE
${smeRole}

## TRANSCRIPT
${transcript}

## YOUR TASK
Read every answer carefully. The SME's answers describe how they and their team do their work. Infer the business process steps from what they describe — look for:
- Verbs like "we do", "I check", "the system sends", "approval happens", "we submit"
- Sequential activities ("first we..., then..., after that...")
- Department handoffs, system interactions, and decisions
- Anything described as a regular part of how work gets done

Even if the interview was a knowledge assessment (not an explicit process walkthrough), the answers contain implicit process information. Extract that.

For every step you identify, output:
- "order"        — sequential index starting at 1 (infer sequence from context)
- "label"        — concise step name (≤120 chars)
- "description"  — one short sentence (≤200 chars) describing what happens, in the SME's own framing
- "quote"        — a relevant phrase or sentence from the transcript (≤180 chars) that supports this step

Return ONLY valid JSON in this exact shape, with no surrounding prose, no markdown fences, no comments:

{
  "steps": [
    { "order": 1, "label": "...", "description": "...", "quote": "..." }
  ]
}

If the transcript contains no work-related activities at all, return {"steps": []}.`;
}

export interface ConflictResolutionInput {
  stepLabel: string;
  versions: Array<{
    smeName: string;
    role: string;
    seniority: 'junior' | 'mid' | 'senior';
    weight: number;
    description: string;
    quote: string;
  }>;
}

export function buildConflictResolutionPrompt(input: ConflictResolutionInput): string {
  const versionsBlock = input.versions
    .map(
      (v, i) => `### Version ${i + 1} — ${v.smeName} (${v.role}, ${v.seniority}, weight ${v.weight}×)
Description: ${v.description}
Quote: "${v.quote}"`
    )
    .join('\n\n');

  return `You are reconciling divergent SME accounts of the same process step into a single canonical description.

## STEP UNDER REVIEW
${input.stepLabel}

## SME VERSIONS
${versionsBlock}

## YOUR TASK
Produce the canonical version of this step that best reflects how the process actually runs today, weighted by SME seniority (senior > mid > junior). When seniors disagree with juniors, prefer the senior account but call out the divergence in the rationale.

Return ONLY valid JSON in this exact shape, no prose, no markdown fences:

{
  "proposed":  "<≤220 char canonical description of the step as the process actually runs>",
  "rationale": "<≤320 char explanation of how the seniors' accounts shape the canonical version and what the junior(s) seem to represent — onboarding gap, exception path, etc.>"
}`;
}
