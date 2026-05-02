/**
 * erpEnrichmentService.ts
 *
 * The bridge between the connector layer and the pipeline.
 * Reads canonical data from any registered connector (demo or live)
 * and produces structured ERP evidence for reports, prompts, and chat.
 */

import { getConnector, listConnectors } from './connectors/registry';
import { getERPConnectionSettings } from './connectors/connectionSettings';
import type { CanonicalEntityName } from './connectors/types';

// ─── Sub-area → entity mapping ─────────────────────────────────────────────

const AREA_TO_ENTITIES: Record<string, CanonicalEntityName[]> = {
  procure_to_pay:            ['purchase_order', 'purchase_order_item', 'vendor', 'invoice'],
  procurement_sourcing:      ['purchase_order', 'vendor'],
  purchase_order_management: ['purchase_order', 'purchase_order_item'],
  vendor_management:         ['vendor'],
  accounts_payable:          ['purchase_order', 'vendor', 'invoice'],
  payment_execution:         ['invoice', 'purchase_order'],
  order_to_cash:             ['customer', 'ar_item', 'invoice'],
  accounts_receivable:       ['customer', 'ar_item'],
  record_to_report:          ['gl_entry'],
  general_ledger:            ['gl_entry'],
  journal_entries_accruals:  ['gl_entry'],
  reconciliation:            ['gl_entry', 'ar_item'],
  period_end_close:          ['gl_entry'],
  financial_reporting:       ['gl_entry', 'ar_item'],
  treasury_cash_management:  ['gl_entry', 'customer', 'ar_item'],
  treasury:                  ['gl_entry'],
  compliance_controls:       ['gl_entry', 'vendor'],
};

// ─── Metric computation helpers ────────────────────────────────────────────

function computePOMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const total = rows.length;
  const released = rows.filter(r => (r.releaseStatus || '').toLowerCase() === 'released').length;
  const pending  = rows.filter(r => (r.releaseStatus || '').toLowerCase() === 'pending').length;
  const blocked  = rows.filter(r => (r.releaseStatus || '').toLowerCase() === 'blocked').length;
  const totalAmt = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const avgAmt   = total ? totalAmt / total : 0;
  const currencies = [...new Set(rows.map(r => r.currency).filter(Boolean))];
  return {
    totalPOs: total,
    releasedPOs: released,
    pendingApproval: pending,
    blockedPOs: blocked,
    approvalRate: total ? Math.round((released / total) * 100) : 0,
    totalValue: Math.round(totalAmt),
    avgPOValue: Math.round(avgAmt),
    currencies,
  };
}

function computeVendorMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const total   = rows.length;
  const blocked = rows.filter(r => r.isBlocked === true || r.isBlocked === 'X').length;
  const countries = [...new Set(rows.map(r => r.country).filter(Boolean))];
  return {
    totalVendors: total,
    blockedVendors: blocked,
    activeVendors: total - blocked,
    blockedPct: total ? Math.round((blocked / total) * 100) : 0,
    countries: countries.length,
  };
}

function computeGLMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const total    = rows.length;
  const totalAmt = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const years    = [...new Set(rows.map(r => r.fiscalYear).filter(Boolean))];
  const accounts = [...new Set(rows.map(r => r.glAccount).filter(Boolean))];
  const postingFreq = total > 0 ? (total / Math.max(years.length, 1)).toFixed(1) : '0';
  return {
    totalEntries: total,
    totalValue: Math.round(totalAmt),
    avgEntryValue: total ? Math.round(totalAmt / total) : 0,
    glAccountsUsed: accounts.length,
    postingsPerYear: parseFloat(postingFreq),
    fiscalYears: years,
  };
}

function computeCustomerMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const countries = [...new Set(rows.map(r => r.country).filter(Boolean))];
  return {
    totalCustomers: rows.length,
    countries: countries.length,
    accountGroups: [...new Set(rows.map(r => r.accountGroup).filter(Boolean))].length,
  };
}

function computeInvoiceMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const total = rows.length;
  const paid = rows.filter(r => ['paid', 'posted', 'cleared'].includes((r.status || '').toLowerCase()));
  const open = rows.filter(r => ['open', 'pending'].includes((r.status || '').toLowerCase()));
  const overdue = rows.filter(r => (r.status || '').toLowerCase() === 'overdue');
  const blocked = rows.filter(r => ['blocked', 'on hold'].includes((r.status || '').toLowerCase()));

  // Compute avg payment cycle (invoice date → payment date) for paid invoices
  const cycleTimes = paid
    .filter(r => r.invoiceDate && r.paymentDate)
    .map(r => {
      const diff = new Date(r.paymentDate).getTime() - new Date(r.invoiceDate).getTime();
      return Math.round(diff / (1000 * 60 * 60 * 24));
    })
    .filter(d => d >= 0 && d < 365);

  const avgPaymentCycleDays = cycleTimes.length
    ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
    : null;

  return {
    totalInvoices: total,
    paidInvoices: paid.length,
    openInvoices: open.length,
    overdueInvoices: overdue.length,
    blockedInvoices: blocked.length,
    automationRate: total ? Math.round((paid.length / total) * 100) : 0,
    ...(avgPaymentCycleDays !== null ? { avgPaymentCycleDays } : {}),
  };
}

function computeARMetrics(rows: any[]): Record<string, any> {
  if (!rows.length) return {};
  const total = rows.length;
  const overdue = rows.filter(r => (r.daysPastDue || 0) > 0);
  const totalBalance = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const avgDaysPastDue = overdue.length
    ? Math.round(overdue.reduce((s, r) => s + (r.daysPastDue || 0), 0) / overdue.length)
    : 0;
  // DSO proxy: payment terms (assume 30) + avg days past due across all items
  const allDaysOutstanding = rows.map(r => 30 + (r.daysPastDue || 0));
  const estimatedDSO = Math.round(allDaysOutstanding.reduce((a, b) => a + b, 0) / total);

  return {
    totalARItems: total,
    overdueItems: overdue.length,
    overdueRate: Math.round((overdue.length / total) * 100),
    avgDaysPastDue,
    totalARBalance: Math.round(totalBalance),
    estimatedDSO,
  };
}

// ─── Public types ──────────────────────────────────────────────────────────

export interface ERPEntitySummary {
  entityName: CanonicalEntityName;
  displayName: string;
  rowCount: number;
  metrics: Record<string, any>;
}

export interface ERPEvidence {
  connectorId: string;
  connectorName: string;
  mode: 'demo' | 'live';
  subAreaId: string;
  entities: ERPEntitySummary[];
  contextBlock: string;   // pre-formatted string for LLM injection
  computedAt: string;
}

export interface ClaimValidation {
  claim: string;
  metric: string;
  statedValue: number;
  actualValue: number | null;
  unit: string;
  discrepancy: number | null;
  severity: 'confirmed' | 'minor_gap' | 'major_gap' | 'unverifiable';
  evidenceNote: string;
}

// ─── Core service functions ────────────────────────────────────────────────

/**
 * Returns ERP evidence for a given sub-area.
 * Reads from the settings-configured connector; falls back to first connected.
 * Returns null if no connector is available.
 */
export async function getSubAreaERPEvidence(subAreaId: string): Promise<ERPEvidence | null> {
  const settings = await getERPConnectionSettings();
  const connectorId = settings.activeConnectorId;
  const mode = settings.mode;

  if (!connectorId) {
    // Try the first available connector
    const all = listConnectors();
    if (!all.length) return null;
    return _buildEvidence(all[0].summary().id, mode, subAreaId);
  }

  const connector = getConnector(connectorId);
  if (!connector) return null;

  return _buildEvidence(connectorId, mode, subAreaId);
}

async function _buildEvidence(
  connectorId: string,
  mode: 'demo' | 'live',
  subAreaId: string,
): Promise<ERPEvidence | null> {
  const connector = getConnector(connectorId);
  if (!connector) return null;

  const summary = connector.summary();
  const entityNames = AREA_TO_ENTITIES[subAreaId] || AREA_TO_ENTITIES[subAreaId.split('_').slice(0, 3).join('_')] || [];
  if (!entityNames.length) return null;

  const entities: ERPEntitySummary[] = [];

  for (const name of entityNames) {
    const data = connector.getEntityData(name);
    if (!data) continue;

    const canonicalRows = data.rows.map(r => r.canonical);
    let metrics: Record<string, any> = {};

    if (name === 'purchase_order')           metrics = computePOMetrics(canonicalRows);
    else if (name === 'purchase_order_item') metrics = { lineItems: canonicalRows.length };
    else if (name === 'vendor')              metrics = computeVendorMetrics(canonicalRows);
    else if (name === 'gl_entry')            metrics = computeGLMetrics(canonicalRows);
    else if (name === 'customer')            metrics = computeCustomerMetrics(canonicalRows);
    else if (name === 'invoice')             metrics = computeInvoiceMetrics(canonicalRows);
    else if (name === 'ar_item')             metrics = computeARMetrics(canonicalRows);
    else                                     metrics = { records: canonicalRows.length };

    entities.push({
      entityName: name,
      displayName: data.entity.displayName,
      rowCount: canonicalRows.length,
      metrics,
    });
  }

  if (!entities.length) return null;

  const contextBlock = buildContextBlock(summary.name, entities, mode);

  return {
    connectorId,
    connectorName: summary.name,
    mode,
    subAreaId,
    entities,
    contextBlock,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Builds a formatted string block for LLM prompt injection.
 */
export function buildContextBlock(
  connectorName: string,
  entities: ERPEntitySummary[],
  mode: 'demo' | 'live',
): string {
  const modeTag = mode === 'demo' ? '[DEMO DATA] ' : '[LIVE ERP] ';
  const lines = [`${modeTag}ERP System: ${connectorName}`, ''];

  for (const e of entities) {
    lines.push(`${e.displayName} (${e.rowCount} records):`);
    for (const [k, v] of Object.entries(e.metrics)) {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      const val   = Array.isArray(v) ? v.join(', ') : String(v);
      lines.push(`  • ${label}: ${val}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Validates a specific SME claim against ERP data.
 * Returns a structured discrepancy or confirmation.
 */
export async function validateClaim(
  subAreaId: string,
  claim: string,
  metric: string,
  statedValue: number,
  unit: string,
): Promise<ClaimValidation> {
  const evidence = await getSubAreaERPEvidence(subAreaId);
  if (!evidence) {
    return {
      claim, metric, statedValue, actualValue: null, unit,
      discrepancy: null,
      severity: 'unverifiable',
      evidenceNote: 'No ERP connector available — claim cannot be verified against system data.',
    };
  }

  // Try to find a matching metric in the evidence
  let actualValue: number | null = null;
  for (const entity of evidence.entities) {
    for (const [k, v] of Object.entries(entity.metrics)) {
      if (typeof v === 'number' && k.toLowerCase().includes(metric.toLowerCase())) {
        actualValue = v;
        break;
      }
    }
    if (actualValue !== null) break;
  }

  if (actualValue === null) {
    return {
      claim, metric, statedValue, actualValue: null, unit,
      discrepancy: null,
      severity: 'unverifiable',
      evidenceNote: `Metric "${metric}" not directly available in ERP data for ${subAreaId}.`,
    };
  }

  const discrepancy = Math.abs(statedValue - actualValue);
  const pct = statedValue !== 0 ? (discrepancy / statedValue) * 100 : 100;

  let severity: ClaimValidation['severity'];
  let evidenceNote: string;

  if (pct <= 5) {
    severity = 'confirmed';
    evidenceNote = `ERP confirms: ${metric} is ${actualValue} ${unit} (stated: ${statedValue} ${unit}, within 5% tolerance).`;
  } else if (pct <= 20) {
    severity = 'minor_gap';
    evidenceNote = `Minor discrepancy: SME stated ${statedValue} ${unit} but ERP shows ${actualValue} ${unit} (${Math.round(pct)}% gap).`;
  } else {
    severity = 'major_gap';
    evidenceNote = `Significant discrepancy: SME stated ${statedValue} ${unit} but ERP shows ${actualValue} ${unit} (${Math.round(pct)}% gap — flag for review).`;
  }

  return { claim, metric, statedValue, actualValue, unit, discrepancy, severity, evidenceNote };
}

/**
 * Returns a connector-level summary block for chat context.
 * Covers all entities across the active connector.
 */
export async function getFullERPContextBlock(): Promise<string | null> {
  const settings = await getERPConnectionSettings();
  const connectorId = settings.activeConnectorId || listConnectors()[0]?.summary().id;
  if (!connectorId) return null;

  const connector = getConnector(connectorId);
  if (!connector) return null;

  const details = connector.details();
  const entitySummaries: ERPEntitySummary[] = details.entities.map(e => {
    const data = connector.getEntityData(e.canonicalName);
    const rows = data?.rows.map(r => r.canonical) || [];
    let metrics: Record<string, any> = {};
    if (e.canonicalName === 'purchase_order')           metrics = computePOMetrics(rows);
    else if (e.canonicalName === 'vendor')              metrics = computeVendorMetrics(rows);
    else if (e.canonicalName === 'gl_entry')            metrics = computeGLMetrics(rows);
    else if (e.canonicalName === 'customer')            metrics = computeCustomerMetrics(rows);
    else if (e.canonicalName === 'invoice')             metrics = computeInvoiceMetrics(rows);
    else if (e.canonicalName === 'ar_item')             metrics = computeARMetrics(rows);
    else if (e.canonicalName === 'purchase_order_item') metrics = { lineItems: rows.length };
    else metrics = { records: rows.length };
    return { entityName: e.canonicalName, displayName: e.displayName, rowCount: rows.length, metrics };
  });

  return buildContextBlock(details.name, entitySummaries, settings.mode);
}
