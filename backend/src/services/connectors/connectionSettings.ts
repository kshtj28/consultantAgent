/**
 * connectionSettings.ts
 *
 * Persists ERP connector configuration in the same OpenSearch settings doc
 * used by the rest of the project. The enrichment service reads this to know:
 *   - which connector is active (sap_s4hana | dynamics_365 | oracle_ecc | ...)
 *   - whether to use demo (in-memory) or live (real OData/REST) data
 *   - the base URL and credentials for live mode
 */

import { opensearchClient } from '../../config/database';
import { SETTINGS_DOC_ID, SETTINGS_INDEX } from '../settingsService';

export interface ERPConnectionConfig {
  /** ID matching the connector registry key, e.g. 'sap_s4hana' */
  activeConnectorId: string;
  /** 'demo' = in-memory fixture data; 'live' = real OData/REST calls */
  mode: 'demo' | 'live';
  /** Base URL for live mode, e.g. https://my.sap.example.com */
  baseUrl: string;
  /** Username for basic auth / service account */
  username: string;
  /** Stored as plaintext in dev — swap for encrypted vault in prod */
  password: string;
  updatedAt?: string;
}

const DEFAULT_CONFIG: ERPConnectionConfig = {
  activeConnectorId: 'sap_s4hana',
  mode: 'demo',
  baseUrl: '',
  username: '',
  password: '',
};

export async function getERPConnectionSettings(): Promise<ERPConnectionConfig> {
  try {
    const result = await opensearchClient.get({
      index: SETTINGS_INDEX,
      id: SETTINGS_DOC_ID,
    });
    const src = result.body._source?.erpConnection || {};
    return { ...DEFAULT_CONFIG, ...src };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveERPConnectionSettings(config: Partial<ERPConnectionConfig>): Promise<ERPConnectionConfig> {
  let existing: any = {};
  try {
    const doc = await opensearchClient.get({ index: SETTINGS_INDEX, id: SETTINGS_DOC_ID });
    existing = doc.body._source || {};
  } catch { /* doc may not exist yet */ }

  const merged: ERPConnectionConfig = {
    ...DEFAULT_CONFIG,
    ...(existing.erpConnection || {}),
    ...config,
    updatedAt: new Date().toISOString(),
  };

  await opensearchClient.index({
    index: SETTINGS_INDEX,
    id: SETTINGS_DOC_ID,
    body: { ...existing, erpConnection: merged },
    refresh: 'wait_for',
  });

  return merged;
}
