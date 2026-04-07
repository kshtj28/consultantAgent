/**
 * Interview Agent Prompts
 *
 * Contains all prompt-building functions and system prompts for the Mastra interview agent.
 */

export function buildCategoryAnalysisPrompt(
    categoryName: string,
    categoryDescription: string,
    conversationHistory: string,
    knowledgeContext: string
): string {
    return `You are analysing a discovery interview session for the "${categoryName}" category.

Category scope: ${categoryDescription}

## Conversation so far in this category
${conversationHistory || 'No conversation yet — this is the first question for this category.'}

## Relevant domain knowledge from uploaded documents
${knowledgeContext || 'No uploaded documents available.'}

Analyse the conversation and identify:
1. Topics already covered (be specific — list exact subjects discussed)
2. Topics still missing that are important for "${categoryName}"
3. Any answers that were vague and may need follow-up
4. The overall depth of information gathered so far

Respond in JSON:
{
  "coveredTopics": ["topic1", "topic2"],
  "remainingTopics": ["topic3", "topic4"],
  "vagueAnswers": ["description of vague answer if any"],
  "depthAssessment": "shallow | moderate | comprehensive",
  "recommendedFocus": "What to ask next and why"
}`;
}

export function buildNextQuestionPrompt(
    categoryName: string,
    coveredTopics: string[],
    remainingTopics: string[],
    context: string
): string {
    const coveredList = coveredTopics.length > 0
        ? coveredTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : 'None yet';

    const remainingList = remainingTopics.length > 0
        ? remainingTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : 'All key topics appear to be covered';

    return `Generate the next interview question for the "${categoryName}" category.

## Already covered topics (DO NOT ask about these again):
${coveredList}

## Topics still to explore (prioritise from this list):
${remainingList}

## Additional context
${context || 'No additional context.'}

Respond ONLY with valid JSON:
{
  "question": "The interview question text",
  "type": "single_choice | multi_choice | scale | open_ended | yes_no",
  "options": ["option1", "option2"],
  "reasoning": "Why this question is the most valuable next question",
  "topicsCovered": ["The topic(s) this question addresses"]
}`;
}

export function buildCategoryCompletionPrompt(
    categoryName: string,
    answers: string
): string {
    return `Evaluate whether the "${categoryName}" interview category has been sufficiently covered.

## Answers collected so far:
${answers || 'No answers collected yet.'}

Assess the coverage and respond ONLY with valid JSON:
{
  "isComplete": true | false,
  "completionReason": "Explanation",
  "coverageScore": 0-100,
  "missedTopics": ["topic1", "topic2"]
}`;
}

export const INTERVIEW_AGENT_SYSTEM_PROMPT = `You are an expert financial process interviewer working as part of a consulting engagement.

## Your Role
You conduct structured discovery interviews with finance professionals to understand their current processes, identify inefficiencies, and uncover automation opportunities across:
- Company Overview, Order to Cash, Accounts Payable, Accounts Receivable
- General Ledger, Reconciliation, Financial Reporting, Compliance & Controls

## Tool Usage Guide
- **get_category_conversation**: Always call first to retrieve the category conversation history
- **search_domain_knowledge**: Find relevant context from uploaded company documents
- **evaluate_category_completion**: Determine if enough information has been collected
- **generate_next_question**: Produce the next most relevant question

## Quality Standards
- Questions must be specific, not generic
- Stay within category scope
- Never repeat questions already asked`;
