export function buildGapAnalysisPrompt(
    focusArea: string,
    analysisContext: string,
    documentContext: string,
    entityContext: string = ''
): string {
    return `Based on the following documents and context, generate a comprehensive gap analysis report.

Focus Area: ${focusArea}
Additional Context: ${analysisContext}

Document Excerpts:
${documentContext}

${entityContext ? `Related Entities:\n${entityContext}\n` : ''}
Generate a detailed gap analysis report in the following JSON format:
{
  "executiveSummary": "Brief overview of findings",
  "currentStateAssessment": {
    "processInventory": ["list of identified processes"],
    "painPoints": ["list of pain points"],
    "stakeholderImpact": ["impacts on stakeholders"]
  },
  "gapIdentification": {
    "processGaps": [{"gap": "description", "impact": "high|medium|low", "description": "details"}],
    "technologyGaps": [{"gap": "description", "impact": "high|medium|low", "description": "details"}],
    "capabilityGaps": [{"gap": "description", "impact": "high|medium|low", "description": "details"}]
  },
  "recommendations": [{
    "title": "recommendation title",
    "description": "details",
    "automationPotential": true,
    "priority": "high|medium|low",
    "estimatedEffort": "estimate"
  }],
  "implementationRoadmap": {
    "quickWins": [{"task": "task", "duration": "time", "dependencies": [], "owner": "role"}],
    "mediumTerm": [{"task": "task", "duration": "time", "dependencies": [], "owner": "role"}],
    "longTerm": [{"task": "task", "duration": "time", "dependencies": [], "owner": "role"}]
  },
  "riskAssessment": [{
    "risk": "description",
    "probability": "high|medium|low",
    "impact": "high|medium|low",
    "mitigation": "strategy"
  }]
}

Focus on identifying:
1. Process inefficiencies and manual bottlenecks
2. Automation opportunities (RPA, workflow, integrations)
3. Technology gaps and modernization needs
4. Skill and capability development needs
5. Quick wins vs long-term improvements

IMPORTANT: Output ONLY valid JSON, no other text.`;
}

export function buildProjectPlanPrompt(
    gaps: string[],
    timeline: 'short' | 'medium' | 'long'
): string {
    const timelineDescriptions = {
        short: '0-3 months',
        medium: '3-6 months',
        long: '6-12 months',
    };

    return `Create a detailed project implementation plan to address the following gaps:

Gaps to Address:
${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Timeline Preference: ${timelineDescriptions[timeline]}

Generate a project plan in the following JSON format:
{
  "projectName": "Project name",
  "objective": "Main objective",
  "scope": ["scope item 1", "scope item 2"],
  "phases": [{
    "name": "Phase name",
    "duration": "X weeks/months",
    "tasks": ["task 1", "task 2"],
    "deliverables": ["deliverable 1"],
    "milestones": ["milestone 1"]
  }],
  "resourceRequirements": ["resource 1", "resource 2"],
  "successCriteria": ["criteria 1", "criteria 2"],
  "timeline": "Total timeline"
}

Include:
1. Clear phased approach
2. Specific tasks and deliverables
3. Resource requirements
4. Success criteria
5. Realistic timelines

IMPORTANT: Output ONLY valid JSON, no other text.`;
}

export function buildAutomationPrompt(
    processDescription: string,
    context: string
): string {
    return `Analyze the following process descriptions and identify automation opportunities:

Process Context:
${context}

Specific Process:
${processDescription}

Identify automation opportunities and return as JSON array:
[{
  "title": "Automation opportunity title",
  "description": "Detailed description of what can be automated",
  "automationPotential": true,
  "priority": "high|medium|low",
  "estimatedEffort": "Development effort estimate"
}]

Consider these automation types:
1. RPA (Robotic Process Automation) - for repetitive, rule-based tasks
2. Workflow Automation - for approval flows and routing
3. Integration Automation - for data transfer between systems
4. Document Processing - for OCR and document handling
5. Reporting Automation - for scheduled reports and dashboards

IMPORTANT: Output ONLY valid JSON array, no other text.`;
}
