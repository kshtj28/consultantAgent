import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserPlus, User, Lock, Shield, CheckCircle2, AlertCircle, Loader, Building2, Briefcase } from 'lucide-react';

const API_BASE = '/api';

export default function CreateUser() {
    const { token } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('user');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [organization, setOrganization] = useState('');
    const [department, setDepartment] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [usernameError, setUsernameError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [roleError, setRoleError] = useState('');

    const validateUsername = (val: string) => {
        if (!val) { setUsernameError('Email is required'); return false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setUsernameError('Invalid email format'); return false; }
        setUsernameError('');
        return true;
    };

    const validatePassword = (val: string) => {
        if (!val) { setPasswordError('Password is required'); return false; }
        if (val.length < 6) { setPasswordError('Password must be at least 6 characters'); return false; }
        setPasswordError('');
        return true;
    };

    const validateRole = (val: string) => {
        if (!val) { setRoleError('Role is required'); return false; }
        setRoleError('');
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/create-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username,
                    password,
                    role,
                    ...(firstName && { firstName }),
                    ...(lastName && { lastName }),
                    ...(organization && { organization }),
                    ...(department && { department }),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create user');
            }

            setSuccess(`User ${username} created successfully!`);
            setUsername('');
            setPassword('');
            setRole('user');
            setFirstName('');
            setLastName('');
            setOrganization('');
            setDepartment('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="create-user-page">
            <style>{`
                .create-user-page {
                    padding: 2rem;
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                    height: 100%;
                    overflow-y: auto;
                }

                .auth-card {
                    width: 100%;
                    max-width: 500px;
                    padding: 2rem;
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 1rem;
                    box-shadow: var(--shadow-lg);
                    animation: fadeIn 0.3s ease-out;
                }

                .auth-header {
                    margin-bottom: 2rem;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid var(--border);
                }

                .auth-icon-wrapper {
                    width: 3rem;
                    height: 3rem;
                    background: var(--surface-light);
                    border-radius: 0.75rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary);
                }

                .auth-title {
                    font-size: 1.25rem;
                    font-weight: 600;
                    color: var(--text);
                }

                .auth-subtitle {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .input-group {
                    position: relative;
                    margin-bottom: 1.5rem;
                }

                .input-label {
                    display: block;
                    font-size: 0.875rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                    color: var(--text-secondary);
                }

                .input-wrapper {
                    position: relative;
                }

                .input-icon {
                    position: absolute;
                    left: 1rem;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-secondary);
                    pointer-events: none;
                }

                .auth-input, .auth-select {
                    width: 100%;
                    padding: 0.75rem 1rem 0.75rem 2.75rem;
                    background: var(--surface-light);
                    border: 1px solid var(--border);
                    border-radius: 0.75rem;
                    color: var(--text);
                    font-size: 0.9375rem;
                    transition: all 0.2s;
                }

                .auth-select {
                    appearance: none;
                    cursor: pointer;
                }

                .auth-input:focus, .auth-select:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
                }

                .submit-btn {
                    width: 100%;
                    padding: 0.875rem;
                    background: var(--gradient-primary);
                    border: none;
                    border-radius: 0.75rem;
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    transition: all 0.2s;
                    margin-top: 1rem;
                }

                .submit-btn:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
                }

                .submit-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                    transform: none;
                }

                .status-message {
                    padding: 1rem;
                    border-radius: 0.5rem;
                    font-size: 0.875rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 1.5rem;
                }

                .status-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                }

                .status-success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    color: #86efac;
                }

                .field-error {
                    color: #ef4444;
                    font-size: 0.75rem;
                    margin-top: 4px;
                    display: block;
                }
            `}</style>

            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-icon-wrapper">
                        <UserPlus size={24} />
                    </div>
                    <div>
                        <h2 className="auth-title">Create New User</h2>
                        <p className="auth-subtitle">Add a new user to the system</p>
                    </div>
                </div>

                {error && (
                    <div className="status-message status-error">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="status-message status-success">
                        <CheckCircle2 size={18} />
                        <span>{success}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label className="input-label">Username</label>
                        <div className="input-wrapper">
                            <User className="input-icon" size={18} />
                            <input
                                type="text"
                                className="auth-input"
                                placeholder="Enter username (email)"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onBlur={() => validateUsername(username)}
                                required
                            />
                        </div>
                        {usernameError && <span className="field-error">{usernameError}</span>}
                    </div>

                    <div className="input-group">
                        <label className="input-label">Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" size={18} />
                            <input
                                type="password"
                                className="auth-input"
                                placeholder="Enter password (min 6 characters)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onBlur={() => validatePassword(password)}
                                required
                            />
                        </div>
                        {passwordError && <span className="field-error">{passwordError}</span>}
                    </div>

                    <div className="input-group">
                        <label className="input-label">First Name</label>
                        <div className="input-wrapper">
                            <User className="input-icon" size={18} />
                            <input
                                type="text"
                                className="auth-input"
                                placeholder="First name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Last Name</label>
                        <div className="input-wrapper">
                            <User className="input-icon" size={18} />
                            <input
                                type="text"
                                className="auth-input"
                                placeholder="Last name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Organization</label>
                        <div className="input-wrapper">
                            <Building2 className="input-icon" size={18} />
                            <input
                                type="text"
                                className="auth-input"
                                placeholder="Organization"
                                value={organization}
                                onChange={(e) => setOrganization(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Department</label>
                        <div className="input-wrapper">
                            <Briefcase className="input-icon" size={18} />
                            <input
                                type="text"
                                className="auth-input"
                                placeholder="Department"
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Role</label>
                        <div className="input-wrapper">
                            <Shield className="input-icon" size={18} />
                            <select
                                className="auth-select"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                onBlur={() => validateRole(role)}
                            >
                                <option value="user">User</option>
                                <option value="analyst">Analyst</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        {roleError && <span className="field-error">{roleError}</span>}
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading || !username || !password}>
                        {loading ? (
                            <>
                                <Loader size={18} className="animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <UserPlus size={18} />
                                Create User
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
