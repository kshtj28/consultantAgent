import { useState, useEffect } from 'react';
import { Globe, Layers, Cpu, ChevronDown } from 'lucide-react';
import './SettingsBar.css';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = '/api';

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

interface SettingsBarProps {
    onLanguageChange?: (code: string) => void;
    onDomainChange?: (domain: Domain) => void;
    onModelChange?: (modelId: string) => void;
    selectedModel?: string;
    showModelSelector?: boolean;
}

export default function SettingsBar({
    onLanguageChange,
    onDomainChange,
    onModelChange,
    selectedModel,
    showModelSelector = true,
}: SettingsBarProps) {
    const { token } = useAuth();
    const [languages, setLanguages] = useState<Language[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [models, setModels] = useState<ModelConfig[]>([]);
    const [currentLanguage, setCurrentLanguage] = useState<string>('en');
    const [currentDomain, setCurrentDomain] = useState<Domain | null>(null);
    const [currentModel, setCurrentModel] = useState<string>(selectedModel || '');
    const [loading, setLoading] = useState(true);

    // Fetch all config data on mount
    useEffect(() => {
        if (token) {
            fetchConfig();
        }
    }, [token]);

    // Sync selected model from parent
    useEffect(() => {
        if (selectedModel) {
            setCurrentModel(selectedModel);
        }
    }, [selectedModel]);

    const fetchConfig = async () => {
        setLoading(true);
        const authHeaders = { 'Authorization': `Bearer ${token}` };
        try {
            // Fetch languages
            const langRes = await fetch(`${API_BASE}/readiness/config/languages`, { headers: authHeaders });
            const langData = await langRes.json();
            setLanguages(langData.languages || []);

            // Fetch domains
            const domainListRes = await fetch(`${API_BASE}/readiness/config/domains`, { headers: authHeaders });
            const domainListData = await domainListRes.json();
            setDomains(domainListData.domains || []);

            // Fetch active domain
            const activeDomainRes = await fetch(`${API_BASE}/readiness/config/domain`, { headers: authHeaders });
            const activeDomainData = await activeDomainRes.json();
            if (activeDomainData.domain) {
                setCurrentDomain(activeDomainData.domain);
            }

            // Fetch models
            const modelsRes = await fetch(`${API_BASE}/chat/models`, { headers: authHeaders });
            const modelsData = await modelsRes.json();
            setModels(modelsData.models || []);
            if (!currentModel && modelsData.defaultModel) {
                setCurrentModel(modelsData.defaultModel);
            }
        } catch (error) {
            console.error('Failed to fetch config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLanguageChange = (code: string) => {
        setCurrentLanguage(code);

        // Apply RTL if needed
        const lang = languages.find(l => l.code === code);
        if (lang) {
            document.documentElement.setAttribute('dir', lang.direction);
            document.documentElement.setAttribute('lang', code);
        }

        onLanguageChange?.(code);
    };

    const handleDomainChange = async (domainId: string) => {
        try {
            const res = await fetch(`${API_BASE}/readiness/config/domain`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ domainId }),
            });
            const data = await res.json();
            if (data.domain) {
                setCurrentDomain(data.domain);
                onDomainChange?.(data.domain);
            }
        } catch (error) {
            console.error('Failed to switch domain:', error);
        }
    };

    const handleModelChange = (modelId: string) => {
        setCurrentModel(modelId);
        onModelChange?.(modelId);
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
            <div className="settings-bar loading">
                <div className="settings-spinner"></div>
            </div>
        );
    }

    return (
        <div className="settings-bar">
            {/* Language Selector */}
            <div className="settings-group">
                <Globe size={16} className="settings-icon" />
                <div className="settings-select-wrapper">
                    <select
                        className="settings-select"
                        value={currentLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                        {languages.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                                {lang.nativeName}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="select-arrow" />
                </div>
            </div>

            {/* Domain Selector */}
            <div className="settings-group">
                <Layers size={16} className="settings-icon" />
                <div className="settings-select-wrapper">
                    <select
                        className="settings-select domain-select"
                        value={currentDomain?.id || ''}
                        onChange={(e) => handleDomainChange(e.target.value)}
                    >
                        {domains.map((domain) => (
                            <option key={domain.id} value={domain.id}>
                                {domain.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="select-arrow" />
                </div>
            </div>

            {/* Model/Provider Selector */}
            {showModelSelector && models.length > 0 && (
                <div className="settings-group">
                    <Cpu size={16} className="settings-icon" />
                    <div className="settings-select-wrapper">
                        <select
                            className="settings-select model-select"
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
                        <ChevronDown size={14} className="select-arrow" />
                    </div>
                </div>
            )}
        </div>
    );
}
