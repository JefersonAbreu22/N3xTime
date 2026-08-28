import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownRight, ArrowUpRight, CalendarRange, Download, Filter, RotateCcw, Search, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { departmentsApi } from '../../services/departmentsApi';
import { reportsApi, type AttendanceReportResponse, type HrSummaryResponse } from '../../services/reportsApi';
import { formatMinutes, monthStartKey, requestStatusLabel, requestTypeLabel, todayKey } from '../../components/dashboard/dashboardUtils';

type AttendanceRow = AttendanceReportResponse['data'][number];
type BalanceMode = 'balance' | 'overtime' | 'deficit';
type BalanceStatus = 'all' | 'positive' | 'negative' | 'neutral';
type SortMode = 'balance_desc' | 'balance_asc' | 'name' | 'worked_desc';
type DailyView = AttendanceRow['allDailyViews'][number];
type Occurrence = HrSummaryResponse['data']['absenceDocuments'][number];
type RhythmTone = 'excellent' | 'good' | 'attention' | 'critical' | 'authorized' | 'external' | 'neutral';
const EMPTY_ROWS: AttendanceRow[] = [];

const dateKeyDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

const decimalHours = (minutes: number) => `${(minutes / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
const signedMinutes = (minutes: number) => `${minutes > 0 ? '+' : minutes < 0 ? '−' : ''}${formatMinutes(Math.abs(minutes))}`;

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : name;
};

const getModeValue = (row: AttendanceRow, mode: BalanceMode) => {
  if (mode === 'overtime') return row.bankHours.overtimeMinutes;
  if (mode === 'deficit') return -row.bankHours.deficitMinutes;
  return row.bankHours.balanceMinutesTotal;
};

const getRhythmCell = (day: DailyView, occurrence?: Occurrence) => {
  const future = Boolean(day.date && day.date > todayKey());
  if (future) return { tone: 'neutral' as RhythmTone, label: 'Data futura', score: null };
  if (occurrence?.status === 'approved') {
    if (occurrence.requestType === 'external_work') return { tone: 'external' as RhythmTone, label: 'Trabalho externo aprovado', score: null };
    return { tone: 'authorized' as RhythmTone, label: `${requestTypeLabel(occurrence.requestType)} aprovado`, score: null };
  }
  if (occurrence?.status === 'pending') return { tone: 'attention' as RhythmTone, label: `${requestTypeLabel(occurrence.requestType)} pendente`, score: null };
  if (day.holidayType) return { tone: 'authorized' as RhythmTone, label: day.holidayType === 'paid' ? 'Feriado remunerado' : 'Feriado não remunerado', score: null };
  if ((day.expectedMinutes ?? 0) === 0 && !day.timeline?.length) return { tone: 'neutral' as RhythmTone, label: 'Sem jornada prevista', score: null };
  if (!day.timeline?.length) return { tone: 'critical' as RhythmTone, label: 'Sem marcação', score: 0 };
  if (day.status === 'complete' && day.balanceMinutes >= 0) return { tone: 'excellent' as RhythmTone, label: 'Jornada completa', score: 100 };
  if (day.status === 'complete' && day.balanceMinutes >= -30) return { tone: 'good' as RhythmTone, label: 'Jornada completa com pequena variação', score: 80 };
  if (day.status === 'complete') return { tone: 'attention' as RhythmTone, label: 'Jornada completa com déficit', score: 55 };
  return { tone: 'attention' as RhythmTone, label: 'Marcações incompletas', score: 35 };
};

const RHYTHM_CLASSES: Record<RhythmTone, string> = {
  excellent: 'bg-[#075f55] hover:bg-[#064b44] ring-[#075f55]',
  good: 'bg-[#4da58e] hover:bg-[#3a8e78] ring-[#4da58e]',
  attention: 'bg-[#e3b64f] hover:bg-[#cc9d31] ring-[#e3b64f]',
  critical: 'bg-[#c44b4b] hover:bg-[#aa3636] ring-[#c44b4b]',
  authorized: 'bg-[#816da8] hover:bg-[#6d5993] ring-[#816da8]',
  external: 'bg-[#3f82b5] hover:bg-[#306f9e] ring-[#3f82b5]',
  neutral: 'bg-[#dedbdb] hover:bg-[#ccc8c8] ring-[#aaa5a5]',
};

function TeamRhythmHeatmap({
  rows,
  occurrences,
  selectedUserId,
  selectedDate,
  onSelect,
}: {
  rows: AttendanceRow[];
  occurrences: Map<string, Occurrence>;
  selectedUserId: number | null;
  selectedDate: string | null;
  onSelect: (userId: number, date: string) => void;
}) {
  const dates = rows[0]?.allDailyViews.filter((day) => day.date).map((day) => day.date!) ?? [];

  if (!rows.length || !dates.length) return <div className="flex h-56 items-center justify-center text-sm text-[#6e6a6a]">Sem dados diários para montar o mapa de ritmo.</div>;

  return (
    <div className="overflow-auto">
      <table className="min-w-max border-separate border-spacing-x-1 border-spacing-y-1.5">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[190px] bg-white px-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#6e6a6a]">Colaborador</th>
            {dates.map((date) => <th key={date} className="w-7 min-w-7 pb-1 text-center text-[9px] font-semibold text-[#8b8686]"><span className="block">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span><span>{date.slice(8, 10)}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const viewsByDate = new Map(row.allDailyViews.filter((day) => day.date).map((day) => [day.date!, day]));
            return (
              <tr key={row.userId}>
                <th className="sticky left-0 z-10 max-w-[190px] bg-white px-2 py-0.5 text-left">
                  <button type="button" className="block w-full truncate text-left text-xs font-semibold text-[#393636] hover:text-[#026666]" onClick={() => onSelect(row.userId, dates[dates.length - 1])}>{row.name}</button>
                  <span className="block truncate text-[9px] font-normal text-[#8b8686]">{row.departmentName || 'Sem setor'}</span>
                </th>
                {dates.map((date) => {
                  const day = viewsByDate.get(date);
                  if (!day) return <td key={date}><span className="block h-7 w-7 rounded-md bg-[#efeded]" /></td>;
                  const occurrence = occurrences.get(`${row.userId}:${date}`);
                  const cell = getRhythmCell(day, occurrence);
                  const selected = selectedUserId === row.userId && selectedDate === date;
                  const detail = [cell.label, `Trabalhado: ${formatMinutes(day.workedMinutes)}`, `Previsto: ${formatMinutes(day.expectedMinutes ?? 0)}`, `Saldo: ${signedMinutes(day.balanceMinutes)}`];
                  if (occurrence) detail.push(`${requestTypeLabel(occurrence.requestType)} · ${requestStatusLabel(occurrence.status)}${occurrence.reason ? ` · ${occurrence.reason}` : ''}`);
                  return (
                    <td key={date}>
                      <button type="button" onClick={() => onSelect(row.userId, date)} title={`${row.name} · ${new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}\n${detail.join('\n')}`} aria-label={`${row.name}, ${date}: ${cell.label}`} className={`block h-7 w-7 rounded-md transition-transform hover:scale-110 focus:outline-none ${RHYTHM_CLASSES[cell.tone]} ${selected ? 'ring-2 ring-offset-2' : ''}`} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DivergingBalanceChart({
  rows,
  mode,
  selectedUserId,
  onSelect,
}: {
  rows: AttendanceRow[];
  mode: BalanceMode;
  selectedUserId: number | null;
  onSelect: (userId: number) => void;
}) {
  const width = Math.max(780, 84 + rows.length * 92);
  const height = 470;
  const zeroY = 205;
  const maximumBarHeight = 145;
  const values = rows.map((row) => getModeValue(row, mode));
  const maximum = Math.max(...values.map(Math.abs), 60);
  const roundedMaximum = Math.ceil(maximum / 60) * 60;

  if (!rows.length) {
    return <div className="flex h-[420px] items-center justify-center text-sm text-[#6e6a6a]">Nenhum colaborador corresponde aos filtros selecionados.</div>;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${width}px` }} className="h-[470px] w-full" role="img" aria-label="Gráfico de saldo de horas por colaborador">
        <rect x="0" y="0" width={width} height={height} fill="#fff" />
        {[1, 0.5, 0, -0.5, -1].map((ratio) => {
          const y = zeroY - ratio * maximumBarHeight;
          return (
            <g key={ratio}>
              <line x1="62" y1={y} x2={width - 18} y2={y} stroke={ratio === 0 ? '#8f8a8a' : '#ebe8e8'} strokeWidth={ratio === 0 ? 1.6 : 1} strokeDasharray={ratio === 0 ? undefined : '4 5'} />
              <text x="52" y={y + 4} textAnchor="end" fontSize="10" fill="#8b8686">{ratio === 0 ? '0h' : decimalHours(roundedMaximum * ratio)}</text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const value = getModeValue(row, mode);
          const barHeight = Math.abs(value / roundedMaximum) * maximumBarHeight;
          const x = 78 + index * 92;
          const y = value >= 0 ? zeroY - barHeight : zeroY;
          const selected = selectedUserId === row.userId;
          const color = value > 0 ? '#027878' : value < 0 ? '#b43737' : '#aaa5a5';
          return (
            <g
              key={row.userId}
              role="button"
              tabIndex={0}
              aria-label={`${row.name}: ${signedMinutes(value)}`}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(row.userId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(row.userId);
              }}
            >
              <title>{`${row.name} · ${row.departmentName || 'Sem setor'} · ${signedMinutes(value)}`}</title>
              {selected && <rect x={x - 15} y="35" width="78" height="385" rx="12" fill="#edf8f8" stroke="#bcdede" />}
              <rect x={x} y={value === 0 ? zeroY - 2 : y} width="48" height={value === 0 ? 4 : Math.max(barHeight, 3)} rx="6" fill={color} opacity={selected ? 1 : 0.88} />
              <text x={x + 24} y={value >= 0 ? Math.max(y - 9, 24) : Math.min(y + barHeight + 16, 362)} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
                {signedMinutes(value)}
              </text>
              <foreignObject x={x - 14} y="374" width="76" height="76">
                <div className={`flex h-full items-start justify-center px-1 text-center text-[10px] leading-[1.25] ${selected ? 'font-bold text-[#026666]' : 'font-medium text-[#4c4848]'}`}>
                  {shortName(row.name)}
                </div>
              </foreignObject>
            </g>
          );
        })}
        <text x="16" y="27" fontSize="10" fontWeight="700" fill="#6e6a6a" letterSpacing="1.2">HORAS</text>
        <text x={width / 2} y="460" textAnchor="middle" fontSize="10" fontWeight="700" fill="#6e6a6a" letterSpacing="1.2">COLABORADORES</text>
      </svg>
    </div>
  );
}

function CollaboratorTrend({ row }: { row: AttendanceRow }) {
  const days = [...row.allDailyViews].filter((day) => day.date).sort((first, second) => (first.date ?? '').localeCompare(second.date ?? ''));
  let runningBalance = 0;
  const points = days.map((day) => {
    runningBalance += day.balanceMinutes;
    return { date: day.date!, value: runningBalance };
  });

  if (!points.length) return <div className="flex h-32 items-center justify-center text-sm text-[#6e6a6a]">Sem evolução diária no período.</div>;

  const width = 560;
  const height = 150;
  const values = [...points.map((point) => point.value), 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 60);
  const x = (index: number) => 8 + (index / Math.max(points.length - 1, 1)) * (width - 16);
  const y = (value: number) => 10 + ((max - value) / spread) * (height - 20);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.value)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label={`Evolução do saldo de ${row.name}`}>
        <line x1="0" y1={y(0)} x2={width} y2={y(0)} stroke="#d9d7d7" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke={last.value < 0 ? '#b43737' : '#026666'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={point.date} cx={x(index)} cy={y(point.value)} r={index === points.length - 1 ? 5 : 2.5} fill={point.value < 0 ? '#b43737' : '#026666'}>
            <title>{`${new Date(`${point.date}T12:00:00`).toLocaleDateString('pt-BR')}: ${signedMinutes(point.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-[0.1em] text-[#8b8686]">
        <span>{new Date(`${points[0].date}T12:00:00`).toLocaleDateString('pt-BR')}</span><span>Saldo acumulado</span><span>{new Date(`${last.date}T12:00:00`).toLocaleDateString('pt-BR')}</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const auth = useAuthStore();
  const [startDate, setStartDate] = useState(monthStartKey());
  const [endDate, setEndDate] = useState(todayKey());
  const [departmentId, setDepartmentId] = useState('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BalanceStatus>('all');
  const [sort, setSort] = useState<SortMode>('balance_desc');
  const [mode, setMode] = useState<BalanceMode>('balance');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const enabled = !!auth.token && auth.user?.role !== 'employee' && startDate <= endDate;

  const departments = useQuery({
    queryKey: ['analytics', 'departments'],
    queryFn: async () => (await departmentsApi.list()).data,
    enabled: !!auth.token && auth.user?.role !== 'employee',
  });

  const attendance = useQuery({
    queryKey: ['analytics', 'attendance', startDate, endDate, departmentId],
    queryFn: async () => (await reportsApi.attendance({ startDate, endDate, departmentId: departmentId ? Number(departmentId) : undefined })).data,
    enabled,
  });

  const summary = useQuery({
    queryKey: ['analytics', 'summary', startDate, endDate, departmentId],
    queryFn: async () => (await reportsApi.hrSummary({ startDate, endDate, departmentId: departmentId ? Number(departmentId) : undefined })).data,
    enabled,
  });

  const baseRows = attendance.data ?? EMPTY_ROWS;
  const availableUsers = useMemo(() => [...baseRows].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')), [baseRows]);
  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return baseRows
      .filter((row) => !userId || row.userId === Number(userId))
      .filter((row) => !normalizedSearch || `${row.name} ${row.departmentName}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
      .filter((row) => {
        const balance = row.bankHours.balanceMinutesTotal;
        if (status === 'positive') return balance > 0;
        if (status === 'negative') return balance < 0;
        if (status === 'neutral') return balance === 0;
        return true;
      })
      .sort((first, second) => {
        if (sort === 'name') return first.name.localeCompare(second.name, 'pt-BR');
        if (sort === 'balance_asc') return first.bankHours.balanceMinutesTotal - second.bankHours.balanceMinutesTotal;
        if (sort === 'worked_desc') return second.bankHours.workedMinutesTotal - first.bankHours.workedMinutesTotal;
        return second.bankHours.balanceMinutesTotal - first.bankHours.balanceMinutesTotal;
      });
  }, [baseRows, search, sort, status, userId]);

  const occurrences = useMemo(() => new Map(
    (summary.data?.absenceDocuments ?? []).map((occurrence) => [`${occurrence.userId}:${occurrence.targetDate}`, occurrence]),
  ), [summary.data?.absenceDocuments]);

  const totals = useMemo(() => rows.reduce((result, row) => {
    const balance = row.bankHours.balanceMinutesTotal;
    result.balance += balance;
    result.worked += row.bankHours.workedMinutesTotal;
    result.expected += row.bankHours.expectedMinutesTotal;
    if (balance > 0) result.positive += 1;
    else if (balance < 0) result.negative += 1;
    else result.neutral += 1;
    return result;
  }, { balance: 0, worked: 0, expected: 0, positive: 0, negative: 0, neutral: 0 }), [rows]);

  const selectedRow = rows.find((row) => row.userId === selectedUserId) ?? (userId ? rows[0] : null);
  const selectedDay = selectedRow?.allDailyViews.find((day) => day.date === selectedDate) ?? null;
  const selectedOccurrence = selectedRow && selectedDate ? occurrences.get(`${selectedRow.userId}:${selectedDate}`) : undefined;
  const positiveRanking = [...rows].filter((row) => row.bankHours.balanceMinutesTotal > 0).sort((a, b) => b.bankHours.balanceMinutesTotal - a.bankHours.balanceMinutesTotal).slice(0, 5);
  const negativeRanking = [...rows].filter((row) => row.bankHours.balanceMinutesTotal < 0).sort((a, b) => a.bankHours.balanceMinutesTotal - b.bankHours.balanceMinutesTotal).slice(0, 5);
  const trendRows = useMemo(() => rows.map((row) => {
    const scheduledDays = [...row.allDailyViews]
      .filter((day) => day.date && day.date <= todayKey() && (day.expectedMinutes ?? 0) > 0)
      .sort((first, second) => (first.date ?? '').localeCompare(second.date ?? ''));
    const middle = Math.ceil(scheduledDays.length / 2);
    const firstHalf = scheduledDays.slice(0, middle);
    const secondHalf = scheduledDays.slice(middle);
    const average = (days: typeof scheduledDays) => days.length ? days.reduce((sum, day) => sum + day.balanceMinutes, 0) / days.length : 0;
    const change = secondHalf.length ? average(secondHalf) - average(firstHalf) : 0;
    return { row, change, direction: change >= 15 ? 'improving' as const : change <= -15 ? 'worsening' as const : 'stable' as const };
  }), [rows]);
  const improving = trendRows.filter((item) => item.direction === 'improving').sort((a, b) => b.change - a.change);
  const worsening = trendRows.filter((item) => item.direction === 'worsening').sort((a, b) => a.change - b.change);
  const departmentHealth = useMemo(() => {
    const groups = new Map<string, { score: number; count: number; people: number }>();
    for (const row of rows) {
      const name = row.departmentName || 'Sem setor';
      const group = groups.get(name) ?? { score: 0, count: 0, people: 0 };
      group.people += 1;
      for (const day of row.allDailyViews) {
        if (!day.date) continue;
        const cell = getRhythmCell(day, occurrences.get(`${row.userId}:${day.date}`));
        if (cell.score !== null) { group.score += cell.score; group.count += 1; }
      }
      groups.set(name, group);
    }
    return [...groups.entries()].map(([name, group]) => ({ name, people: group.people, score: group.count ? Math.round(group.score / group.count) : 100 })).sort((a, b) => b.score - a.score);
  }, [occurrences, rows]);

  const applyPreset = (preset: 'month' | '30' | '90') => {
    setEndDate(todayKey());
    setStartDate(preset === 'month' ? monthStartKey() : dateKeyDaysAgo(preset === '30' ? 29 : 89));
  };

  const resetFilters = () => {
    setStartDate(monthStartKey()); setEndDate(todayKey()); setDepartmentId(''); setUserId(''); setSearch(''); setStatus('all'); setSort('balance_desc'); setMode('balance'); setSelectedUserId(null); setSelectedDate(null);
  };

  const downloadCsv = () => {
    const header = ['Colaborador', 'Setor', 'Trabalhadas', 'Previstas', 'Saldo', 'Extras', 'Déficit'];
    const csvRows = rows.map((row) => [row.name, row.departmentName, row.bankHours.workedMinutesTotal, row.bankHours.expectedMinutesTotal, row.bankHours.balanceMinutesTotal, row.bankHours.overtimeMinutes, row.bankHours.deficitMinutes]);
    const content = [header, ...csvRows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `analise-banco-horas-${startDate}-${endDate}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (auth.user?.role === 'employee') return null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[#dceaea] bg-white shadow-sm">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-[#dceaea] bg-gradient-to-br from-[#e9f7f6] via-[#f7fbfb] to-white p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#026666]"><Activity className="h-4 w-4" /> Central de análises</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#191717] md:text-4xl">Banco de horas, pessoa por pessoa</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6e6a6a]">Créditos sobem, débitos descem. Explore a equipe, encontre desequilíbrios e abra a evolução individual com um clique.</p>
          </div>
          <div className="flex items-center p-6 lg:p-7"><div className="w-full"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6e6a6a]">Saldo líquido da visão atual</div><div className={`mt-2 text-4xl font-bold tracking-[-0.05em] ${totals.balance < 0 ? 'text-[#b43737]' : 'text-[#026666]'}`}>{signedMinutes(totals.balance)}</div><div className="mt-2 text-sm text-[#6e6a6a]">{rows.length} colaborador(es) · {startDate.split('-').reverse().join('/')} a {endDate.split('-').reverse().join('/')}</div></div></div>
        </div>
      </section>

      <section className="surface-panel p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter className="h-4 w-4 text-[#026666]" /><h2 className="font-semibold text-[#191717]">Filtros da análise</h2></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-ghost" onClick={() => applyPreset('month')}>Este mês</button><button type="button" className="btn-ghost" onClick={() => applyPreset('30')}>Últimos 30 dias</button><button type="button" className="btn-ghost" onClick={() => applyPreset('90')}>Últimos 90 dias</button><button type="button" className="btn-ghost" onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Limpar</button></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Data inicial</span><input type="date" className="input-field w-full" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Data final</span><input type="date" className="input-field w-full" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Setor</span><select className="input-field w-full" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setUserId(''); }}><option value="">Todos os setores</option>{departments.data?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Colaborador</span><select className="input-field w-full" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Todos</option>{availableUsers.map((user) => <option key={user.userId} value={user.userId}>{user.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Situação</span><select className="input-field w-full" value={status} onChange={(event) => setStatus(event.target.value as BalanceStatus)}><option value="all">Todos os saldos</option><option value="positive">Somente positivos</option><option value="negative">Somente negativos</option><option value="neutral">Saldo zerado</option></select></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Ordenar</span><select className="input-field w-full" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="balance_desc">Maior saldo</option><option value="balance_asc">Maior débito</option><option value="worked_desc">Mais horas trabalhadas</option><option value="name">Nome</option></select></label>
          <label className="text-xs font-semibold text-[#514d4d]"><span className="mb-1.5 block">Busca rápida</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8686]" /><input className="input-field w-full pl-9" placeholder="Nome ou setor" value={search} onChange={(event) => setSearch(event.target.value)} /></span></label>
        </div>
        {startDate > endDate && <div className="mt-3 rounded-xl border border-[#f0dede] bg-[#fbf1f1] px-4 py-3 text-sm text-[#b43737]">A data inicial deve ser anterior ou igual à data final.</div>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card"><div className="flex items-center justify-between"><div className="metric-label">Crédito acumulado</div><ArrowUpRight className="h-5 w-5 text-[#026666]" /></div><div className="metric-value text-[#026666]">{formatMinutes(rows.reduce((sum, row) => sum + Math.max(row.bankHours.balanceMinutesTotal, 0), 0))}</div><div className="mt-1 text-xs text-[#6e6a6a]">{totals.positive} pessoa(s) com saldo positivo.</div></div>
        <div className="metric-card"><div className="flex items-center justify-between"><div className="metric-label">Débito acumulado</div><ArrowDownRight className="h-5 w-5 text-[#b43737]" /></div><div className="metric-value text-[#b43737]">{formatMinutes(Math.abs(rows.reduce((sum, row) => sum + Math.min(row.bankHours.balanceMinutesTotal, 0), 0)))}</div><div className="mt-1 text-xs text-[#6e6a6a]">{totals.negative} pessoa(s) devendo horas.</div></div>
        <div className="metric-card"><div className="flex items-center justify-between"><div className="metric-label">Horas trabalhadas</div><Activity className="h-5 w-5 text-[#026666]" /></div><div className="metric-value">{formatMinutes(totals.worked)}</div><div className="mt-1 text-xs text-[#6e6a6a]">Carga prevista: {formatMinutes(totals.expected)}.</div></div>
        <div className="metric-card"><div className="flex items-center justify-between"><div className="metric-label">Pessoas analisadas</div><Users className="h-5 w-5 text-[#191717]" /></div><div className="metric-value">{rows.length}</div><div className="mt-1 text-xs text-[#6e6a6a]">{totals.neutral} com saldo exatamente zerado.</div></div>
      </section>

      <section id="team-health" className="surface-panel overflow-hidden scroll-mt-6">
        <div className="flex flex-col gap-4 border-b border-[#ebe8e8] bg-gradient-to-r from-[#edf8f8] to-white p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <div className="section-kicker">🏥 Saúde da equipe</div>
            <h2 className="section-title mt-1">Mapa de Ritmo</h2>
            <p className="section-note mt-1">Cada quadrado é um dia. Clique para entender exatamente o que aconteceu.</p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 text-[10px] font-semibold text-[#6e6a6a]">
            {[
              ['#075f55', 'Excelente'], ['#4da58e', 'Dentro do esperado'], ['#e3b64f', 'Atenção'], ['#c44b4b', 'Crítico'], ['#3f82b5', 'Trabalho externo'], ['#816da8', 'Ausência autorizada'], ['#dedbdb', 'Sem jornada'],
            ].map(([color, label]) => <span key={label} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: color }} />{label}</span>)}
          </div>
        </div>
        <div className="p-4 md:p-5">
          {attendance.isLoading || summary.isLoading ? <div className="flex h-56 items-center justify-center text-sm text-[#6e6a6a]">Montando o mapa de ritmo...</div> : <TeamRhythmHeatmap rows={rows} occurrences={occurrences} selectedUserId={selectedRow?.userId ?? null} selectedDate={selectedDate} onSelect={(selectedId, date) => { setSelectedUserId(selectedId); setSelectedDate(date); }} />}
        </div>
        {selectedRow && selectedDay && selectedDate && (
          <div className="border-t border-[#ebe8e8] bg-[#faf9f9] p-4 md:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-[#191717]">{selectedRow.name} · {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
                <div className="mt-1 text-xs text-[#6e6a6a]">
                  {getRhythmCell(selectedDay, selectedOccurrence).label} · Trabalhado {formatMinutes(selectedDay.workedMinutes)} · Previsto {formatMinutes(selectedDay.expectedMinutes ?? 0)} · Saldo {signedMinutes(selectedDay.balanceMinutes)}
                </div>
                {selectedOccurrence && <div className="mt-1 text-xs text-[#6e6a6a]">{requestTypeLabel(selectedOccurrence.requestType)} · {requestStatusLabel(selectedOccurrence.status)}{selectedOccurrence.reason ? ` · Motivo: ${selectedOccurrence.reason}` : ''}</div>}
              </div>
              <a href="#people" className="btn-secondary shrink-0">Abrir análise individual</a>
            </div>
          </div>
        )}
      </section>

      <section id="trends" className="grid scroll-mt-6 gap-5 xl:grid-cols-[1fr_1fr_0.9fr]">
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between"><div><div className="section-kicker">📈 Tendências</div><h3 className="mt-1 font-semibold text-[#191717]">Quem está melhorando</h3></div><TrendingUp className="h-6 w-6 text-[#026666]" /></div>
          <p className="mt-2 text-xs leading-5 text-[#6e6a6a]">Compara a média diária da primeira e da segunda metade do período.</p>
          <div className="mt-4 space-y-2">{improving.slice(0, 5).map((item) => <button type="button" key={item.row.userId} onClick={() => setSelectedUserId(item.row.userId)} className="flex w-full items-center justify-between rounded-xl border border-[#dceaea] bg-[#f8fcfc] px-3 py-2.5 text-left"><span className="truncate text-sm font-medium">{item.row.name}</span><strong className="ml-3 shrink-0 text-xs text-[#026666]">+{formatMinutes(Math.round(item.change))}/dia</strong></button>)}{!improving.length && <div className="rounded-xl bg-[#f6f4f4] p-3 text-sm text-[#8b8686]">Nenhuma melhora relevante detectada.</div>}</div>
        </div>
        <div className="surface-panel p-5">
          <div className="flex items-center justify-between"><div><div className="section-kicker">⚠ Sinal de atenção</div><h3 className="mt-1 font-semibold text-[#191717]">Quem está piorando</h3></div><TrendingDown className="h-6 w-6 text-[#b43737]" /></div>
          <p className="mt-2 text-xs leading-5 text-[#6e6a6a]">Mostra quedas médias superiores a 15 minutos por dia.</p>
          <div className="mt-4 space-y-2">{worsening.slice(0, 5).map((item) => <button type="button" key={item.row.userId} onClick={() => setSelectedUserId(item.row.userId)} className="flex w-full items-center justify-between rounded-xl border border-[#f0dede] bg-[#fffafa] px-3 py-2.5 text-left"><span className="truncate text-sm font-medium">{item.row.name}</span><strong className="ml-3 shrink-0 text-xs text-[#b43737]">{signedMinutes(Math.round(item.change))}/dia</strong></button>)}{!worsening.length && <div className="rounded-xl bg-[#f6f4f4] p-3 text-sm text-[#8b8686]">Nenhuma piora relevante detectada.</div>}</div>
        </div>
        <div className="surface-panel p-5">
          <div className="section-kicker">🏢 Departamentos</div><h3 className="mt-1 font-semibold text-[#191717]">Índice de saúde</h3><p className="mt-2 text-xs leading-5 text-[#6e6a6a]">Considera apenas dias com jornada; folgas e ausências autorizadas não reduzem a nota.</p>
          <div className="mt-4 space-y-3">{departmentHealth.slice(0, 6).map((department) => <div key={department.name}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-[#393636]">{department.name}</span><span className={`font-bold ${department.score < 60 ? 'text-[#b43737]' : department.score < 80 ? 'text-[#a66b00]' : 'text-[#026666]'}`}>{department.score}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#ebe8e8]"><div className={`h-full rounded-full ${department.score < 60 ? 'bg-[#b43737]' : department.score < 80 ? 'bg-[#e3b64f]' : 'bg-[#026666]'}`} style={{ width: `${department.score}%` }} /></div><div className="mt-1 text-[9px] text-[#8b8686]">{department.people} pessoa(s)</div></div>)}</div>
        </div>
      </section>

      <section id="bank-hours" className="surface-panel scroll-mt-6 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[#ebe8e8] p-5 md:flex-row md:items-end md:justify-between"><div><div className="section-kicker">Gráfico divergente</div><h2 className="section-title mt-1">Saldo por colaborador</h2><p className="section-note mt-1">Passe o mouse para consultar valores e clique em uma barra para abrir os detalhes.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl border border-[#d9d7d7] bg-[#f6f4f4] p-1">{([['balance', 'Saldo líquido'], ['overtime', 'Horas extras'], ['deficit', 'Déficit']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${mode === value ? 'bg-white text-[#026666] shadow-sm' : 'text-[#6e6a6a] hover:text-[#191717]'}`}>{label}</button>)}</div><button type="button" className="btn-secondary" onClick={downloadCsv} disabled={!rows.length}><Download className="h-4 w-4" /> Exportar CSV</button></div></div>
        {attendance.isLoading ? <div className="flex h-[470px] items-center justify-center text-sm text-[#6e6a6a]">Calculando os saldos da equipe...</div> : attendance.isError ? <div className="flex h-[470px] items-center justify-center text-sm text-[#b43737]">Não foi possível carregar a análise.</div> : <DivergingBalanceChart rows={rows} mode={mode} selectedUserId={selectedRow?.userId ?? null} onSelect={setSelectedUserId} />}
      </section>

      <section id="people" className="grid scroll-mt-6 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-panel p-5 md:p-6">
          {selectedRow ? <><div className="flex flex-col gap-3 border-b border-[#ebe8e8] pb-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="section-kicker">Detalhamento interativo</div><h3 className="mt-1 text-xl font-semibold text-[#191717]">{selectedRow.name}</h3><p className="mt-1 text-sm text-[#6e6a6a]">{selectedRow.departmentName || 'Sem setor'} · {selectedRow.managerName || 'Sem líder informado'}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${selectedRow.bankHours.balanceMinutesTotal < 0 ? 'bg-[#fbebeb] text-[#b43737]' : 'bg-[#e7f5f3] text-[#026666]'}`}>{signedMinutes(selectedRow.bankHours.balanceMinutesTotal)}</span></div><div className="mt-5"><CollaboratorTrend row={selectedRow} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="insight-card"><div className="metric-label">Trabalhadas</div><div className="mt-2 font-bold">{formatMinutes(selectedRow.bankHours.workedMinutesTotal)}</div></div><div className="insight-card"><div className="metric-label">Previstas</div><div className="mt-2 font-bold">{formatMinutes(selectedRow.bankHours.expectedMinutesTotal)}</div></div><div className="insight-card"><div className="metric-label">Dias completos</div><div className="mt-2 font-bold">{selectedRow.bankHours.completeDays}</div></div><div className="insight-card"><div className="metric-label">Faltas</div><div className="mt-2 font-bold text-[#b43737]">{selectedRow.bankHours.absenceDays}</div></div></div></> : <div className="flex min-h-72 flex-col items-center justify-center text-center"><CalendarRange className="h-10 w-10 text-[#aaa5a5]" /><h3 className="mt-3 font-semibold text-[#191717]">Selecione uma barra</h3><p className="mt-1 max-w-sm text-sm text-[#6e6a6a]">O histórico acumulado e os indicadores individuais aparecerão aqui.</p></div>}
        </div>

        <div className="surface-panel p-5 md:p-6">
          <div className="section-kicker">Extremos do período</div><h3 className="mt-1 text-xl font-semibold text-[#191717]">Quem pede atenção</h3><p className="mt-1 text-sm text-[#6e6a6a]">Os maiores créditos e débitos dentro dos filtros atuais.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#026666]">Maiores créditos</div><div className="space-y-2">{positiveRanking.map((row, index) => <button type="button" key={row.userId} onClick={() => setSelectedUserId(row.userId)} className="flex w-full items-center justify-between rounded-xl border border-[#e4eeee] bg-[#f8fcfc] px-3 py-2.5 text-left hover:border-[#bcdede]"><span className="truncate text-sm"><strong className="mr-2 text-[#8b8686]">{index + 1}</strong>{row.name}</span><strong className="ml-3 shrink-0 text-sm text-[#026666]">{signedMinutes(row.bankHours.balanceMinutesTotal)}</strong></button>)}{!positiveRanking.length && <div className="text-sm text-[#8b8686]">Nenhum saldo positivo.</div>}</div></div>
            <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b43737]">Maiores débitos</div><div className="space-y-2">{negativeRanking.map((row, index) => <button type="button" key={row.userId} onClick={() => setSelectedUserId(row.userId)} className="flex w-full items-center justify-between rounded-xl border border-[#f0dede] bg-[#fffafa] px-3 py-2.5 text-left hover:border-[#e2bcbc]"><span className="truncate text-sm"><strong className="mr-2 text-[#8b8686]">{index + 1}</strong>{row.name}</span><strong className="ml-3 shrink-0 text-sm text-[#b43737]">{signedMinutes(row.bankHours.balanceMinutesTotal)}</strong></button>)}{!negativeRanking.length && <div className="text-sm text-[#8b8686]">Nenhum saldo negativo.</div>}</div></div>
          </div>
        </div>
      </section>
    </div>
  );
}
