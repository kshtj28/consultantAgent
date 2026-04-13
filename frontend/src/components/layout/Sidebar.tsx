import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  LayoutDashboard,
  TrendingUp,
  Users,
  FileText,
  Settings,
  LogOut,
  UserPlus,
  ScrollText,
  BookOpen,
  Plug,
} from 'lucide-react';
import { getInitials, getRoleLabel } from '../../utils/format';
import { useLanguage } from '../../i18n/LanguageContext';
import './Sidebar.css';

interface SidebarProps {
  user: { username: string; role: string; userId: string } | null;
  onLogout: () => void;
}

const Sidebar = ({ user, onLogout }: SidebarProps) => {
  const location = useLocation();
  const { t } = useLanguage();

  const navItems = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/process-analysis', label: t('nav.processAnalysis'), icon: Activity },
    { path: '/insights', label: t('nav.insights'), icon: TrendingUp },
    { path: '/sme-engagement', label: t('nav.smeEngagement'), icon: Users },
    { path: '/reports', label: t('nav.reports'), icon: FileText },
    { path: '/knowledge-base', label: t('nav.knowledgeBase'), icon: BookOpen },
    { path: '/connectors', label: 'Connectors', icon: Plug },
    { path: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  const adminNavItems = [
    { path: '/admin/users', label: t('nav.userManagement'), icon: UserPlus },
    { path: '/admin/audit-logs', label: t('nav.auditLogs'), icon: ScrollText },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Activity size={28} strokeWidth={1.5} />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-title">ProcessIQ</span>
          <span className="sidebar-logo-subtitle">Discovery</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul className="sidebar-nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

            return (
              <li key={item.path} className="sidebar-nav-item">
                <NavLink
                  to={item.path}
                  className={`sidebar-nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-nav-divider">Admin</div>
            <ul className="sidebar-nav-list">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

                return (
                  <li key={item.path} className="sidebar-nav-item">
                    <NavLink
                      to={item.path}
                      className={`sidebar-nav-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={18} strokeWidth={1.8} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>

      {user && (
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">
              {getInitials(user.username)}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{getRoleLabel(user.role)} User</span>
              <span className="sidebar-user-role">{getRoleLabel(user.role)}</span>
            </div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={onLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
