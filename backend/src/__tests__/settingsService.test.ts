import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        opensearchClient: { get: vi.fn() },
    };
});

vi.mock('../config/env', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getModelConfig: vi.fn(),
        getDefaultModel: vi.fn(),
    };
});

import { opensearchClient } from '../config/database';
import { getModelConfig, getDefaultModel } from '../config/env';
import { getEffectiveModel } from '../services/settingsService';

describe('getEffectiveModel', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('returns the requested model when it is valid', async () => {
        const mockConfig = { id: 'openai:gpt-4o', provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o (openai)' };
        vi.mocked(getModelConfig).mockReturnValue(mockConfig);

        const result = await getEffectiveModel('openai:gpt-4o');

        expect(result).toBe(mockConfig);
        expect(opensearchClient.get).not.toHaveBeenCalled();
    });

    it('returns the OpenSearch model when no request model is given', async () => {
        const mockConfig = { id: 'anthropic:claude-opus-4-6', provider: 'anthropic', model: 'claude-opus-4-6', displayName: 'claude-opus-4-6 (anthropic)' };
        vi.mocked(getModelConfig).mockReturnValue(mockConfig);
        vi.mocked(opensearchClient.get).mockResolvedValue({
            body: { _source: { defaultModel: 'anthropic:claude-opus-4-6' } },
        } as any);

        const result = await getEffectiveModel();

        expect(opensearchClient.get).toHaveBeenCalledWith({ index: 'consultant_users', id: 'project-settings' });
        expect(getModelConfig).toHaveBeenCalledWith('anthropic:claude-opus-4-6');
        expect(result).toBe(mockConfig);
    });

    it('falls back to env default when OpenSearch defaultModel is empty', async () => {
        const envDefault = { id: 'openai:gpt-4o', provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o (openai)' };
        vi.mocked(getModelConfig).mockReturnValue(null);
        vi.mocked(getDefaultModel).mockReturnValue(envDefault);
        vi.mocked(opensearchClient.get).mockResolvedValue({
            body: { _source: { defaultModel: '' } },
        } as any);

        const result = await getEffectiveModel();

        expect(result).toBe(envDefault);
    });

    it('falls back to env default when OpenSearch read throws', async () => {
        const envDefault = { id: 'openai:gpt-4o', provider: 'openai', model: 'gpt-4o', displayName: 'GPT-4o (openai)' };
        vi.mocked(getDefaultModel).mockReturnValue(envDefault);
        vi.mocked(opensearchClient.get).mockRejectedValue(new Error('connection refused'));

        const result = await getEffectiveModel();

        expect(result).toBe(envDefault);
    });
});
