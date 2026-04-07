import { opensearchClient, INDICES } from '../config/database';
import { getModelConfig, getDefaultModel } from '../config/env';
import type { ModelConfig } from '../config/env';

export const SETTINGS_DOC_ID = 'project-settings';
export const SETTINGS_INDEX = INDICES.USERS;

/**
 * Resolve the effective LLM model in priority order:
 * 1. Explicit requestedModel (if valid)
 * 2. System-wide defaultModel from OpenSearch project settings
 * 3. Env DEFAULT_MODEL fallback
 *
 * Never throws — OpenSearch failures fall through to the env default.
 */
export async function getEffectiveModel(requestedModel?: string): Promise<ModelConfig | null> {
    if (requestedModel) {
        const config = getModelConfig(requestedModel);
        if (config) return config;
    }

    try {
        const result = await opensearchClient.get({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
        });
        const savedModel: string = result.body._source?.defaultModel || '';
        if (savedModel) {
            const config = getModelConfig(savedModel);
            if (config) return config;
        }
    } catch (err) {
        console.warn('[getEffectiveModel] Could not read project settings, using env default:', (err as Error).message);
    }

    return getDefaultModel();
}

export interface ProjectContext {
    projectName: string;
    clientName: string;
    erpPath: string;
    industry: string;
}

/**
 * Fetch project context (client name, ERP path, industry) from saved settings.
 * Returns empty strings on failure so callers can safely interpolate.
 */
export async function getProjectContext(): Promise<ProjectContext> {
    try {
        const result = await opensearchClient.get({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
        });
        const src = result.body._source || {};
        return {
            projectName: src.projectName || '',
            clientName: src.clientName || '',
            erpPath: src.erpPath || '',
            industry: src.industry || '',
        };
    } catch {
        return { projectName: '', clientName: '', erpPath: '', industry: '' };
    }
}
