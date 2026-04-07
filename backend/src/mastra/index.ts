import { Mastra } from '@mastra/core';
import { OpenSearchVector } from '@mastra/opensearch';
import { consultantAgent } from './agent';
import { interviewAgent } from './interviewAgent';
import { env } from '../config/env';

// Initialize OpenSearch Vector Store for RAG capabilities
export const openSearchVector = new OpenSearchVector({
    id: 'opensearch-vector-store',
    node: env.OPENSEARCH_NODE,
    auth: {
        username: env.OPENSEARCH_USERNAME,
        password: env.OPENSEARCH_PASSWORD,
    },
    ssl: {
        rejectUnauthorized: false, // For local development with self-signed certs
    },
});

// Initialize Mastra with the consultant agent, interview agent and vector store
export const mastra = new Mastra({
    agents: {
        consultantAgent,
        interviewAgent,
    },
    vectors: {
        opensearch: openSearchVector,
    },
});

export { consultantAgent, interviewAgent };
