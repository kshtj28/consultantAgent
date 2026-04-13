import {
  ConnectorDetails,
  ConnectorEntity,
  ConnectorSummary,
  DualRow,
  EntityDataResponse,
  ERPConnector,
  CanonicalEntityName,
} from './types';

/**
 * SAP S/4HANA Adapter — Layer 1.
 * Speaks OData v4 / CDS. Knows native tables EKKO, EKPO, BKPF, LFA1, KNA1, MARA.
 * Each row is returned in both native (raw SAP) and canonical form.
 *
 * Data is in-memory dummy for now; replace with real OData calls later.
 */

interface ConnState {
  status: 'connected' | 'disconnected' | 'error';
  baseUrl: string;
  lastSyncedAt?: string;
}

const state: ConnState = {
  status: 'connected',
  baseUrl: 'https://sap-s4hana.demo.client.com/sap/opu/odata/sap',
  lastSyncedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
};

const ENTITIES: ConnectorEntity[] = [
  {
    canonicalName: 'purchase_order',
    displayName: 'Purchase Orders',
    nativeTable: 'EKKO',
    description: 'Purchasing document headers (OData: API_PURCHASEORDER_PROCESS_SRV)',
    mappings: [
      { native: 'EBELN', canonical: 'poId', type: 'string', description: 'PO number' },
      { native: 'BUKRS', canonical: 'companyCode', type: 'string' },
      { native: 'BSTYP', canonical: 'documentType', type: 'string' },
      { native: 'LIFNR', canonical: 'vendorId', type: 'string' },
      { native: 'AEDAT', canonical: 'createdDate', type: 'date' },
      { native: 'WAERS', canonical: 'currency', type: 'string' },
      { native: 'NETWR', canonical: 'totalAmount', type: 'currency' },
      { native: 'FRGKE', canonical: 'releaseStatus', type: 'string' },
    ],
    rowCount: 8,
  },
  {
    canonicalName: 'purchase_order_item',
    displayName: 'Purchase Order Items',
    nativeTable: 'EKPO',
    description: 'Purchase order line items',
    mappings: [
      { native: 'EBELN', canonical: 'poId', type: 'string' },
      { native: 'EBELP', canonical: 'lineItem', type: 'number' },
      { native: 'MATNR', canonical: 'materialId', type: 'string' },
      { native: 'MENGE', canonical: 'quantity', type: 'number' },
      { native: 'MEINS', canonical: 'unitOfMeasure', type: 'string' },
      { native: 'NETPR', canonical: 'netPrice', type: 'currency' },
    ],
    rowCount: 6,
  },
  {
    canonicalName: 'gl_entry',
    displayName: 'General Ledger Entries',
    nativeTable: 'BKPF / BSEG',
    description: 'Accounting document headers and line items (ACDOCA in S/4HANA universal journal)',
    mappings: [
      { native: 'BELNR', canonical: 'documentNumber', type: 'string' },
      { native: 'BUKRS', canonical: 'companyCode', type: 'string' },
      { native: 'GJAHR', canonical: 'fiscalYear', type: 'number' },
      { native: 'BUDAT', canonical: 'postingDate', type: 'date' },
      { native: 'HKONT', canonical: 'glAccount', type: 'string' },
      { native: 'DMBTR', canonical: 'amount', type: 'currency' },
      { native: 'WAERS', canonical: 'currency', type: 'string' },
    ],
    rowCount: 7,
  },
  {
    canonicalName: 'vendor',
    displayName: 'Vendors',
    nativeTable: 'LFA1',
    description: 'Vendor master (OData: API_BUSINESS_PARTNER)',
    mappings: [
      { native: 'LIFNR', canonical: 'vendorId', type: 'string' },
      { native: 'NAME1', canonical: 'name', type: 'string' },
      { native: 'LAND1', canonical: 'country', type: 'string' },
      { native: 'STRAS', canonical: 'street', type: 'string' },
      { native: 'ORT01', canonical: 'city', type: 'string' },
      { native: 'SPERR', canonical: 'isBlocked', type: 'boolean' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'customer',
    displayName: 'Customers',
    nativeTable: 'KNA1',
    description: 'Customer master data',
    mappings: [
      { native: 'KUNNR', canonical: 'customerId', type: 'string' },
      { native: 'NAME1', canonical: 'name', type: 'string' },
      { native: 'LAND1', canonical: 'country', type: 'string' },
      { native: 'KTOKD', canonical: 'accountGroup', type: 'string' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'material',
    displayName: 'Materials',
    nativeTable: 'MARA',
    description: 'Material master (OData: API_PRODUCT_SRV)',
    mappings: [
      { native: 'MATNR', canonical: 'materialId', type: 'string' },
      { native: 'MATKL', canonical: 'materialGroup', type: 'string' },
      { native: 'MEINS', canonical: 'baseUnit', type: 'string' },
      { native: 'MTART', canonical: 'materialType', type: 'string' },
    ],
    rowCount: 6,
  },
];

// ---- Dummy data, keyed by native field names ----

const DATA: Record<CanonicalEntityName, Record<string, any>[]> = {
  purchase_order: [
    { EBELN: '4500001234', BUKRS: '1000', BSTYP: 'F', LIFNR: '100045', AEDAT: '2026-03-14', WAERS: 'USD', NETWR: 84500.0, FRGKE: 'Released' },
    { EBELN: '4500001235', BUKRS: '1000', BSTYP: 'F', LIFNR: '100051', AEDAT: '2026-03-18', WAERS: 'EUR', NETWR: 12750.5, FRGKE: 'Released' },
    { EBELN: '4500001236', BUKRS: '2000', BSTYP: 'K', LIFNR: '100088', AEDAT: '2026-03-22', WAERS: 'USD', NETWR: 245000.0, FRGKE: 'Pending' },
    { EBELN: '4500001237', BUKRS: '1000', BSTYP: 'F', LIFNR: '100045', AEDAT: '2026-03-25', WAERS: 'USD', NETWR: 3200.0, FRGKE: 'Released' },
    { EBELN: '4500001238', BUKRS: '3000', BSTYP: 'F', LIFNR: '100102', AEDAT: '2026-04-02', WAERS: 'GBP', NETWR: 56320.75, FRGKE: 'Released' },
    { EBELN: '4500001239', BUKRS: '1000', BSTYP: 'F', LIFNR: '100051', AEDAT: '2026-04-05', WAERS: 'EUR', NETWR: 8900.0, FRGKE: 'Blocked' },
    { EBELN: '4500001240', BUKRS: '2000', BSTYP: 'F', LIFNR: '100088', AEDAT: '2026-04-08', WAERS: 'USD', NETWR: 19450.25, FRGKE: 'Released' },
    { EBELN: '4500001241', BUKRS: '1000', BSTYP: 'K', LIFNR: '100045', AEDAT: '2026-04-11', WAERS: 'USD', NETWR: 132000.0, FRGKE: 'Pending' },
  ],
  purchase_order_item: [
    { EBELN: '4500001234', EBELP: 10, MATNR: 'RAW-STL-4120', MENGE: 500, MEINS: 'KG', NETPR: 78.5 },
    { EBELN: '4500001234', EBELP: 20, MATNR: 'RAW-STL-4130', MENGE: 300, MEINS: 'KG', NETPR: 82.0 },
    { EBELN: '4500001235', EBELP: 10, MATNR: 'PKG-BOX-12', MENGE: 1500, MEINS: 'EA', NETPR: 8.5 },
    { EBELN: '4500001236', EBELP: 10, MATNR: 'SRV-LOG-01', MENGE: 1, MEINS: 'LOT', NETPR: 245000.0 },
    { EBELN: '4500001237', EBELP: 10, MATNR: 'SPR-BRG-9', MENGE: 40, MEINS: 'EA', NETPR: 80.0 },
    { EBELN: '4500001238', EBELP: 10, MATNR: 'ELC-PCB-22', MENGE: 220, MEINS: 'EA', NETPR: 256.0 },
  ],
  gl_entry: [
    { BELNR: '1900000567', BUKRS: '1000', GJAHR: 2026, BUDAT: '2026-03-14', HKONT: '400000', DMBTR: 84500.0, WAERS: 'USD' },
    { BELNR: '1900000568', BUKRS: '1000', GJAHR: 2026, BUDAT: '2026-03-18', HKONT: '400000', DMBTR: 12750.5, WAERS: 'EUR' },
    { BELNR: '1900000569', BUKRS: '2000', GJAHR: 2026, BUDAT: '2026-03-22', HKONT: '420000', DMBTR: 245000.0, WAERS: 'USD' },
    { BELNR: '1900000570', BUKRS: '1000', GJAHR: 2026, BUDAT: '2026-04-02', HKONT: '410000', DMBTR: 3200.0, WAERS: 'USD' },
    { BELNR: '1900000571', BUKRS: '3000', GJAHR: 2026, BUDAT: '2026-04-05', HKONT: '400000', DMBTR: 56320.75, WAERS: 'GBP' },
    { BELNR: '1900000572', BUKRS: '1000', GJAHR: 2026, BUDAT: '2026-04-08', HKONT: '113100', DMBTR: 15400.0, WAERS: 'USD' },
    { BELNR: '1900000573', BUKRS: '2000', GJAHR: 2026, BUDAT: '2026-04-11', HKONT: '200000', DMBTR: 19450.25, WAERS: 'USD' },
  ],
  vendor: [
    { LIFNR: '100045', NAME1: 'Acme Steel Industries', LAND1: 'US', STRAS: '4500 Industrial Pkwy', ORT01: 'Pittsburgh', SPERR: '' },
    { LIFNR: '100051', NAME1: 'EuroPack GmbH', LAND1: 'DE', STRAS: 'Mühlenweg 14', ORT01: 'Stuttgart', SPERR: '' },
    { LIFNR: '100088', NAME1: 'Global Logistics Solutions', LAND1: 'US', STRAS: '900 Harbor Blvd', ORT01: 'Long Beach', SPERR: '' },
    { LIFNR: '100102', NAME1: 'Britannia Electronics Ltd', LAND1: 'GB', STRAS: '22 Kingsway', ORT01: 'Manchester', SPERR: '' },
    { LIFNR: '100119', NAME1: 'Pacific Components Inc', LAND1: 'US', STRAS: '155 Tech Dr', ORT01: 'San Jose', SPERR: 'X' },
  ],
  customer: [
    { KUNNR: '0001000501', NAME1: 'Northwind Distributors', LAND1: 'US', KTOKD: 'Z001' },
    { KUNNR: '0001000502', NAME1: 'Alpine Trading AG', LAND1: 'CH', KTOKD: 'Z001' },
    { KUNNR: '0001000503', NAME1: 'Tokyo Retail Holdings', LAND1: 'JP', KTOKD: 'Z002' },
    { KUNNR: '0001000504', NAME1: 'Sunbelt Industries', LAND1: 'US', KTOKD: 'Z001' },
    { KUNNR: '0001000505', NAME1: 'Maple Leaf Logistics', LAND1: 'CA', KTOKD: 'Z002' },
  ],
  material: [
    { MATNR: 'RAW-STL-4120', MATKL: 'RAW-METAL', MEINS: 'KG', MTART: 'ROH' },
    { MATNR: 'RAW-STL-4130', MATKL: 'RAW-METAL', MEINS: 'KG', MTART: 'ROH' },
    { MATNR: 'PKG-BOX-12', MATKL: 'PACKAGING', MEINS: 'EA', MTART: 'VERP' },
    { MATNR: 'SPR-BRG-9', MATKL: 'SPARES', MEINS: 'EA', MTART: 'HALB' },
    { MATNR: 'ELC-PCB-22', MATKL: 'ELECTRONICS', MEINS: 'EA', MTART: 'HALB' },
    { MATNR: 'SRV-LOG-01', MATKL: 'SERVICES', MEINS: 'LOT', MTART: 'DIEN' },
  ],
};

function toCanonical(
  entity: ConnectorEntity,
  nativeRow: Record<string, any>
): Record<string, any> {
  const canonical: Record<string, any> = {};
  for (const m of entity.mappings) {
    canonical[m.canonical] = nativeRow[m.native];
  }
  return canonical;
}

export const sapS4HanaConnector: ERPConnector = {
  summary(): ConnectorSummary {
    const totalRows = ENTITIES.reduce((sum, e) => sum + e.rowCount, 0);
    return {
      id: 'sap_s4hana',
      name: 'SAP S/4HANA',
      vendor: 'SAP',
      version: '2023 FPS02',
      protocol: 'OData v4 / CDS Views',
      logo: 'SAP',
      status: state.status,
      baseUrl: state.baseUrl,
      lastSyncedAt: state.lastSyncedAt,
      entityCount: ENTITIES.length,
      totalRows,
    };
  },
  details(): ConnectorDetails {
    return { ...this.summary(), entities: ENTITIES };
  },
  getEntityData(canonicalName: CanonicalEntityName): EntityDataResponse | null {
    const entity = ENTITIES.find(e => e.canonicalName === canonicalName);
    if (!entity) return null;
    const rows: DualRow[] = (DATA[canonicalName] || []).map(native => ({
      native,
      canonical: toCanonical(entity, native),
    }));
    return { connectorId: 'sap_s4hana', entity, rows };
  },
  connect(baseUrl?: string) {
    state.status = 'connected';
    if (baseUrl) state.baseUrl = baseUrl;
    state.lastSyncedAt = new Date().toISOString();
  },
  disconnect() {
    state.status = 'disconnected';
  },
  sync() {
    state.lastSyncedAt = new Date().toISOString();
  },
};
