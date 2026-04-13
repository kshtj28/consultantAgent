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
 * Microsoft Dynamics 365 F&O Adapter — Layer 1.
 * Speaks Dataverse Web API / OData v4. Uses standard F&O data entities
 * (PurchPurchaseOrderHeaderV2, VendVendorV2, etc.).
 */

interface ConnState {
  status: 'connected' | 'disconnected' | 'error';
  baseUrl: string;
  lastSyncedAt?: string;
}

const state: ConnState = {
  status: 'disconnected',
  baseUrl: 'https://demo-client.dynamics.com/api/data/v9.2',
  lastSyncedAt: undefined,
};

const ENTITIES: ConnectorEntity[] = [
  {
    canonicalName: 'purchase_order',
    displayName: 'Purchase Orders',
    nativeTable: 'PurchPurchaseOrderHeaderV2',
    description: 'Purchase order headers (D365 F&O data entity)',
    mappings: [
      { native: 'PurchaseOrderNumber', canonical: 'poId', type: 'string' },
      { native: 'PurchaseOrderLegalEntity', canonical: 'companyCode', type: 'string' },
      { native: 'PurchaseOrderType', canonical: 'documentType', type: 'string' },
      { native: 'OrderVendorAccountNumber', canonical: 'vendorId', type: 'string' },
      { native: 'OrderedDate', canonical: 'createdDate', type: 'date' },
      { native: 'CurrencyCode', canonical: 'currency', type: 'string' },
      { native: 'PurchaseOrderTotalAmount', canonical: 'totalAmount', type: 'currency' },
      { native: 'ApprovalStatus', canonical: 'releaseStatus', type: 'string' },
    ],
    rowCount: 7,
  },
  {
    canonicalName: 'purchase_order_item',
    displayName: 'Purchase Order Lines',
    nativeTable: 'PurchPurchaseOrderLineV2',
    description: 'Purchase order line-level data',
    mappings: [
      { native: 'PurchaseOrderNumber', canonical: 'poId', type: 'string' },
      { native: 'LineNumber', canonical: 'lineItem', type: 'number' },
      { native: 'ItemNumber', canonical: 'materialId', type: 'string' },
      { native: 'OrderedQuantity', canonical: 'quantity', type: 'number' },
      { native: 'PurchaseUnitSymbol', canonical: 'unitOfMeasure', type: 'string' },
      { native: 'PurchasePrice', canonical: 'netPrice', type: 'currency' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'gl_entry',
    displayName: 'General Journal Entries',
    nativeTable: 'LedgerJournalAccountEntry',
    description: 'General ledger journal entries',
    mappings: [
      { native: 'VoucherNumber', canonical: 'documentNumber', type: 'string' },
      { native: 'CompanyCode', canonical: 'companyCode', type: 'string' },
      { native: 'FiscalYear', canonical: 'fiscalYear', type: 'number' },
      { native: 'AccountingDate', canonical: 'postingDate', type: 'date' },
      { native: 'LedgerAccount', canonical: 'glAccount', type: 'string' },
      { native: 'TransactionAmount', canonical: 'amount', type: 'currency' },
      { native: 'TransactionCurrencyCode', canonical: 'currency', type: 'string' },
    ],
    rowCount: 6,
  },
  {
    canonicalName: 'vendor',
    displayName: 'Vendors',
    nativeTable: 'VendVendorV2',
    description: 'Vendor master data entity',
    mappings: [
      { native: 'VendorAccountNumber', canonical: 'vendorId', type: 'string' },
      { native: 'VendorName', canonical: 'name', type: 'string' },
      { native: 'PrimaryContactCountryRegionId', canonical: 'country', type: 'string' },
      { native: 'PrimaryAddressStreet', canonical: 'street', type: 'string' },
      { native: 'PrimaryAddressCity', canonical: 'city', type: 'string' },
      { native: 'IsOnHold', canonical: 'isBlocked', type: 'boolean' },
    ],
    rowCount: 5,
  },
  {
    canonicalName: 'customer',
    displayName: 'Customers',
    nativeTable: 'CustCustomerV3',
    description: 'Customer master entity',
    mappings: [
      { native: 'CustomerAccount', canonical: 'customerId', type: 'string' },
      { native: 'OrganizationName', canonical: 'name', type: 'string' },
      { native: 'PrimaryContactCountryRegionId', canonical: 'country', type: 'string' },
      { native: 'CustomerGroupId', canonical: 'accountGroup', type: 'string' },
    ],
    rowCount: 4,
  },
  {
    canonicalName: 'material',
    displayName: 'Items',
    nativeTable: 'InventItemV2',
    description: 'Released products / items',
    mappings: [
      { native: 'ItemNumber', canonical: 'materialId', type: 'string' },
      { native: 'ItemGroupId', canonical: 'materialGroup', type: 'string' },
      { native: 'InventoryUnitSymbol', canonical: 'baseUnit', type: 'string' },
      { native: 'ProductType', canonical: 'materialType', type: 'string' },
    ],
    rowCount: 5,
  },
];

const DATA: Record<CanonicalEntityName, Record<string, any>[]> = {
  purchase_order: [
    { PurchaseOrderNumber: 'PO-000812', PurchaseOrderLegalEntity: 'USMF', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1001', OrderedDate: '2026-03-12', CurrencyCode: 'USD', PurchaseOrderTotalAmount: 64200.0, ApprovalStatus: 'Approved' },
    { PurchaseOrderNumber: 'PO-000813', PurchaseOrderLegalEntity: 'USMF', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1004', OrderedDate: '2026-03-19', CurrencyCode: 'USD', PurchaseOrderTotalAmount: 9750.0, ApprovalStatus: 'Approved' },
    { PurchaseOrderNumber: 'PO-000814', PurchaseOrderLegalEntity: 'DEMF', PurchaseOrderType: 'Blanket', OrderVendorAccountNumber: 'V-1008', OrderedDate: '2026-03-21', CurrencyCode: 'EUR', PurchaseOrderTotalAmount: 189000.0, ApprovalStatus: 'Draft' },
    { PurchaseOrderNumber: 'PO-000815', PurchaseOrderLegalEntity: 'USMF', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1001', OrderedDate: '2026-04-01', CurrencyCode: 'USD', PurchaseOrderTotalAmount: 2800.0, ApprovalStatus: 'Approved' },
    { PurchaseOrderNumber: 'PO-000816', PurchaseOrderLegalEntity: 'GBSI', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1012', OrderedDate: '2026-04-04', CurrencyCode: 'GBP', PurchaseOrderTotalAmount: 41560.0, ApprovalStatus: 'Approved' },
    { PurchaseOrderNumber: 'PO-000817', PurchaseOrderLegalEntity: 'USMF', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1004', OrderedDate: '2026-04-07', CurrencyCode: 'USD', PurchaseOrderTotalAmount: 15200.5, ApprovalStatus: 'In review' },
    { PurchaseOrderNumber: 'PO-000818', PurchaseOrderLegalEntity: 'DEMF', PurchaseOrderType: 'Purchase', OrderVendorAccountNumber: 'V-1008', OrderedDate: '2026-04-10', CurrencyCode: 'EUR', PurchaseOrderTotalAmount: 7600.0, ApprovalStatus: 'Approved' },
  ],
  purchase_order_item: [
    { PurchaseOrderNumber: 'PO-000812', LineNumber: 1, ItemNumber: 'ITM-STL-A01', OrderedQuantity: 400, PurchaseUnitSymbol: 'kg', PurchasePrice: 72.5 },
    { PurchaseOrderNumber: 'PO-000812', LineNumber: 2, ItemNumber: 'ITM-STL-A02', OrderedQuantity: 250, PurchaseUnitSymbol: 'kg', PurchasePrice: 80.0 },
    { PurchaseOrderNumber: 'PO-000813', LineNumber: 1, ItemNumber: 'ITM-PKG-01', OrderedQuantity: 1200, PurchaseUnitSymbol: 'ea', PurchasePrice: 8.125 },
    { PurchaseOrderNumber: 'PO-000815', LineNumber: 1, ItemNumber: 'ITM-SPR-B7', OrderedQuantity: 35, PurchaseUnitSymbol: 'ea', PurchasePrice: 80.0 },
    { PurchaseOrderNumber: 'PO-000816', LineNumber: 1, ItemNumber: 'ITM-ELC-22', OrderedQuantity: 160, PurchaseUnitSymbol: 'ea', PurchasePrice: 259.75 },
  ],
  gl_entry: [
    { VoucherNumber: 'VCH-00101', CompanyCode: 'USMF', FiscalYear: 2026, AccountingDate: '2026-03-12', LedgerAccount: '600110', TransactionAmount: 64200.0, TransactionCurrencyCode: 'USD' },
    { VoucherNumber: 'VCH-00102', CompanyCode: 'USMF', FiscalYear: 2026, AccountingDate: '2026-03-19', LedgerAccount: '600110', TransactionAmount: 9750.0, TransactionCurrencyCode: 'USD' },
    { VoucherNumber: 'VCH-00103', CompanyCode: 'DEMF', FiscalYear: 2026, AccountingDate: '2026-03-21', LedgerAccount: '610200', TransactionAmount: 189000.0, TransactionCurrencyCode: 'EUR' },
    { VoucherNumber: 'VCH-00104', CompanyCode: 'USMF', FiscalYear: 2026, AccountingDate: '2026-04-01', LedgerAccount: '600110', TransactionAmount: 2800.0, TransactionCurrencyCode: 'USD' },
    { VoucherNumber: 'VCH-00105', CompanyCode: 'GBSI', FiscalYear: 2026, AccountingDate: '2026-04-04', LedgerAccount: '600110', TransactionAmount: 41560.0, TransactionCurrencyCode: 'GBP' },
    { VoucherNumber: 'VCH-00106', CompanyCode: 'USMF', FiscalYear: 2026, AccountingDate: '2026-04-07', LedgerAccount: '130100', TransactionAmount: 15200.5, TransactionCurrencyCode: 'USD' },
  ],
  vendor: [
    { VendorAccountNumber: 'V-1001', VendorName: 'Acme Steel Industries', PrimaryContactCountryRegionId: 'USA', PrimaryAddressStreet: '4500 Industrial Pkwy', PrimaryAddressCity: 'Pittsburgh', IsOnHold: false },
    { VendorAccountNumber: 'V-1004', VendorName: 'EuroPack GmbH', PrimaryContactCountryRegionId: 'DEU', PrimaryAddressStreet: 'Mühlenweg 14', PrimaryAddressCity: 'Stuttgart', IsOnHold: false },
    { VendorAccountNumber: 'V-1008', VendorName: 'Global Logistics Solutions', PrimaryContactCountryRegionId: 'USA', PrimaryAddressStreet: '900 Harbor Blvd', PrimaryAddressCity: 'Long Beach', IsOnHold: false },
    { VendorAccountNumber: 'V-1012', VendorName: 'Britannia Electronics Ltd', PrimaryContactCountryRegionId: 'GBR', PrimaryAddressStreet: '22 Kingsway', PrimaryAddressCity: 'Manchester', IsOnHold: false },
    { VendorAccountNumber: 'V-1019', VendorName: 'Pacific Components Inc', PrimaryContactCountryRegionId: 'USA', PrimaryAddressStreet: '155 Tech Dr', PrimaryAddressCity: 'San Jose', IsOnHold: true },
  ],
  customer: [
    { CustomerAccount: 'C-2001', OrganizationName: 'Northwind Distributors', PrimaryContactCountryRegionId: 'USA', CustomerGroupId: 'GROUP-10' },
    { CustomerAccount: 'C-2002', OrganizationName: 'Alpine Trading AG', PrimaryContactCountryRegionId: 'CHE', CustomerGroupId: 'GROUP-10' },
    { CustomerAccount: 'C-2003', OrganizationName: 'Tokyo Retail Holdings', PrimaryContactCountryRegionId: 'JPN', CustomerGroupId: 'GROUP-20' },
    { CustomerAccount: 'C-2004', OrganizationName: 'Sunbelt Industries', PrimaryContactCountryRegionId: 'USA', CustomerGroupId: 'GROUP-10' },
  ],
  material: [
    { ItemNumber: 'ITM-STL-A01', ItemGroupId: 'RAW-METAL', InventoryUnitSymbol: 'kg', ProductType: 'Item' },
    { ItemNumber: 'ITM-STL-A02', ItemGroupId: 'RAW-METAL', InventoryUnitSymbol: 'kg', ProductType: 'Item' },
    { ItemNumber: 'ITM-PKG-01', ItemGroupId: 'PACKAGING', InventoryUnitSymbol: 'ea', ProductType: 'Item' },
    { ItemNumber: 'ITM-SPR-B7', ItemGroupId: 'SPARES', InventoryUnitSymbol: 'ea', ProductType: 'Item' },
    { ItemNumber: 'ITM-ELC-22', ItemGroupId: 'ELECTRONICS', InventoryUnitSymbol: 'ea', ProductType: 'Item' },
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

export const dynamicsConnector: ERPConnector = {
  summary(): ConnectorSummary {
    const totalRows = ENTITIES.reduce((sum, e) => sum + e.rowCount, 0);
    return {
      id: 'dynamics_365',
      name: 'Microsoft Dynamics 365 F&O',
      vendor: 'Microsoft',
      version: '10.0.39',
      protocol: 'Dataverse / OData v4',
      logo: 'D365',
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
    return { connectorId: 'dynamics_365', entity, rows };
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
