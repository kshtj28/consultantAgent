import { createTool } from '@mastra/core/tools';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { searchKnowledgeBase, getRelatedEntities } from '../services/knowledgeBase';
import { generateGapAnalysis, generateProjectPlan } from '../services/analysisService';
import { CONSULTANT_SYSTEM_PROMPT } from '../prompts/consultantAgent.prompt';

// Tool for searching the knowledge base
const searchDocumentsTool = createTool({
    id: 'search_documents',
    description: 'Search the knowledge base for relevant information from uploaded documents',
    inputSchema: z.object({
        query: z.string().describe('The search query to find relevant document chunks'),
        limit: z.number().optional().default(5).describe('Maximum number of results to return'),
    }),
    execute: async (params) => {
        const { query, limit } = params;
        const results = await searchKnowledgeBase(query, limit || 5);
        return { results };
    },
});

// Tool for getting related entities (Graph RAG)
const getRelatedEntitesTool = createTool({
    id: 'get_related_entities',
    description: 'Get entities related to a specific process, system, or stakeholder from the knowledge graph',
    inputSchema: z.object({
        entityName: z.string().describe('The name of the entity to find relationships for'),
        entityType: z.enum(['process', 'system', 'stakeholder', 'document']).describe('Type of entity'),
    }),
    execute: async (params) => {
        const { entityName, entityType } = params;
        const entities = await getRelatedEntities(entityName, entityType);
        return { entities };
    },
});

// Tool for generating gap analysis reports
const gapAnalysisTool = createTool({
    id: 'generate_gap_analysis',
    description: 'Generate a comprehensive gap analysis report based on the current state documents',
    inputSchema: z.object({
        focusArea: z.string().describe('The specific area or process to analyze'),
        analysisContext: z.string().describe('Additional context about what gaps to look for'),
    }),
    execute: async (params) => {
        const { focusArea, analysisContext } = params;
        const report = await generateGapAnalysis(focusArea, analysisContext);
        return { report };
    },
});

// Tool for generating project plans
const projectPlanTool = createTool({
    id: 'generate_project_plan',
    description: 'Generate an implementation project plan based on identified gaps and recommendations',
    inputSchema: z.object({
        gaps: z.array(z.string()).describe('List of identified gaps to address'),
        timeline: z.enum(['short', 'medium', 'long']).describe('Timeline preference for the project'),
    }),
    execute: async (params) => {
        const { gaps, timeline } = params;
        const plan = await generateProjectPlan(gaps, timeline);
        return { plan };
    },
});

// CONSULTANT_SYSTEM_PROMPT is imported from '../prompts/consultantAgent.prompt'

// Create the consultant agent
export const consultantAgent = new Agent({
    id: 'consultant-agent',
    name: 'Consultant Agent',
    instructions: CONSULTANT_SYSTEM_PROMPT,
    model: openai('gpt-4o'),
    tools: {
        searchDocuments: searchDocumentsTool,
        getRelatedEntities: getRelatedEntitesTool,
        gapAnalysis: gapAnalysisTool,
        projectPlan: projectPlanTool,
    },
});
