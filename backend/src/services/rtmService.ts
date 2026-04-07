import { getInterviewSession } from './interviewService';
import { generateCompletion, LLMMessage } from './llmService';
import { getActiveDomainConfig, getSubArea } from './domainService';
import { LanguageCode } from './languageService';

export interface RTMRequirement {
  l1: string;
  l2: string;
  l3Requirement: string;
  l3Category: string;
  priority: string;
  notes: string;
  requirementType: string;
  acceptanceCriteria: string;
  effortEstimate: string;
  sourceEvidence: string;
}

export async function generateRTM(sessionId: string, modelId?: string): Promise<RTMRequirement[]> {
    const session = await getInterviewSession(sessionId);
    if (!session) {
        throw new Error('Interview session not found');
    }

    const domainConfig = getActiveDomainConfig();
    const categoryEntries = Object.entries(session.responses || {}).filter(([, a]) => a.length > 0);
    
    if (categoryEntries.length === 0) {
         throw new Error('No interview data available to build RTM.');
    }

    const qaSummaries = categoryEntries.map(([areaId, answers]) => {
        const subArea = getSubArea(areaId);
        const areaName = subArea?.name || areaId;
        const qa = answers.map((a, i) => `  ${i + 1}. Q: ${a.question}\n     A: ${Array.isArray(a.answer) ? a.answer.join(', ') : a.answer}`).join('\n');
        return `### ${areaName} (${areaId})\n${qa}`;
    }).join('\n\n');

    const sessionLang = (session.language as LanguageCode) ?? 'en';
    const langConfig = sessionLang !== 'en' ? (await import('./languageService')).SUPPORTED_LANGUAGES[sessionLang] : null;

    const langInstructions = langConfig
        ? `\n## OUTPUT LANGUAGE REQUIREMENT — CRITICAL
The interview transcript below may be in a non-English language (or mixed). 
Regardless of the input language, you MUST generate the ENTIRE RTM in **${langConfig.name}** (${langConfig.nativeName}).
- ALL JSON string VALUES (l1, l2, l3Requirement, notes, acceptanceCriteria, sourceEvidence, etc.) MUST be in **${langConfig.name}**.
- Keep ALL JSON keys exactly as specified in the schema (English keys).
- Enum values (l3Category, priority, requirementType, effortEstimate) MUST use the exact English values from the schema.
- If the input text is in a different language, TRANSLATE it into ${langConfig.name} while generating the requirements.\n`
        : '';

    const prompt = `You are an expert ${domainConfig.name} business analyst and ERP solutions architect with extensive experience in writing formal Requirements Traceability Matrices (RTMs) for enterprise transformation programmes.
${langInstructions}
## INTERVIEW TRANSCRIPT
${qaSummaries}

## YOUR TASK
Review the interview transcript above and generate a comprehensive, formal Requirements Traceability Matrix (RTM).

### REQUIREMENTS TO EXTRACT
Extract BOTH:
1. **Explicit requirements**: Direct requests, stated needs, and specific process changes mentioned
2. **Implicit requirements**: Process needs inferred from pain points, inefficiencies, manual workarounds, and gaps described

### CLASSIFICATION
For each requirement, classify it as one of:
- **Functional**: Business process requirements (e.g., "automated invoice matching")
- **Non-Functional**: Performance, security, scalability, usability requirements
- **Integration**: System-to-system interfaces, API needs, data migration
- **Configuration**: System settings, workflow rules, approval hierarchies
- **Reporting**: Dashboard, report, analytics, and BI requirements
- **Compliance**: Regulatory, audit, and control requirements

### OUTPUT SCHEMA
For each requirement, provide ALL of the following fields:

| Field | Description |
|-------|-------------|
| l1 | High-level process area (e.g., "Procure-to-Pay", "Order-to-Cash", "Record-to-Report", "Treasury & Cash Management", "Compliance & Controls") |
| l2 | Sub-process area (e.g., "Invoice Processing", "PO Management", "Bank Reconciliation") |
| l3Requirement | The specific requirement in clear, testable business terms. Must be detailed enough for a developer to implement. (e.g., "The system must automatically route invoices above $10,000 to the regional controller for approval within the AP module") |
| l3Category | Standard | Custom | Configuration | Integration |
| priority | Critical | High | Medium | Low |
| notes | Context, rationale, or constraints extracted from the interview transcript |
| requirementType | Functional | Non-Functional | Integration | Configuration | Reporting | Compliance |
| acceptanceCriteria | How to verify this requirement is met (e.g., "Invoice is auto-routed within 5 seconds of receipt; routing rule is configurable by threshold amount") |
| effortEstimate | S (1-2 weeks) | M (2-4 weeks) | L (1-3 months) | XL (3+ months) |
| sourceEvidence | Which specific Q&A from the transcript supports this requirement |

### QUALITY STANDARDS
- Generate at least 15-25 requirements for a typical assessment
- Requirements must be specific, measurable, and testable — avoid vague statements
- Each requirement should trace back to a specific interview answer
- Include a mix of all requirement types and priorities
- Group requirements logically by L1 process area
- Acceptance criteria must be concrete and verifiable

Output ONLY valid JSON — an array of requirement objects:
[
  {
    "l1": "Procure-to-Pay",
    "l2": "Invoice Processing",
    "l3Requirement": "The system must support automated 3-way matching (PO, goods receipt, invoice) with configurable tolerance thresholds and exception routing for mismatches",
    "l3Category": "Standard",
    "priority": "Critical",
    "notes": "Currently manual matching causes 3-day delays per interview response",
    "requirementType": "Functional",
    "acceptanceCriteria": "Auto-match rate exceeds 80%; mismatches are routed to AP clerk within 1 hour; tolerance thresholds are configurable per vendor category",
    "effortEstimate": "M",
    "sourceEvidence": "Q: How do you currently match invoices? A: Manual matching in spreadsheets"
  }
]`;

    const messages: LLMMessage[] = [
        { role: 'system', content: `You are a senior ERP business analyst specialising in requirements engineering for enterprise transformation programmes. Generate precise, testable, implementation-ready requirements based on interview evidence.\n\nCRITICAL: Output ONLY a valid JSON array — no markdown code fences, no explanation text, no commentary. The response must start with [ and end with ]. All JSON keys must be exactly as specified in the schema (in English). Enum values (l3Category, priority, requirementType, effortEstimate) must use the exact English values from the schema.` },
        { role: 'user', content: prompt }
    ];

    const completion = await generateCompletion(modelId || null, messages, { temperature: 0.2, maxTokens: 8000 });

    try {
        // Strip markdown code fences if present
        let cleaned = completion.content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('RTM parse error. Raw LLM output (first 500 chars):', completion.content.substring(0, 500));
        throw new Error('Failed to parse LLM RTM generation output');
    }
}
