import { ERPConnector } from './types';
import { sapS4HanaConnector } from './sapS4HanaConnector';
import { dynamicsConnector } from './dynamicsConnector';

/**
 * Central registry of ERP connectors. Adding a new ERP (Oracle, NetSuite, Workday)
 * is one line here once its adapter is implemented.
 */
export const connectorRegistry: Record<string, ERPConnector> = {
  sap_s4hana: sapS4HanaConnector,
  dynamics_365: dynamicsConnector,
};

export function getConnector(id: string): ERPConnector | null {
  return connectorRegistry[id] || null;
}

export function listConnectors(): ERPConnector[] {
  return Object.values(connectorRegistry);
}
