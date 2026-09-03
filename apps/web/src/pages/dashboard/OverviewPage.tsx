import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Home,
  Stethoscope,
  Umbrella,
  UserCheck,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { reportsApi, type HrSummaryResponse } from '../../services/reportsApi';
import { recordsApi } from '../../services/recordsApi';
import { formatMinutes, methodLabel, monthStartKey, recordTypeLabel, todayKey } from '../../components/dashboard/dashboardUtils';
import RemoteClockInModal from '../../components/dashboard/RemoteClockInModal';

type Summary = HrSummaryResponse['data'];
type StatusPerson = NonNullable<Summary['todayWorkforce']>['statuses'][number];
type TodayTimeRecordDepartment = NonNullable<Summary['todayTimeRecords']>[number];
type RadarTone = 'danger' | 'warning' | 'teal' | 'blue' | 'purple' | 'neutral';
type RadarPerson = { id: string | number; name: string; department: string; detail?: string; badge?: string };

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

const todayLabel = () => {
  const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const firstName = (name?: string) => name?.trim().split(' ')[0] || 'RH';
const timeLabel = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  : '—';

const radarStyles: Record<RadarTone, { icon: string; count: string; avatar: string; badge: string }> = {
  danger: { icon: 'bg-[#fbebeb] text-[#b43737]', count: 'text-[#b43737]', avatar: 'border-[#efcece] bg-[#fff5f5] text-[#a33131]', badge: 'bg-[#fbebeb] text-[#a33131]' },
  warning: { icon: 'bg-[#fff5df] text-[#9a6918]', count: 'text-[#9a6918]', avatar: 'border-[#ead8b0] bg-[#fff9ed] text-[#805816]', badge: 'bg-[#fff3d7] text-[#805816]' },
  teal: { icon: 'bg-[#e7f5f3] text-[#026666]', count: 'text-[#026666]', avatar: 'border-[#bddbd7] bg-[#edf8f8] text-[#026666]', badge: 'bg-[#e7f5f3] text-[#026666]' },
  blue: { icon: 'bg-[#eaf3fa] text-[#28658e]', count: 'text-[#28658e]', avatar: 'border-[#c7dceb] bg-[#f1f7fb] text-[#28658e]', badge: 'bg-[#eaf3fa] text-[#28658e]' },
  purple: { icon: 'bg-[#f2ecf8] text-[#74528d]', count: 'text-[#74528d]', avatar: 'border-[#ddcfe8] bg-[#f8f4fb] text-[#74528d]', badge: 'bg-[#f2ecf8] text-[#74528d]' },
  neutral: { icon: 'bg-[#f0eeee] text-[#625d5d]', count: 'text-[#4d4848]', avatar: 'border-[#ddd8d8] bg-[#f7f5f5] text-[#625d5d]', badge: 'bg-[#f0eeee] text-[#625d5d]' },
};

function RadarCard({ title, description, people, icon: Icon, tone, emptyText }: {
  title: string;
  description: string;
  people: RadarPerson[];
  icon: LucideIcon;
  tone: RadarTone;
  emptyText: string;
}) {
  const styles = radarStyles[tone];
  return (
    <section className="surface-panel flex min-h-[260px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-[#e7e4e4] p-4 md:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#191717]">{title}</h2>
            <p className="mt-1 text-[11px] leading-4 text-[#777171]">{description}</p>
          </div>
        </div>
        <span className={`text-2xl font-semibold leading-none ${styles.count}`}>{people.length}</span>
      </div>
      {people.length ? (
        <div className="max-h-[290px] flex-1 divide-y divide-[#ece9e9] overflow-y-auto">
          {people.map((person) => (
            <div key={person.id} className="flex items-center gap-3 px-4 py-3.5 md:px-5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${styles.avatar}`}>{initials(person.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-[#282525]">{person.name}</div>
                <div className="mt-0.5 truncate text-[10px] text-[#817b7b]">{person.department}{person.detail ? ` · ${person.detail}` : ''}</div>
              </div>
              {person.badge && <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${styles.badge}`}>{person.badge}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 py-8 text-center">
          <div><CheckCircle2 className="mx-auto h-5 w-5 text-[#168077]" /><p className="mt-2 text-xs font-medium text-[#5f7774]">{emptyText}</p></div>
        </div>
      )}
    </section>
  );
}

const timeRecordTone = (recordType: string) => {
  if (recordType === 'entry') return 'border-[#b9d9d5] bg-[#edf8f8] text-[#026666]';
  if (recordType === 'lunch_start') return 'border-[#ead8b0] bg-[#fff8e8] text-[#8b641e]';
  if (recordType === 'lunch_end') return 'border-[#c7dceb] bg-[#f1f7fb] text-[#28658e]';
  if (recordType === 'exit') return 'border-[#ddd8d8] bg-[#f6f4f4] text-[#514c4c]';
  return 'border-[#d9d0e2] bg-[#f5f0f8] text-[#74528d]';
};

const compactRecordTypeLabel = (recordType: string) => {
  if (recordType === 'entry') return 'Entrada';
  if (recordType === 'lunch_start') return 'Almoço';
  if (recordType === 'lunch_end') return 'Retorno';
  if (recordType === 'exit') return 'Saída';
  return 'Auto';
};

function TimeRecordsByDepartment({ departments }: { departments: TodayTimeRecordDepartment[] }) {
  const collaboratorCount = departments.reduce((total, department) => total + department.collaborators.length, 0);
  const recordCount = departments.reduce((total, department) => total + department.collaborators.reduce((subtotal, collaborator) => subtotal + collaborator.records.length, 0), 0);

  return (
    <section className="surface-panel overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e4e4] px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e7f5f3] text-[#026666]"><Clock3 className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2"><span className="section-kicker">Batidas de hoje</span><h2 className="text-sm font-semibold text-[#191717]">Horários por setor</h2></div>
            <p className="mt-0.5 hidden text-[10px] text-[#777171] sm:block">Atualização automática junto com o radar.</p>
          </div>
        </div>
        <div className="text-[10px] font-semibold text-[#6e6a6a]"><span className="text-[#191717]">{collaboratorCount}</span> pessoas <span className="mx-1 text-[#c5c0c0]">·</span> <span className="text-[#026666]">{recordCount}</span> batidas</div>
      </div>

      {departments.length ? (
        <div className="max-h-[420px] overflow-y-auto">
          {departments.map((department) => (
            <article key={department.departmentId ?? 'none'} className="border-b border-[#e7e4e4] last:border-b-0">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#ece9e9] bg-[#f8fcfc] px-4 py-2 md:px-5">
                <div className="flex min-w-0 items-center gap-2"><Building2 className="h-3.5 w-3.5 shrink-0 text-[#026666]" /><h3 className="truncate text-[11px] font-semibold text-[#282525]">{department.departmentName}</h3></div>
                <span className="shrink-0 text-[9px] text-[#777171]">{department.collaborators.length} pessoa(s)</span>
              </div>
              <div className="divide-y divide-[#f0eeee]">
                {department.collaborators.map((collaborator) => (
                  <div key={collaborator.userId} className="grid gap-2 px-4 py-2.5 md:grid-cols-[minmax(170px,0.65fr)_minmax(0,1.35fr)] md:items-center md:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#ddd8d8] bg-[#f6f4f4] text-[9px] font-bold text-[#514c4c]">{initials(collaborator.userName)}</span>
                      <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#282525]">{collaborator.userName}</div><div className="truncate text-[9px] text-[#817b7b]">Mat. {collaborator.registrationNumber}</div></div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 md:justify-end">
                      {collaborator.records.map((record) => (
                        <span key={record.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] leading-none ${timeRecordTone(record.recordType)}`} title={`${recordTypeLabel(record.recordType)} · ${methodLabel(record.method)}`}>
                          <span className="font-medium opacity-75">{compactRecordTypeLabel(record.recordType)}</span><strong className="text-[11px]">{timeLabel(record.recordTime)}</strong><span className="hidden text-[9px] opacity-60 2xl:inline">{methodLabel(record.method)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="px-6 py-7 text-center text-xs text-[#6e6a6a]">Nenhuma batida registrada hoje.</div>}
    </section>
  );
}

const approvedByType = (statuses: StatusPerson[], requestType: StatusPerson['requestType']) =>
  statuses.filter((person) => person.requestStatus === 'approved' && person.requestType === requestType);

function ManagementOverview({ summary, userName, canManageTeam }: { summary?: Summary; userName?: string; canManageTeam: boolean }) {
  const metrics = summary?.metrics;
  const present = summary?.todayWorkforce?.present ?? [];
  const statuses = summary?.todayWorkforce?.statuses ?? [];
  const missingClockIns = summary?.missingClockIns ?? [];
  const lateArrivals = summary?.lateArrivals ?? [];
  const todayTimeRecords = summary?.todayTimeRecords ?? [];
  const vacations = approvedByType(statuses, 'vacation');
  const medicalLeaves = approvedByType(statuses, 'medical_certificate');
  const externalWorkers = approvedByType(statuses, 'external_work');
  const daysOff = approvedByType(statuses, 'day_off');
  const declarations = approvedByType(statuses, 'declaration');
  const homeWorkers = present.filter((person) => person.isRemote || person.workType === 'remote');
  const pendingToday = statuses.filter((person) => person.requestStatus === 'pending').length;
  const attentionCount = missingClockIns.length + lateArrivals.length + pendingToday;
  const statusPeople = (items: StatusPerson[], badge: string): RadarPerson[] => items.map((person) => ({
    id: `${person.requestType}-${person.userId}`,
    name: person.userName,
    department: person.departmentName,
    badge,
  }));

  const quickActions = [
    ['/dashboard/pending', 'Resolver pendências', 'Aprovações e registros'],
    ...(canManageTeam ? [['/dashboard/team/restrictions', 'Vínculos e afastamentos', 'Situações e retornos']] : []),
    ['/dashboard/analytics', 'Ir para análises', 'Histórico e indicadores'],
  ];

  return (
    <div className="space-y-5 pb-4 font-sans">
      <section className="page-hero rounded-2xl">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-5 md:p-6">
            <div className="page-eyebrow">{todayLabel()}</div>
            <h1 className="page-title">{greeting()}, {firstName(userName)}. Este é o radar de hoje.</h1>
            <p className="page-description">Pessoas fora do fluxo esperado, ausências justificadas e equipes trabalhando fora da empresa, sem misturar com análises históricas.</p>
          </div>
          <div className="flex items-center border-t border-[#e7e4e4] bg-[#f8fcfc] px-5 py-4 lg:min-w-64 lg:border-l lg:border-t-0 lg:px-6">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6e6a6a]">Precisam de atenção</div>
              <div className="mt-2 flex items-end gap-2"><span className={`text-4xl font-semibold ${attentionCount ? 'text-[#b43737]' : 'text-[#026666]'}`}>{attentionCount}</span><span className="mb-1 text-xs text-[#6e6a6a]">sinal(is)</span></div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[#777171]"><span className={`h-2 w-2 rounded-full ${attentionCount ? 'bg-[#b43737]' : 'bg-[#168077]'}`} />Atualização automática a cada minuto</div>
            </div>
          </div>
        </div>
        <div className="grid border-t border-[#e7e4e4] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Na operação', metrics?.presentToday ?? 0, 'com registro hoje', 'text-[#026666]'],
            ['Sem ponto', missingClockIns.length, 'após o horário', 'text-[#b43737]'],
            ['Atrasados', lateArrivals.length, 'fora da tolerância', 'text-[#9a6918]'],
            ['Para aprovar', metrics?.pendingApprovals ?? 0, 'itens pendentes', 'text-[#74528d]'],
          ].map(([label, value, note, color], index) => (
            <div key={String(label)} className={`px-5 py-4 ${index < 3 ? 'border-b border-[#e7e4e4] sm:border-r xl:border-b-0' : ''}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#777171]">{label}</div>
              <div className="mt-2 flex items-end justify-between gap-3"><span className={`text-2xl font-semibold ${color}`}>{value}</span><span className="mb-0.5 text-[10px] text-[#8a8585]">{note}</span></div>
            </div>
          ))}
        </div>
      </section>

      <nav className={`surface-panel grid overflow-hidden rounded-2xl ${quickActions.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} aria-label="Ações rápidas">
        {quickActions.map(([path, title, description], index) => (
          <Link key={path} to={path} className={`group flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-[#f6f4f4] ${index < quickActions.length - 1 ? 'border-b border-[#e7e4e4] sm:border-b-0 sm:border-r' : ''}`}>
            <span><span className="block text-xs font-semibold text-[#191717]">{title}</span><span className="mt-1 block text-[10px] text-[#6e6a6a]">{description}</span></span>
            <ArrowUpRight className="h-4 w-4 text-[#8a8585] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#026666]" />
          </Link>
        ))}
      </nav>

      <TimeRecordsByDepartment departments={todayTimeRecords} />

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
          <div><div className="section-kicker">Movimento de hoje</div><h2 className="mt-1 text-xl font-semibold text-[#191717]">Quem está onde — e quem saiu da linha</h2></div>
          <span className="text-xs text-[#777171]">Somente situações do dia atual</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <RadarCard title="Sem ponto / possível falta" description="Já passou do horário de entrada e não há registro." icon={UserX} tone="danger" emptyText="Ninguém sem ponto neste momento." people={missingClockIns.map((person) => ({ id: person.userId, name: person.userName, department: person.departmentName, detail: `entrada prevista ${person.scheduleEntryTime}`, badge: person.delayMinutes !== undefined ? `+${formatMinutes(person.delayMinutes)}` : 'sem ponto' }))} />
          <RadarCard title="Chegaram atrasados" description="Entrada registrada depois da tolerância configurada." icon={AlertTriangle} tone="warning" emptyText="Nenhum atraso registrado hoje." people={lateArrivals.map((person) => ({ id: person.userId, name: person.userName, department: person.departmentName, detail: `entrou ${timeLabel(person.actualEntryTime)} · previsto ${person.scheduleEntryTime}`, badge: `+${formatMinutes(person.delayMinutes)}` }))} />
          <RadarCard title="Em home office" description="Pessoas remotas com movimentação registrada hoje." icon={Home} tone="blue" emptyText="Ninguém identificado em home office." people={homeWorkers.map((person) => ({ id: person.userId, name: person.userName, department: person.departmentName, detail: recordTypeLabel(person.lastRecordType), badge: timeLabel(person.lastRecordAt) }))} />
          <RadarCard title="Em trabalho externo" description="Atividade externa aprovada para a data de hoje." icon={Briefcase} tone="teal" emptyText="Ninguém em trabalho externo hoje." people={statusPeople(externalWorkers, 'externo')} />
          <RadarCard title="De férias" description="Ausências planejadas e aprovadas para hoje." icon={Umbrella} tone="purple" emptyText="Ninguém de férias hoje." people={statusPeople(vacations, 'férias')} />
          <RadarCard title="Com atestado médico" description="Afastamentos médicos aprovados para o dia inteiro." icon={Stethoscope} tone="neutral" emptyText="Nenhum atestado vigente hoje." people={statusPeople(medicalLeaves, 'abonado')} />
          <RadarCard title="Em folga" description="Folgas aprovadas para a jornada de hoje." icon={UserCheck} tone="teal" emptyText="Ninguém em folga hoje." people={statusPeople(daysOff, 'folga')} />
          <RadarCard title="Com declaração" description="Comparecimento com intervalo de horas abonado." icon={FileCheck2} tone="blue" emptyText="Nenhuma declaração aprovada hoje." people={statusPeople(declarations, 'horas abonadas')} />
        </div>
      </div>

      {(pendingToday > 0 || (summary?.exceptionQueue.length ?? 0) > 0) && (
        <section className="surface-panel flex flex-col gap-4 rounded-2xl border-l-4 border-l-[#9a6918] p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div><div className="text-sm font-semibold text-[#191717]">Ainda existem decisões esperando você</div><p className="mt-1 text-xs text-[#6e6a6a]">{pendingToday} solicitação(ões) de hoje e {summary?.exceptionQueue.length ?? 0} registro(s) com exceção.</p></div>
          <Link to="/dashboard/pending" className="btn-secondary shrink-0">Abrir fila de pendências</Link>
        </section>
      )}
    </div>
  );
}

function EmployeeOverview({ userName, bank, cumulativeBank, latestRecord, remoteEnabled, onRemoteClockIn }: {
  userName?: string;
  bank?: Summary['bankHours'];
  cumulativeBank?: Summary['bankHours'];
  latestRecord?: { record_type: string; record_time: string };
  remoteEnabled?: boolean;
  onRemoteClockIn: () => void;
}) {
  const today = bank?.latestDailyBalance;
  return (
    <div className="space-y-5 font-sans">
      <section className="page-hero rounded-2xl p-5 md:p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#026666]">{todayLabel()}</div>
        <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-[#191717] md:text-4xl">{greeting()}, {firstName(userName)}.</h2>
        <p className="mt-3 text-sm text-[#6e6a6a]">Sua jornada, sem ruído: marcações, saldo e o que ainda falta cumprir hoje.</p>
        {remoteEnabled && <button onClick={onRemoteClockIn} className="btn-primary mt-5"><Clock3 className="h-4 w-4" />Registrar ponto</button>}
      </section>
      <section className="surface-panel grid overflow-hidden rounded-2xl sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Horas hoje', formatMinutes(today?.workedMinutes ?? 0), 'jornada realizada'],
          ['Restante hoje', formatMinutes(Math.max((today?.expectedMinutes ?? 0) - (today?.workedMinutes ?? 0), 0)), 'carga prevista'],
          ['Saldo do mês', formatMinutes(bank?.balanceMinutesTotal ?? 0), 'competência atual'],
          ['Saldo geral', formatMinutes(cumulativeBank?.balanceMinutesTotal ?? 0), 'banco acumulado'],
          ['Última marcação', latestRecord ? recordTypeLabel(latestRecord.record_type) : '—', latestRecord ? new Date(latestRecord.record_time).toLocaleString('pt-BR') : 'sem movimentação'],
        ].map(([label, value, note], index) => <div key={label} className={`p-5 ${index < 4 ? 'border-b border-[#e7e4e4] sm:border-r xl:border-b-0' : ''}`}><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6e6a6a]">{label}</div><div className="mt-3 text-xl font-semibold text-[#191717]">{value}</div><div className="mt-2 text-[10px] text-[#8a8585]">{note}</div></div>)}
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        <Link to="/dashboard/my-point" className="surface-panel group rounded-2xl p-6 transition-colors hover:bg-[#f8fcfc]"><div className="flex items-center justify-between"><Clock3 className="h-5 w-5 text-[#026666]" /><ArrowUpRight className="h-4 w-4 text-[#8a8585]" /></div><h3 className="mt-8 text-xl font-semibold text-[#191717]">Meu espelho de ponto</h3><p className="mt-2 text-xs leading-5 text-[#6e6a6a]">Consulte a sequência completa de marcações e o saldo diário.</p></Link>
        <Link to="/dashboard/requests" className="surface-panel group rounded-2xl p-6 transition-colors hover:bg-[#f8fcfc]"><div className="flex items-center justify-between"><FileCheck2 className="h-5 w-5 text-[#026666]" /><ArrowUpRight className="h-4 w-4 text-[#8a8585]" /></div><h3 className="mt-8 text-xl font-semibold text-[#191717]">Solicitações e documentos</h3><p className="mt-2 text-xs leading-5 text-[#6e6a6a]">Envie ajustes, atestados e declarações de comparecimento.</p></Link>
      </section>
    </div>
  );
}

export default function OverviewPage() {
  const auth = useAuthStore();
  const role = auth.user?.role ?? 'employee';
  const isManagement = role === 'manager' || role === 'admin';
  const canManageTeam = role === 'admin' || Boolean(auth.user?.leadership_permissions?.includes('manage_team'));
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);

  const hrSummary = useQuery({
    queryKey: ['overview', 'hr-summary', role, todayKey()],
    queryFn: () => reportsApi.hrSummary({ startDate: isManagement ? todayKey() : monthStartKey(), endDate: todayKey(), operationalOnly: isManagement }),
    enabled: !!auth.token,
    refetchInterval: isManagement ? 60_000 : false,
  });
  const cumulativeBankHours = useQuery({ queryKey: ['my-point', 'cumulative-bank-hours'], queryFn: () => reportsApi.cumulativeBankHours(), enabled: !!auth.token && role === 'employee' });
  const recent = useQuery({ queryKey: ['overview', 'recent-records'], queryFn: async () => (await recordsApi.myRecords()).data, enabled: !!auth.token && role === 'employee' });
  const summary = hrSummary.data?.data;

  return (
    <>
      {isManagement ? <ManagementOverview summary={summary} userName={auth.user?.name} canManageTeam={canManageTeam} /> : (
        <EmployeeOverview userName={auth.user?.name} bank={summary?.bankHours} cumulativeBank={cumulativeBankHours.data?.data.bankHours} latestRecord={recent.data?.[0]} remoteEnabled={auth.user?.remote_clock_in_enabled} onRemoteClockIn={() => setIsRemoteModalOpen(true)} />
      )}
      <RemoteClockInModal isOpen={isRemoteModalOpen} onClose={() => setIsRemoteModalOpen(false)} />
    </>
  );
}
