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

  return `You are a banking process architect creating an AS-IS (current state) BPMN process model for "${processName}".

## RAW PROCESS STEPS (from SME interviews)
${stepsBlock}

Transform these raw steps into a structured BPMN process model with:
1. Swimlanes - assign each step to one of: "Customer", "Branch Staff", "Back Office", "System/IT", "Compliance/Risk"
2. Short labels - each step label MUST be 2-4 words maximum (e.g. "Submit Application", "KYC Check", "Approve Loan")
3. Task types - classify each as: "userTask" (human), "serviceTask" (automated), or "manualTask" (manual/paper)
4. Decision gateways - add exclusiveGateway nodes for natural Yes/No decision points
5. Duration - estimate durationDays per step based on typical Saudi banking operations

CRITICAL RULES:
- Labels MUST be 2-4 words ONLY, no longer
- Add 1-3 gateways at natural decision points (approvals, escalations)
- Keep total node count between 8 and 14 (including gateways, start, end)
- Every gateway must have exactly 2 exit flows with Yes/No labels
- All nodes must be connected (no orphans)

Return ONLY valid JSON, no markdown, no explanation:
{"lanes":[{"id":"customer","name":"Customer","color":"#dbeafe"},{"id":"branch","name":"Branch Staff","color":"#dcfce7"},{"id":"backoffice","name":"Back Office","color":"#fef9c3"},{"id":"system","name":"System / IT","color":"#f3e8ff"}],"nodes":[{"id":"start","type":"startEvent","label":"Start","lane":"customer"},{"id":"n1","type":"userTask","label":"Submit Request","lane":"customer","durationDays":1},{"id":"gw1","type":"exclusiveGateway","label":"Docs Complete?","lane":"branch"},{"id":"n2","type":"userTask","label":"Gather Documents","lane":"branch","durationDays":2},{"id":"n3","type":"serviceTask","label":"KYC Screening","lane":"system","durationDays":0},{"id":"end","type":"endEvent","label":"End","lane":"backoffice"}],"flows":[{"id":"f1","from":"start","to":"n1"},{"id":"f2","from":"n1","to":"gw1"},{"id":"f3","from":"gw1","to":"n2","label":"No"},{"id":"f4","from":"gw1","to":"n3","label":"Yes"},{"id":"f5","from":"n2","to":"n3"},{"id":"f6","from":"n3","to":"end"}]}`;
}
