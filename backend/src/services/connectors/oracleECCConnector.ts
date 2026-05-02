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
 * Oracle EBS / ECC Adapter — Layer 1.
 * Speaks Oracle REST Data Services (ORDS) / JDBC. Knows native tables
 * PO_HEADERS_ALL, AP_INVOICES_ALL, GL_JE_LINES, AP_SUPPLIERS, HZ_PARTIES, MTL_SYSTEM_ITEMS_B.
 */

interface ConnState {
  status: 'connected' | 'disconnected' | 'error';
  baseUrl: string;
  lastSyncedAt?: string;
}

const state: ConnState = {
  status: 'disconnected',
  baseUrl: 'https://demo-client.oracle.com/ords/fin',
  lastSyncedAt: undefined,
};

const ENTITIES: ConnectorEntity[] = [
  {
    canonicalName: 'purchase_order',
    displayName: 'Purchase Orders',
    nativeTable: 'PO_HEADERS_ALL',
    description: 'Purchase order headers (Oracle Procurement Cloud / EBS)',
    mappings: [
      { native: 'PO_NUMBER', canonical: 'poId', type: 'string', description: 'PO number' },
      { native: 'ORG_ID', canonical: 'companyCode', type: 'string' },
      { native: 'TYPE_LOOKUP_CODE', canonical: 'documentType', type: 'string' },
      { native: 'VENDOR_ID', canonical: 'vendorId', type: 'string' },
      { native: 'CREATION_DATE', canonical: 'createdDate', type: 'date' },
      { native: 'CURRENCY_CODE', canonical: 'currency', type: 'string' },
      { native: 'AMOUNT_LIMIT', canonical: 'totalAmount', type: 'currency' },
      { native: 'AUTHORIZATION_STATUS', canonical: 'releaseStatus', type: 'string' },
    ],
    rowCount: 7,
  },
  {
    canonicalName: 'purchase_order_item',
    displayName: 'Purchase Order Lines',
    nativeTable: 'PO_LINES_ALL',
    description: 'Purchase order line items',
    mappings: [
      { native: 'PO_NUMBER', canonical: 'poId', type: 'string' },
      { native: 'LINE_NUM', canonical: 'lineItem', type: 'number' },
      { native: 'ITEM_ID', canonical: 'materialId', type: 'string' },
      { native: 'QUANTITY', canonical: 'quantity', type: 'number' },
      { native: 'UNIT_MEAS_LOOKUP_CODE', canonical: 'unitOfMeasure', type: 'string' },
      { native: 'UNIT_PRICE', canonical: 'netPrice', type: 'currency' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'gl_entry',
    displayName: 'Journal Entry Lines',
    nativeTable: 'GL_JE_LINES',
    description: 'General ledger journal entry lines',
    mappings: [
      { native: 'JE_HEADER_ID', canonical: 'documentNumber', type: 'string' },
      { native: 'LEDGER_ID', canonical: 'companyCode', type: 'string' },
      { native: 'PERIOD_YEAR', canonical: 'fiscalYear', type: 'number' },
      { native: 'EFFECTIVE_DATE', canonical: 'postingDate', type: 'date' },
      { native: 'CODE_COMBINATION_ID', canonical: 'glAccount', type: 'string' },
      { native: 'ACCOUNTED_DR', canonical: 'amount', type: 'currency' },
      { native: 'CURRENCY_CODE', canonical: 'currency', type: 'string' },
    ],
    rowCount: 6,
  },
  {
    canonicalName: 'vendor',
    displayName: 'Suppliers',
    nativeTable: 'AP_SUPPLIERS',
    description: 'Supplier master (Oracle AP module)',
    mappings: [
      { native: 'VENDOR_ID', canonical: 'vendorId', type: 'string' },
      { native: 'VENDOR_NAME', canonical: 'name', type: 'string' },
      { native: 'COUNTRY_OF_ORIGIN_CODE', canonical: 'country', type: 'string' },
      { native: 'ADDRESS_LINE1', canonical: 'street', type: 'string' },
      { native: 'CITY', canonical: 'city', type: 'string' },
      { native: 'HOLD_FLAG', canonical: 'isBlocked', type: 'boolean' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'customer',
    displayName: 'Customers',
    nativeTable: 'HZ_PARTIES',
    description: 'Trading community architecture — party (customer) master',
    mappings: [
      { native: 'PARTY_ID', canonical: 'customerId', type: 'string' },
      { native: 'PARTY_NAME', canonical: 'name', type: 'string' },
      { native: 'COUNTRY', canonical: 'country', type: 'string' },
      { native: 'CUSTOMER_CLASS_CODE', canonical: 'accountGroup', type: 'string' },
    ],
    rowCount: 4,
  },
  {
    canonicalName: 'material',
    displayName: 'Inventory Items',
    nativeTable: 'MTL_SYSTEM_ITEMS_B',
    description: 'Item master from Oracle Inventory module',
    mappings: [
      { native: 'SEGMENT1', canonical: 'materialId', type: 'string' },
      { native: 'ITEM_TYPE', canonical: 'materialGroup', type: 'string' },
      { native: 'PRIMARY_UOM_CODE', canonical: 'baseUnit', type: 'string' },
      { native: 'ITEM_TYPE_CODE', canonical: 'materialType', type: 'string' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'invoice',
    displayName: 'AP Invoices',
    nativeTable: 'AP_INVOICES_ALL',
    description: 'Accounts payable invoice headers',
    mappings: [
      { native: 'INVOICE_NUM', canonical: 'invoiceId', type: 'string' },
      { native: 'ORG_ID', canonical: 'companyCode', type: 'string' },
      { native: 'VENDOR_ID', canonical: 'vendorId', type: 'string' },
      { native: 'INVOICE_DATE', canonical: 'invoiceDate', type: 'date' },
      { native: 'DUE_DATE', canonical: 'dueDate', type: 'date' },
      { native: 'PAYMENT_STATUS_FLAG', canonical: 'paymentDate', type: 'date' },
      { native: 'INVOICE_AMOUNT', canonical: 'amount', type: 'currency' },
      { native: 'INVOICE_CURRENCY_CODE', canonical: 'currency', type: 'string' },
      { native: 'APPROVAL_STATUS', canonical: 'status', type: 'string' },
    ],
    rowCount: 8,
  },
  {
    canonicalName: 'ar_item',
    displayName: 'AR Payment Schedules',
    nativeTable: 'AR_PAYMENT_SCHEDULES_ALL',
    description: 'Customer receivables payment schedule lines',
    mappings: [
      { native: 'CUSTOMER_ID', canonical: 'customerId', type: 'string' },
      { native: 'TRX_NUMBER', canonical: 'documentNumber', type: 'string' },
      { native: 'TRX_DATE', canonical: 'postingDate', type: 'date' },
      { native: 'DUE_DATE', canonical: 'dueDate', type: 'date' },
      { native: 'AMOUNT_DUE_REMAINING', canonical: 'amount', type: 'currency' },
      { native: 'INVOICE_CURRENCY_CODE', canonical: 'currency', type: 'string' },
      { native: 'TERMS_SEQUENCE_NUMBER', canonical: 'paymentTerms', type: 'string' },
      { native: 'DAYS_PAST_DUE', canonical: 'daysPastDue', type: 'number' },
    ],
    rowCount: 7,
  },
];

const DATA: Record<CanonicalEntityName, Record<string, any>[]> = {
  purchase_order: [
    { PO_NUMBER: 'PO-ORA-00301', ORG_ID: '101', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2001', CREATION_DATE: '2026-03-10', CURRENCY_CODE: 'USD', AMOUNT_LIMIT: 92000.0, AUTHORIZATION_STATUS: 'APPROVED' },
    { PO_NUMBER: 'PO-ORA-00302', ORG_ID: '101', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2004', CREATION_DATE: '2026-03-15', CURRENCY_CODE: 'USD', AMOUNT_LIMIT: 11200.0, AUTHORIZATION_STATUS: 'APPROVED' },
    { PO_NUMBER: 'PO-ORA-00303', ORG_ID: '102', TYPE_LOOKUP_CODE: 'BLANKET', VENDOR_ID: 'S-2008', CREATION_DATE: '2026-03-20', CURRENCY_CODE: 'EUR', AMOUNT_LIMIT: 210000.0, AUTHORIZATION_STATUS: 'IN PROCESS' },
    { PO_NUMBER: 'PO-ORA-00304', ORG_ID: '101', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2001', CREATION_DATE: '2026-04-01', CURRENCY_CODE: 'USD', AMOUNT_LIMIT: 4100.0, AUTHORIZATION_STATUS: 'APPROVED' },
    { PO_NUMBER: 'PO-ORA-00305', ORG_ID: '103', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2012', CREATION_DATE: '2026-04-05', CURRENCY_CODE: 'GBP', AMOUNT_LIMIT: 48900.0, AUTHORIZATION_STATUS: 'APPROVED' },
    { PO_NUMBER: 'PO-ORA-00306', ORG_ID: '101', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2004', CREATION_DATE: '2026-04-09', CURRENCY_CODE: 'USD', AMOUNT_LIMIT: 17600.0, AUTHORIZATION_STATUS: 'PRE-APPROVED' },
    { PO_NUMBER: 'PO-ORA-00307', ORG_ID: '102', TYPE_LOOKUP_CODE: 'STANDARD', VENDOR_ID: 'S-2008', CREATION_DATE: '2026-04-12', CURRENCY_CODE: 'EUR', AMOUNT_LIMIT: 8300.0, AUTHORIZATION_STATUS: 'APPROVED' },
  ],
  purchase_order_item: [
    { PO_NUMBER: 'PO-ORA-00301', LINE_NUM: 1, ITEM_ID: 'ORG-STL-001', QUANTITY: 450, UNIT_MEAS_LOOKUP_CODE: 'KG', UNIT_PRICE: 80.0 },
    { PO_NUMBER: 'PO-ORA-00301', LINE_NUM: 2, ITEM_ID: 'ORG-STL-002', QUANTITY: 280, UNIT_MEAS_LOOKUP_CODE: 'KG', UNIT_PRICE: 85.0 },
    { PO_NUMBER: 'PO-ORA-00302', LINE_NUM: 1, ITEM_ID: 'ORG-PKG-01', QUANTITY: 1400, UNIT_MEAS_LOOKUP_CODE: 'EA', UNIT_PRICE: 8.0 },
    { PO_NUMBER: 'PO-ORA-00304', LINE_NUM: 1, ITEM_ID: 'ORG-SPR-07', QUANTITY: 38, UNIT_MEAS_LOOKUP_CODE: 'EA', UNIT_PRICE: 108.0 },
    { PO_NUMBER: 'PO-ORA-00305', LINE_NUM: 1, ITEM_ID: 'ORG-ELC-11', QUANTITY: 190, UNIT_MEAS_LOOKUP_CODE: 'EA', UNIT_PRICE: 257.0 },
  ],
  gl_entry: [
    { JE_HEADER_ID: 'JE-ORA-8801', LEDGER_ID: '1001', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-03-10', CODE_COMBINATION_ID: '4000.100.0000', ACCOUNTED_DR: 92000.0, CURRENCY_CODE: 'USD' },
    { JE_HEADER_ID: 'JE-ORA-8802', LEDGER_ID: '1001', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-03-15', CODE_COMBINATION_ID: '4000.100.0000', ACCOUNTED_DR: 11200.0, CURRENCY_CODE: 'USD' },
    { JE_HEADER_ID: 'JE-ORA-8803', LEDGER_ID: '1002', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-03-20', CODE_COMBINATION_ID: '4200.200.0000', ACCOUNTED_DR: 210000.0, CURRENCY_CODE: 'EUR' },
    { JE_HEADER_ID: 'JE-ORA-8804', LEDGER_ID: '1001', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-04-05', CODE_COMBINATION_ID: '4000.100.0000', ACCOUNTED_DR: 4100.0, CURRENCY_CODE: 'USD' },
    { JE_HEADER_ID: 'JE-ORA-8805', LEDGER_ID: '1003', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-04-09', CODE_COMBINATION_ID: '4100.300.0000', ACCOUNTED_DR: 48900.0, CURRENCY_CODE: 'GBP' },
    { JE_HEADER_ID: 'JE-ORA-8806', LEDGER_ID: '1001', PERIOD_YEAR: 2026, EFFECTIVE_DATE: '2026-04-12', CODE_COMBINATION_ID: '1300.100.0000', ACCOUNTED_DR: 17600.0, CURRENCY_CODE: 'USD' },
  ],
  vendor: [
    { VENDOR_ID: 'S-2001', VENDOR_NAME: 'Acme Steel Industries', COUNTRY_OF_ORIGIN_CODE: 'US', ADDRESS_LINE1: '4500 Industrial Pkwy', CITY: 'Pittsburgh', HOLD_FLAG: 'N' },
    { VENDOR_ID: 'S-2004', VENDOR_NAME: 'EuroPack GmbH', COUNTRY_OF_ORIGIN_CODE: 'DE', ADDRESS_LINE1: 'Mühlenweg 14', CITY: 'Stuttgart', HOLD_FLAG: 'N' },
    { VENDOR_ID: 'S-2008', VENDOR_NAME: 'Global Logistics Solutions', COUNTRY_OF_ORIGIN_CODE: 'US', ADDRESS_LINE1: '900 Harbor Blvd', CITY: 'Long Beach', HOLD_FLAG: 'N' },
    { VENDOR_ID: 'S-2012', VENDOR_NAME: 'Britannia Electronics Ltd', COUNTRY_OF_ORIGIN_CODE: 'GB', ADDRESS_LINE1: '22 Kingsway', CITY: 'Manchester', HOLD_FLAG: 'N' },
    { VENDOR_ID: 'S-2019', VENDOR_NAME: 'Pacific Components Inc', COUNTRY_OF_ORIGIN_CODE: 'US', ADDRESS_LINE1: '155 Tech Dr', CITY: 'San Jose', HOLD_FLAG: 'Y' },
  ],
  customer: [
    { PARTY_ID: 'P-3001', PARTY_NAME: 'Northwind Distributors', COUNTRY: 'US', CUSTOMER_CLASS_CODE: 'WHOLESALE' },
    { PARTY_ID: 'P-3002', PARTY_NAME: 'Alpine Trading AG', COUNTRY: 'CH', CUSTOMER_CLASS_CODE: 'WHOLESALE' },
    { PARTY_ID: 'P-3003', PARTY_NAME: 'Tokyo Retail Holdings', COUNTRY: 'JP', CUSTOMER_CLASS_CODE: 'RETAIL' },
    { PARTY_ID: 'P-3004', PARTY_NAME: 'Sunbelt Industries', COUNTRY: 'US', CUSTOMER_CLASS_CODE: 'WHOLESALE' },
  ],
  material: [
    { SEGMENT1: 'ORG-STL-001', ITEM_TYPE: 'RAW', PRIMARY_UOM_CODE: 'KG', ITEM_TYPE_CODE: 'STD' },
    { SEGMENT1: 'ORG-STL-002', ITEM_TYPE: 'RAW', PRIMARY_UOM_CODE: 'KG', ITEM_TYPE_CODE: 'STD' },
    { SEGMENT1: 'ORG-PKG-01', ITEM_TYPE: 'PACK', PRIMARY_UOM_CODE: 'EA', ITEM_TYPE_CODE: 'PKG' },
    { SEGMENT1: 'ORG-SPR-07', ITEM_TYPE: 'SPARE', PRIMARY_UOM_CODE: 'EA', ITEM_TYPE_CODE: 'MRO' },
    { SEGMENT1: 'ORG-ELC-11', ITEM_TYPE: 'ELEC', PRIMARY_UOM_CODE: 'EA', ITEM_TYPE_CODE: 'MFG' },
  ],
  invoice: [
    { INVOICE_NUM: 'AP-ORA-6001', ORG_ID: '101', VENDOR_ID: 'S-2001', INVOICE_DATE: '2026-02-05', DUE_DATE: '2026-03-07', PAYMENT_STATUS_FLAG: '2026-03-14', INVOICE_AMOUNT: 92000.0, INVOICE_CURRENCY_CODE: 'USD', APPROVAL_STATUS: 'APPROVED' },
    { INVOICE_NUM: 'AP-ORA-6002', ORG_ID: '101', VENDOR_ID: 'S-2004', INVOICE_DATE: '2026-02-12', DUE_DATE: '2026-03-14', PAYMENT_STATUS_FLAG: '2026-04-01', INVOICE_AMOUNT: 11200.0, INVOICE_CURRENCY_CODE: 'USD', APPROVAL_STATUS: 'APPROVED' },
    { INVOICE_NUM: 'AP-ORA-6003', ORG_ID: '102', VENDOR_ID: 'S-2008', INVOICE_DATE: '2026-02-20', DUE_DATE: '2026-03-22', PAYMENT_STATUS_FLAG: null, INVOICE_AMOUNT: 210000.0, INVOICE_CURRENCY_CODE: 'EUR', APPROVAL_STATUS: 'NEEDS REAPPROVAL' },
    { INVOICE_NUM: 'AP-ORA-6004', ORG_ID: '101', VENDOR_ID: 'S-2001', INVOICE_DATE: '2026-02-28', DUE_DATE: '2026-03-30', PAYMENT_STATUS_FLAG: '2026-03-28', INVOICE_AMOUNT: 4100.0, INVOICE_CURRENCY_CODE: 'USD', APPROVAL_STATUS: 'APPROVED' },
    { INVOICE_NUM: 'AP-ORA-6005', ORG_ID: '103', VENDOR_ID: 'S-2012', INVOICE_DATE: '2026-03-06', DUE_DATE: '2026-04-05', PAYMENT_STATUS_FLAG: null, INVOICE_CURRENCY_CODE: 'GBP', INVOICE_AMOUNT: 48900.0, APPROVAL_STATUS: 'OVERDUE' },
    { INVOICE_NUM: 'AP-ORA-6006', ORG_ID: '101', VENDOR_ID: 'S-2004', INVOICE_DATE: '2026-03-14', DUE_DATE: '2026-04-13', PAYMENT_STATUS_FLAG: null, INVOICE_AMOUNT: 17600.0, INVOICE_CURRENCY_CODE: 'USD', APPROVAL_STATUS: 'APPROVED' },
    { INVOICE_NUM: 'AP-ORA-6007', ORG_ID: '102', VENDOR_ID: 'S-2008', INVOICE_DATE: '2026-03-22', DUE_DATE: '2026-04-21', PAYMENT_STATUS_FLAG: '2026-04-24', INVOICE_AMOUNT: 8300.0, INVOICE_CURRENCY_CODE: 'EUR', APPROVAL_STATUS: 'APPROVED' },
    { INVOICE_NUM: 'AP-ORA-6008', ORG_ID: '101', VENDOR_ID: 'S-2019', INVOICE_DATE: '2026-03-30', DUE_DATE: '2026-04-29', PAYMENT_STATUS_FLAG: null, INVOICE_AMOUNT: 35500.0, INVOICE_CURRENCY_CODE: 'USD', APPROVAL_STATUS: 'ON HOLD' },
  ],
  ar_item: [
    { CUSTOMER_ID: 'P-3001', TRX_NUMBER: 'AR-ORA-9001', TRX_DATE: '2026-01-20', DUE_DATE: '2026-02-19', AMOUNT_DUE_REMAINING: 33600.0, INVOICE_CURRENCY_CODE: 'USD', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 0 },
    { CUSTOMER_ID: 'P-3002', TRX_NUMBER: 'AR-ORA-9002', TRX_DATE: '2026-01-28', DUE_DATE: '2026-02-27', AMOUNT_DUE_REMAINING: 17400.0, INVOICE_CURRENCY_CODE: 'CHF', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 0 },
    { CUSTOMER_ID: 'P-3003', TRX_NUMBER: 'AR-ORA-9003', TRX_DATE: '2026-02-08', DUE_DATE: '2026-03-10', AMOUNT_DUE_REMAINING: 51200.0, INVOICE_CURRENCY_CODE: 'USD', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 20 },
    { CUSTOMER_ID: 'P-3001', TRX_NUMBER: 'AR-ORA-9004', TRX_DATE: '2026-02-17', DUE_DATE: '2026-03-19', AMOUNT_DUE_REMAINING: 9800.0, INVOICE_CURRENCY_CODE: 'USD', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 11 },
    { CUSTOMER_ID: 'P-3004', TRX_NUMBER: 'AR-ORA-9005', TRX_DATE: '2026-02-25', DUE_DATE: '2026-03-27', AMOUNT_DUE_REMAINING: 68000.0, INVOICE_CURRENCY_CODE: 'USD', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 0 },
    { CUSTOMER_ID: 'P-3003', TRX_NUMBER: 'AR-ORA-9006', TRX_DATE: '2026-03-10', DUE_DATE: '2026-04-09', AMOUNT_DUE_REMAINING: 26400.0, INVOICE_CURRENCY_CODE: 'USD', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 23 },
    { CUSTOMER_ID: 'P-3002', TRX_NUMBER: 'AR-ORA-9007', TRX_DATE: '2026-03-22', DUE_DATE: '2026-04-21', AMOUNT_DUE_REMAINING: 13800.0, INVOICE_CURRENCY_CODE: 'CHF', TERMS_SEQUENCE_NUMBER: 'NET30', DAYS_PAST_DUE: 11 },
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

export const oracleECCConnector: ERPConnector = {
  summary(): ConnectorSummary {
    const totalRows = ENTITIES.reduce((sum, e) => sum + e.rowCount, 0);
    return {
      id: 'oracle_ecc',
      name: 'Oracle EBS / ECC',
      vendor: 'Oracle',
      version: '12.2.12',
      protocol: 'Oracle REST Data Services (ORDS)',
      logo: 'ORA',
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
    return { connectorId: 'oracle_ecc', entity, rows };
  },
  connect(baseUrl?: string) {
    state.status = 'connected';
    if (baseUrl) state.baseUrl = baseUrl;
    state.lastSyncedAt = new Date().toISOString();
  },
  disconnect() {
    state.status = 'disconnected';
    state.lastSyncedAt = undefined;
  },
  sync() {
    state.lastSyncedAt = new Date().toISOString();
  },
};
