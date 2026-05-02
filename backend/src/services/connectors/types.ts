/**
 * ERP Connector types — Canonical Data Model pattern.
 *
 * Three-layer architecture:
 *   Layer 1 (Source Adapters):   ERP-specific plugins (SAP, Dynamics, Oracle, ...)
 *   Layer 2 (Canonical Mapping): Translates native ERP fields → universal schema
 *   Layer 3 (Unified API):       Consumed by dashboards, reports, LLM context
 */

export type CanonicalEntityName =
  | 'purchase_order'
  | 'purchase_order_item'
  | 'gl_entry'
  | 'vendor'
  | 'customer'
  | 'material'
  | 'invoice'
  | 'ar_item';

export type FieldType = 'string' | 'number' | 'date' | 'currency' | 'boolean';

/** Maps one native ERP column to a canonical universal field. */
export interface FieldMapping {
  native: string;        // e.g. "EBELN" (SAP) or "PurchaseOrderNumber" (Dynamics)
  canonical: string;     // e.g. "poId"
  type: FieldType;
  description?: string;
}

/** A single canonical entity exposed by a connector. */
export interface ConnectorEntity {
  canonicalName: CanonicalEntityName;
  displayName: string;       // "Purchase Orders"
  nativeTable: string;       // "EKKO" or "PurchPurchaseOrderHeaderV2"
  description: string;
  mappings: FieldMapping[];
  rowCount: number;
}

/** Summary for connector list view. */
export interface ConnectorSummary {
  id: string;                // "sap_s4hana"
  name: string;              // "SAP S/4HANA"
  vendor: string;            // "SAP"
  version: string;           // "2023 FPS02"
  protocol: string;          // "OData v4 / CDS"
  logo: string;              // emoji or short code
  status: 'connected' | 'disconnected' | 'error';
  baseUrl?: string;
  lastSyncedAt?: string;
  entityCount: number;
  totalRows: number;
}

/** Full connector details including entity metadata. */
export interface ConnectorDetails extends ConnectorSummary {
  entities: ConnectorEntity[];
}

/** A row returned in both native and canonical form, for transparent demo. */
export interface DualRow {
  native: Record<string, any>;      // keyed by native field names
  canonical: Record<string, any>;   // keyed by canonical field names
}

/** Response for an entity data query. */
export interface EntityDataResponse {
  connectorId: string;
  entity: ConnectorEntity;
  rows: DualRow[];
}

/** Abstract connector interface — every adapter implements this. */
export interface ERPConnector {
  summary(): ConnectorSummary;
  details(): ConnectorDetails;
  getEntityData(canonicalName: CanonicalEntityName): EntityDataResponse | null;
  connect(baseUrl?: string): void;
  disconnect(): void;
  sync(): void;
}
