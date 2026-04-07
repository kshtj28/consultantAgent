import { getSubArea, getBroadAreaForSubArea, getBroadArea, SubArea, getActiveDomainConfig, getDomainArea } from './domainService';
import { getLanguageInstructions } from './languageService';
import { searchKnowledgeBase } from './knowledgeBase';
import { generateCompletion, LLMMessage } from './llmService';
import { v4 as uuidv4 } from 'uuid';
// Legacy types kept for backward-compat with deprecated functions below
import { getReadinessSession } from './readinessSessionService';

// Build context from session and documents
async function buildContext(session: any, areaId: string): Promise<{
    previousAnswers: string;
    documentContext: string;
    identifiedGaps: string;
}> {
    const area = getDomainArea(areaId);
    const areaResponses = session.responses[areaId] || [];

    const previousAnswers = areaResponses
        .map((qa: any) => `Q: ${qa.question}\nA: ${JSON.stringify(qa.answer)}`)
        .join('\n\n');

    let documentContext = '';
    try {
        const areaName = area?.name ?? areaId;
        const docs = await searchKnowledgeBase(`${areaName} process workflow`, 5);
        documentContext = docs.map(d => d.content).join('\n\n---\n\n');
    } catch (error) {
        console.warn('Could not retrieve document context:', error);
    }

    const identifiedGaps = session.conversationContext.identifiedGaps.join(', ') || 'None identified yet';

    return { previousAnswers, documentContext, identifiedGaps };
}

// Determine question mode based on context
function determineQuestionMode(
    questionsAnswered: number,
    lastAnswer: string | undefined,
    hasGaps: boolean
): string {
    if (questionsAnswered === 0) return 'foundation';
    if (questionsAnswered < 3) return 'foundation';
    if (hasGaps) return 'transformation';
    if (lastAnswer && lastAnswer.length < 50) return 'probing';
    if (questionsAnswered >= 5) return 'benchmark';
    return 'discovery';
}

/** @deprecated Use interviewService.generateNextInterviewQuestion instead */
export async function generateNextQuestion(
    sessionId: string,
    areaId?: string,
    modelId?: string
): Promise<any> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    const targetArea = areaId || session.currentArea;
    if (!targetArea) throw new Error('No area selected');

    const area = getDomainArea(targetArea);
    if (!area) throw new Error(`Unknown area: ${targetArea}`);

    const areaResponses = session.responses[targetArea] || [];
    const questionsAnswered = areaResponses.length;
    const lastAnswer = areaResponses[areaResponses.length - 1]?.answer as string | undefined;
    const hasGaps = session.conversationContext.identifiedGaps.length > 0;

    const mode = determineQuestionMode(questionsAnswered, lastAnswer, hasGaps);
    const context = await buildContext(session, targetArea);

    const languageInstructions = getLanguageInstructions(session.language);

    const systemPrompt = `You are a process consultant conducting a discovery interview for ${area.name}.

${languageInstructions}

Your goal is to understand the organization's current processes and identify transformation opportunities.

Current Mode: ${mode}
- foundation: Establish baseline understanding of current process
- probing: Dig deeper into specific details when answers are vague
- discovery: Explore problems and their root causes
- transformation: Explore improvement and automation opportunities
- validation: Confirm discrepancies between sources
- benchmark: Compare against industry best practices

Previous Q&A in this area:
${context.previousAnswers || 'No previous questions yet.'}

Document context (if available):
${context.documentContext || 'No documents uploaded for this area.'}

Identified gaps so far:
${context.identifiedGaps}

Generate the next interview question that will:
1. Build on what we already know (don't repeat questions)
2. Uncover hidden inefficiencies or manual processes
3. Identify automation/transformation opportunities
4. Assess readiness for modern practices

Return ONLY valid JSON in this exact format:
{
  "question": "The interview question text",
  "type": "single_choice|multi_choice|scale|open_ended|yes_no",
  "options": ["option1", "option2", "option3"],
  "mode": "${mode}",
  "followUpTopics": ["topic1", "topic2"]
}

For 'scale' type, options should be ["1", "2", "3", "4", "5"].
For 'yes_no' type, options should be ["Yes", "No"].
For 'open_ended' type, options should be empty array.`;

    const response = await generateCompletion(modelId || null, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate the next ${mode} question for ${area.name}. Questions answered so far: ${questionsAnswered}` }
    ], { temperature: 0.7 });

    try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            id: uuidv4(),
            question: parsed.question,
            type: parsed.type,
            options: parsed.options || [],
            mode: parsed.mode || mode,
            areaId: targetArea,
            followUpTopics: parsed.followUpTopics || [],
        };
    } catch (error) {
        console.error('Failed to parse question:', error);
        return {
            id: uuidv4(),
            question: `Tell me about your current ${area.name} process — how does it work today?`,
            type: 'open_ended',
            mode: 'foundation',
            areaId: targetArea,
        };
    }
}

/** @deprecated Use interviewService instead */
export async function analyzeAnswer(
    _session: any,
    areaId: string,
    question: string,
    answer: string,
    modelId?: string
): Promise<{
    gaps: string[];
    opportunities: string[];
    painPoints: string[];
}> {
    const area = getDomainArea(areaId);
    const areaName = area?.name ?? areaId;

    const prompt = `Analyze this interview response for a process assessment:

Area: ${areaName}
Question: ${question}
Answer: ${answer}

Identify:
1. Process gaps (inefficiencies, manual work, missing capabilities)
2. Transformation opportunities (automation, modernization potential)
3. Pain points mentioned

Return JSON:
{
  "gaps": ["gap1", "gap2"],
  "opportunities": ["opp1", "opp2"],
  "painPoints": ["pain1", "pain2"]
}`;

    try {
        const response = await generateCompletion(modelId || null, [
            { role: 'user', content: prompt }
        ], { temperature: 0.3 });

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error('Failed to analyze answer:', error);
    }

    return { gaps: [], opportunities: [], painPoints: [] };
}
