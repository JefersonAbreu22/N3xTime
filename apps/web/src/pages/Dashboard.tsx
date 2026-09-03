import { Suspense, lazy, useEffect, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import MobileBottomNav from '../components/dashboard/MobileBottomNav';
import { authApi } from '../services/authApi';
import {
  getCurrentDashboardPageTitle,
  getDashboardNavSections,
  getDashboardProfileLabel,
  getDisplayInitials,
  getMobileNavItems,
} from '../components/dashboard/dashboardNavigation';

const OverviewPage = lazy(() => import('./dashboard/OverviewPage'));
const MyRecordsPage = lazy(() => import('./dashboard/MyRecordsPage'));
const MyRequestsPage = lazy(() => import('./dashboard/MyRequestsPage'));
const PendingPage = lazy(() => import('./dashboard/PendingPage'));
const AnalyticsPage = lazy(() => import('./dashboard/AnalyticsPage'));
const TeamPage = lazy(() => import('./dashboard/team/TeamLayout'));
const EmployeesTab = lazy(() => import('./dashboard/team/EmployeesTab'));
const DepartmentsTab = lazy(() => import('./dashboard/team/DepartmentsTab'));
const SchedulesTab = lazy(() => import('./dashboard/team/SchedulesTab'));
const BiometricsTab = lazy(() => import('./dashboard/team/BiometricsTab'));
const RestrictionsTab = lazy(() => import('./dashboard/team/RestrictionsTab'));
const ReportsLayout = lazy(() => import('./dashboard/reports/ReportsLayout'));
const IndicatorsTab = lazy(() => import('./dashboard/reports/IndicatorsTab'));
const TimesheetTab = lazy(() => import('./dashboard/reports/TimesheetTab'));
const DailyReportsTab = lazy(() => import('./dashboard/reports/DailyReportsTab'));
const RequestsTab = lazy(() => import('./dashboard/reports/RequestsTab'));
const ComplianceTab = lazy(() => import('./dashboard/reports/ComplianceTab'));
const ClosingTab = lazy(() => import('./dashboard/reports/ClosingTab'));
const SettingsPage = lazy(() => import('./dashboard/SettingsPage'));
const PermissionsPage = lazy(() => import('./dashboard/PermissionsPage'));
const EmailFailuresPage = lazy(() => import('./dashboard/EmailFailuresPage'));
const SmtpTestPage = lazy(() => import('./dashboard/SmtpTestPage'));

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuthStore();
  const token = auth.token;
  const setSession = auth.setSession;
  const role = auth.user?.role ?? 'employee';

  useEffect(() => {
    if (!token) return;
    let active = true;
    authApi.me().then((response) => {
      if (active) setSession(token, response.data.user);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [setSession, token]);

  const isPlatformAdmin = auth.user?.is_platform_admin === true;
  const requiresTimeTracking = auth.user?.requires_time_tracking !== false;
  const leadershipPermissions = useMemo(() => auth.user?.leadership_permissions ?? [], [auth.user?.leadership_permissions]);
  const canViewTeam = role === 'admin' || leadershipPermissions.some((item) => ['view_team', 'manage_team'].includes(item));
  const canManageTeam = role === 'admin' || leadershipPermissions.includes('manage_team');
  const canManageBiometrics = role === 'admin' || leadershipPermissions.includes('manage_biometrics');
  const canSeeTeam = canViewTeam || canManageBiometrics;
  const canApprove = role === 'admin' || leadershipPermissions.includes('approve_requests');
  const canViewReports = role === 'admin' || leadershipPermissions.includes('view_reports');
  const navSections = useMemo(() => getDashboardNavSections(role, isPlatformAdmin, requiresTimeTracking, leadershipPermissions), [role, isPlatformAdmin, requiresTimeTracking, leadershipPermissions]);

  const handleLogout = () => {
    auth.clearSession();
    navigate('/login');
  };

  const currentPageTitle = useMemo(() => getCurrentDashboardPageTitle(location.pathname), [location.pathname]);
  const mobileNavItems = useMemo(() => getMobileNavItems(role, requiresTimeTracking, leadershipPermissions), [role, requiresTimeTracking, leadershipPermissions]);
  const profileLabel = useMemo(() => getDashboardProfileLabel(role), [role]);
  const displayInitials = auth.user ? getDisplayInitials(auth.user.name) : '';

  const returnToPlatform = () => {
    auth.endImpersonation();
    navigate('/dashboard/platform');
  };

  const switchCompany = async (companyId: number) => {
    if (!auth.token || companyId === auth.user?.company.id) return;
    try {
      const response = await authApi.selectCompany(auth.token, companyId);
      if ('requires_company_selection' in response.data) return;
      setSession(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch {
      // The HTTP interceptor or the next authenticated request will surface session errors.
    }
  };

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <DashboardSidebar navSections={navSections} pathname={location.pathname} user={auth.user} onLogout={handleLogout} />

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          currentPageTitle={currentPageTitle}
          profileLabel={profileLabel}
          user={auth.user ? { name: auth.user.name, role: auth.user.role } : null}
          companySlug={auth.user?.company.slug}
          displayInitials={displayInitials}
          onLogin={() => navigate('/login')}
          companies={auth.user?.available_companies}
          currentCompanyId={auth.user?.company.id}
          onCompanyChange={(companyId) => void switchCompany(companyId)}
        />

        {auth.user?.is_impersonating && (
          <div className="flex flex-col gap-3 border-b border-[#8ccaca] bg-[#e4f4f4] px-5 py-3 text-sm text-[#014444] sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Você está acessando <strong>{auth.user.company.name}</strong> como Super Admin. Este acesso foi registrado na auditoria global.</span>
            </div>
            <button className="inline-flex shrink-0 items-center gap-2 font-semibold hover:underline" onClick={returnToPlatform}>
              <ArrowLeft className="h-4 w-4" /> Voltar ao Painel Super Admin
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-5 md:pb-24 xl:p-6 xl:pb-6">
          <Suspense fallback={<div className="surface-panel py-16 text-center text-[#6e6a6a]">Carregando página...</div>}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/my-point" element={requiresTimeTracking ? <MyRecordsPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/records" element={<Navigate to="/dashboard/my-point" replace />} />
              <Route path="/requests" element={requiresTimeTracking ? <MyRequestsPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/pending" element={canApprove ? <PendingPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/analytics" element={canViewReports ? <AnalyticsPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/team" element={canSeeTeam ? <TeamPage /> : <Navigate to="/dashboard" replace />}>
                <Route index element={<Navigate to={canViewTeam ? 'employees' : 'biometrics'} replace />} />
                <Route path="employees" element={canViewTeam ? <EmployeesTab /> : <Navigate to="../biometrics" replace />} />
                <Route path="departments" element={role === 'admin' ? <DepartmentsTab /> : <Navigate to="../employees" replace />} />
                <Route path="schedules" element={canManageTeam ? <SchedulesTab /> : <Navigate to="../employees" replace />} />
                <Route path="restrictions" element={canManageTeam ? <RestrictionsTab /> : <Navigate to="../employees" replace />} />
                <Route path="biometrics" element={canManageBiometrics ? <BiometricsTab /> : <Navigate to="../employees" replace />} />
              </Route>
              <Route path="/reports" element={canViewReports ? <ReportsLayout /> : <Navigate to="/dashboard" replace />}>
                <Route index element={<Navigate to="indicators" replace />} />
                <Route path="indicators" element={<IndicatorsTab />} />
                <Route path="timesheet" element={<TimesheetTab />} />
                <Route path="daily" element={<DailyReportsTab />} />
                <Route path="requests" element={<RequestsTab />} />
                <Route path="compliance" element={<ComplianceTab />} />
                <Route path="closing" element={<ClosingTab />} />
              </Route>
              <Route path="/settings" element={role === 'admin' ? <SettingsPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/settings/permissions" element={role === 'admin' ? <PermissionsPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/settings/email-failures" element={role === 'admin' ? <EmailFailuresPage /> : <Navigate to="/dashboard" replace />} />
              <Route path="/settings/smtp-test" element={role === 'admin' ? <SmtpTestPage /> : <Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <MobileBottomNav items={mobileNavItems} pathname={location.pathname} />
    </div>
  );
}
