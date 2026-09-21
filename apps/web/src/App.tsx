import { Suspense, lazy, useEffect, useState, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { usePlatformAuthStore } from './stores/platformAuthStore';
import { platformApi } from './services/platformApi';
import ChunkLoadRecovery from './components/ChunkLoadRecovery';
import FullScreenLoader from './components/FullScreenLoader';

const Kiosk = lazy(() => import('./pages/Kiosk'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const PlatformDashboard = lazy(() => import('./pages/platform/PlatformDashboard'));

function ProtectedRoute({ children, allowPasswordChange = false }: { children: ReactElement; allowPasswordChange?: boolean }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (user?.must_change_password && !allowPasswordChange) return <Navigate to="/change-password" replace />;
  if (user?.is_platform_admin && !user.is_impersonating && !allowPasswordChange) {
    return <Navigate to="/dashboard/platform/companies" replace />;
  }
  return children;
}

function PlatformProtectedRoute({ children }: { children: ReactElement }) {
  const platformToken = usePlatformAuthStore((state) => state.token);
  const setPlatformSession = usePlatformAuthStore((state) => state.setSession);
  const clearPlatformSession = usePlatformAuthStore((state) => state.clearSession);
  const tenantToken = useAuthStore((state) => state.token);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const isPlatformAdmin = useAuthStore((state) => state.user?.is_platform_admin === true);
  const [checkingSession, setCheckingSession] = useState(Boolean(!platformToken && tenantToken && isPlatformAdmin));
  const [bootstrapFailed, setBootstrapFailed] = useState(false);

  useEffect(() => {
    if (platformToken || !tenantToken || !isPlatformAdmin || bootstrapFailed) return;
    let active = true;
    setCheckingSession(true);
    platformApi.bootstrapSession()
      .then((response) => {
        if (active) setPlatformSession(response.data.token, response.data.user);
      })
      .catch(() => {
        if (active) {
          clearPlatformSession();
          clearAuthSession();
          setBootstrapFailed(true);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, [bootstrapFailed, clearAuthSession, clearPlatformSession, isPlatformAdmin, platformToken, setPlatformSession, tenantToken]);

  if (platformToken) return children;
  if (checkingSession) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f6f4f4] px-6 text-center text-sm text-[#6e6a6a]">Abrindo painel global...</div>;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: '10px',
            border: '1px solid #d9d7d7',
            background: '#fcfbfb',
            color: '#191717',
            fontFamily: 'Poppins, sans-serif',
            boxShadow: '0 18px 50px rgba(25, 23, 23, 0.12)',
          },
        }}
      />
      <ChunkLoadRecovery>
        <Suspense fallback={<FullScreenLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/kiosk" element={<Kiosk />} />
            <Route path="/:companySlug/kiosk" element={<Kiosk />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/change-password" element={<ProtectedRoute allowPasswordChange><ChangePassword /></ProtectedRoute>} />
            <Route path="/platform" element={<Navigate to="/dashboard/platform/companies" replace />} />
            <Route path="/platform/companies" element={<Navigate to="/dashboard/platform/companies" replace />} />
            <Route path="/dashboard/platform/*" element={<PlatformProtectedRoute><PlatformDashboard /></PlatformProtectedRoute>} />
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </ChunkLoadRecovery>
    </BrowserRouter>
  );
}

export default App;
