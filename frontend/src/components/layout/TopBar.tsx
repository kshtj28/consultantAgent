import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, FileText, Users as UsersIcon, Monitor, X } from 'lucide-react';
import { getInitials } from '../../utils/format';
import { globalSearch, fetchNotifications, type SearchResult } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import './TopBar.css';

interface TopBarProps {
    projectName?: string;
    projectSubtitle?: string;
    user: { username: string; role: string; firstName?: string; lastName?: string; organization?: string } | null;
    onToggleNotifications?: () => void;
    onLogout?: () => void;
}

export default function TopBar({
    projectName = 'Q3 Global Assessment',
    projectSubtitle = 'Order-to-Cash, Record-to-Report, Procure-to-Pay',
    user,
    onToggleNotifications,
    onLogout,
}: TopBarProps) {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const searchRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // Debounced search
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.length < 2) {
            setSearchResults([]);
            setShowSearch(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            try {
                const { results } = await globalSearch(query);
                setSearchResults(results);
                setShowSearch(results.length > 0);
            } catch {
                setSearchResults([]);
            }
        }, 300);
    }, []);

    // Fetch notification count on mount and periodically
    useEffect(() => {
        const loadCount = async () => {
            try {
                const res = await fetchNotifications(1, 1);
                setUnreadCount(res.unreadCount || 0);
            } catch { /* ignore */ }
        };
        loadCount();
        const interval = setInterval(loadCount, 30000);
        return () => clearInterval(interval);
    }, []);

    // SSE connection for real-time notification count
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        let eventSource: EventSource | null = null;
        try {
            eventSource = new EventSource(`/api/notifications/stream?token=${token}`);
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'connected') return;
                    setUnreadCount((prev) => prev + 1);
                } catch { /* ignore parse errors */ }
            };
            eventSource.onerror = () => {
                eventSource?.close();
            };
        } catch { /* SSE not supported or connection failed */ }

        return () => { eventSource?.close(); };
    }, []);

    // Close search dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearch(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleResultClick = (result: SearchResult) => {
        setShowSearch(false);
        setSearchQuery('');
        navigate(result.url);
    };

    const typeIcon = (type: string) => {
        switch (type) {
            case 'session': return <Monitor size={14} />;
            case 'document': return <FileText size={14} />;
            case 'user': return <UsersIcon size={14} />;
            default: return <FileText size={14} />;
        }
    };

    const displayName = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
        : '';
    const displayEmail = user?.organization
        ? `${user.username}@${user.organization.toLowerCase().replace(/\s+/g, '')}.com`
        : '';

    return (
        <header className="topbar">
            <div className="topbar__left">
                <div className="topbar__project">
                    <span className="topbar__project-label">{t('topbar.currentProject')}</span>{' '}
                    <span className="topbar__project-name">{projectName}</span>
                </div>
                <div className="topbar__project-subtitle">{projectSubtitle}</div>
            </div>

            <div className="topbar__center" ref={searchRef}>
                <div className="topbar__search">
                    <Search className="topbar__search-icon" size={16} />
                    <input
                        type="text"
                        className="topbar__search-input"
                        placeholder={t('topbar.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setShowSearch(true)}
                    />
                    {searchQuery && (
                        <button className="topbar__search-clear" onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearch(false); }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                {showSearch && (
                    <div className="topbar__search-dropdown">
                        {searchResults.map((r) => (
                            <button key={`${r.type}-${r.id}`} className="topbar__search-result" onClick={() => handleResultClick(r)}>
                                <span className="topbar__search-result-icon">{typeIcon(r.type)}</span>
                                <div className="topbar__search-result-info">
                                    <span className="topbar__search-result-title">{r.title}</span>
                                    <span className="topbar__search-result-snippet">{r.snippet}</span>
                                </div>
                                <span className="topbar__search-result-type">{r.type}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="topbar__right">
                {user && (
                    <div className="topbar__user-info">
                        <span className="topbar__user-name">{displayName}</span>
                        {displayEmail && <span className="topbar__user-email">{displayEmail}</span>}
                    </div>
                )}

                <button
                    className="topbar__icon-btn"
                    onClick={onToggleNotifications}
                    aria-label={t('topbar.notifications')}
                >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="topbar__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                </button>

                {user && (
                    <div className="topbar__avatar" title={`${displayName} (${user.role})`}>
                        {getInitials(displayName || user.username)}
                    </div>
                )}

                <button
                    className="topbar__icon-btn"
                    onClick={onLogout}
                    aria-label="Logout"
                    title="Logout"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    );
}
