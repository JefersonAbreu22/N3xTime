import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  MailWarning,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

export type DashboardRole = 'admin' | 'manager' | 'employee';
export type LeadershipPermission = 'view_team' | 'manage_team' | 'view_time_records' | 'manage_time_records' | 'approve_requests' | 'view_reports' | 'manage_biometrics';

export type DashboardNavItem = {
  name: string;
  path: string;
  icon: LucideIcon;
};

export type DashboardNavSection = {
  label: string;
  items: DashboardNavItem[];
};

export type DashboardMobileNavItem = DashboardNavItem & {
  shortName: string;
};

export type DashboardAreaTab = {
  name: string;
  path: string;
  match: string[];
};

export const getDashboardNavSections = (role: DashboardRole, isPlatformAdmin = false, requiresTimeTracking = true, permissions: LeadershipPermission[] = []): DashboardNavSection[] => {
  if (role === 'employee') {
    return [
      {
        label: 'Ponto',
        items: [
          { name: 'Visão Geral', path: '/dashboard', icon: LayoutDashboard },
          ...(requiresTimeTracking ? [
            { name: 'Meu Ponto', path: '/dashboard/my-point', icon: Clock3 },
            { name: 'Solicitações', path: '/dashboard/requests', icon: FileText },
          ] : []),
        ],
      },
    ];
  }

  if (role === 'manager') {
    const canSeeTeam = permissions.some((item) => ['view_team', 'manage_team', 'manage_biometrics'].includes(item));
    const canApprove = permissions.includes('approve_requests');
    const canReport = permissions.includes('view_reports');
    return [
      {
        label: 'Gestão',
        items: [
          { name: 'Visão Geral', path: '/dashboard', icon: LayoutDashboard },
          ...(canSeeTeam ? [{ name: 'Minha Equipe', path: '/dashboard/team', icon: Users }] : []),
          ...(canApprove ? [{ name: 'Pendências', path: '/dashboard/pending', icon: ClipboardList }] : []),
          ...(canReport ? [{ name: 'Análises', path: '/dashboard/analytics', icon: Activity }, { name: 'Relatórios', path: '/dashboard/reports', icon: BarChart3 }] : []),
        ],
      },
    ];
  }

  const sections: DashboardNavSection[] = [
    {
      label: 'Administração',
      items: [
        { name: 'Análises', path: '/dashboard/analytics', icon: Activity },
        { name: 'Dashboard RH', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Colaboradores', path: '/dashboard/team', icon: Users },
        { name: 'Pendências', path: '/dashboard/pending', icon: ClipboardList },
        { name: 'Relatórios', path: '/dashboard/reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Operação',
      items: [
        { name: 'Configurações', path: '/dashboard/settings', icon: Settings },
        { name: 'Permissões', path: '/dashboard/settings/permissions', icon: ShieldCheck },
        { name: 'Falhas de e-mail', path: '/dashboard/settings/email-failures', icon: MailWarning },
      ],
    },
  ];

  if (isPlatformAdmin) {
    sections.push({
      label: 'Plataforma',
      items: [
        { name: 'Painel Super Admin', path: '/dashboard/platform/companies', icon: Building2 },
      ],
    });
  }

  return sections;
};

export const getDashboardAreaTabs = (role: DashboardRole): DashboardAreaTab[] => {
  if (role === 'employee') {
    return [
      { name: 'Ponto', path: '/dashboard/my-point', match: ['/dashboard', '/dashboard/my-point'] },
      { name: 'Solicitações', path: '/dashboard/requests', match: ['/dashboard/requests'] },
      { name: 'Perfil', path: '/dashboard/settings', match: ['/dashboard/settings'] },
    ];
  }

  if (role === 'manager') {
    return [
      { name: 'Operação', path: '/dashboard', match: ['/dashboard', '/dashboard/pending'] },
      { name: 'Equipe', path: '/dashboard/team', match: ['/dashboard/team'] },
      { name: 'Relatórios', path: '/dashboard/reports', match: ['/dashboard/reports'] },
    ];
  }

  return [
    { name: 'RH', path: '/dashboard', match: ['/dashboard', '/dashboard/pending'] },
    { name: 'Pessoas', path: '/dashboard/team', match: ['/dashboard/team'] },
    { name: 'Administração', path: '/dashboard/settings', match: ['/dashboard/settings'] },
  ];
};

export const getMobileNavItems = (role: DashboardRole, requiresTimeTracking = true, permissions: LeadershipPermission[] = []): DashboardMobileNavItem[] => {
  if (role === 'employee') {
    return [
      { name: 'Visão Geral', shortName: 'Home', path: '/dashboard', icon: LayoutDashboard },
      ...(requiresTimeTracking ? [
        { name: 'Meu Ponto', shortName: 'Ponto', path: '/dashboard/my-point', icon: Clock3 },
        { name: 'Solicitações', shortName: 'Pedidos', path: '/dashboard/requests', icon: FileText },
      ] : []),
    ];
  }

  if (role === 'manager') {
    return [
      { name: 'Visão Geral', shortName: 'Home', path: '/dashboard', icon: LayoutDashboard },
      ...(permissions.some((item) => ['view_team', 'manage_team', 'manage_biometrics'].includes(item)) ? [{ name: 'Equipe', shortName: 'Equipe', path: '/dashboard/team', icon: Users }] : []),
      ...(permissions.includes('approve_requests') ? [{ name: 'Pendências', shortName: 'Fila', path: '/dashboard/pending', icon: ClipboardList }] : []),
      ...(permissions.includes('view_reports') ? [{ name: 'Relatórios', shortName: 'Dados', path: '/dashboard/reports', icon: BarChart3 }] : []),
    ];
  }

  return [
    { name: 'Visão Geral', shortName: 'Home', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Equipe', shortName: 'Equipe', path: '/dashboard/team', icon: Users },
    { name: 'Pendências', shortName: 'Fila', path: '/dashboard/pending', icon: ClipboardList },
    { name: 'Relatórios', shortName: 'Dados', path: '/dashboard/reports', icon: BarChart3 },
    { name: 'Ajustes', shortName: 'Ajustes', path: '/dashboard/settings', icon: Settings },
  ];
};

export const getDashboardProfileLabel = (role: DashboardRole) => {
  if (role === 'employee') return 'Colaborador';
  if (role === 'manager') return 'Liderança';
  return 'RH/Admin';
};

export const getCurrentDashboardPageTitle = (pathname: string) => {
  if (pathname.includes('/dashboard/platform')) return 'Painel Super Admin';
  if (pathname.includes('/team/restrictions')) return 'Vínculos e afastamentos';
  if (pathname.includes('/my-point') || pathname.includes('/records')) return 'Meu Ponto';
  if (pathname.includes('/requests')) return 'Solicitações';
  if (pathname.includes('/pending')) return 'Pendências';
  if (pathname.includes('/analytics')) return 'Análises';
  if (pathname.includes('/team')) return 'Minha Equipe';
  if (pathname.includes('/reports')) return 'Relatórios';
  if (pathname.includes('/settings/permissions')) return 'Permissões';
  if (pathname.includes('/settings/email-failures')) return 'Falhas de e-mail';
  if (pathname.includes('/settings')) return 'Configurações';
  return 'Visão Geral';
};

export const getDisplayInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('');
};
