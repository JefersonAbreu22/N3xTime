import { AlertTriangle, CheckCircle2, Clock3, FileText, MapPin, ShieldAlert, Umbrella, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { reportsApi } from '../../services/reportsApi';
import { recordsApi } from '../../services/recordsApi';
import { usersApi } from '../../services/usersApi';
import { formatMinutes, monthStartKey, recordTypeLabel, requestStatusLabel, requestTypeLabel, todayKey } from '../../components/dashboard/dashboardUtils';
import RemoteClockInModal from '../../components/dashboard/RemoteClockInModal';

const EMPTY_COLLABORATORS: never[] = [];

const Metric = ({
  label,
  value,
  note,
  tone = 'brand',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  tone?: 'brand' | 'danger' | 'neutral';
  icon: typeof Clock3;
}) => {
  const toneClass =
    tone === 'danger'
      ? 'text-[#b43737]'
      : tone === 'neutral'
        ? 'text-[#191717]'
        : 'text-[#026666]';

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between">
        <div className="metric-label">{label}</div>
        <Icon className={`h-5 w-5 ${toneClass}`} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="mt-1.5 text-[12px] text-[#6e6a6a]">{note}</div>
    </div>
  );
};

const groupByDepartment = <T extends { departmentName: string; userName: string }>(collaborators: T[]) => {
  const groups = new Map<string, T[]>();

  for (const collaborator of collaborators) {
    const departmentName = collaborator.departmentName || 'Sem setor';
    const members = groups.get(departmentName) ?? [];
    members.push(collaborator);
    groups.set(departmentName, members);
  }

  return Array.from(groups.entries())
    .map(([departmentName, members]) => [
      departmentName,
      members.sort((a, b) => a.userName.localeCompare(b.userName, 'pt-BR')),
    ] as const)
    .sort(([firstDepartment], [secondDepartment]) => firstDepartment.localeCompare(secondDepartment, 'pt-BR'));
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export default function OverviewPage() {
  const auth = useAuthStore();
  const role = auth.user?.role ?? 'employee';
  const isManagement = role === 'manager' || role === 'admin';
  const isAdmin = role === 'admin';
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);

  const hrSummary = useQuery({
    queryKey: ['overview', 'hr-summary', todayKey()],
    queryFn: async () => reportsApi.hrSummary({ startDate: monthStartKey(), endDate: todayKey() }),
    enabled: !!auth.token,
  });

  const cumulativeBankHours = useQuery({
    queryKey: ['my-point', 'cumulative-bank-hours'],
    queryFn: () => reportsApi.cumulativeBankHours(),
    enabled: !!auth.token && role === 'employee',
  });

  const recent = useQuery({
    queryKey: ['overview', 'recent-records'],
    queryFn: async () => {
      const res = role === 'employee' ? await recordsApi.myRecords() : await recordsApi.recent();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const teamCount = useQuery({
    queryKey: ['overview', 'team-count'],
    queryFn: async () => {
      const res = await usersApi.team();
      return res.data.length;
    },
    enabled: !!auth.token && isManagement,
  });

  const monthlyClosures = useQuery({
    queryKey: ['overview', 'monthly-closures'],
    queryFn: async () => reportsApi.monthlyClosures(),
    enabled: !!auth.token && isAdmin,
  });

  const summary = hrSummary.data?.data;
  const bank = summary?.bankHours;
  const cumulativeBank = cumulativeBankHours.data?.data.bankHours;
  const latestDailyBalance = bank?.latestDailyBalance;
  const employeeLatestRecord = recent.data?.[0];
  const currentClosure = monthlyClosures.data?.data.find((item) => item.isCurrentMonth);
  const presentByDepartment = useMemo(
    () => groupByDepartment(summary?.todayWorkforce?.present ?? []),
    [summary?.todayWorkforce?.present]
  );
  const statusesByDepartment = useMemo(
    () => groupByDepartment(summary?.todayWorkforce?.statuses ?? []),
    [summary?.todayWorkforce?.statuses]
  );
  const absentToday = summary?.todayWorkforce?.absent ?? EMPTY_COLLABORATORS;
  const absentByDepartment = useMemo(
    () => groupByDepartment(absentToday),
    [absentToday]
  );

  const heroTitle =
    role === 'employee'
      ? 'Sua rotina de ponto em um só lugar'
      : role === 'manager'
        ? 'Sua operação de equipe, com foco no que exige ação'
        : 'Visão operacional de RH e fechamento';
  const heroDescription =
    role === 'employee'
      ? 'Acompanhe horas do dia, saldo do banco, última marcação e pedidos pendentes.'
      : role === 'manager'
        ? 'Priorize aprovações, atrasos, faltas e exceções sem navegar entre módulos desconectados.'
        : 'Consolide fechamento, banco de horas geral, alertas e indicadores da empresa em uma home mais operacional.';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-[#191717]">
          {getGreeting()}, {auth.user?.name?.split(' ')[0] ?? 'Colaborador'}!
        </h1>
      </div>

      {auth.user?.remote_clock_in_enabled && (
        <section className="bg-white border border-[#e7e4e4] rounded-2xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#191717]">Registro de Ponto</h2>
            <p className="text-[#6e6a6a] mt-1 text-sm">Registre seu ponto remotamente de forma rápida e segura.</p>
          </div>
          <button 
            onClick={() => setIsRemoteModalOpen(true)}
            className="w-full md:w-auto bg-[#026666] hover:bg-[#014d4d] text-white px-8 py-3 rounded-xl font-semibold text-[15px] shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Clock3 className="h-5 w-5" />
            Registrar Ponto
          </button>
        </section>
      )}

      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="border-b border-[#e7e4e4] p-5 md:p-6 xl:border-b-0 xl:border-r">
            <div className="page-eyebrow">{role === 'employee' ? 'Colaborador' : role === 'manager' ? 'Liderança' : 'RH/Admin'}</div>
            <h2 className="page-title">{heroTitle}</h2>
            <p className="page-description">{heroDescription}</p>
          </div>
          <div className="p-5 md:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Último destaque</div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">
              {role === 'employee'
                ? employeeLatestRecord
                  ? recordTypeLabel(employeeLatestRecord.record_type)
                  : 'Sem marcações recentes'
                : `${summary?.metrics.pendingApprovals ?? 0} aprovações pendentes`}
            </div>
            <div className="mt-2 text-sm leading-6 text-[#6e6a6a]">
              {role === 'employee'
                ? employeeLatestRecord
                  ? new Date(employeeLatestRecord.record_time).toLocaleString()
                  : 'Nenhuma movimentação disponível.'
                : `${summary?.metrics.lateToday ?? 0} atrasos, ${summary?.metrics.missingToday ?? 0} ausências e ${summary?.exceptionQueue.length ?? 0} exceções monitoradas.`}
            </div>
          </div>
        </div>
      </section>

      {isManagement && summary?.missingClockIns && summary.missingClockIns.length > 0 && (
        <section className="surface-panel p-5 md:p-6 border-l-4 border-[#b43737]">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-[#b43737]" />
            <h3 className="text-lg font-semibold text-[#191717]">Alertas de Esquecimento de Ponto</h3>
          </div>
          <p className="text-sm text-[#6e6a6a] mb-4">
            Os seguintes colaboradores não registraram o ponto no horário esperado hoje. Entre em contato para solicitar o ajuste de ponto na plataforma.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.missingClockIns.map((missing: { userId: number; userName: string; departmentName: string; scheduleEntryTime: string; delayMinutes?: number }) => (
              <div key={missing.userId} className="flex flex-col rounded-xl border border-[#f0dede] bg-[#fbf1f1] p-4 text-[#b43737]">
                <div className="font-semibold">{missing.userName}</div>
                <div className="text-sm opacity-90 mt-1">{missing.departmentName}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <div className="text-xs font-medium bg-white/50 px-2 py-1 rounded">
                    Entrada esperada: {missing.scheduleEntryTime}
                  </div>
                  {missing.delayMinutes !== undefined && (
                    <div className="text-xs font-medium bg-[#b43737]/10 text-[#b43737] px-2 py-1 rounded">
                      Atraso: {formatMinutes(missing.delayMinutes)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isManagement && summary?.todayWorkforce && (
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-[#dceaea] bg-white p-5 shadow-sm md:p-6">
            <div className="-mx-5 -mt-5 mb-5 flex items-start justify-between gap-4 border-b border-[#dceaea] bg-gradient-to-br from-[#edf8f8] via-[#f8fcfc] to-white px-5 py-5 md:-mx-6 md:-mt-6 md:px-6">
              <div>
                <div className="section-kicker">Acompanhamento de hoje</div>
                <h3 className="mt-1 text-lg font-semibold text-[#191717]">Colaboradores presentes</h3>
                <p className="mt-1 text-sm text-[#6e6a6a]">Última marcação registrada para cada pessoa em atividade.</p>
              </div>
              <span className="status-chip border-[#dceaea] bg-[#edf8f8] text-[#026666]">{summary.todayWorkforce.present.length} presente(s)</span>
            </div>
            <div className="mt-5 space-y-4">
              {presentByDepartment.map(([departmentName, collaborators]) => (
                <div key={departmentName} className="rounded-xl border border-[#dceaea] bg-[#f8fcfc] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-[#191717]">{departmentName}</h4>
                    <span className="text-xs font-medium text-[#6e6a6a]">{collaborators.length} presente(s)</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {collaborators.map((collaborator) => (
                <div key={collaborator.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-3 shadow-sm transition-shadow hover:shadow-md">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-[#191717]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#dff1f1] text-[10px] font-bold text-[#026666]">{initials(collaborator.userName)}</span>{collaborator.userName}</div>
                    <div className="mt-1 text-xs text-[#6e6a6a]">{collaborator.departmentName} · {recordTypeLabel(collaborator.lastRecordType)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {collaborator.isRemote && <span className="status-chip border-[#c8e7e7] bg-[#edf8f8] text-[#026666]"><MapPin className="h-3.5 w-3.5" /> Remoto</span>}
                    <span className="text-sm font-semibold text-[#191717]">{new Date(collaborator.lastRecordAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                    ))}
                  </div>
                </div>
              ))}
              {!summary.todayWorkforce.present.length && <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Nenhuma presença com ponto registrado até o momento.</div>}
            </div>
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-[#e7e4e4] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Status vinculado ao ponto</div>
                <h3 className="mt-1 text-lg font-semibold text-[#191717]">Folgas, afastamentos e trabalho externo</h3>
                <p className="mt-1 text-sm text-[#6e6a6a]">Situações lançadas para hoje, inclusive solicitações em aprovação.</p>
              </div>
              <span className="status-chip border-[#ece8e8] bg-[#f6f4f4] text-[#191717]">{summary.todayWorkforce.statuses.length} status</span>
            </div>
            <div className="mt-5 space-y-3">
              {statusesByDepartment.map(([departmentName, collaborators]) => (
                <div key={departmentName} className="rounded-xl border border-[#e7e4e4] bg-[#faf9f9] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-[#191717]">{departmentName}</h4>
                    <span className="text-xs font-medium text-[#6e6a6a]">{collaborators.length} status</span>
                  </div>
                  <div className="space-y-3">
                    {collaborators.map((collaborator) => (
                <div key={collaborator.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-3 shadow-sm transition-shadow hover:shadow-md">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold text-[#191717]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ece8e8] text-[10px] font-bold text-[#4c4848]">{initials(collaborator.userName)}</span>{collaborator.userName}</div>
                    <div className="mt-1 text-xs text-[#6e6a6a]">{collaborator.departmentName} · {collaborator.reason}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="status-chip border-[#ece8e8] bg-[#f6f4f4] text-[#191717]"><Umbrella className="h-3.5 w-3.5" /> {requestTypeLabel(collaborator.requestType)}</span>
                    <span className={`status-chip ${collaborator.requestStatus === 'approved' ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : collaborator.requestStatus === 'rejected' ? 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]' : 'border-[#ece8e8] bg-[#f6f4f4] text-[#191717]'}`}>{requestStatusLabel(collaborator.requestStatus)}</span>
                    {collaborator.isRemote && <span className="status-chip border-[#c8e7e7] bg-[#edf8f8] text-[#026666]"><MapPin className="h-3.5 w-3.5" /> Ponto remoto</span>}
                  </div>
                </div>
                    ))}
                  </div>
                </div>
              ))}
              {!summary.todayWorkforce.statuses.length && <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Nenhuma folga, afastamento ou trabalho externo lançado para hoje.</div>}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#f0dede] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Acompanhamento de hoje</div>
                <h3 className="mt-1 text-lg font-semibold text-[#191717]">Colaboradores com falta</h3>
                <p className="mt-1 text-sm text-[#6e6a6a]">Sem marcação e sem ocorrência vinculada para a jornada de hoje.</p>
              </div>
              <span className="status-chip border-[#f0dede] bg-[#fbf1f1] text-[#b43737]">{absentToday.length} falta(s)</span>
            </div>
            <div className="mt-5 space-y-5">
              {absentByDepartment.map(([departmentName, collaborators]) => (
                <div key={departmentName} className="rounded-xl border border-[#f0dede] bg-[#fffafa] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-[#191717]">{departmentName}</h4>
                    <span className="text-xs font-medium text-[#6e6a6a]">{collaborators.length} falta(s)</span>
                  </div>
                  <div className="space-y-3">
                    {collaborators.map((collaborator) => (
                      <div key={collaborator.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white px-3 py-3 shadow-sm transition-shadow hover:shadow-md">
                        <div>
                            <div className="flex items-center gap-2 font-semibold text-[#191717]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f9dddd] text-[10px] font-bold text-[#b43737]">{initials(collaborator.userName)}</span>{collaborator.userName}</div>
                          <div className="mt-1 text-xs text-[#6e6a6a]">Entrada prevista: {collaborator.scheduleEntryTime}</div>
                        </div>
                        <span className="status-chip border-[#f0dede] bg-white text-[#b43737]"><AlertTriangle className="h-3.5 w-3.5" /> Sem registro</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!absentToday.length && <div className="surface-muted p-4 text-sm text-[#6e6a6a]">Nenhuma falta identificada para as jornadas previstas hoje.</div>}
            </div>
          </div>
          </div>
        </section>
      )}

      {role === 'employee' ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Horas Hoje"
            value={formatMinutes(latestDailyBalance?.workedMinutes ?? 0)}
            note="Trabalhadas no dia de hoje."
            icon={Clock3}
          />
          <Metric
            label="Trabalhadas no Mês"
            value={formatMinutes(bank?.workedMinutesTotal ?? 0)}
            note="Total de horas trabalhadas no período atual."
            icon={CheckCircle2}
          />
          <Metric
            label="Horas Restantes Hoje"
            value={formatMinutes(Math.max((latestDailyBalance?.expectedMinutes ?? 0) - (latestDailyBalance?.workedMinutes ?? 0), 0))}
            note="Jornada prevista ainda a ser cumprida hoje."
            tone="neutral"
            icon={Clock3}
          />
          <Metric
            label="Saldo do Mês"
            value={formatMinutes(bank?.balanceMinutesTotal ?? 0)}
            note="Resultado acumulado no mês atual."
            tone={((bank?.balanceMinutesTotal ?? 0) < 0) ? 'danger' : 'brand'}
            icon={Clock3}
          />
          <Metric
            label="Saldo Geral"
            value={formatMinutes(cumulativeBank?.balanceMinutesTotal ?? 0)}
            note="Acumulado desde o início do banco de horas."
            tone={((cumulativeBank?.balanceMinutesTotal ?? 0) < 0) ? 'danger' : 'brand'}
            icon={Clock3}
          />
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Pendências de Aprovação"
            value={summary?.metrics.pendingApprovals ?? 0}
            note="Ajustes, documentos e solicitações em fila."
            tone={(summary?.metrics.pendingApprovals ?? 0) > 0 ? 'danger' : 'brand'}
            icon={FileText}
          />
          <Metric
            label="Esquecimentos de Ponto"
            value={summary?.missingClockIns?.length ?? 0}
            note="Colaboradores que não bateram ponto hoje."
            tone={(summary?.missingClockIns?.length ?? 0) > 0 ? 'danger' : 'brand'}
            icon={AlertTriangle}
          />
          <Metric
            label="Pessoas Atrasadas"
            value={summary?.metrics.lateToday ?? 0}
            note="Entradas fora da tolerância configurada."
            tone={(summary?.metrics.lateToday ?? 0) > 0 ? 'danger' : 'brand'}
            icon={Clock3}
          />
          <Metric
            label="Faltas Hoje"
            value={summary?.metrics.missingToday ?? 0}
            note="Sem registro de entrada até o momento."
            tone={(summary?.metrics.missingToday ?? 0) > 0 ? 'danger' : 'neutral'}
            icon={Users}
          />
        </section>
      )}

      {isAdmin && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Metric
            label="Fechamento Atual"
            value={currentClosure?.status === 'closed' ? 'Fechado' : 'Aberto'}
            note={currentClosure ? `${currentClosure.periodLabel}` : 'Competência atual ainda não encontrada.'}
            tone={currentClosure?.status === 'closed' ? 'brand' : 'danger'}
            icon={ShieldAlert}
          />
          <Metric
            label="Banco Geral"
            value={formatMinutes(bank?.balanceMinutesTotal ?? 0)}
            note="Saldo agregado do período consultado."
            icon={Clock3}
          />
          <Metric
            label="Colaboradores"
            value={summary?.metrics.totalEmployees ?? 0}
            note="Base ativa considerada na visão operacional."
            tone="neutral"
            icon={Users}
          />
        </section>
      )}

      <section className="section-card">
        <div className="section-header">
          <div>
            <div className="section-kicker">{isManagement ? 'Indicadores' : 'Resumo pessoal'}</div>
            <h3 className="section-title">{isManagement ? 'Estado da operação' : 'Situação da sua jornada'}</h3>
            <p className="section-note">
              {isManagement
                ? 'Dados imediatos para decidir o que deve ser tratado agora.'
                : 'Resumo consolidado para consulta rápida antes de entrar nos detalhes do ponto.'}
            </p>
          </div>
        </div>

        {isManagement ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="insight-card">
              <div className="metric-label">Equipe monitorada</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{teamCount.data ?? 0}</div>
              <div className="kpi-caption">Pessoas visíveis dentro do escopo atual.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Falhas biométricas</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{summary?.metrics.biometricFailures ?? 0}</div>
              <div className="kpi-caption">Eventos que merecem investigação operacional.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">PIN contingência</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{summary?.metrics.pinFallbacks ?? 0}</div>
              <div className="kpi-caption">Uso de fallback no período analisado.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Registros ajustados</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{summary?.metrics.adjustedRecords ?? 0}</div>
              <div className="kpi-caption">Marcações alteradas após revisão.</div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="insight-card">
              <div className="metric-label">Horas extras</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{formatMinutes(Math.max(bank?.balanceMinutesTotal ?? 0, 0))}</div>
              <div className="kpi-caption">Total excedente acumulado.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Déficit</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{formatMinutes(Math.abs(Math.min(bank?.balanceMinutesTotal ?? 0, 0)))}</div>
              <div className="kpi-caption">Horas em aberto para compensação.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Atrasos</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{formatMinutes(bank?.lateMinutesTotal ?? 0)}</div>
              <div className="kpi-caption">Tempo total de atraso registrado.</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Faltas</div>
              <div className="mt-2 text-xl font-semibold text-[#191717]">{bank?.absenceDays ?? 0}</div>
              <div className="kpi-caption">Dias sem presença justificada.</div>
            </div>
          </div>
        )}
      </section>

      <RemoteClockInModal
        isOpen={isRemoteModalOpen}
        onClose={() => setIsRemoteModalOpen(false)}
      />
    </div>
  );
}
