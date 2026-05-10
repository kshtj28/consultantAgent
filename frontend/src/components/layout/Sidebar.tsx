import { useState } from 'react';
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
  MessageSquare,
  ChevronDown,
  GitMerge,
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

  const smeChildPaths = ['/sme-engagement', '/sme/consolidation'];
  const isInSMEGroup = smeChildPaths.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  const [smeExpanded, setSMEExpanded] = useState<boolean>(isInSMEGroup);

  const isAdmin = user?.role === 'admin';

  const navItems = [
    { path: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/process-analysis', label: t('nav.processAnalysis'), icon: Activity },
    ...(isAdmin ? [{ path: '/insights', label: t('nav.insights'), icon: TrendingUp }] : []),
  ];

  const tailItems = [
    { path: '/reports', label: t('nav.reports'), icon: FileText },
    { path: '/knowledge-base', label: t('nav.knowledgeBase'), icon: BookOpen },
    ...(isAdmin ? [{ path: '/connectors', label: 'Connectors', icon: Plug }] : []),
    { path: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  const adminNavItems = [
    { path: '/admin/users', label: t('nav.userManagement'), icon: UserPlus },
    { path: '/admin/audit-logs', label: t('nav.auditLogs'), icon: ScrollText },
  ];

  const smeChildren = [
    { path: '/sme-engagement', label: t('nav.smeEngagement'), icon: MessageSquare },
    ...(isAdmin ? [
      { path: '/sme/consolidation', label: t('nav.multiSMEConsolidation'), icon: GitMerge },
    ] : []),
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
                <NavLink to={item.path} className={`sidebar-nav-link ${isActive ? 'active' : ''}`}>
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}

          {/* SME Interview group */}
          <li className="sidebar-nav-item">
            <button
              type="button"
              className={`sidebar-nav-group-toggle ${smeExpanded || isInSMEGroup ? 'expanded' : ''}`}
              onClick={() => setSMEExpanded((v) => !v)}
              aria-expanded={smeExpanded}
            >
              <Users size={18} strokeWidth={1.8} />
              <span className="sidebar-nav-group-label">{t('nav.smeInterview')}</span>
              <span className={`sidebar-nav-group-chevron ${smeExpanded ? 'expanded' : ''}`}>
                <ChevronDown size={14} strokeWidth={2} />
              </span>
            </button>
            {(smeExpanded || isInSMEGroup) && (
              <ul className="sidebar-nav-sublist">
                {smeChildren.map((child) => {
                  const ChildIcon = child.icon;
                  const isActive = location.pathname === child.path || location.pathname.startsWith(child.path + '/');
                  return (
                    <li key={child.path} className="sidebar-nav-item">
                      <NavLink to={child.path} className={`sidebar-nav-sublink ${isActive ? 'active' : ''}`}>
                        <ChildIcon size={14} strokeWidth={1.8} />
                        <span>{child.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>

          {tailItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <li key={item.path} className="sidebar-nav-item">
                <NavLink to={item.path} className={`sidebar-nav-link ${isActive ? 'active' : ''}`}>
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
