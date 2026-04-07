import { useState, useEffect } from 'react';
import {
    Globe,
    Layers,
    Cpu,
    ChevronDown,
    Settings,
    Save,
    Check,
    ArrowLeft,
    Workflow,
} from 'lucide-react';
import './ConfigurationPage.css';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = '/api';

// Interview process area options
export const INTERVIEW_AREAS = [
    {
        id: 'order_to_cash',
        label: 'Order to Cash',
        abbr: 'O2C',
        description: 'Sales order, billing, accounts receivable & collections',
        color: '#6366f1',
    },
    {
        id: 'procure_to_pay',
        label: 'Procure to Pay',
        abbr: 'P2P',
        description: 'Procurement, purchase orders, invoice processing & payments',
        color: '#f59e0b',
    },
    {
        id: 'record_to_report',
        label: 'Record to Report',
        abbr: 'R2R',
        description: 'General ledger, financial close, consolidation & reporting',
        color: '#10b981',
    },
] as const;

export type InterviewAreaId = 'order_to_cash' | 'procure_to_pay' | 'record_to_report';
export const AREAS_STORAGE_KEY = 'interview_selected_areas';

// Types
interface Language {
    code: string;
    name: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}

interface Domain {
    id: string;
    name: string;
    description: string;
}

interface ModelConfig {
    id: string;
    provider: string;
    model: string;
    displayName: string;
}

interface ConfigurationPageProps {
    onBack?: () => void;
    selectedModel: string;
    onModelChange: (modelId: string) => void;
    onDomainChange?: (domain: { id: string; name: string }) => void;
    onAreasChange?: (areas: InterviewAreaId[]) => void;
    selectedAreas?: InterviewAreaId[];
}

export default function ConfigurationPage({
    onBack,
    selectedModel,
    onModelChange,
    onDomainChange,
    onAreasChange,
    selectedAreas: propAreas,
}: ConfigurationPageProps) {
    const { language, setLanguage, t } = useLanguage();
    const { token } = useAuth();

    const [languages, setLanguages] = useState<Language[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [currentDomain, setCurrentDomain] = useState<Domain | null>(null);
    const [currentModel, setCurrentModel] = useState<string>(selectedModel);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Interview area selection — default to propAreas or load from localStorage
    const [selectedInterviewAreas, setSelectedInterviewAreas] = useState<InterviewAreaId[]>(() => {
        if (propAreas && propAreas.length > 0) return propAreas;
        try {
            const stored = localStorage.getItem(AREAS_STORAGE_KEY);
            if (stored) return JSON.parse(stored) as InterviewAreaId[];
        } catch { /* ignore */ }
        return ['order_to_cash', 'procure_to_pay', 'record_to_report'];
    });

    useEffect(() => {
        fetchConfig();
    }, []);

    useEffect(() => {
        setCurrentModel(selectedModel);
    }, [selectedModel]);

    const fetchConfig = async () => {
        setLoading(true);
        const authHeaders = { 'Authorization': `Bearer ${token}` };
        try {
            const langRes = await fetch(`${API_BASE}/readiness/config/languages`, { headers: authHeaders });
            const langData = await langRes.json();
            setLanguages(langData.languages || []);

            const domainListRes = await fetch(`${API_BASE}/readiness/config/domains`, { headers: authHeaders });
            const domainListData = await domainListRes.json();
            setDomains(domainListData.domains || []);

            const activeDomainRes = await fetch(`${API_BASE}/readiness/config/domain`, { headers: authHeaders });
            const activeDomainData = await activeDomainRes.json();
            if (activeDomainData.domain) {
                setCurrentDomain(activeDomainData.domain);
            }

            const modelsRes = await fetch(`${API_BASE}/chat/models`, { headers: authHeaders });
            const modelsData = await modelsRes.json();
            setModels(modelsData.models || []);
        } catch (error) {
            console.error('Failed to fetch config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLanguageChange = (code: string) => {
        setLanguage(code);
    };

    const handleDomainChange = async (domainId: string) => {
        const domain = domains.find(d => d.id === domainId);
        if (domain) {
            setCurrentDomain(domain);
        }
    };

    const handleModelChange = (modelId: string) => {
        setCurrentModel(modelId);
    };

    const handleToggleArea = (areaId: InterviewAreaId) => {
        setSelectedInterviewAreas(prev => {
            if (prev.includes(areaId)) {
                // Don't allow deselecting all
                if (prev.length <= 1) return prev;
                return prev.filter(a => a !== areaId);
            }
            return [...prev, areaId];
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Save domain selection
            if (currentDomain) {
                await fetch(`${API_BASE}/readiness/config/domain`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ domainId: currentDomain.id }),
                });
            }

            // Update model in parent
            onModelChange(currentModel);

            // Notify parent of domain change
            if (currentDomain && onDomainChange) {
                onDomainChange(currentDomain);
            }

            // Persist interview areas to localStorage and notify parent
            localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify(selectedInterviewAreas));
            onAreasChange?.(selectedInterviewAreas);

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (error) {
            console.error('Failed to save config:', error);
        } finally {
            setSaving(false);
        }
    };

    // Group models by provider
    const modelsByProvider = models.reduce((acc, model) => {
        if (!acc[model.provider]) {
            acc[model.provider] = [];
        }
        acc[model.provider].push(model);
        return acc;
    }, {} as Record<string, ModelConfig[]>);

    if (loading) {
        return (
            <div className="config-page loading">
                <div className="config-spinner"></div>
                <p>{t('config.loading')}</p>
            </div>
        );
    }

    return (
        <div className="config-page">
            <div className="config-container">
                {/* Header */}
                <header className="config-header">
                    {onBack && (
                        <button className="back-btn" onClick={onBack}>
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="config-title">
                        <Settings size={28} />
                        <h1>{t('config.title')}</h1>
                    </div>
                    <p className="config-subtitle">{t('config.subtitle')}</p>
                </header>

                {/* Configuration Cards */}
                <div className="config-cards">
                    {/* Language Card */}
                    <div className="config-card">
                        <div className="card-header">
                            <Globe size={24} className="card-icon" />
                            <div>
                                <h2>{t('config.language')}</h2>
                                <p>{t('config.languageDesc')}</p>
                            </div>
                        </div>
                        <div className="language-grid">
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    className={`language-option ${language === lang.code ? 'selected' : ''}`}
                                    onClick={() => handleLanguageChange(lang.code)}
                                >
                                    <span className="lang-native">{lang.nativeName}</span>
                                    <span className="lang-name">{lang.name}</span>
                                    {language === lang.code && (
                                        <Check size={18} className="check-icon" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Domain Card */}
                    <div className="config-card">
                        <div className="card-header">
                            <Layers size={24} className="card-icon" />
                            <div>
                                <h2>{t('config.domain')}</h2>
                                <p>{t('config.domainDesc')}</p>
                            </div>
                        </div>
                        <div className="card-content">
                            <div className="domain-options">
                                {domains.map((domain) => (
                                    <div
                                        key={domain.id}
                                        className={`domain-option ${currentDomain?.id === domain.id ? 'selected' : ''}`}
                                        onClick={() => handleDomainChange(domain.id)}
                                    >
                                        <div className="domain-info">
                                            <h3>{t(`domain.${domain.id}.name`) || domain.name}</h3>
                                            <p>{t(`domain.${domain.id}.description`) || domain.description}</p>
                                        </div>
                                        {currentDomain?.id === domain.id && (
                                            <Check size={20} className="check-icon" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Interview Areas Card */}
                    <div className="config-card">
                        <div className="card-header">
                            <Workflow size={24} className="card-icon" />
                            <div>
                                <h2>{t('config.interviewAreas')}</h2>
                                <p>{t('config.interviewAreasDesc')}</p>
                            </div>
                        </div>
                        <div className="card-content">
                            <div className="area-options">
                                {INTERVIEW_AREAS.map((area) => {
                                    const isSelected = selectedInterviewAreas.includes(area.id as InterviewAreaId);
                                    return (
                                        <div
                                            key={area.id}
                                            className={`area-option ${isSelected ? 'selected' : ''}`}
                                            style={{ '--area-color': area.color } as React.CSSProperties}
                                            onClick={() => handleToggleArea(area.id as InterviewAreaId)}
                                        >
                                            <div className="area-checkbox">
                                                {isSelected ? <Check size={16} /> : null}
                                            </div>
                                            <div className="area-info">
                                                <div className="area-name">
                                                    <span className="area-abbr" style={{ background: area.color }}>{area.abbr}</span>
                                                    {t(`area.${area.id}.label`)}
                                                </div>
                                                <p>{t(`area.${area.id}.description`)}</p>
                                            </div>
                                            {isSelected && (
                                                <Check size={20} className="check-icon" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="area-hint">
                                <span className="area-selected-count">{selectedInterviewAreas.length}</span> {t('config.areasOf3Selected')}
                                {selectedInterviewAreas.length === 1 && ` — ${t('config.areasRequired')}`}
                            </p>
                        </div>
                    </div>

                    {/* Model Card */}
                    <div className="config-card">
                        <div className="card-header">
                            <Cpu size={24} className="card-icon" />
                            <div>
                                <h2>{t('config.model')}</h2>
                                <p>{t('config.modelDesc')}</p>
                            </div>
                        </div>
                        <div className="card-content">
                            <div className="model-select-wrapper">
                                <select
                                    className="model-select"
                                    value={currentModel}
                                    onChange={(e) => handleModelChange(e.target.value)}
                                >
                                    {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
                                        <optgroup key={provider} label={provider.toUpperCase()}>
                                            {providerModels.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.model}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                                <ChevronDown size={20} className="select-arrow" />
                            </div>

                            {/* Provider Info */}
                            <div className="provider-info">
                                {Object.keys(modelsByProvider).map((provider) => (
                                    <span key={provider} className="provider-badge">
                                        {provider}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="config-actions">
                    <button
                        className={`save-btn ${saveSuccess ? 'success' : ''}`}
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <div className="btn-spinner"></div>
                                {t('config.saving')}
                            </>
                        ) : saveSuccess ? (
                            <>
                                <Check size={20} />
                                {t('config.saved')}
                            </>
                        ) : (
                            <>
                                <Save size={20} />
                                {t('config.save')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
