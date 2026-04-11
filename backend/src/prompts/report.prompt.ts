export function buildReadinessReportPrompt(answerContext: string, identifiedGaps: string, painPoints: string, opportunities: string, erpPath?: string): string {
  const targetSystem = erpPath ? (erpPath.split('→').pop()?.trim() ?? erpPath) : null;
  const erpStandards = erpPath ? getErpStandardsList(erpPath) : `   - APQC PCF for process benchmarks
   - SAP Best Practice for ERP-specific gaps
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps`;

  const erpContext = erpPath
    ? `\nERP Migration Path: ${erpPath}\nIMPORTANT: This client is migrating to ${targetSystem}. Assess readiness specifically for ${targetSystem} adoption — score each area based on how prepared the client is to move to ${targetSystem} standard processes. Reference ${targetSystem}-specific capabilities when describing target state and recommendations.`
    : '';

  return `You are a senior management consultant producing an ERP readiness assessment report for a client.

## INTERVIEW DATA
${answerContext}

## ADDITIONAL CONTEXT
Identified Gaps: ${identifiedGaps || 'None explicitly flagged'}
Pain Points: ${painPoints || 'None explicitly flagged'}
Transformation Opportunities: ${opportunities || 'None explicitly flagged'}${erpContext}

## YOUR TASK
Generate a comprehensive readiness assessment. For EACH area covered in the interview data:

1. **Score (0-100)** based on:
   - Automation level (manual=10-30, semi-automated=40-60, fully automated=70-90, AI-driven=90-100)
   - Process efficiency (cycle times, error rates, FTE utilisation)
   - Best practice alignment against these standards:
${erpStandards}
   - Control and compliance maturity${targetSystem ? `\n   - Fit-to-standard readiness for ${targetSystem} out-of-the-box processes` : ''}

2. **Strengths (2-3)**: Specific things the organisation does well — reference actual interview answers
3. **Weaknesses (2-3)**: Specific gaps or inefficiencies — reference actual interview answers
4. **Recommendations (2-3)**: Actionable, specific recommendations with expected outcomes (e.g., "Implement automated 3-way matching to reduce invoice processing time by 60% and free up 1.5 FTEs")

## EXECUTIVE SUMMARY REQUIREMENTS
Write a 4-6 sentence executive summary that:
- States the overall readiness level (e.g., "The organisation is at a Developing maturity level")
- Highlights the top 2-3 strengths
- Identifies the most critical gaps
- Provides a clear recommendation on next steps

## KEY FINDINGS
Provide 5-8 specific, evidence-based findings. Each finding should be a concise statement that references specific process areas and their maturity level.

## PRIORITY RECOMMENDATIONS
Provide 5-8 prioritised recommendations, ordered by impact. Each should specify:
- What to do
- Expected benefit (quantified where possible)
- Effort level (low/medium/high)
- Timeline (quick win / medium-term / long-term)

Return JSON:
{
  "areas": [
    {
      "areaId": "area_id_from_interview_data",
      "score": 65,
      "strengths": ["Specific strength referencing interview data"],
      "weaknesses": ["Specific weakness referencing interview data"],
      "recommendations": ["Specific recommendation with expected outcome"]
    }
  ],
  "executiveSummary": "4-6 sentence comprehensive summary",
  "keyFindings": ["Evidence-based finding 1", "Evidence-based finding 2", "...up to 8 findings"],
  "priorityRecommendations": ["Recommendation with quantified benefit and timeline", "...up to 8 recommendations"]
}`;
}

export function getErpStandardsList(erpPath: string): string {
  const target = erpPath.split('→').pop()?.trim().toLowerCase() ?? erpPath.toLowerCase();

  if (target.includes('s/4hana') || target.includes('s4hana')) {
    return `   - SAP S/4HANA Best Practice for ERP-specific gaps (use this as the PRIMARY standard)
   - SAP Activate Methodology for implementation gaps
   - APQC PCF (Process Classification Framework) for process benchmarks
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps
   - COSO Framework for internal controls`;
  }
  if (target.includes('d365') || target.includes('dynamics 365') || target.includes('dynamics365')) {
    return `   - Microsoft Dynamics 365 Finance Best Practice for ERP-specific gaps (use this as the PRIMARY standard)
   - Microsoft Sure Step Methodology for implementation gaps
   - Microsoft FastTrack for D365 deployment standards
   - APQC PCF (Process Classification Framework) for process benchmarks
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps
   - COSO Framework for internal controls`;
  }
  if (target.includes('oracle') || target.includes('fusion') || target.includes('ebs')) {
    return `   - Oracle Cloud ERP Best Practice for ERP-specific gaps (use this as the PRIMARY standard)
   - Oracle Unified Method (OUM) for implementation gaps
   - APQC PCF (Process Classification Framework) for process benchmarks
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps
   - COSO Framework for internal controls`;
  }
  if (target.includes('workday')) {
    return `   - Workday Finance Best Practice for ERP-specific gaps (use this as the PRIMARY standard)
   - Workday Deployment Methodology for implementation gaps
   - APQC PCF (Process Classification Framework) for process benchmarks
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps`;
  }
  // Generic fallback
  return `   - APQC PCF (Process Classification Framework) for process benchmarks
   - ${erpPath} Best Practice for ERP-specific gaps (use this as the PRIMARY standard for ERP gaps)
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps
   - COSO Framework for internal controls`;
}

export function buildGapReportPrompt(answerContext: string, identifiedGaps: string, painPoints: string, erpPath?: string): string {
  const targetSystem = erpPath ? (erpPath.split('→').pop()?.trim() ?? erpPath) : null;

  const erpContext = erpPath
    ? `\nERP Migration Path: ${erpPath}\nIMPORTANT: This client is migrating to ${targetSystem}. All gap assessments MUST be benchmarked against ${targetSystem} standard capabilities and best practices. In the Standard/Framework field, reference ${targetSystem}-specific standards (not SAP unless ${targetSystem} is SAP). Gaps that represent deviations from ${targetSystem} standard processes should be flagged as high priority.`
    : '';

  return `You are a senior management consultant at a Big 4 firm producing a gap analysis report for a client's finance transformation engagement.

## INTERVIEW DATA
${answerContext}

## ADDITIONAL CONTEXT
Previously Identified Gaps: ${identifiedGaps || 'None explicitly flagged'}
Pain Points: ${painPoints || 'None explicitly flagged'}${erpContext}

## YOUR TASK
Generate a comprehensive, consultant-grade gap analysis. This report will be used by the client's leadership to prioritise transformation investments.

### GAP IDENTIFICATION REQUIREMENTS
Identify at least 8-12 gaps across these categories:
- **Process**: Inefficiencies, manual steps, bottlenecks, missing workflows
- **Technology**: Missing systems, outdated tools, integration gaps, lack of automation
- **Capability**: Skill gaps, missing expertise, training needs, organisational readiness
- **Data**: Data quality issues, missing master data governance, reporting gaps

For EACH gap, provide:
1. **Current State**: What the client does today (reference specific interview answers)
2. **Target State**: Industry best practice (reference specific standards)
3. **Gap Description**: Clear, specific description of the gap
4. **Impact**: high/medium/low with quantified estimate (e.g., "adds 3-5 days to month-end close", "requires 2 additional FTEs", "~$50K annual cost of manual processing")
5. **Effort**: high/medium/low
6. **Fit Assessment**: gap (major gap), partial (some alignment), fit (already meets standard)
7. **Standard/Framework**: Which best practice standard the gap is measured against:
${erpPath ? getErpStandardsList(erpPath) : `   - APQC PCF (Process Classification Framework) for process benchmarks
   - SAP S/4HANA Best Practice for ERP-specific gaps
   - COBIT 2019 for IT governance gaps
   - IFRS/GAAP for financial reporting gaps
   - ISO 27001 for security/compliance gaps
   - COSO Framework for internal controls`}
8. **Process Area**: Which end-to-end process this gap belongs to (e.g., "Order to Cash", "Procure to Pay", "Record to Report")
9. **impactScore**: 1-10 numeric (for impact-effort bubble chart)
10. **effortScore**: 1-10 numeric (for impact-effort bubble chart)

### EXECUTIVE SUMMARY
Write a 4-6 sentence executive summary that:
- States the number of gaps identified and their severity distribution
- Highlights the most critical gaps requiring immediate attention
- Identifies quick wins that can deliver early value
- Provides a clear transformation thesis

### ROADMAP
Provide a 3-phase implementation roadmap:
- **Phase 1 (0-3 months)**: Quick wins and foundations — include specific deliverables and expected ROI
- **Phase 2 (3-6 months)**: Core transformation — include specific deliverables and expected ROI
- **Phase 3 (6-12 months)**: Optimisation and advanced capabilities — include specific deliverables and expected ROI

### RISK ASSESSMENT
Provide 4-6 risks covering:
- Change management and user adoption
- Technology/integration risks
- Resource and skill availability
- Timeline and budget risks
- Data migration and quality risks

### KPI BENCHMARKING
For each major process area covered, provide:
- Current estimated score (0-100)
- Industry benchmark score (typically 70-85)

Return JSON:
{
  "executiveSummary": "4-6 sentence summary",
  "gaps": [
    {
      "id": "gap_1",
      "category": "process",
      "area": "Order to Cash",
      "currentState": "Current situation from interview",
      "targetState": "Best practice target with framework reference",
      "gap": "Specific gap description",
      "impact": "high",
      "effort": "medium",
      "fit": "gap",
      "standard": "SAP S/4HANA Best Practice",
      "impactScore": 8,
      "effortScore": 5
    }
  ],
  "quickWins": ["gap_1", "gap_3"],
  "roadmap": [
    { "phase": "Phase 1: Quick Wins (0-3 months)", "duration": "3 months", "items": ["deliverable — expected ROI", "deliverable"] },
    { "phase": "Phase 2: Core Transformation (3-6 months)", "duration": "3 months", "items": ["deliverable — expected ROI", "deliverable"] },
    { "phase": "Phase 3: Optimisation (6-12 months)", "duration": "6 months", "items": ["deliverable — expected ROI", "deliverable"] }
  ],
  "risks": [
    { "risk": "Risk description", "likelihood": "medium", "impact": "high", "mitigation": "Specific mitigation strategy" }
  ],
  "kpiScores": [
    { "category": "Process Area Name", "score": 45, "benchmark": 80 }
  ]
}`;
}
