import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, Shield, Plus, Pencil, Trash2 } from 'lucide-react';
import StatCard from '../../components/shared/StatCard';
import SectionCard from '../../components/shared/SectionCard';
import StatusBadge from '../../components/shared/StatusBadge';
import { fetchUsers, updateUser, deactivateUser, type UserProfile } from '../../services/api';
import './UserManagement.css';

function formatDate(ts?: string): string {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function UserManagement() {
    const navigate = useNavigate();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);

    // Edit modal
    const [editUser, setEditUser] = useState<UserProfile | null>(null);
    const [editRole, setEditRole] = useState('');
    const [editOrg, setEditOrg] = useState('');
    const [editDept, setEditDept] = useState('');
    const [editStatus, setEditStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [actionError, setActionError] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const data = await fetchUsers();
            setUsers(data.users);
        } catch {
            // silently handle
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    // Stats
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => (u.status || 'active') === 'active').length;
    const adminCount = users.filter((u) => u.role === 'admin').length;

    const openEdit = (user: UserProfile) => {
        setSaveError('');
        setEditUser(user);
        setEditRole(user.role);
        setEditOrg(user.organization || '');
        setEditDept(user.department || '');
        setEditStatus(user.status || 'active');
    };

    const handleSave = async () => {
        if (!editUser) return;
        setSaving(true);
        setSaveError('');
        try {
            await updateUser(editUser.userId, {
                role: editRole,
                organization: editOrg || undefined,
                department: editDept || undefined,
                status: editStatus,
            });
            setEditUser(null);
            await load();
        } catch (err: any) {
            setSaveError(err.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async (user: UserProfile) => {
        if (!window.confirm(`Deactivate "${user.username}"? They will no longer be able to log in.`)) return;
        setActionError('');
        try {
            await deactivateUser(user.userId);
            await load();
        } catch (err: any) {
            setActionError(err.message || 'Failed to deactivate user');
        }
    };

    const displayName = (u: UserProfile) => {
        if (u.firstName || u.lastName) {
            return [u.firstName, u.lastName].filter(Boolean).join(' ');
        }
        return u.username;
    };

    return (
        <div className="user-mgmt">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">User Management</h1>
                    <p className="page-header__subtitle">Manage system users and their permissions</p>
                </div>
                <button
                    className="user-mgmt__header-btn"
                    onClick={() => navigate('/admin/create-user')}
                >
                    <Plus size={16} />
                    Create User
                </button>
            </div>

            {/* Stats */}
            <div className="user-mgmt__stats">
                <StatCard icon={<Users size={18} />} label="Total Users" value={totalUsers} />
                <StatCard icon={<UserCheck size={18} />} label="Active Users" value={activeUsers} />
                <StatCard icon={<Shield size={18} />} label="Admin Count" value={adminCount} />
            </div>

            {/* Action error banner */}
            {actionError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
                    {actionError}
                    <button onClick={() => setActionError('')} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                </div>
            )}

            {/* Users table */}
            <SectionCard title="Users">
                <div className="user-mgmt__table-wrap">
                    <table className="user-mgmt__table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Organization</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                        No users found
                                    </td>
                                </tr>
                            )}
                            {users.map((u) => (
                                <tr key={u.userId}>
                                    <td>{displayName(u)}</td>
                                    <td>{u.organization || '-'}</td>
                                    <td>
                                        <StatusBadge
                                            label={u.role}
                                            variant={u.role === 'admin' ? 'info' : 'neutral'}
                                        />
                                    </td>
                                    <td>
                                        <StatusBadge
                                            label={u.status || 'active'}
                                            variant={(u.status || 'active') === 'active' ? 'success' : 'neutral'}
                                        />
                                    </td>
                                    <td>{formatDate(u.lastLoginAt)}</td>
                                    <td>
                                        <div className="user-mgmt__actions">
                                            <button
                                                className="user-mgmt__action-btn"
                                                title="Edit user"
                                                onClick={() => openEdit(u)}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                className="user-mgmt__action-btn user-mgmt__action-btn--danger"
                                                title="Deactivate user"
                                                onClick={() => handleDeactivate(u)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {/* Edit modal */}
            {editUser && (
                <div className="user-mgmt__modal-overlay" onClick={() => setEditUser(null)}>
                    <div className="user-mgmt__modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Edit User: {editUser.username}</h3>

                        <div className="user-mgmt__modal-field">
                            <label>Role</label>
                            <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                <option value="user">User</option>
                                <option value="analyst">Analyst</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        <div className="user-mgmt__modal-field">
                            <label>Organization</label>
                            <input
                                type="text"
                                value={editOrg}
                                onChange={(e) => setEditOrg(e.target.value)}
                                placeholder="Organization"
                            />
                        </div>

                        <div className="user-mgmt__modal-field">
                            <label>Department</label>
                            <input
                                type="text"
                                value={editDept}
                                onChange={(e) => setEditDept(e.target.value)}
                                placeholder="Department"
                            />
                        </div>

                        <div className="user-mgmt__modal-field">
                            <label>Status</label>
                            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>

                        {saveError && (
                            <div style={{ color: '#fca5a5', fontSize: '0.82rem', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                                {saveError}
                            </div>
                        )}

                        <div className="user-mgmt__modal-actions">
                            <button
                                className="user-mgmt__modal-btn"
                                onClick={() => setEditUser(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="user-mgmt__modal-btn user-mgmt__modal-btn--primary"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
