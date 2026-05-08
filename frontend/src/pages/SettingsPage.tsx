import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bell, Shield, Database, Loader, Plug, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';
import {
    fetchLanguages,
    fetchDomains,
    getActiveDomain,
    setActiveDomain,
    fetchModels,
    fetchProjectSettings,
    updateProjectSettings,
    saveModelPreference,
    exportProjectData,
    archiveAssessments,
    deleteProjectData,
    getERPConnectionSettings,
    saveERPConnectionSettings,
    testERPConnection,
    type Language,
    type Domain,
    type ModelConfig,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import './SettingsPage.css';

interface ToggleState {
    criticalRiskAlerts: boolean;
    smeResponseUpdates: boolean;
    weeklySummary: boolean;
}

interface AvailableConnector { id: string; name: string; vendor: string; protocol: string; }

export default function SettingsPage() {
    const { isAdmin } = useAuth();
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const [languages, setLanguages] = useState<Language[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [currentDomain, setCurrentDomain] = useState<Domain | null>(null);
    const [selectedDomainId, setSelectedDomainId] = useState('');
    const [selectedModel, setSelectedModel] = useState('');
    const [selectedLanguage, setSelectedLanguage] = useState(language);
    const [projectName, setProjectName] = useState('');
    const [clientName, setClientName] = useState('');
    const [erpPath, setErpPath] = useState('');
    const [assessmentPeriod, setAssessmentPeriod] = useState('');
    const [timeZone, setTimeZone] = useState('UTC+0');
    const [sessionTimeout, setSessionTimeout] = useState('30 minutes');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    // ERP Connection state
    const [erpConnectorId, setErpConnectorId] = useState('sap_s4hana');
    const [erpMode, setErpMode] = useState<'demo' | 'live'>('demo');
    const [erpBaseUrl, setErpBaseUrl] = useState('');
    const [erpUsername, setErpUsername] = useState('');
    const [erpPassword, setErpPassword] = useState('');
    const [availableConnectors, setAvailableConnectors] = useState<AvailableConnector[]>([]);
    const [erpTestResult, setErpTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [erpTesting, setErpTesting] = useState(false);
    const [toggles, setToggles] = useState<ToggleState>({
        criticalRiskAlerts: true,
        smeResponseUpdates: true,
        weeklySummary: false,
    });

    useEffect(() => {
        Promise.allSettled([
            fetchLanguages(), fetchDomains(), getActiveDomain(),
            fetchModels(), fetchProjectSettings(), getERPConnectionSettings(),
        ])
            .then(([langRes, domRes, domainRes, modelRes, settingsRes, erpRes]) => {
                if (langRes.status === 'fulfilled') setLanguages(langRes.value.languages || []);
                if (domRes.status === 'fulfilled') setDomains(domRes.value.domains || []);
                if (domainRes.status === 'fulfilled' && domainRes.value.domain) {
                    setCurrentDomain(domainRes.value.domain);
                    setSelectedDomainId(domainRes.value.domain.id);
                }
                if (modelRes.status === 'fulfilled') {
                    setModels(modelRes.value.models || []);
                    if (modelRes.value.defaultModel) {
                        setSelectedModel(
                            typeof modelRes.value.defaultModel === 'string'
                                ? modelRes.value.defaultModel
                                : modelRes.value.defaultModel.id || '',
                        );
                    }
                }
                if (settingsRes.status === 'fulfilled' && settingsRes.value) {
                    const s = settingsRes.value;
                    setProjectName(s.projectName || '');
                    setClientName(s.clientName || '');
                    setErpPath(s.erpPath || '');
                    setAssessmentPeriod(s.assessmentPeriod || '');
                    setTimeZone(s.timeZone || 'UTC+0');
                    if (s.notifications) {
                        setToggles({
                            criticalRiskAlerts: s.notifications.criticalRiskAlerts ?? true,
                            smeResponseUpdates: s.notifications.smeResponseUpdates ?? true,
                            weeklySummary: s.notifications.weeklySummary ?? false,
                        });
                    }
                    if (s.sessionTimeout) {
                        const mins = s.sessionTimeout;
                        if (mins <= 15) setSessionTimeout('15 minutes');
                        else if (mins <= 30) setSessionTimeout('30 minutes');
                        else setSessionTimeout('1 hour');
                    }
                }
                if (erpRes.status === 'fulfilled') {
                    const erp = erpRes.value;
                    if (erp?.config) {
                        setErpConnectorId(erp.config.activeConnectorId || 'sap_s4hana');
                        setErpMode(erp.config.mode || 'demo');
                        setErpBaseUrl(erp.config.baseUrl || '');
                        setErpUsername(erp.config.username || '');
                        setErpPassword(erp.config.password || '');
                    }
                    if (erp?.availableConnectors) setAvailableConnectors(erp.availableConnectors);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const handleToggle = (key: keyof ToggleState) => {
        setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            if (selectedDomainId && selectedDomainId !== currentDomain?.id) {
                const res = await setActiveDomain(selectedDomainId);
                setCurrentDomain(res.domain);
            }
            if (selectedLanguage !== language) setLanguage(selectedLanguage);
            if (selectedModel) await saveModelPreference(selectedModel);
            if (isAdmin) {
                const timeoutMinutes =
                    sessionTimeout === '15 minutes' ? 15 :
                    sessionTimeout === '1 hour' ? 60 : 30;
                await updateProjectSettings({
                    projectName, clientName, erpPath, assessmentPeriod, timeZone,
                    notifications: toggles, sessionTimeout: timeoutMinutes, defaultModel: selectedModel,
                });
                // Save ERP connection config
                await saveERPConnectionSettings({
                    activeConnectorId: erpConnectorId,
                    mode: erpMode,
                    baseUrl: erpBaseUrl,
                    username: erpUsername,
                    password: erpPassword !== '••••••••' ? erpPassword : undefined,
                });
            }
            setSaveMsg(t('settings.saved'));
            setTimeout(() => setSaveMsg(''), 3000);
        } catch (err: any) {
            setSaveMsg(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    async function handleTestERPConnection() {
        setErpTesting(true);
        setErpTestResult(null);
        try {
            const result = await testERPConnection({ activeConnectorId: erpConnectorId, mode: erpMode, baseUrl: erpBaseUrl });
            setErpTestResult(result);
        } catch (err: any) {
            setErpTestResult({ success: false, message: err.message });
        } finally {
            setErpTesting(false);
        }
    }

    if (loading) {
        return (
            <div className="settings-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <Loader size={24} className="spin" />
            </div>
        );
    }

    return (
        <div className="settings-page">
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">{t('settings.title')}</h1>
                    <p className="page-header__subtitle">
                        {t('settings.subtitle')}
                    </p>
                </div>
            </div>

            <div className="settings-grid">
                {/* General */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <Settings size={18} className="settings-section__icon" />
                        <h3>{t('settings.general')}</h3>
                    </div>

                    {/* Project Name - admin only */}
                    {isAdmin && (
                        <label className="settings-field">
                            <span className="settings-field__label">Project Name</span>
                            <input
                                type="text"
                                className="settings-field__input"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="Q3 Global Assessment"
                            />
                        </label>
                    )}

                    {/* Client Name - admin only */}
                    {isAdmin && (
                        <label className="settings-field">
                            <span className="settings-field__label">Client Name</span>
                            <input
                                type="text"
                                className="settings-field__input"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="e.g. Acme Corp"
                            />
                        </label>
                    )}

                    {/* ERP Migration Path - admin only */}
                    {isAdmin && (
                        <label className="settings-field">
                            <span className="settings-field__label">ERP Migration Path</span>
                            <select
                                className="settings-field__input"
                                value={erpPath}
                                onChange={(e) => setErpPath(e.target.value)}
                            >
                                <option value="">Select migration path...</option>
                                <option value="SAP ECC → S/4HANA">SAP ECC → S/4HANA</option>
                                <option value="Dynamics GP/NAV/AX → D365 F&O">Dynamics GP/NAV/AX → D365 F&O</option>
                                <option value="Oracle EBS → Oracle Cloud">Oracle EBS → Oracle Cloud</option>
                                <option value="Generic">Generic</option>
                            </select>
                        </label>
                    )}

                    {/* Assessment Period - admin only */}
                    {isAdmin && (
                        <label className="settings-field">
                            <span className="settings-field__label">Assessment Period</span>
                            <input
                                type="text"
                                className="settings-field__input"
                                value={assessmentPeriod}
                                onChange={(e) => setAssessmentPeriod(e.target.value)}
                                placeholder="Q3 2025 - Q1 2026"
                            />
                        </label>
                    )}

                    {/* Time Zone - all users */}
                    <label className="settings-field">
                        <span className="settings-field__label">Time Zone</span>
                        <select
                            className="settings-field__input"
                            value={timeZone}
                            onChange={(e) => setTimeZone(e.target.value)}
                        >
                            <option value="UTC-12">UTC-12 (Baker Island)</option>
                            <option value="UTC-8">UTC-8 (Pacific Time)</option>
                            <option value="UTC-7">UTC-7 (Mountain Time)</option>
                            <option value="UTC-6">UTC-6 (Central Time)</option>
                            <option value="UTC-5">UTC-5 (Eastern Time)</option>
                            <option value="UTC+0">UTC+0 (GMT)</option>
                            <option value="UTC+1">UTC+1 (Central European)</option>
                            <option value="UTC+3">UTC+3 (Arabia Standard)</option>
                            <option value="UTC+4">UTC+4 (Gulf Standard)</option>
                            <option value="UTC+5:30">UTC+5:30 (India Standard)</option>
                            <option value="UTC+8">UTC+8 (China Standard)</option>
                            <option value="UTC+9">UTC+9 (Japan Standard)</option>
                            <option value="UTC+10">UTC+10 (Australia Eastern)</option>
                        </select>
                    </label>

                    <label className="settings-field">
                        <span className="settings-field__label">{t('settings.activeDomain')}</span>
                        <select
                            className="settings-field__input"
                            value={selectedDomainId}
                            onChange={(e) => setSelectedDomainId(e.target.value)}
                            disabled={!isAdmin}
                        >
                            {domains.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                        {!isAdmin && <span className="settings-field__desc">{t('settings.adminOnlyDomain')}</span>}
                    </label>

                    <label className="settings-field">
                        <span className="settings-field__label">{t('config.language')}</span>
                        <select
                            className="settings-field__input"
                            value={selectedLanguage}
                            onChange={(e) => setSelectedLanguage(e.target.value)}
                        >
                            {languages.map((l) => (
                                <option key={l.code} value={l.code}>
                                    {l.name}
                                </option>
                            ))}
                            {languages.length === 0 && <option value="en">English</option>}
                        </select>
                    </label>

                    <label className="settings-field">
                        <span className="settings-field__label">{t('config.model')}</span>
                        <select
                            className="settings-field__input"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                        >
                            {models.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.displayName}
                                </option>
                            ))}
                            {models.length === 0 && <option value="">Default model</option>}
                        </select>
                    </label>
                </section>

                {/* Notifications */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <Bell size={18} className="settings-section__icon" />
                        <h3>{t('settings.notifications')}</h3>
                    </div>

                    <div className="settings-toggle-row">
                        <div>
                            <span className="settings-toggle-row__label">{t('settings.criticalRiskAlerts')}</span>
                            <span className="settings-toggle-row__desc">{t('settings.criticalRiskAlertsDesc')}</span>
                        </div>
                        <button
                            className={`settings-toggle ${toggles.criticalRiskAlerts ? 'settings-toggle--on' : ''}`}
                            onClick={() => handleToggle('criticalRiskAlerts')}
                            aria-pressed={toggles.criticalRiskAlerts}
                        >
                            <span className="settings-toggle__knob" />
                        </button>
                    </div>

                    <div className="settings-toggle-row">
                        <div>
                            <span className="settings-toggle-row__label">{t('settings.smeResponseUpdates')}</span>
                            <span className="settings-toggle-row__desc">{t('settings.smeResponseUpdatesDesc')}</span>
                        </div>
                        <button
                            className={`settings-toggle ${toggles.smeResponseUpdates ? 'settings-toggle--on' : ''}`}
                            onClick={() => handleToggle('smeResponseUpdates')}
                            aria-pressed={toggles.smeResponseUpdates}
                        >
                            <span className="settings-toggle__knob" />
                        </button>
                    </div>

                    <div className="settings-toggle-row">
                        <div>
                            <span className="settings-toggle-row__label">{t('settings.weeklySummary')}</span>
                            <span className="settings-toggle-row__desc">{t('settings.weeklySummaryDesc')}</span>
                        </div>
                        <button
                            className={`settings-toggle ${toggles.weeklySummary ? 'settings-toggle--on' : ''}`}
                            onClick={() => handleToggle('weeklySummary')}
                            aria-pressed={toggles.weeklySummary}
                        >
                            <span className="settings-toggle__knob" />
                        </button>
                    </div>
                </section>

                {/* Security & Privacy */}
                <section className="settings-section">
                    <div className="settings-section__header">
                        <Shield size={18} className="settings-section__icon" />
                        <h3>{t('settings.security')}</h3>
                    </div>

                    <div className="settings-row">
                        <div>
                            <span className="settings-toggle-row__label">{t('settings.twoFactor')}</span>
                            <span className="settings-toggle-row__desc">{t('settings.twoFactorDesc')}</span>
                        </div>
                        <button className="settings-btn settings-btn--primary">{t('settings.enable')}</button>
                    </div>

                    <label className="settings-field">
                        <span className="settings-field__label">{t('settings.sessionTimeout')}</span>
                        <div className="settings-field__desc">{t('settings.sessionTimeoutDesc')}</div>
                        <select
                            className="settings-field__input"
                            value={sessionTimeout}
                            onChange={(e) => setSessionTimeout(e.target.value)}
                        >
                            <option value="15 minutes">15 minutes</option>
                            <option value="30 minutes">30 minutes</option>
                            <option value="1 hour">1 hour</option>
                        </select>
                    </label>
                </section>

                {/* ERP Connector (admin only) */}
                {isAdmin && (
                    <section className="settings-section">
                        <div className="settings-section__header">
                            <Plug size={18} className="settings-section__icon" />
                            <h3>ERP Data Connector</h3>
                        </div>

                        {/* Connector selector */}
                        <label className="settings-field">
                            <span className="settings-field__label">ERP System</span>
                            <select
                                className="settings-field__input"
                                value={erpConnectorId}
                                onChange={e => { setErpConnectorId(e.target.value); setErpTestResult(null); }}
                            >
                                {availableConnectors.length > 0
                                    ? availableConnectors.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.vendor})</option>
                                    ))
                                    : <option value="sap_s4hana">SAP S/4HANA</option>
                                }
                            </select>
                        </label>

                        {/* Demo / Live toggle */}
                        <div className="settings-field">
                            <span className="settings-field__label">Connection Mode</span>
                            <div className="erp-mode-toggle">
                                <button
                                    className={`erp-mode-btn ${erpMode === 'demo' ? 'erp-mode-btn--active' : ''}`}
                                    onClick={() => { setErpMode('demo'); setErpTestResult(null); }}
                                    type="button"
                                >
                                    <FlaskConical size={13} /> Demo Data
                                </button>
                                <button
                                    className={`erp-mode-btn ${erpMode === 'live' ? 'erp-mode-btn--active erp-mode-btn--live' : ''}`}
                                    onClick={() => { setErpMode('live'); setErpTestResult(null); }}
                                    type="button"
                                >
                                    <Plug size={13} /> Live OData
                                </button>
                            </div>
                            <span className="settings-field__desc">
                                {erpMode === 'demo'
                                    ? 'Uses built-in fixture data — no network connection required. Perfect for demos and development.'
                                    : 'Connects to your real ERP via OData/REST. Provide the base URL and service account credentials below.'}
                            </span>
                        </div>

                        {/* Live-mode fields */}
                        {erpMode === 'live' && (
                            <>
                                <label className="settings-field">
                                    <span className="settings-field__label">Base URL</span>
                                    <input
                                        type="url"
                                        className="settings-field__input"
                                        value={erpBaseUrl}
                                        onChange={e => setErpBaseUrl(e.target.value)}
                                        placeholder="https://your-erp.example.com/sap/opu/odata/sap"
                                    />
                                </label>
                                <label className="settings-field">
                                    <span className="settings-field__label">Username</span>
                                    <input
                                        type="text"
                                        className="settings-field__input"
                                        value={erpUsername}
                                        onChange={e => setErpUsername(e.target.value)}
                                        placeholder="service_account"
                                        autoComplete="off"
                                    />
                                </label>
                                <label className="settings-field">
                                    <span className="settings-field__label">Password</span>
                                    <input
                                        type="password"
                                        className="settings-field__input"
                                        value={erpPassword}
                                        onChange={e => setErpPassword(e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete="new-password"
                                    />
                                </label>
                            </>
                        )}

                        {/* Test connection */}
                        <div className="erp-test-row">
                            <button
                                className="settings-btn settings-btn--primary"
                                onClick={handleTestERPConnection}
                                disabled={erpTesting}
                                type="button"
                            >
                                {erpTesting
                                    ? <><Loader size={13} className="spin" style={{ display: 'inline', marginRight: 5 }} />Testing…</>
                                    : 'Test Connection'}
                            </button>
                            {erpTestResult && (
                                <div className={`erp-test-result ${erpTestResult.success ? 'erp-test-result--ok' : 'erp-test-result--fail'}`}>
                                    {erpTestResult.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                    <span>{erpTestResult.message}</span>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Data Management (admin only) */}
                {isAdmin && (
                    <section className="settings-section">
                        <div className="settings-section__header">
                            <Database size={18} className="settings-section__icon" />
                            <h3>{t('settings.dataManagement')}</h3>
                        </div>

                        <button
                            className="settings-data-btn"
                            onClick={async () => {
                                try {
                                    const data = await exportProjectData();
                                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    const dateStr = new Date().toISOString().slice(0, 10);
                                    a.href = url;
                                    a.download = `processiq-export-${dateStr}.json`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                } catch (err: any) {
                                    alert(`Export failed: ${err.message}`);
                                }
                            }}
                        >
                            {t('settings.exportData')}
                        </button>
                        <button
                            className="settings-data-btn"
                            onClick={async () => {
                                try {
                                    const result = await archiveAssessments();
                                    alert(result.message);
                                } catch (err: any) {
                                    alert(`Archive failed: ${err.message}`);
                                }
                            }}
                        >
                            {t('settings.archiveAssessments')}
                        </button>
                        <button
                            className="settings-data-btn settings-data-btn--danger"
                            onClick={async () => {
                                const typed = prompt(
                                    'This will permanently delete all project data (sessions, reports, documents, notifications). ' +
                                    'Type the project name to confirm:',
                                );
                                if (!typed) return;
                                try {
                                    const result = await deleteProjectData(typed);
                                    alert(result.message);
                                    navigate('/');
                                } catch (err: any) {
                                    alert(`Delete failed: ${err.message}`);
                                }
                            }}
                        >
                            {t('settings.deleteData')}
                        </button>
                    </section>
                )}
            </div>

            <div className="settings-footer">
                {saveMsg && (
                    <span
                        className={`settings-save-msg ${saveMsg.startsWith('Error') ? 'settings-save-msg--error' : ''}`}
                    >
                        {saveMsg}
                    </span>
                )}
                <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
                    {saving ? t('settings.saving') : t('settings.saveChanges')}
                </button>
            </div>
        </div>
    );
}
