# LLM Model System-Wide Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the active LLM model as a system-wide OpenSearch setting and use it as the default for all LLM calls across chat, interview, and report routes.

**Architecture:** A new `settingsService.ts` exports `getEffectiveModel(requestedModel?)` which resolves the model in priority order: (1) explicit request model, (2) OpenSearch project settings `defaultModel`, (3) env `DEFAULT_MODEL`. All LLM call sites replace ad-hoc `getModelConfig`/`getDefaultModel` calls with `await getEffectiveModel(req.body.model)`. A new `PUT /api/settings/model` route (no admin required) lets all users save the system-wide default. The frontend `saveModelPreference` is rewired to hit this new route.

**Tech Stack:** TypeScript, Express, OpenSearch (`@opensearch-project/opensearch`), Vitest (tests), React (frontend)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/src/services/settingsService.ts` | **Create** | Exports `getEffectiveModel` |
| `backend/src/__tests__/settingsService.test.ts` | **Create** | Unit tests for `getEffectiveModel` |
| `backend/src/routes/settings.ts` | **Modify** | Add `defaultModel` to `DEFAULT_SETTINGS`; accept it in `PUT /project`; add `PUT /model` |
| `backend/src/routes/chat.ts` | **Modify** | `GET /models` async + use `getEffectiveModel`; same for `/message` and `/message/stream` |
| `backend/src/routes/interview.ts` | **Modify** | Replace ad-hoc model fallbacks with `getEffectiveModel` at every endpoint |
| `backend/src/routes/reports.ts` | **Modify** | Resolve model via `getEffectiveModel` before calling `generateReadinessReport`/`generateGapReport` |
| `frontend/src/services/api.ts` | **Modify** | `saveModelPreference` → calls `PUT /api/settings/model` |

---

### Task 1: Create settingsService with getEffectiveModel (TDD)

**Files:**
- Create: `backend/src/services/settingsService.ts`
- Create: `backend/src/__tests__/settingsService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/__tests__/settingsService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database', () => ({
    opensearchClient: { get: vi.fn() },
    INDICES: { USERS: 'consultant_users' },
}));

vi.mock('../../config/env', () => ({
    getModelConfig: vi.fn(),
    getDefaultModel: vi.fn(),
}));

import { opensearchClient } from '../../config/database';
import { getModelConfig, getDefaultModel } from '../../config/env';
import { getEffectiveModel } from '../../services/settingsService';

describe('getEffectiveModel', () => {
    beforeEach(() => vi.clearAllMocks());

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run --reporter=verbose src/__tests__/settingsService.test.ts
```

Expected: FAIL — `Cannot find module '../../services/settingsService'`

- [ ] **Step 3: Create the implementation**

Create `backend/src/services/settingsService.ts`:

```typescript
import { opensearchClient, INDICES } from '../config/database';
import { getModelConfig, getDefaultModel } from '../config/env';
import type { ModelConfig } from '../config/env';

const SETTINGS_DOC_ID = 'project-settings';
const SETTINGS_INDEX = INDICES.USERS;

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run --reporter=verbose src/__tests__/settingsService.test.ts
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/settingsService.ts backend/src/__tests__/settingsService.test.ts
git commit -m "feat: add getEffectiveModel helper with OpenSearch fallback"
```

---

### Task 2: Update settings.ts routes

**Files:**
- Modify: `backend/src/routes/settings.ts`

- [ ] **Step 1: Add `defaultModel` to DEFAULT_SETTINGS and add env import**

In `backend/src/routes/settings.ts`, add the import at the top (after existing imports):

```typescript
import { getAvailableModels } from '../config/env';
```

Update `DEFAULT_SETTINGS`:

```typescript
const DEFAULT_SETTINGS = {
    projectName: '',
    assessmentPeriod: '',
    timeZone: 'UTC+0',
    notifications: {
        criticalRiskAlerts: true,
        smeResponseUpdates: true,
        weeklySummary: false,
    },
    sessionTimeout: 30,
    defaultModel: '',
};
```

- [ ] **Step 2: Update `PUT /project` to accept and save `defaultModel`**

Replace the body of `PUT /project` route handler. Find:

```typescript
        const { projectName, assessmentPeriod, timeZone, notifications, sessionTimeout } = req.body;

        const settings = {
            settingsType: 'project-settings',
            projectName: projectName || '',
            assessmentPeriod: assessmentPeriod || '',
            timeZone: timeZone || 'UTC+0',
            notifications: notifications || DEFAULT_SETTINGS.notifications,
            sessionTimeout: sessionTimeout || 30,
            updatedBy: (req as any).user?.userId || 'unknown',
            updatedAt: new Date().toISOString(),
        };
```

Replace with:

```typescript
        const { projectName, assessmentPeriod, timeZone, notifications, sessionTimeout, defaultModel } = req.body;

        const settings = {
            settingsType: 'project-settings',
            projectName: projectName || '',
            assessmentPeriod: assessmentPeriod || '',
            timeZone: timeZone || 'UTC+0',
            notifications: notifications || DEFAULT_SETTINGS.notifications,
            sessionTimeout: sessionTimeout || 30,
            defaultModel: typeof defaultModel === 'string' ? defaultModel : '',
            updatedBy: (req as any).user?.userId || 'unknown',
            updatedAt: new Date().toISOString(),
        };
```

- [ ] **Step 3: Add `PUT /model` route (all authenticated users)**

Add this route after the `PUT /project` route and before the Data Management section comment:

```typescript
// PUT /api/settings/model (all authenticated users)
router.put('/model', async (req: Request, res: Response) => {
    try {
        const { defaultModel } = req.body;

        if (typeof defaultModel !== 'string' || defaultModel.length === 0) {
            return res.status(400).json({ error: 'defaultModel is required' });
        }

        const available = getAvailableModels();
        if (!available.find((m) => m.id === defaultModel)) {
            return res.status(400).json({ error: `Unknown model: ${defaultModel}` });
        }

        // Merge with existing settings to preserve other fields
        let existing: any = {};
        try {
            const result = await opensearchClient.get({
                index: SETTINGS_INDEX,
                id: SETTINGS_DOC_ID,
            });
            existing = result.body._source || {};
        } catch (_) {}

        await opensearchClient.index({
            index: SETTINGS_INDEX,
            id: SETTINGS_DOC_ID,
            body: {
                ...existing,
                defaultModel,
                updatedBy: (req as any).user?.userId || 'unknown',
                updatedAt: new Date().toISOString(),
            },
            refresh: true,
        });

        res.json({ success: true, defaultModel });
    } catch (err: any) {
        console.error('Failed to update model setting:', err.message);
        res.status(500).json({ error: 'Failed to update model setting' });
    }
});
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/settings.ts
git commit -m "feat: add defaultModel to project settings and PUT /api/settings/model route"
```

---

### Task 3: Update chat.ts

**Files:**
- Modify: `backend/src/routes/chat.ts`

- [ ] **Step 1: Update imports**

In `backend/src/routes/chat.ts`, find the env import line:

```typescript
import { getAvailableModels, getDefaultModel, getModelConfig, ModelConfig } from '../config/env';
```

Replace with:

```typescript
import { getAvailableModels } from '../config/env';
import { getEffectiveModel } from '../services/settingsService';
```

(`getDefaultModel` and `getModelConfig` are no longer called directly in this file.)

- [ ] **Step 2: Make `GET /models` async and use `getEffectiveModel`**

Find:

```typescript
router.get('/models', (req: Request, res: Response) => {
    try {
        const models = getAvailableModels();
        const defaultModel = getDefaultModel();
        res.json({
            models,
            defaultModel: defaultModel?.id || null,
        });
    } catch (error: any) {
        console.error('Error getting models:', error);
        res.status(500).json({ error: error.message });
    }
});
```

Replace with:

```typescript
router.get('/models', async (req: Request, res: Response) => {
    try {
        const models = getAvailableModels();
        const effectiveModel = await getEffectiveModel();
        res.json({
            models,
            defaultModel: effectiveModel?.id || null,
        });
    } catch (error: any) {
        console.error('Error getting models:', error);
        res.status(500).json({ error: error.message });
    }
});
```

- [ ] **Step 3: Update `POST /message` model resolution**

In `POST /message`, find:

```typescript
        // Validate model selection (format: provider:model)
        const modelConfig = requestedModel ? getModelConfig(requestedModel) : getDefaultModel();
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }
```

Replace with:

```typescript
        // Validate model selection (format: provider:model)
        const modelConfig = await getEffectiveModel(requestedModel);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }
```

- [ ] **Step 4: Update `POST /message/stream` model resolution**

In `POST /message/stream`, find:

```typescript
        // Validate model selection
        const modelConfig = requestedModel ? getModelConfig(requestedModel) : getDefaultModel();
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }
```

Replace with:

```typescript
        // Validate model selection
        const modelConfig = await getEffectiveModel(requestedModel);
        if (!modelConfig) {
            return res.status(400).json({ error: 'Invalid or no model configured' });
        }
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chat.ts
git commit -m "feat: use getEffectiveModel in chat routes"
```

---

### Task 4: Update interview.ts

**Files:**
- Modify: `backend/src/routes/interview.ts`

- [ ] **Step 1: Add import**

At the top of `backend/src/routes/interview.ts`, after the existing imports, add:

```typescript
import { getEffectiveModel } from '../services/settingsService';
```

- [ ] **Step 2: Update `POST /start` endpoint**

Find:

```typescript
        const modelId = req.body.model || 'default-model';
```

Replace with:

```typescript
        const resolvedModel = await getEffectiveModel(req.body.model);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 3: Update `GET /:sessionId/next-question` endpoint**

Find:

```typescript
        const modelId = req.query.model as string | undefined;
```

Replace with:

```typescript
        const resolvedModel = await getEffectiveModel(req.query.model as string | undefined);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 4: Update `POST /:sessionId/answer` endpoint**

Find:

```typescript
        const { questionId, question, answer, type, mode, categoryId, model: modelId } = req.body;
```

Replace with:

```typescript
        const { questionId, question, answer, type, mode, categoryId, model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 5: Update `POST /:sessionId/message` endpoint**

Find:

```typescript
        const { message, model: modelId } = req.body;
```

Replace with:

```typescript
        const { message, model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 6: Update `POST /:sessionId/switch-category` endpoint**

Find:

```typescript
        const { categoryId, model: modelId } = req.body;
```

Replace with:

```typescript
        const { categoryId, model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 7: Update `POST /:sessionId/report` endpoint**

Find:

```typescript
        const { model: modelId } = req.body;
```

Replace with:

```typescript
        const { model: requestedModel } = req.body;
        const resolvedModel = await getEffectiveModel(requestedModel);
        const modelId = resolvedModel?.id;
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/interview.ts
git commit -m "feat: use getEffectiveModel in interview routes"
```

---

### Task 5: Update reports.ts

**Files:**
- Modify: `backend/src/routes/reports.ts`

- [ ] **Step 1: Add import**

At the top of `backend/src/routes/reports.ts`, after the existing imports, add:

```typescript
import { getEffectiveModel } from '../services/settingsService';
```

- [ ] **Step 2: Resolve model before report generation**

In `POST /generate`, `model` is already destructured at the top of the handler:

```typescript
        const { sessionId, type, name, model } = req.body;
```

Find the block where report content is generated (after session validation and report record creation):

```typescript
            if (type === 'readiness') {
                content = await generateReadinessReport(sessionId, model);
            } else if (type === 'gap_analysis' || type === 'strategic') {
                content = await generateGapReport(sessionId, model);
```

Replace with:

```typescript
            const resolvedModel = await getEffectiveModel(model);
            if (type === 'readiness') {
                content = await generateReadinessReport(sessionId, resolvedModel?.id);
            } else if (type === 'gap_analysis' || type === 'strategic') {
                content = await generateGapReport(sessionId, resolvedModel?.id);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/reports.ts
git commit -m "feat: use getEffectiveModel in reports route"
```

---

### Task 6: Update frontend api.ts

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Rewire `saveModelPreference` to the new endpoint**

Find:

```typescript
export async function saveModelPreference(preferredModel: string): Promise<void> {
    await request(`${API_BASE}/auth/preferences`, { method: 'PUT', body: JSON.stringify({ preferredModel }) });
}
```

Replace with:

```typescript
export async function saveModelPreference(preferredModel: string): Promise<void> {
    await request(`${API_BASE}/settings/model`, { method: 'PUT', body: JSON.stringify({ defaultModel: preferredModel }) });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: save model preference to system-wide settings endpoint"
```

---

## Self-Review

**Spec coverage:**
- ✅ `defaultModel` added to project-settings doc in OpenSearch (Task 2)
- ✅ `GET /api/settings/project` returns `defaultModel` (no change needed — it returns `_source` which now includes the field)
- ✅ `PUT /api/settings/project` (admin) saves `defaultModel` (Task 2, Step 2)
- ✅ `PUT /api/settings/model` (all users) added (Task 2, Step 3)
- ✅ `GET /api/chat/models` returns OpenSearch-sourced default (Task 3)
- ✅ `chat.ts` LLM call sites updated (Task 3)
- ✅ `interview.ts` LLM call sites updated (Task 4)
- ✅ `reports.ts` LLM call site updated (Task 5)
- ✅ Frontend `saveModelPreference` rewired (Task 6)
- ✅ OpenSearch failures fall through to env default — never breaks LLM calls (Task 1, implementation)
- ✅ `PUT /api/settings/model` validates model ID against `getAvailableModels()` (Task 2, Step 3)

**Type consistency:**
- `getEffectiveModel` returns `Promise<ModelConfig | null>` throughout
- All call sites use `resolvedModel?.id` (string | undefined) which is compatible with existing service function signatures that accept `modelId?: string`

**Placeholder scan:** None found — all steps contain exact code.
