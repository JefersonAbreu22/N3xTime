import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, FileText, ShieldCheck, Clock, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { formatMinutes, todayKey } from '../../../components/dashboard/dashboardUtils';
import { useQuery } from '@tanstack/react-query';
import { departmentsApi } from '../../../services/departmentsApi';
import { usersApi } from '../../../services/usersApi';
import { reportsApi } from '../../../services/reportsApi';
import { authApi, type BiometricHistoryEvent } from '../../../services/authApi';

export type ReportsContextType = {
  companyName: string;
  filters: {
    startDate: string;
    endDate: string;
    departmentId: string;
    userId: string;
    dailyUserId: string;
    dailyDate: string;
  };
  setFilters: React.Dispatch<React.SetStateAction<ReportsContextType["filters"]>>;
  departments: Array<{ id: number; name: string }>;
  team: Array<{ id: number; name: string; remote_clock_in_enabled?: boolean }>;
  summaryData: {
    company?: {
      tradeName?: string;
      legalName?: string;
      cnpj?: string;
    };
    period?: {
      start: string;
      end: string;
    };
    metrics?: {
      employeesCount?: number;
      activeUsers?: number;
      departmentsCount?: number;
      totalEmployees?: number;
      presentToday?: number;
      missingToday?: number;
      lateToday?: number;
      pendingApprovals?: number;
      adjustedRecords?: number;
      rejectedRecords?: number;
      pinFallbacks?: number;
      biometricFailures?: number;
    };
    departmentBreakdown?: Array<{ departmentId?: string | number; departmentName: string; totalEmployees: number; presentToday: number; missingToday: number; lateToday: number; pendingApprovals: number }>;
    bankHours?: {
      workedMinutesTotal: number;
      expectedMinutesTotal: number;
      balanceMinutesTotal: number;
      overtimeMinutes: number;
      deficitMinutes: number;
      nightMinutesTotal?: number;
      holidayWorkedMinutes?: number;
      monthlyBreakdown?: Array<{
        month: string;
        workedMinutes: number;
        expectedMinutes: number;
        requiredMinutes: number;
        balanceMinutes: number;
        overtimeMinutes: number;
        deficitMinutes: number;
        nightMinutes: number;
        holidayWorkedMinutes: number;
        absenceDays: number;
        justifiedDays: number;
      }>;
    };
    absenceDocumentStats?: {
      totalUploaded?: number;
      pendingReview?: number;
      approved: number;
      rejected: number;
      total?: number;
      pending?: number;
      withAttachment?: number;
      vacations?: number;
      dayOffs?: number;
      timeAdjustments?: number;
    };
    recentVerificationFailures?: number;
    absenceDocuments?: Array<{
      id: number;
      userId: number;
      userName: string;
      registrationNumber: string;
      departmentName: string;
      requestType: string;
      targetDate: string;
      absenceStartTime?: string | null;
      absenceEndTime?: string | null;
      document_type: string;
      status: string;
      reason?: string;
      attachmentUrl?: string;
      attachmentName?: string;
      reviewedByName?: string;
      [key: string]: unknown;
    }>;
  } | null;
  attendanceData: Array<{ 
    userId: number; 
    name: string; 
    departmentName: string; 
    registrationNumber: string; 
    managerName: string; 
      bankHours: { 
        workedMinutesTotal: number;
        expectedMinutesTotal: number;
        balanceMinutesTotal: number; 
        overtimeMinutes: number; 
        deficitMinutes: number; 
        completeDays?: number;
        absenceDays?: number;
        justifiedDays?: number;
        latestDailyBalance?: { date: string; balanceMinutes: number } 
      }; 
    pendingApprovals: number; 
    biometricFailures: number; 
    daysPresent: number;
    adjustedRecords?: number;
    rejectedRecords?: number;
    pinFallbacks?: number;
    firstRecordAt?: string;
    lastRecordAt?: string;
    schedule?: { entry_time: string; exit_time: string; daily_workload_minutes?: number };
  }>;
  biometricData: {
    sampleCoverageRate?: number;
    usersWithoutBiometrics?: number;
    usersWithLowCoverage?: number;
    pinFallbacks?: number;
    recentVerificationFailures?: number;
    invalidPinAttempts?: number;
    rateLimitedPinAttempts?: number;
    lowConfidenceRejections?: number;
    recentResets?: number;
    topFailureReasons?: Array<{ reason: string; count: number }>;
    deviceBreakdown?: Array<{ deviceLabel: string; successCount: number; failureCount: number; pinFallbackCount: number }>;
  } | null;
  biometricHistoryRows: Array<BiometricHistoryEvent>;
  monthlyClosureRows: Array<{ periodMonth: string; periodLabel: string; periodStart: string; periodEnd: string; status: string; snapshot?: { bankHours?: { workedMinutesTotal?: number; requiredMinutesTotal?: number; expectedMinutesTotal?: number; balanceMinutesTotal?: number; overtimeMinutes?: number; deficitMinutes?: number } } | null; closedByName?: string; closedAt?: string; canClose: boolean; canReopen: boolean; notes?: string }>;
  isLoading: boolean;
};

export default function ReportsLayout() {
  const auth = useAuthStore();
  const location = useLocation();

  const [filters, setFilters] = useState({
    startDate: todayKey(),
    endDate: todayKey(),
    departmentId: '',
    userId: '',
    dailyUserId: '',
    dailyDate: todayKey(),
  });

  const enabled = auth.user?.role === 'manager' || auth.user?.role === 'admin';
  const parsedDepartmentId = filters.departmentId ? Number(filters.departmentId) : null;
  const parsedUserId = filters.userId ? Number(filters.userId) : null;
  const reportYear = Number(filters.startDate.slice(0, 4)) || new Date().getFullYear();

  const deptsQuery = useQuery({
    queryKey: ['departments', 'reports'],
    queryFn: async () => {
      const res = await departmentsApi.list();
      return res.data;
    },
    enabled,
  });

  const teamQuery = useQuery({
    queryKey: ['users', 'team', 'reports'],
    queryFn: async () => {
      const res = await usersApi.team();
      return res.data;
    },
    enabled,
  });

  const hrSummary = useQuery({
    queryKey: ['reports', 'hr-summary', filters.startDate, filters.endDate, parsedDepartmentId, parsedUserId],
    queryFn: async () => {
      const res = await reportsApi.hrSummary({
        startDate: filters.startDate,
        endDate: filters.endDate,
        departmentId: parsedDepartmentId ?? undefined,
        userId: parsedUserId ?? undefined,
      });
      return res;
    },
    enabled,
  });

  const attendance = useQuery({
    queryKey: ['reports', 'attendance', filters.startDate, filters.endDate, parsedDepartmentId, parsedUserId],
    queryFn: async () => {
      const res = await reportsApi.attendance({
        startDate: filters.startDate,
        endDate: filters.endDate,
        departmentId: parsedDepartmentId ?? undefined,
        userId: parsedUserId ?? undefined,
      });
      return res;
    },
    enabled,
  });

  const cumulativeBankHours = useQuery({
    queryKey: ['reports', 'cumulative-bank-hours', parsedUserId],
    queryFn: async () => reportsApi.cumulativeBankHours(parsedUserId),
    enabled: enabled && Boolean(parsedUserId),
  });

  const { data: biometricSummary, isLoading: isLoadingBiometricSummary } = useQuery({
    queryKey: ['biometrics', 'summary'],
    queryFn: async () => {
      const res = await authApi.getBiometricSummary();
      return res;
    },
    enabled: !!auth.token,
  });

  const { data: biometricHistory, isLoading: isLoadingBiometricHistory } = useQuery({
    queryKey: ['biometrics', 'history'],
    queryFn: async () => {
      const res = await authApi.getBiometricHistory();
      return res;
    },
    enabled: !!auth.token,
  });

  const monthlyClosures = useQuery({
    queryKey: ['reports', 'monthly-closures', reportYear],
    queryFn: async () => reportsApi.monthlyClosures(reportYear),
    enabled,
  });

  if (!auth.token) return <div className="py-12 text-center text-slate-500">Faça login para acessar.</div>;
  if (!enabled) return <div className="py-12 text-center text-slate-500">Acesso restrito.</div>;

  const tabs = [
    { name: 'Indicadores', path: '/dashboard/reports/indicators', icon: BarChart3 },
    { name: 'Espelho Diário', path: '/dashboard/reports/timesheet', icon: Clock },
    { name: 'Banco de Horas', path: '/dashboard/reports/daily', icon: FileText },
    { name: 'Solicitações', path: '/dashboard/reports/requests', icon: ClipboardList },
    { name: 'Compliance', path: '/dashboard/reports/compliance', icon: ShieldCheck },
    { name: 'Fechamento', path: '/dashboard/reports/closing', icon: CalendarDays },
  ];

  const summaryData = hrSummary.data?.data;
  const selectedDepartmentName = deptsQuery.data?.find((department: {id: number; name: string}) => department.id === parsedDepartmentId)?.name;
  const selectedUserName = teamQuery.data?.find((user: {id: number; name: string}) => user.id === parsedUserId)?.name;
  const scopeLabel = selectedUserName || selectedDepartmentName || 'Base completa';
  const selectedPeriodBankHours = parsedUserId
    ? attendance.data?.data.find((item) => item.userId === parsedUserId)?.bankHours
    : null;
  const generalBankHours = cumulativeBankHours.data?.data.bankHours;
  const formatBalance = (minutes: number) => minutes > 0 ? `+${formatMinutes(minutes)}` : formatMinutes(minutes);

  const contextValue: ReportsContextType = {
    companyName: auth.user?.company.name || summaryData?.company?.tradeName || summaryData?.company?.legalName || 'Empresa não configurada',
    filters,
    setFilters,
    departments: deptsQuery.data ?? [],
    team: teamQuery.data ?? [],
    summaryData: (summaryData as unknown) as ReportsContextType['summaryData'],
    attendanceData: attendance.data?.data ?? [],
    biometricData: biometricSummary?.data as ReportsContextType['biometricData'],
    biometricHistoryRows: biometricHistory?.data ?? [],
    monthlyClosureRows: monthlyClosures.data?.data ?? [],
    isLoading: hrSummary.isLoading || attendance.isLoading || cumulativeBankHours.isLoading || isLoadingBiometricSummary || isLoadingBiometricHistory || monthlyClosures.isLoading,
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel overflow-hidden">
        <div className="border-b border-[#e7e4e4] p-7">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#ece8e8] pb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">
                Análise e Fechamento
              </div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#191717]">
                Central de Relatórios
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="text-sm px-3 py-1.5 bg-[#f6f4f4] rounded-md border border-[#ece8e8]">
                <span className="font-semibold text-[#191717]">Escopo:</span> {scopeLabel}
              </div>
              <div className="text-sm px-3 py-1.5 bg-[#f6f4f4] rounded-md border border-[#ece8e8]">
                <span className="font-semibold text-[#191717]">Empresa:</span>{' '}
                {summaryData?.company?.tradeName || summaryData?.company?.legalName || 'Não configurada'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4 mt-5">
            <div>
              <label className="field-label">Data inicial</label>
              <input type="date" className="form-control field-input" value={filters.startDate} onChange={(e) => setFilters((state) => ({ ...state, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Data final</label>
              <input type="date" className="form-control field-input" value={filters.endDate} onChange={(e) => setFilters((state) => ({ ...state, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Setor</label>
              <select className="field-input" value={filters.departmentId} onChange={(e) => setFilters((state) => ({ ...state, departmentId: e.target.value, userId: '' }))}>
                <option value="">Todos os setores</option>
                {deptsQuery.data?.map((department: { id: number; name: string }) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Colaborador</label>
              <select className="field-input" value={filters.userId} onChange={(e) => setFilters((state) => ({ ...state, userId: e.target.value, dailyUserId: e.target.value || state.dailyUserId }))}>
                <option value="">Todos os colaboradores</option>
                {teamQuery.data?.map((user: { id: number; name: string }) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {parsedUserId && (
            <div className="mt-5 rounded-2xl border border-[#dceaea] bg-[#f8fcfc] p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Banco de horas individual</div>
                  <div className="mt-1 font-semibold text-[#191717]">{selectedUserName ?? 'Colaborador selecionado'}</div>
                </div>
                <div className="text-xs text-[#6e6a6a]">Período: {filters.startDate} até {filters.endDate}</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#dceaea] bg-white p-4">
                  <div className="metric-label">Saldo do período selecionado</div>
                  <div className={`mt-2 text-2xl font-bold ${(selectedPeriodBankHours?.balanceMinutesTotal ?? 0) < 0 ? 'text-[#b43737]' : 'text-[#026666]'}`}>
                    {formatBalance(selectedPeriodBankHours?.balanceMinutesTotal ?? 0)}
                  </div>
                  <div className="mt-1 text-xs text-[#6e6a6a]">Considera somente as datas informadas acima.</div>
                </div>
                <div className="rounded-xl border border-[#dceaea] bg-white p-4">
                  <div className="metric-label">Saldo geral</div>
                  <div className={`mt-2 text-2xl font-bold ${(generalBankHours?.balanceMinutesTotal ?? 0) < 0 ? 'text-[#b43737]' : 'text-[#026666]'}`}>
                    {cumulativeBankHours.isLoading ? 'Carregando...' : formatBalance(generalBankHours?.balanceMinutesTotal ?? 0)}
                  </div>
                  <div className="mt-1 text-xs text-[#6e6a6a]">Acumulado desde o início do banco de horas.</div>
                </div>
              </div>
            </div>
          )}
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

      {contextValue.isLoading ? (
        <div className="surface-panel py-16 text-center text-[#6e6a6a]">Carregando dados...</div>
      ) : (
        <Outlet context={contextValue} />
      )}
    </div>
  );
}
