# LLM Model System-Wide Settings Design

**Date:** 2026-03-28
**Status:** Approved

## Overview

Store the active LLM model as a system-wide setting in OpenSearch and use it as the default for all LLM calls. All authenticated users can update the model preference (not admin-only). Explicit per-request model overrides continue to work.

---

## Data Layer

Extend the existing `project-settings` document in the `consultant_users` OpenSearch index with a `defaultModel` field:

```json
{
  "settingsType": "project-settings",
  "projectName": "...",
  "timeZone": "UTC+0",
  "defaultModel": "openai:gpt-4o",
  ...
}
```

- `defaultModel` format: `provider:model` (e.g. `anthropic:claude-opus-4-6`, `ollama:gemma3:4b`)
- Empty string `""` means "fall back to env `DEFAULT_MODEL`"
- Added to `DEFAULT_SETTINGS` in `settings.ts` as `defaultModel: ''`

---

## Backend

### Shared Helper

`getEffectiveModel(requestedModel?: string): Promise<ModelConfig | null>` — exported from `settings.ts`.

Resolution order:
1. If `requestedModel` is provided and valid per `getModelConfig()` → return it
2. Fetch `defaultModel` from the project settings doc in OpenSearch → if set and valid, return it
3. Fall back to `getDefaultModel()` from env

### Route Changes

| Route | Change |
|---|---|
| `GET /api/settings/project` | Already returns settings; now includes `defaultModel` |
| `PUT /api/settings/project` | Admin-only (unchanged); also accepts and saves `defaultModel` |
| `PUT /api/settings/model` | **New** — authenticated users only (no admin required); saves only `defaultModel` to the project settings doc |
| `GET /api/chat/models` | Updated to call `getEffectiveModel()` with no args; returns the OpenSearch `defaultModel` if set and valid, otherwise falls back to the env `DEFAULT_MODEL` |

### LLM Call Sites

All routes that invoke `generateCompletion` or `streamCompletion` replace inline `getModelConfig(requestedModel) || getDefaultModel()` with `await getEffectiveModel(requestedModel)`:

- `chat.ts` — `POST /chat/message`, `POST /chat/message/stream`
- `interview.ts` — `/start`, answer submit, `/message`, `/switch-category`, `/report` endpoints
- `reports.ts` — report generation endpoint

---

## Frontend

### `api.ts`

Update `saveModelPreference(preferredModel)` to call `PUT /api/settings/model` instead of `PUT /api/auth/preferences`.

### `SettingsPage.tsx`

No logic change needed — `handleSave` already calls `saveModelPreference`. The model dropdown is pre-populated from `fetchProjectSettings` (which now includes `defaultModel`) so the displayed value reflects the system-wide setting on page load.

### `fetchModels` (`GET /api/chat/models`)

No frontend change needed — the backend now returns the OpenSearch-sourced default. The frontend already uses `modelRes.defaultModel` to pre-select the dropdown.

---

## Error Handling

- If the OpenSearch read in `getEffectiveModel` fails, log a warning and fall through to the env fallback — LLM calls must not break due to a settings read failure.
- `PUT /api/settings/model` validates that the submitted model id exists in `getAvailableModels()` and returns `400` for unknown model ids.

---

## Out of Scope

- Per-user model preferences (the existing `preferredModel` field on user documents is left in place but is no longer written or read by the settings flow)
- Admin-only restriction on model setting (all authenticated users can change it)
- UI changes beyond wiring the existing model dropdown to the new endpoint
