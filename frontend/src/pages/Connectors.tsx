import { useEffect, useState } from 'react';
import {
    Database, CheckCircle2, XCircle, RefreshCw, Plug, Table as TableIcon,
    ArrowRightLeft, Loader, Zap,
} from 'lucide-react';
import SectionCard from '../components/shared/SectionCard';
import StatusBadge from '../components/shared/StatusBadge';
import {
    fetchConnectors, fetchConnectorDetails, fetchConnectorEntityData,
    connectConnector, disconnectConnector, syncConnector,
    type ConnectorSummary, type ConnectorDetails, type ConnectorEntity, type DualRow,
} from '../services/api';
import { formatRelativeTime } from '../utils/format';
import './Connectors.css';

type ViewMode = 'native' | 'canonical' | 'mapping';

export default function Connectors() {
    const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [details, setDetails] = useState<ConnectorDetails | null>(null);
    const [selectedEntity, setSelectedEntity] = useState<ConnectorEntity | null>(null);
    const [rows, setRows] = useState<DualRow[]>([]);
    const [rowsLoading, setRowsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('native');
    const [busy, setBusy] = useState(false);

    // Load list on mount
    useEffect(() => {
        setLoading(true);
        fetchConnectors()
            .then(data => {
                setConnectors(data.connectors);
                // Auto-select first connected, else first in list
                const first = data.connectors.find(c => c.status === 'connected') || data.connectors[0];
                if (first) setSelectedId(first.id);
            })
            .catch(err => console.error('Failed to load connectors:', err))
            .finally(() => setLoading(false));
    }, []);

    // Load details when selection changes
    useEffect(() => {
        if (!selectedId) return;
        fetchConnectorDetails(selectedId)
            .then(data => {
                setDetails(data.connector);
                // Auto-select first entity
                if (data.connector.entities.length > 0) {
                    setSelectedEntity(data.connector.entities[0]);
                } else {
                    setSelectedEntity(null);
                    setRows([]);
                }
            })
            .catch(err => console.error('Failed to load connector details:', err));
    }, [selectedId]);

    // Load entity rows when entity changes
    useEffect(() => {
        if (!selectedId || !selectedEntity) return;
        setRowsLoading(true);
        fetchConnectorEntityData(selectedId, selectedEntity.canonicalName)
            .then(data => setRows(data.rows))
            .catch(err => console.error('Failed to load entity data:', err))
            .finally(() => setRowsLoading(false));
    }, [selectedId, selectedEntity]);

    const refreshSummaries = async () => {
        const data = await fetchConnectors();
        setConnectors(data.connectors);
    };

    const handleConnect = async () => {
        if (!selectedId || !details) return;
        setBusy(true);
        try {
            await connectConnector(selectedId, details.baseUrl);
            const fresh = await fetchConnectorDetails(selectedId);
            setDetails(fresh.connector);
            await refreshSummaries();
        } finally { setBusy(false); }
    };

    const handleDisconnect = async () => {
        if (!selectedId) return;
        setBusy(true);
        try {
            await disconnectConnector(selectedId);
            const fresh = await fetchConnectorDetails(selectedId);
            setDetails(fresh.connector);
            await refreshSummaries();
        } finally { setBusy(false); }
    };

    const handleSync = async () => {
        if (!selectedId) return;
        setBusy(true);
        try {
            await syncConnector(selectedId);
            const fresh = await fetchConnectorDetails(selectedId);
            setDetails(fresh.connector);
            await refreshSummaries();
        } finally { setBusy(false); }
    };

    const columnsForView = (): string[] => {
        if (!selectedEntity || rows.length === 0) return [];
        if (viewMode === 'native') return selectedEntity.mappings.map(m => m.native);
        return selectedEntity.mappings.map(m => m.canonical);
    };

    const formatCell = (val: any, type?: string): string => {
        if (val === null || val === undefined || val === '') return '—';
        if (type === 'currency' && typeof val === 'number') {
            return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
        }
        if (type === 'boolean') return val ? 'Yes' : 'No';
        return String(val);
    };

    const isConnected = details?.status === 'connected';

    return (
        <div className="connectors-page">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">ERP Connectors</h1>
                    <p className="page-header__subtitle">
                        ERP-agnostic data ingestion. Native tables on the left, canonical schema on the right — the same data, two views.
                    </p>
                </div>
            </div>

            {/* Connector cards */}
            {loading ? (
                <div className="connectors-loading"><Loader size={18} className="spin" /> Loading connectors...</div>
            ) : (
                <div className="connectors-grid">
                    {connectors.map(c => {
                        const isSel = c.id === selectedId;
                        return (
                            <button
                                key={c.id}
                                className={`connector-card ${isSel ? 'connector-card--selected' : ''}`}
                                onClick={() => setSelectedId(c.id)}
                            >
                                <div className="connector-card__header">
                                    <div className="connector-card__logo">{c.logo}</div>
                                    <div className="connector-card__status">
                                        {c.status === 'connected' ? (
                                            <span className="status-dot status-dot--green"><CheckCircle2 size={14} /> Connected</span>
                                        ) : c.status === 'error' ? (
                                            <span className="status-dot status-dot--red"><XCircle size={14} /> Error</span>
                                        ) : (
                                            <span className="status-dot status-dot--gray"><XCircle size={14} /> Disconnected</span>
                                        )}
                                    </div>
                                </div>
                                <div className="connector-card__name">{c.name}</div>
                                <div className="connector-card__vendor">{c.vendor} · {c.version}</div>
                                <div className="connector-card__meta">
                                    <span><Database size={12} /> {c.entityCount} entities</span>
                                    <span><TableIcon size={12} /> {c.totalRows} rows</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {details && (
                <>
                    {/* Connection bar */}
                    <SectionCard title={`${details.name} · Connection`}>
                        <div className="conn-bar">
                            <div className="conn-bar__info">
                                <div className="conn-bar__row">
                                    <span className="conn-bar__label">Protocol</span>
                                    <span className="conn-bar__val">{details.protocol}</span>
                                </div>
                                <div className="conn-bar__row">
                                    <span className="conn-bar__label">Base URL</span>
                                    <code className="conn-bar__url">{details.baseUrl || '—'}</code>
                                </div>
                                <div className="conn-bar__row">
                                    <span className="conn-bar__label">Last synced</span>
                                    <span className="conn-bar__val">
                                        {details.lastSyncedAt ? formatRelativeTime(details.lastSyncedAt) : 'Never'}
                                    </span>
                                </div>
                            </div>
                            <div className="conn-bar__actions">
                                {isConnected ? (
                                    <>
                                        <button className="conn-btn conn-btn--primary" onClick={handleSync} disabled={busy}>
                                            {busy ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />} Sync now
                                        </button>
                                        <button className="conn-btn conn-btn--ghost" onClick={handleDisconnect} disabled={busy}>
                                            <XCircle size={14} /> Disconnect
                                        </button>
                                    </>
                                ) : (
                                    <button className="conn-btn conn-btn--primary" onClick={handleConnect} disabled={busy}>
                                        {busy ? <Loader size={14} className="spin" /> : <Plug size={14} />} Connect
                                    </button>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                    {/* Entity explorer */}
                    <div className="entity-explorer">
                        <aside className="entity-list">
                            <div className="entity-list__title">Entities</div>
                            {details.entities.map(e => {
                                const isSel = selectedEntity?.canonicalName === e.canonicalName;
                                return (
                                    <button
                                        key={e.canonicalName}
                                        className={`entity-item ${isSel ? 'entity-item--selected' : ''}`}
                                        onClick={() => setSelectedEntity(e)}
                                    >
                                        <div className="entity-item__name">{e.displayName}</div>
                                        <div className="entity-item__native"><code>{e.nativeTable}</code></div>
                                        <div className="entity-item__count">{e.rowCount} rows</div>
                                    </button>
                                );
                            })}
                        </aside>

                        <div className="entity-viewer">
                            {!selectedEntity ? (
                                <div className="entity-viewer__empty">Select an entity to view its data</div>
                            ) : (
                                <>
                                    <div className="entity-viewer__header">
                                        <div>
                                            <h3 className="entity-viewer__title">{selectedEntity.displayName}</h3>
                                            <p className="entity-viewer__desc">{selectedEntity.description}</p>
                                        </div>
                                        <div className="view-tabs">
                                            <button
                                                className={`view-tab ${viewMode === 'native' ? 'view-tab--active' : ''}`}
                                                onClick={() => setViewMode('native')}
                                            >
                                                <Database size={13} /> Native ({selectedEntity.nativeTable})
                                            </button>
                                            <button
                                                className={`view-tab ${viewMode === 'canonical' ? 'view-tab--active' : ''}`}
                                                onClick={() => setViewMode('canonical')}
                                            >
                                                <Zap size={13} /> Canonical
                                            </button>
                                            <button
                                                className={`view-tab ${viewMode === 'mapping' ? 'view-tab--active' : ''}`}
                                                onClick={() => setViewMode('mapping')}
                                            >
                                                <ArrowRightLeft size={13} /> Mapping
                                            </button>
                                        </div>
                                    </div>

                                    {rowsLoading ? (
                                        <div className="entity-viewer__loading"><Loader size={16} className="spin" /> Loading rows...</div>
                                    ) : viewMode === 'mapping' ? (
                                        <div className="mapping-table-wrapper">
                                            <table className="mapping-table">
                                                <thead>
                                                    <tr>
                                                        <th>Native Field</th>
                                                        <th></th>
                                                        <th>Canonical Field</th>
                                                        <th>Type</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedEntity.mappings.map(m => (
                                                        <tr key={m.native}>
                                                            <td><code className="native-code">{m.native}</code></td>
                                                            <td className="mapping-arrow"><ArrowRightLeft size={14} /></td>
                                                            <td><code className="canonical-code">{m.canonical}</code></td>
                                                            <td><StatusBadge label={m.type} /></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="data-table-wrapper">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        {columnsForView().map(col => (
                                                            <th key={col}>
                                                                <code className={viewMode === 'native' ? 'native-code' : 'canonical-code'}>
                                                                    {col}
                                                                </code>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rows.map((row, i) => {
                                                        const data = viewMode === 'native' ? row.native : row.canonical;
                                                        return (
                                                            <tr key={i}>
                                                                {selectedEntity.mappings.map(m => {
                                                                    const key = viewMode === 'native' ? m.native : m.canonical;
                                                                    return <td key={key}>{formatCell(data[key], m.type)}</td>;
                                                                })}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
