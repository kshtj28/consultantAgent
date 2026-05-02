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
  {
    canonicalName: 'invoice',
    displayName: 'Vendor Invoices',
    nativeTable: 'RBKP',
    description: 'Logistics Invoice Verification headers (OData: API_SUPPLIERINVOICE_PROCESS_SRV)',
    mappings: [
      { native: 'BELNR', canonical: 'invoiceId', type: 'string', description: 'Invoice document number' },
      { native: 'BUKRS', canonical: 'companyCode', type: 'string' },
      { native: 'LIFNR', canonical: 'vendorId', type: 'string' },
      { native: 'BLDAT', canonical: 'invoiceDate', type: 'date' },
      { native: 'FAEDT', canonical: 'dueDate', type: 'date' },
      { native: 'ZLDAT', canonical: 'paymentDate', type: 'date' },
      { native: 'WRBTR', canonical: 'amount', type: 'currency' },
      { native: 'WAERS', canonical: 'currency', type: 'string' },
      { native: 'RBSTAT', canonical: 'status', type: 'string' },
    ],
    rowCount: 9,
  },
  {
    canonicalName: 'ar_item',
    displayName: 'Accounts Receivable Items',
    nativeTable: 'BSID / BSAD',
    description: 'Customer open and cleared AR line items',
    mappings: [
      { native: 'KUNNR', canonical: 'customerId', type: 'string' },
      { native: 'BELNR', canonical: 'documentNumber', type: 'string' },
      { native: 'BUDAT', canonical: 'postingDate', type: 'date' },
      { native: 'FAEDT', canonical: 'dueDate', type: 'date' },
      { native: 'DMBTR', canonical: 'amount', type: 'currency' },
      { native: 'WAERS', canonical: 'currency', type: 'string' },
      { native: 'ZTERM', canonical: 'paymentTerms', type: 'string' },
      { native: 'VERZN', canonical: 'daysPastDue', type: 'number' },
    ],
    rowCount: 8,
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
  invoice: [
    { BELNR: 'INV-2026-0451', BUKRS: '1000', LIFNR: '100045', BLDAT: '2026-02-01', FAEDT: '2026-03-03', ZLDAT: '2026-03-10', WRBTR: 84500.0, WAERS: 'USD', RBSTAT: 'Paid' },
    { BELNR: 'INV-2026-0452', BUKRS: '1000', LIFNR: '100051', BLDAT: '2026-02-08', FAEDT: '2026-03-10', ZLDAT: '2026-03-28', WRBTR: 12750.5, WAERS: 'EUR', RBSTAT: 'Paid' },
    { BELNR: 'INV-2026-0453', BUKRS: '2000', LIFNR: '100088', BLDAT: '2026-02-15', FAEDT: '2026-03-17', ZLDAT: null, WRBTR: 245000.0, WAERS: 'USD', RBSTAT: 'Open' },
    { BELNR: 'INV-2026-0454', BUKRS: '1000', LIFNR: '100045', BLDAT: '2026-02-22', FAEDT: '2026-03-24', ZLDAT: '2026-03-22', WRBTR: 3200.0, WAERS: 'USD', RBSTAT: 'Paid' },
    { BELNR: 'INV-2026-0455', BUKRS: '3000', LIFNR: '100102', BLDAT: '2026-03-01', FAEDT: '2026-03-31', ZLDAT: null, WRBTR: 56320.75, WAERS: 'GBP', RBSTAT: 'Overdue' },
    { BELNR: 'INV-2026-0456', BUKRS: '1000', LIFNR: '100051', BLDAT: '2026-03-10', FAEDT: '2026-04-09', ZLDAT: null, WRBTR: 8900.0, WAERS: 'EUR', RBSTAT: 'Open' },
    { BELNR: 'INV-2026-0457', BUKRS: '2000', LIFNR: '100088', BLDAT: '2026-03-18', FAEDT: '2026-04-17', ZLDAT: '2026-04-20', WRBTR: 19450.25, WAERS: 'USD', RBSTAT: 'Paid' },
    { BELNR: 'INV-2026-0458', BUKRS: '1000', LIFNR: '100119', BLDAT: '2026-03-25', FAEDT: '2026-04-24', ZLDAT: null, WRBTR: 31000.0, WAERS: 'USD', RBSTAT: 'Blocked' },
    { BELNR: 'INV-2026-0459', BUKRS: '1000', LIFNR: '100045', BLDAT: '2026-04-01', FAEDT: '2026-05-01', ZLDAT: null, WRBTR: 47800.0, WAERS: 'USD', RBSTAT: 'Open' },
  ],
  ar_item: [
    { KUNNR: '0001000501', BELNR: 'AR-2026-1001', BUDAT: '2026-01-15', FAEDT: '2026-02-14', DMBTR: 28400.0, WAERS: 'USD', ZTERM: 'NT30', VERZN: 0 },
    { KUNNR: '0001000502', BELNR: 'AR-2026-1002', BUDAT: '2026-01-22', FAEDT: '2026-02-21', DMBTR: 15600.0, WAERS: 'CHF', ZTERM: 'NT30', VERZN: 0 },
    { KUNNR: '0001000503', BELNR: 'AR-2026-1003', BUDAT: '2026-02-01', FAEDT: '2026-03-03', DMBTR: 42000.0, WAERS: 'USD', ZTERM: 'NT30', VERZN: 18 },
    { KUNNR: '0001000501', BELNR: 'AR-2026-1004', BUDAT: '2026-02-10', FAEDT: '2026-03-12', DMBTR: 8750.0, WAERS: 'USD', ZTERM: 'NT30', VERZN: 9 },
    { KUNNR: '0001000504', BELNR: 'AR-2026-1005', BUDAT: '2026-02-20', FAEDT: '2026-03-22', DMBTR: 63200.0, WAERS: 'USD', ZTERM: 'NT30', VERZN: 0 },
    { KUNNR: '0001000505', BELNR: 'AR-2026-1006', BUDAT: '2026-03-05', FAEDT: '2026-04-04', DMBTR: 19800.0, WAERS: 'CAD', ZTERM: 'NT30', VERZN: 28 },
    { KUNNR: '0001000503', BELNR: 'AR-2026-1007', BUDAT: '2026-03-15', FAEDT: '2026-04-14', DMBTR: 35500.0, WAERS: 'USD', ZTERM: 'NT30', VERZN: 18 },
    { KUNNR: '0001000502', BELNR: 'AR-2026-1008', BUDAT: '2026-03-28', FAEDT: '2026-04-27', DMBTR: 11200.0, WAERS: 'CHF', ZTERM: 'NT30', VERZN: 5 },
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
