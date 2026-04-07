import { searchKnowledgeBase, getRelatedEntities } from './knowledgeBase';
import { generateCompletion, LLMMessage } from './llmService';
import { buildGapAnalysisPrompt, buildProjectPlanPrompt, buildAutomationPrompt } from '../prompts/gapAnalysis.prompt';
import { getLanguageInstructions, isValidLanguage, LanguageCode } from './languageService';
import { extractJSON } from '../utils/jsonUtils';

export interface GapAnalysisReport {
    executiveSummary: string;
    currentStateAssessment: {
        processInventory: string[];
        painPoints: string[];
        stakeholderImpact: string[];
    };
    gapIdentification: {
        processGaps: GapItem[];
        technologyGaps: GapItem[];
        capabilityGaps: GapItem[];
    };
    recommendations: Recommendation[];
    implementationRoadmap: {
        quickWins: RoadmapItem[];
        mediumTerm: RoadmapItem[];
        longTerm: RoadmapItem[];
    };
    riskAssessment: RiskItem[];
}

export interface GapItem {
    gap: string;
    impact: 'high' | 'medium' | 'low';
    description: string;
}

export interface Recommendation {
    title: string;
    description: string;
    automationPotential: boolean;
    priority: 'high' | 'medium' | 'low';
    estimatedEffort: string;
}

export interface RoadmapItem {
    task: string;
    duration: string;
    dependencies: string[];
    owner: string;
}

export interface RiskItem {
    risk: string;
    probability: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
}

export interface ProjectPlan {
    projectName: string;
    objective: string;
    scope: string[];
    phases: ProjectPhase[];
    resourceRequirements: string[];
    successCriteria: string[];
    timeline: string;
}

export interface ProjectPhase {
    name: string;
    duration: string;
    tasks: string[];
    deliverables: string[];
    milestones: string[];
}

// Generate gap analysis report
export async function generateGapAnalysis(
    focusArea: string,
    context: string,
    modelId?: string,
    language?: string
): Promise<GapAnalysisReport> {
    // Search knowledge base for relevant information
    const searchResults = await searchKnowledgeBase(focusArea, 10);
    const relatedEntities = await getRelatedEntities(focusArea);

    const documentContext = searchResults
        .map((r) => r.content)
        .join('\n\n---\n\n');

    const entityContext = relatedEntities
        .map((e) => `${e.type}: ${e.name} - ${e.description || ''}`)
        .join('\n');

    const langCode: LanguageCode = language && isValidLanguage(language) ? language : 'en';
    const languageInstructions = getLanguageInstructions(langCode);
    const prompt = `${languageInstructions}\n\n${buildGapAnalysisPrompt(focusArea, context, documentContext, entityContext)}`;

    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
    const response = await generateCompletion(modelId || null, messages, { temperature: 0.3 });

    // Parse JSON from the response using robust utility
    const content = extractJSON<GapAnalysisReport>(response.content);
    if (!content) {
        throw new Error('Failed to parse gap analysis response (invalid JSON)');
    }
    return content;
}

// Generate project plan
export async function generateProjectPlan(
    gaps: string[],
    timeline: 'short' | 'medium' | 'long',
    modelId?: string,
    language?: string
): Promise<ProjectPlan> {
    const langCode: LanguageCode = language && isValidLanguage(language) ? language : 'en';
    const languageInstructions = getLanguageInstructions(langCode);
    const prompt = `${languageInstructions}\n\n${buildProjectPlanPrompt(gaps, timeline)}`;

    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
    const response = await generateCompletion(modelId || null, messages, { temperature: 0.3 });

    // Parse JSON from the response using robust utility
    const content = extractJSON<ProjectPlan>(response.content);
    if (!content) {
        throw new Error('Failed to parse project plan response (invalid JSON)');
    }
    return content;
}

// Identify automation opportunities
export async function identifyAutomationOpportunities(
    processDescription: string,
    modelId?: string,
    language?: string
): Promise<Recommendation[]> {
    const searchResults = await searchKnowledgeBase(processDescription, 5);
    const context = searchResults.map((r) => r.content).join('\n\n');

    const langCode: LanguageCode = language && isValidLanguage(language) ? language : 'en';
    const languageInstructions = getLanguageInstructions(langCode);
    const prompt = `${languageInstructions}\n\n${buildAutomationPrompt(processDescription, context)}`;

    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
    const response = await generateCompletion(modelId || null, messages, { temperature: 0.3 });

    // Parse JSON from the response
    const parsed = extractJSON<any>(response.content);
    if (!parsed) return [];
    return Array.isArray(parsed) ? parsed : (parsed.recommendations || []);
}
