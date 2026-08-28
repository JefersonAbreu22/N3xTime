import { Clock3, MapPinned, TimerReset } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { recordsApi } from '../../services/recordsApi';
import { reportsApi } from '../../services/reportsApi';
import {
  formatMinutes,
  methodLabel,
  monthStartKey,
  recordTypeLabel,
  requestStatusLabel,
  requestTypeLabel,
  todayKey,
} from '../../components/dashboard/dashboardUtils';
import { ProtectedRecordPhoto } from '../../components/dashboard/ProtectedFile';
import RequestAdjustmentModal from '../../components/dashboard/RequestAdjustmentModal';
import RemoteClockInModal from '../../components/dashboard/RemoteClockInModal';

export default function MyRecordsPage() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);
  const [pointView, setPointView] = useState<'summary' | 'timesheet'>('summary');
  const [timesheetStartDate, setTimesheetStartDate] = useState(todayKey());
  const [timesheetEndDate, setTimesheetEndDate] = useState(todayKey());

  const my = useQuery({
    queryKey: ['records', 'me'],
    queryFn: async () => {
      const res = await recordsApi.myRecords();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const hrSummary = useQuery({
    queryKey: ['my-point', 'summary', todayKey()],
    queryFn: async () => reportsApi.hrSummary({ startDate: monthStartKey(), endDate: todayKey() }),
    enabled: !!auth.token,
  });

  const cumulativeBankHours = useQuery({
    queryKey: ['my-point', 'cumulative-bank-hours'],
    queryFn: () => reportsApi.cumulativeBankHours(),
    enabled: !!auth.token,
  });

  const summary = hrSummary.data?.data?.bankHours;
  const cumulativeBank = cumulativeBankHours.data?.data.bankHours;
  const latestRecord = my.data?.[0];
  const latestDailyBalance = summary?.latestDailyBalance;

  // Organiza os saldos diários do mais recente para o mais antigo
  const dailyBalances = summary?.dailyBalances ? [...summary.dailyBalances].reverse() : [];
  const summaryOccurrencesByDate = new Map(
    (hrSummary.data?.data?.absenceDocuments ?? []).map((occurrence) => [occurrence.targetDate, occurrence]),
  );

  const timesheet = useQuery({
    queryKey: ['my-point', 'timesheet', timesheetStartDate, timesheetEndDate],
    queryFn: async () => reportsApi.attendance({ startDate: timesheetStartDate, endDate: timesheetEndDate }),
    enabled: !!auth.token && pointView === 'timesheet' && timesheetStartDate <= timesheetEndDate,
  });

  const timesheetSummary = useQuery({
    queryKey: ['my-point', 'timesheet-occurrences', timesheetStartDate, timesheetEndDate],
    queryFn: async () => reportsApi.hrSummary({ startDate: timesheetStartDate, endDate: timesheetEndDate }),
    enabled: !!auth.token && pointView === 'timesheet' && timesheetStartDate <= timesheetEndDate,
  });

  const myAttendance = timesheet.data?.data?.[0];
  const timesheetDays = myAttendance?.allDailyViews ?? [];
  const occurrencesByDate = new Map(
    (timesheetSummary.data?.data?.absenceDocuments ?? []).map((occurrence) => [occurrence.targetDate, occurrence]),
  );

  const getWeekdayLabel = (dateKey?: string) => {
    if (!dateKey) return '—';
    const label = new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const getTimelineTime = (day: (typeof timesheetDays)[number], recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit') =>
    day.timeline?.find((record) => record.recordType === recordType)?.timeLabel ?? '—';

  const timesheetStatusLabel = (day: (typeof timesheetDays)[number]) => {
    const occurrence = day.date ? occurrencesByDate.get(day.date) : undefined;
    if (occurrence) return requestTypeLabel(occurrence.requestType);
    if (day.holidayType === 'paid') return 'Feriado remunerado';
    if (day.holidayType === 'unpaid') return 'Feriado não remunerado';
    if (!day.timeline?.length && (day.expectedMinutes ?? 0) === 0) return 'Sem jornada prevista';
    if (day.status === 'complete') return 'Jornada completa';
    if (day.status === 'in_progress') return 'Jornada em andamento';
    return 'Sem marcação';
  };

  const timesheetObservation = (day: (typeof timesheetDays)[number]) => {
    const occurrence = day.date ? occurrencesByDate.get(day.date) : undefined;
    if (occurrence) {
      const status = requestStatusLabel(occurrence.status);
      return occurrence.reason ? `${status}. Motivo: ${occurrence.reason}` : status;
    }
    if (day.holidayType === 'paid') return 'Carga dispensada por feriado remunerado.';
    if (day.holidayType === 'unpaid') return 'Feriado não remunerado; a carga prevista foi mantida.';
    if (!day.timeline?.length && (day.expectedMinutes ?? 0) === 0) return `Dia sem jornada prevista (${getWeekdayLabel(day.date)}).`;
    if (!day.timeline?.length) return 'Sem marcação e sem ocorrência ou justificativa vinculada.';
    if (day.status === 'in_progress') return 'Jornada com marcações incompletas.';
    return '—';
  };

  const dailyBalanceObservation = (day: (typeof dailyBalances)[number]) => {
    const occurrence = summaryOccurrencesByDate.get(day.date);
    if (occurrence) {
      const type = requestTypeLabel(occurrence.requestType);
      const status = requestStatusLabel(occurrence.status);
      return occurrence.reason ? `${type}. ${status}. Motivo: ${occurrence.reason}` : `${type}. ${status}.`;
    }
    if (day.holidayType === 'paid') return 'Feriado remunerado; carga prevista dispensada.';
    if (day.holidayType === 'unpaid') return 'Feriado não remunerado; carga prevista mantida.';
    if (day.expectedMinutes === 0 && day.workedMinutes === 0) return `Dia sem jornada prevista (${getWeekdayLabel(day.date)}).`;
    if (day.isJustifiedAbsence) return 'Ausência justificada.';
    if (day.isAbsence) return 'Sem marcação e sem ocorrência ou justificativa vinculada.';
    if (!day.hasCompleteJourney && day.workedMinutes > 0) return 'Jornada com marcações incompletas.';
    return '—';
  };

  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="border-b border-[#e7e4e4] p-5 md:p-6 xl:border-b-0 xl:border-r">
            <div className="page-eyebrow">Meu ponto</div>
            <h2 className="page-title">Histórico, marcações e evidências</h2>
            <p className="page-description">
              Consulte sua jornada consolidada, acompanhe o último registro realizado e acesse as evidências do ponto remoto.
            </p>
          </div>
          <div className="p-5 md:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Ações rápidas</div>
            <div className="mt-4 flex flex-wrap gap-3">
              {auth.user?.remote_clock_in_enabled && (
                <button 
                  onClick={() => setIsRemoteModalOpen(true)} 
                  className="btn-primary flex items-center gap-2 bg-[#026666] hover:bg-[#014d4d]"
                >
                  Registrar Ponto
                </button>
              )}
              <button onClick={() => setIsRequestModalOpen(true)} className="btn-secondary">
                Solicitar Ajuste
              </button>
              <Link to="/dashboard/requests" className="btn-ghost">
                Ir para Solicitações
              </Link>
            </div>
            <div className="mt-6 text-sm leading-6 text-[#6e6a6a]">
              Último evento: {latestRecord ? `${recordTypeLabel(latestRecord.record_type)} em ${new Date(latestRecord.record_time).toLocaleString()}` : 'nenhuma marcação recente.'}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Horas Hoje</div>
            <Clock3 className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value">{formatMinutes(latestDailyBalance?.workedMinutes ?? 0)}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Trabalhadas na data mais recente consolidada.</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Saldo do Mês</div>
            <TimerReset className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value">{formatMinutes(summary?.balanceMinutesTotal ?? 0)}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Resultado acumulado no mês atual.</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Saldo Geral</div>
            <TimerReset className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value">{formatMinutes(cumulativeBank?.balanceMinutesTotal ?? 0)}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Acumulado desde o início do banco de horas.</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Última Marcação</div>
            <Clock3 className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value text-[1.35rem] md:text-[1.6rem]">
            {latestRecord ? recordTypeLabel(latestRecord.record_type) : 'Sem registro'}
          </div>
          <div className="mt-2 text-sm text-[#6e6a6a]">
            {latestRecord ? new Date(latestRecord.record_time).toLocaleString() : 'Nenhuma movimentação encontrada.'}
          </div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Evidências</div>
            <MapPinned className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value">
            {(my.data ?? []).filter((record) => record.map_url || record.photo_url).length}
          </div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Marcações com mapa ou foto registrada.</div>
        </div>
      </section>

      <div className="surface-panel p-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Visualizações do meu ponto">
          <button
            type="button"
            role="tab"
            aria-selected={pointView === 'summary'}
            onClick={() => setPointView('summary')}
            className={pointView === 'summary' ? 'btn-primary' : 'btn-ghost'}
          >
            Resumo diário
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pointView === 'timesheet'}
            onClick={() => setPointView('timesheet')}
            className={pointView === 'timesheet' ? 'btn-primary' : 'btn-ghost'}
          >
            Espelho diário
          </button>
        </div>
      </div>

      {pointView === 'summary' ? (
      <div className="surface-panel p-6" role="tabpanel">
        <div className="flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Resumo diário</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Espelho de Ponto</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-[#6e6a6a]">Acompanhe seu saldo, entradas, saídas e horas extras por dia.</div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto border border-[#ebe8e8] rounded-xl">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th>Data</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Jornada Realizada</th>
                <th>Faltam (Déficit)</th>
                <th>Horas Extras</th>
                <th>Status</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {dailyBalances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#6e6a6a]">Nenhum resumo disponível para este mês.</td>
                </tr>
              ) : (
                dailyBalances.map((day) => (
                  <tr key={day.date}>
                    <td>
                      <div className="font-medium text-[#191717]">
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </div>
                      <div className="text-xs text-[#6e6a6a]">
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' })}
                      </div>
                    </td>
                    <td>{day.entryTime || '—'}</td>
                    <td>{day.exitTime || '—'}</td>
                    <td>
                      <div className="font-medium text-[#026666]">
                        {formatMinutes(day.workedMinutes)}
                      </div>
                      {day.expectedMinutes > 0 && (
                        <div className="text-xs text-[#6e6a6a]">
                          Previsto: {formatMinutes(day.expectedMinutes)}
                        </div>
                      )}
                    </td>
                    <td>
                      {day.isAbsence ? (
                        <span className="text-[#b43737] font-medium">Falta integral</span>
                      ) : day.balanceMinutes < 0 ? (
                        <span className="text-[#b43737] font-medium">{formatMinutes(Math.abs(day.balanceMinutes))}</span>
                      ) : (
                        <span className="text-[#6e6a6a]">—</span>
                      )}
                    </td>
                    <td>
                      {day.balanceMinutes > 0 ? (
                        <span className="text-[#026666] font-medium">+{formatMinutes(day.balanceMinutes)}</span>
                      ) : (
                        <span className="text-[#6e6a6a]">—</span>
                      )}
                    </td>
                    <td>
                      {day.isHoliday ? (
                        <span className="status-chip bg-[#eef2fa] text-[#2d5299] border-[#d9e2f2]">
                          {day.holidayType === 'unpaid' ? 'Feriado não remunerado' : 'Feriado remunerado'}
                        </span>
                      ) : day.isJustifiedAbsence ? (
                        <span className="status-chip bg-[#f4f8f8] text-[#026666] border-[#dceaea]">Justificado</span>
                      ) : day.isAbsence ? (
                        <span className="status-chip bg-[#fdf3f3] text-[#b43737] border-[#f8e1e1]">Ausente</span>
                      ) : day.hasCompleteJourney ? (
                        <span className="status-chip bg-[#f4f8f8] text-[#026666] border-[#dceaea]">Completo</span>
                      ) : day.workedMinutes > 0 ? (
                        <span className="status-chip bg-[#fff8e6] text-[#b36b00] border-[#fde8b3]">Incompleto</span>
                      ) : (
                        <span className="text-[#6e6a6a]">—</span>
                      )}
                    </td>
                    <td className="min-w-[260px] whitespace-normal text-sm leading-5 text-[#6e6a6a]">{dailyBalanceObservation(day)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
      <div className="surface-panel p-6" role="tabpanel">
        <div className="flex flex-col gap-5 border-b border-[#ece8e8] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Espelho diário</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Todos os meus horários</h3>
            <div className="mt-2 text-sm text-[#6e6a6a]">Consulte entradas, intervalos, saídas e o saldo de cada dia.</div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-[#3f3b3b]">
              <span className="mb-1 block">Data inicial</span>
              <input
                type="date"
                value={timesheetStartDate}
                onChange={(event) => setTimesheetStartDate(event.target.value)}
                className="input-field min-w-[165px]"
              />
            </label>
            <label className="text-sm font-medium text-[#3f3b3b]">
              <span className="mb-1 block">Data final</span>
              <input
                type="date"
                value={timesheetEndDate}
                onChange={(event) => setTimesheetEndDate(event.target.value)}
                className="input-field min-w-[165px]"
              />
            </label>
          </div>
        </div>

        {timesheetStartDate > timesheetEndDate ? (
          <div className="mt-5 rounded-xl border border-[#f2d6d6] bg-[#fdf3f3] p-4 text-sm text-[#b43737]">
            A data inicial deve ser anterior ou igual à data final.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="insight-card">
                <div className="metric-label">Total trabalhado</div>
                <div className="mt-2 text-xl font-bold text-[#191717]">{formatMinutes(myAttendance?.bankHours.workedMinutesTotal ?? 0)}</div>
              </div>
              <div className="insight-card">
                <div className="metric-label">Carga do período</div>
                <div className="mt-2 text-xl font-bold text-[#191717]">{formatMinutes(myAttendance?.bankHours.expectedMinutesTotal ?? 0)}</div>
              </div>
              <div className="insight-card">
                <div className="metric-label">Horas extras</div>
                <div className="mt-2 text-xl font-bold text-[#026666]">{formatMinutes(myAttendance?.bankHours.overtimeMinutes ?? 0)}</div>
              </div>
              <div className="insight-card">
                <div className="metric-label">Déficit</div>
                <div className="mt-2 text-xl font-bold text-[#b43737]">{formatMinutes(myAttendance?.bankHours.deficitMinutes ?? 0)}</div>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-[#ebe8e8]">
              <table className="data-table min-w-[1350px]">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Dia da semana</th>
                    <th>Entrada</th>
                    <th>Saída almoço</th>
                    <th>Retorno almoço</th>
                    <th>Saída</th>
                    <th>Jornada realizada</th>
                    <th>Saldo</th>
                    <th>Status</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheet.isLoading ? (
                    <tr><td colSpan={10} className="py-8 text-center text-[#6e6a6a]">Carregando espelho de ponto...</td></tr>
                  ) : timesheet.isError ? (
                    <tr><td colSpan={10} className="py-8 text-center text-[#b43737]">Não foi possível carregar seu espelho de ponto.</td></tr>
                  ) : timesheetDays.length === 0 ? (
                    <tr><td colSpan={10} className="py-8 text-center text-[#6e6a6a]">Nenhum horário encontrado no período selecionado.</td></tr>
                  ) : (
                    [...timesheetDays].reverse().map((day) => (
                      <tr key={day.date}>
                        <td className="whitespace-nowrap font-medium text-[#191717]">
                          {day.date ? new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="whitespace-nowrap text-[#6e6a6a]">{getWeekdayLabel(day.date)}</td>
                        <td>{getTimelineTime(day, 'entry')}</td>
                        <td>{getTimelineTime(day, 'lunch_start')}</td>
                        <td>{getTimelineTime(day, 'lunch_end')}</td>
                        <td>{getTimelineTime(day, 'exit')}</td>
                        <td className="font-medium text-[#026666]">{formatMinutes(day.workedMinutes)}</td>
                        <td>
                          {day.balanceMinutes > 0 ? (
                            <span className="font-medium text-[#026666]">+{formatMinutes(day.balanceMinutes)}</span>
                          ) : day.balanceMinutes < 0 ? (
                            <span className="font-medium text-[#b43737]">-{formatMinutes(Math.abs(day.balanceMinutes))}</span>
                          ) : '—'}
                        </td>
                        <td>{timesheetStatusLabel(day)}</td>
                        <td className="min-w-[240px] whitespace-normal text-sm leading-5 text-[#6e6a6a]">{timesheetObservation(day)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      )}

      <div className="surface-panel p-6">
        <div className="flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Histórico operacional</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Lista de Marcações Brutas</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-[#6e6a6a]">Consulte as batidas individuais, métodos, geolocalização e foto do histórico.</div>
          </div>
        </div>

        <div className="mt-6">
          {!auth.token ? (
          <div className="py-16 text-center text-[#6e6a6a]">Faça login para visualizar seus registros.</div>
        ) : my.isLoading ? (
          <div className="py-16 text-center text-[#6e6a6a]">Carregando historico...</div>
        ) : (my.data?.length ?? 0) === 0 ? (
          <div className="py-16 text-center text-[#6e6a6a]">Nenhum registro encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Tipo</th>
                  <th>Metodo</th>
                  <th>Status</th>
                  <th>Geo</th>
                  <th>Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {my.data?.map((record) => (
                  <tr key={record.id}>
                    <td>{new Date(record.record_time).toLocaleString()}</td>
                    <td>
                      <span className="status-chip border-[#dceaea] bg-[#edf8f8] text-[#026666]">
                        {recordTypeLabel(record.record_type)}
                      </span>
                    </td>
                    <td>{methodLabel(record.method)}</td>
                    <td>{record.status}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {record.map_url ? (
                          <a className="font-semibold text-[#026666] hover:underline" href={record.map_url} target="_blank" rel="noreferrer">
                            Abrir no Google Maps
                          </a>
                        ) : (
                          <span>—</span>
                        )}
                        {record.photo_url ? (
                          <ProtectedRecordPhoto recordId={record.id} className="h-12 w-12 rounded-md border border-[#ece8e8] object-cover" linkClassName="mt-1 block w-fit hover:opacity-80 transition-opacity" />
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate">{record.device_info || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {isRequestModalOpen && (
        <RequestAdjustmentModal
          onClose={() => setIsRequestModalOpen(false)}
          onSuccess={() => {
            setIsRequestModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['records', 'me'] });
            queryClient.invalidateQueries({ queryKey: ['requests', 'my'] });
            queryClient.invalidateQueries({ queryKey: ['my-point', 'summary'] });
            toast.success('Solicitação enviada com sucesso!');
          }}
          myRecords={my.data || []}
        />
      )}

      <RemoteClockInModal
        isOpen={isRemoteModalOpen}
        onClose={() => setIsRemoteModalOpen(false)}
      />
    </div>
  );
}
