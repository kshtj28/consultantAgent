import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import ProcessAnalysis from './pages/ProcessAnalysis';
import Insights from './pages/Insights';
import SMEEngagement from './pages/SMEEngagement';
import Reports from './pages/Reports';
import SettingsPage from './pages/SettingsPage';
import KnowledgeBase from './pages/KnowledgeBase';
import Connectors from './pages/Connectors';
import CreateUser from './pages/admin/CreateUser';
import AuditLogs from './pages/admin/AuditLogs';
import UserManagement from './pages/admin/UserManagement';
import { LanguageProvider, DEFAULT_LANGUAGE, translations } from './i18n/LanguageContext';
import { useLanguage } from './i18n/LanguageContext';
import { saveLanguagePreference } from './services/api';
import { useEffect, useRef } from 'react';
import { ToastProvider } from './components/shared/Toast';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

/** Syncs language with auth state. Must be inside both AuthProvider and LanguageProvider. */
function LanguageSyncer() {
    const { user, token } = useAuth();
    const { language, setLanguage } = useLanguage();
    const fromAuthSync = useRef(false);

    useEffect(() => {
        fromAuthSync.current = true;
        if (user?.language && translations[user.language]) {
            setLanguage(user.language);
        } else if (!user) {
            setLanguage(DEFAULT_LANGUAGE);
        }
    }, [user?.language, !!user]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (fromAuthSync.current) {
            fromAuthSync.current = false;
            return;
        }
        if (token && language) {
            saveLanguagePreference(language).catch(() => {});
        }
    }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

    return null;
}

function RequireAuth({ children }: { children: JSX.Element }) {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            {/* All authenticated routes use the AppLayout shell */}
            <Route
                element={
                    <RequireAuth>
                        <ErrorBoundary><AppLayout /></ErrorBoundary>
                    </RequireAuth>
                }
            >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/process-analysis" element={<ProcessAnalysis />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/sme-engagement" element={<SMEEngagement />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/knowledge-base" element={<KnowledgeBase />} />
                <Route path="/connectors" element={<Connectors />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/create-user" element={<CreateUser />} />
                <Route path="/admin/audit-logs" element={<AuditLogs />} />

                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <LanguageProvider>
                <ToastProvider>
                    <LanguageSyncer />
                    <Router>
                        <AppRoutes />
                    </Router>
                </ToastProvider>
            </LanguageProvider>
        </AuthProvider>
    );
}
