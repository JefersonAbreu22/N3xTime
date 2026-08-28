import { useMemo } from 'react';
import { Building2, ScrollText } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import DashboardSidebar from '../../components/dashboard/DashboardSidebar';
import { getDisplayInitials, type DashboardNavSection } from '../../components/dashboard/dashboardNavigation';
import { usePlatformAuthStore } from '../../stores/platformAuthStore';
import { useAuthStore } from '../../stores/authStore';
import PlatformCompanies from './PlatformCompanies';
import PlatformLogs from './PlatformLogs';

export default function PlatformDashboard() {
  const user = usePlatformAuthStore((state) => state.user);
  const clearSession = usePlatformAuthStore((state) => state.clearSession);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const location = useLocation();
  const navigate = useNavigate();

  const navSections = useMemo<DashboardNavSection[]>(() => [
    { label: 'Administração', items: [
      { name: 'Empresas', path: '/dashboard/platform/companies', icon: Building2 },
      { name: 'Logs', path: '/dashboard/platform/logs', icon: ScrollText },
    ]},
  ], []);

  const logout = () => {
    clearSession();
    clearAuthSession();
    navigate('/login');
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <DashboardSidebar navSections={navSections} pathname={location.pathname} user={user} onLogout={logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader currentPageTitle={location.pathname.endsWith('/logs') ? 'Logs da plataforma' : 'Empresas'} profileLabel="Super Admin Global" user={user ? { name: user.name, role: 'platform_admin' } : null} displayInitials={user ? getDisplayInitials(user.name) : ''} onLogin={() => navigate('/login')} />

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-5 xl:p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard/platform/companies" replace />} />
            <Route path="/companies" element={<PlatformCompanies embedded />} />
            <Route path="/logs" element={<PlatformLogs />} />
            <Route path="*" element={<Navigate to="/dashboard/platform/companies" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
