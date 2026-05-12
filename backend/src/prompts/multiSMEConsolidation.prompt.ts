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
- "label"        — concise step name (MUST BE ≤5 WORDS)
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

/**
 * Prompt for transforming raw consolidated process steps into a structured
 * swimlane model with short labels, decision gateways, and role assignments.
 * Used to generate the AS-IS BPMN diagram.
 */
export function buildAsIsModelPrompt(processName: string, steps: Array<{ label: string; description: string }>): string {
  const stepsBlock = steps.map((s, i) => `${i + 1}. ${s.label}: ${s.description}`).join('\n');

  return `You are a senior banking process architect. Your task is to transform raw SME interview steps into a structured, high-fidelity BPMN 2.0 process model for "${processName}".
    
## RAW PROCESS DATA
${stepsBlock}

## MANDATORY ARCHITECTURAL RULES
1. SWIMLANES: Assign every node to exactly one of these lanes: "Customer", "Branch Staff", "Back Office", "System/IT", "Compliance/Risk".
2. ULTRA-SHORT LABELS: Every task and gateway label MUST be 2-4 words maximum. (e.g., "Submit Application", NOT "The customer submits their application through the digital portal").
3. TASK TYPES: Use "userTask" for human actions, "serviceTask" for automated system actions, and "manualTask" for offline/paper actions.
4. GATEWAYS: Identify natural decision points (Approvals, KYC checks, Eligibility checks) and insert "exclusiveGateway" nodes.
5. FLOWS: Every gateway MUST have exactly two outgoing flows labeled "Yes" and "No".
6. DURATION: Estimate "durationDays" for each task based on typical banking SLA (0 for automated, 1-3 for manual).
7. COMPLEXITY: Aim for a clear, professional flow with 8-14 total nodes.

Return ONLY a valid JSON object following this schema:
{
  "lanes": [{ "id": "string", "name": "string", "color": "hex" }],
  "nodes": [{ "id": "string", "type": "startEvent|endEvent|userTask|serviceTask|manualTask|exclusiveGateway", "label": "2-4 words", "lane": "laneId", "durationDays": number }],
  "flows": [{ "id": "string", "from": "nodeId", "to": "nodeId", "label": "Yes|No|optional" }]
}
`;
}

/**
 * Prompt for reimagining an AS-IS process as a high-efficiency, AI-driven TO-BE process.
 * Focuses on replacing manual steps with AI agents and service tasks.
 */
export function buildToBeModelPrompt(processName: string, asIsSteps: Array<{ label: string; description: string }>): string {
  const stepsBlock = asIsSteps.map((s, i) => `${i + 1}. ${s.label}: ${s.description}`).join('\n');

  return `You are a senior Strategy and AI Transformation Architect. Your task is to reimagine the AS-IS process for "${processName}" as a high-efficiency, AI-first TO-BE target state.

## AS-IS PROCESS DATA
${stepsBlock}

## TO-BE TRANSFORMATION GOALS
1. AI ADOPTION: Replace manual data entry, validation, and routine document review with "AI Agents" (serviceTasks).
2. STEP ELIMINATION: Remove redundant handoffs and administrative bottlenecks.
3. SWIMLANES: Use lanes: "Customer", "AI Agent", "Analyst/Manager", "System/IT", "Compliance".
4. ULTRA-SHORT LABELS: Use 2-4 word labels only. (e.g., "AI Validates Data").
5. DURATION: Significantly reduce durationDays for automated tasks (should be 0 or <0.1).

Return ONLY a valid JSON object following this schema:
{
  "lanes": [{ "id": "string", "name": "string", "color": "hex" }],
  "nodes": [{ "id": "string", "type": "startEvent|endEvent|userTask|serviceTask|manualTask|exclusiveGateway", "label": "2-4 words", "lane": "laneId", "durationDays": number }],
  "flows": [{ "id": "string", "from": "nodeId", "to": "nodeId", "label": "Yes|No|optional" }]
}
`;
}

/**
 * Prompt for analyzing gaps and estimating savings between AS-IS and TO-BE states.
 */
export function buildProcessAnalysisPrompt(processName: string, asIsModel: any, toBeModel: any): string {
  return `Compare these two BPMN models for "${processName}" and identify critical issues and quantified benefits.

AS-IS MODEL: ${JSON.stringify(asIsModel)}
TO-BE MODEL: ${JSON.stringify(toBeModel)}

Identify 4-6 critical issues in the AS-IS process and estimate savings (Time, Cost, Efficiency) for the TO-BE state.

Return ONLY valid JSON:
{
  "issues": [
    { "id": "string", "title": "string", "description": "string", "severity": "high|medium|low", "category": "efficiency|cost|risk|automation", "impact": "string" }
  ],
  "metrics": {
    "timeSavings": { "asis": "string", "tobe": "string", "reduction": "string", "detail": "string" },
    "costReduction": { "percentage": "string", "detail": "string" },
    "efficiencyGain": { "percentage": "string", "detail": "string" },
    "automationRate": { "asis": "string", "tobe": "string", "detail": "string" }
  }
}`;
}

