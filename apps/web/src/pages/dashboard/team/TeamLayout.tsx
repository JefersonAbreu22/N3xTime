import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building, Clock3, Fingerprint, ShieldAlert, Users } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';

export default function TeamLayout() {
  const auth = useAuthStore();
  const location = useLocation();

  const tabs = useMemo(() => {
    const permissions = auth.user?.leadership_permissions ?? [];
    const baseTabs = permissions.some((item) => ['view_team', 'manage_team'].includes(item)) || auth.user?.role === 'admin' ? [
      { name: 'Colaboradores', path: '/dashboard/team/employees', icon: Users },
      ...(permissions.includes('manage_team') || auth.user?.role === 'admin' ? [
        { name: 'Vínculos e afastamentos', path: '/dashboard/team/restrictions', icon: ShieldAlert },
        { name: 'Jornadas', path: '/dashboard/team/schedules', icon: Clock3 },
      ] : []),
    ] : [];
    if (auth.user?.role === 'admin') {
      baseTabs.push({ name: 'Setores', path: '/dashboard/team/departments', icon: Building });
    }
    if (permissions.includes('manage_biometrics') || auth.user?.role === 'admin') baseTabs.push({ name: 'Biometria', path: '/dashboard/team/biometrics', icon: Fingerprint });
    return baseTabs;
  }, [auth.user?.role, auth.user?.leadership_permissions]);

  if (!auth.token) return <div className="py-12 text-center text-slate-500">Faça login para acessar.</div>;
  if (auth.user?.role !== 'manager' && auth.user?.role !== 'admin') return <div className="py-12 text-center text-slate-500">Acesso restrito.</div>;

  return (
    <div className="space-y-6">
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-[#e7e4e4] p-7">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">
            Estrutura organizacional
          </div>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#191717]">
            Equipes e Cadastro
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6e6a6a]">
            Crie setores, vincule líderes, distribua colaboradores e mantenha a base pronta
            para operação de ponto, auditoria e biometria facial.
          </p>
        </div>
        <div className="flex overflow-x-auto border-b border-[#ece8e8] bg-[#f8f6f6] px-4 scrollbar-hide">
          {tabs.map((tab) => {
            const isActive = location.pathname.startsWith(tab.path);
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-[#026666] text-[#026666]'
                    : 'border-transparent text-[#6e6a6a] hover:text-[#191717]'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.name}
              </NavLink>
            );
          })}
        </div>
      </section>

      <Outlet />
    </div>
  );
}
