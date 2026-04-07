import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, ArrowRight, Shield, AlertCircle, Loader, Lock, ClipboardList } from 'lucide-react';
import './Login.css';

type RoleTab = 'user' | 'admin';

export function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<RoleTab>('user');
    const [passwordError, setPasswordError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const validatePassword = (val: string) => {
        if (!val) { setPasswordError('Password is required'); return false; }
        setPasswordError('');
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Invalid credentials');
            }

            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Failed to login. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Left branding panel */}
            <div className="login-branding">
                <div className="login-branding__content">
                    <div className="login-branding__logo">
                        <Shield size={28} />
                        <span className="login-branding__logo-text">ProcessIQ Discovery</span>
                    </div>
                    <p className="login-branding__tagline">
                        Executive Process Intelligence
                    </p>

                    <h2 className="login-branding__headline">Welcome Back</h2>
                    <p className="login-branding__description">
                        Access your AI-driven business process assessments
                        and gain insights into Order-to-Cash, Record-to-Report,
                        and Procure-to-Pay operations.
                    </p>

                    <div className="login-branding__stats">
                        <div className="login-branding__stat">
                            <span className="login-branding__stat-value">98%</span>
                            <span className="login-branding__stat-label">Process Coverage</span>
                        </div>
                        <div className="login-branding__stat">
                            <span className="login-branding__stat-value">24/7</span>
                            <span className="login-branding__stat-label">Monitoring</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right form panel */}
            <div className="login-form-panel">
                <div className="login-card">
                    <h1 className="login-card__title">Sign In</h1>
                    <p className="login-card__subtitle">
                        Choose your login type and enter your credentials.
                    </p>

                    {/* Role tabs */}
                    <div className="login-tabs">
                        <button
                            className={`login-tab ${activeTab === 'user' ? 'login-tab--active' : ''}`}
                            onClick={() => setActiveTab('user')}
                            type="button"
                        >
                            <User size={18} />
                            User Login
                            <span className="login-tab__subtitle">View your assessments</span>
                        </button>
                        <button
                            className={`login-tab ${activeTab === 'admin' ? 'login-tab--active' : ''}`}
                            onClick={() => setActiveTab('admin')}
                            type="button"
                        >
                            <ClipboardList size={18} />
                            Admin Login
                            <span className="login-tab__subtitle">View all employees</span>
                        </button>
                    </div>

                    {error && (
                        <div className="login-error">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <label className="login-label">Username</label>
                        <div className="login-input-group">
                            <input
                                type="text"
                                className="login-input"
                                placeholder="Username or email"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>

                        <label className="login-label">Password</label>
                        <div className="login-input-group login-input-group--password">
                            <Lock size={16} className="login-input-icon" />
                            <input
                                type="password"
                                className="login-input login-input--with-icon"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onBlur={() => validatePassword(password)}
                                required
                            />
                            {passwordError && <span className="login-field-error">{passwordError}</span>}
                        </div>

                        <div className="login-demo-credentials">
                            <span className="login-demo-credentials__title">Demo Credentials:</span>
                            <span className="login-demo-credentials__line">Admin: admin / admin</span>
                        </div>

                        <button type="submit" className="login-btn" disabled={loading || !username || !password}>
                            {loading ? (
                                <>
                                    <Loader size={18} className="spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
