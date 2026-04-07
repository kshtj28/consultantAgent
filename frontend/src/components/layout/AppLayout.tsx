import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import RightPanel from './RightPanel';
import { getActiveDomain, fetchProjectSettings } from '../../services/api';
import './AppLayout.css';

const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [domainName, setDomainName] = useState<string | undefined>();
  const [settingsProjectName, setSettingsProjectName] = useState<string | undefined>();
  const [showRightPanel, setShowRightPanel] = useState(false);

  useEffect(() => {
    getActiveDomain()
      .then((res) => {
        if (res.domain?.name) setDomainName(res.domain.name);
      })
      .catch(() => {});

    fetchProjectSettings()
      .then((settings) => {
        if (settings.projectName) setSettingsProjectName(settings.projectName);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-layout">
      <Sidebar user={user} onLogout={logout} />
      <div className={`app-layout-center ${showRightPanel ? 'app-layout-center--panel-open' : ''}`}>
        <TopBar
          user={user}
          projectName={settingsProjectName || (domainName ? `${domainName} Assessment` : undefined)}
          onToggleNotifications={() => setShowRightPanel((v) => !v)}
          onLogout={logout}
        />
        <main className="app-layout-content">
          <Outlet />
        </main>
      </div>
      {showRightPanel && <RightPanel />}
    </div>
  );
};

export default AppLayout;
