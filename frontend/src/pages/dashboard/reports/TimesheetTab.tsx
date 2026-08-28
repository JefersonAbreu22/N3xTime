import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { type ReportsContextType } from './ReportsLayout';
import { ReportSectionHeader, downloadHtmlAsExcel, exportTableToPdf } from './reportsHelpers';
import { formatMinutes, recordTypeLabel, requestStatusLabel, requestTypeLabel, todayKey } from '../../../components/dashboard/dashboardUtils';
import { reportsApi } from '../../../services/reportsApi';
import { ProtectedRecordPhoto } from '../../../components/dashboard/ProtectedFile';

interface TimelineItem {
  id: number;
  timeLabel?: string;
  recordTime: string | Date;
  recordType: 'entry' | 'lunch_start' | 'lunch_end' | 'exit';
  method?: 'facial' | 'pin' | 'manual' | 'web';
  mapUrl?: string;
  photoUrl?: string;
}

interface DayView {
  date?: string;
  holidayType?: 'paid' | 'unpaid' | null;
  timeline?: TimelineItem[];
  workedMinutes?: number;
  expectedMinutes?: number;
  balanceMinutes?: number;
  status?: 'absent' | 'in_progress' | 'complete';
}

interface UserAttendance {
  userId: number;
  name: string;
  departmentName?: string;
  allDailyViews?: DayView[];
  bankHours?: {
    workedMinutesTotal: number;
    expectedMinutesTotal: number;
    balanceMinutesTotal: number;
    overtimeMinutes: number;
    deficitMinutes: number;
  };
}

export default function TimesheetTab() {
  const { companyName, filters, summaryData } = useOutletContext<ReportsContextType>();

  const parsedDepartmentId = filters.departmentId ? Number(filters.departmentId) : null;
  const parsedUserId = filters.userId ? Number(filters.userId) : null;

  const attendanceQuery = useQuery({
    queryKey: ['reports', 'timesheet', filters.startDate, filters.endDate, parsedDepartmentId, parsedUserId],
    queryFn: async () =>
      reportsApi.attendance({
        startDate: filters.startDate,
        endDate: filters.endDate,
        departmentId: parsedDepartmentId,
        userId: parsedUserId,
      }),
  });

  const attendanceData = attendanceQuery.data?.data ?? [];
  const selectedAttendanceUser = parsedUserId && attendanceData.length === 1 ? attendanceData[0] as UserAttendance : null;
  const occurrencesByUserAndDate = new Map<string, { requestType: string; status: string; reason: string }>();
  const occurrenceKey = (userId: number, date: string) => `${userId}:${date}`;
  for (const occurrence of summaryData?.absenceDocuments ?? []) {
    const occurrenceUserId = Number(occurrence.userId);
    if (occurrenceUserId && occurrence.targetDate && !occurrencesByUserAndDate.has(occurrenceKey(occurrenceUserId, occurrence.targetDate))) {
      occurrencesByUserAndDate.set(occurrenceKey(occurrenceUserId, occurrence.targetDate), {
        requestType: occurrence.requestType,
        status: occurrence.status,
        reason: typeof occurrence.reason === 'string' ? occurrence.reason : '',
      });
    }
  }

  const getDateValue = (dateKey?: string) => dateKey ? new Date(`${dateKey}T12:00:00`) : null;
  const getDateLabel = (dateKey?: string) => getDateValue(dateKey)?.toLocaleDateString('pt-BR') ?? '—';
  const getWeekdayLabel = (dateKey?: string) => {
    const label = getDateValue(dateKey)?.toLocaleDateString('pt-BR', { weekday: 'long' }) ?? '—';
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const getOccurrence = (dayView: DayView, userId?: number) => dayView.date && userId
    ? occurrencesByUserAndDate.get(occurrenceKey(userId, dayView.date))
    : undefined;

  const getDayStatus = (dayView: DayView, userId?: number) => {
    const occurrence = getOccurrence(dayView, userId);
    if (occurrence) return requestTypeLabel(occurrence.requestType);
    if (dayView.holidayType === 'paid') return 'Feriado remunerado';
    if (dayView.holidayType === 'unpaid') return 'Feriado não remunerado';
    if (!dayView.timeline?.length && (dayView.expectedMinutes ?? 0) === 0) return 'Sem jornada prevista';
    if (dayView.status === 'complete') return 'Jornada completa';
    if (dayView.status === 'in_progress') return 'Jornada em andamento';
    return 'Sem marcação';
  };

  const getDayObservation = (dayView: DayView, userId?: number) => {
    const occurrence = getOccurrence(dayView, userId);
    if (occurrence) {
      const status = requestStatusLabel(occurrence.status);
      return occurrence.reason ? `${status}. Motivo: ${occurrence.reason}` : status;
    }
    if (dayView.holidayType === 'paid') return 'Carga dispensada por feriado remunerado.';
    if (dayView.holidayType === 'unpaid') return 'Feriado não remunerado; a carga prevista foi mantida.';
    if (!dayView.timeline?.length && (dayView.expectedMinutes ?? 0) === 0) {
      return `Dia sem jornada prevista (${getWeekdayLabel(dayView.date)}).`;
    }
    if (!dayView.timeline?.length) return 'Sem marcação e sem ocorrência ou justificativa vinculada.';
    if (dayView.status === 'in_progress') return 'Jornada com marcações incompletas.';
    return '—';
  };

  const getRecordTime = (dayView: DayView, recordType: TimelineItem['recordType']) => {
    const record = dayView.timeline?.find((item) => item.recordType === recordType);
    if (!record) return '—';
    return `${record.timeLabel ?? new Date(record.recordTime).toLocaleTimeString('pt-BR')}${record.method === 'web' ? ' (Remoto)' : ''}`;
  };

  const handleExportIndividualPdf = () => {
    if (!selectedAttendanceUser?.allDailyViews) return;
    exportTableToPdf({
      companyName,
      title: `Espelho de Ponto: ${selectedAttendanceUser.name}`,
      subtitle: `Período ${filters.startDate} até ${filters.endDate} | Setor: ${selectedAttendanceUser.departmentName ?? 'Não informado'}`,
      fileName: `espelho-${selectedAttendanceUser.name.toLowerCase().replace(/\s+/g, '-')}-${filters.startDate}-${filters.endDate}.pdf`,
      orientation: 'landscape',
      fontSize: 7.5,
      columns: ['Data', 'Dia da semana', 'Entrada', 'Saída almoço', 'Retorno', 'Saída', 'Jornada', 'Saldo', 'Observação'],
      rows: selectedAttendanceUser.allDailyViews.map((dayView) => {
        const balance = dayView.balanceMinutes ?? 0;
        const status = getDayStatus(dayView, selectedAttendanceUser.userId);
        const observation = getDayObservation(dayView, selectedAttendanceUser.userId);
        return [
          getDateLabel(dayView.date),
          getWeekdayLabel(dayView.date),
          getRecordTime(dayView, 'entry'),
          getRecordTime(dayView, 'lunch_start'),
          getRecordTime(dayView, 'lunch_end'),
          getRecordTime(dayView, 'exit'),
          formatMinutes(dayView.workedMinutes ?? 0),
          balance > 0 ? `+${formatMinutes(balance)}` : formatMinutes(balance),
          observation === '—' ? status : `${status}. ${observation}`,
        ];
      }),
      columnStyles: {
        0: { cellWidth: 58, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: 45, halign: 'center' },
        3: { cellWidth: 45, halign: 'center' },
        4: { cellWidth: 45, halign: 'center' },
        5: { cellWidth: 45, halign: 'center' },
        6: { cellWidth: 55, halign: 'center' },
        7: { cellWidth: 55, halign: 'center' },
        8: { cellWidth: 345, overflow: 'linebreak', valign: 'top' },
      },
      signature: { collaboratorName: selectedAttendanceUser.name },
    });
  };

  const handleExportExcel = () => {
    downloadHtmlAsExcel({
      title: `Espelho Diario da Equipe`,
      subtitle: `Periodo: ${filters.startDate} a ${filters.endDate}`,
      fileName: `espelho-diario-equipe-${todayKey()}.xls`,
      columns: ['Colaborador', 'Data', 'Dia da semana', 'Entrada', 'Saída almoço', 'Retorno almoço', 'Saída', 'Jornada realizada', 'Saldo', 'Status', 'Observação'],
      rows: (() => {
        if (!attendanceData) return [];
        const rowsToExport: Array<Array<string>> = [];
        (attendanceData as UserAttendance[]).forEach((userAttendance) => {
          if (userAttendance.allDailyViews) {
            userAttendance.allDailyViews.forEach((dayView, idx) => {
              const dateKey = dayView.date || `Dia ${idx + 1}`;
              let entry = '—', lunch_start = '—', lunch_end = '—', exit = '—';
              if (dayView.timeline) {
                dayView.timeline.forEach((item) => {
                  const time = item.timeLabel || new Date(item.recordTime).toLocaleTimeString();
                  const displayedTime = `${time}${item.method === 'web' ? ' (Remoto)' : ''}`;
                  if (item.recordType === 'entry') entry = displayedTime;
                  else if (item.recordType === 'lunch_start') lunch_start = displayedTime;
                  else if (item.recordType === 'lunch_end') lunch_end = displayedTime;
                  else if (item.recordType === 'exit') exit = displayedTime;
                });
              }
              const worked = formatMinutes(dayView.workedMinutes ?? 0);
              const balance = dayView.balanceMinutes ? (dayView.balanceMinutes > 0 ? `+${formatMinutes(dayView.balanceMinutes)}` : `-${formatMinutes(Math.abs(dayView.balanceMinutes))}`) : '0h 00m';
              rowsToExport.push([
                userAttendance.name,
                getDateLabel(dayView.date) || dateKey,
                getWeekdayLabel(dayView.date),
                entry,
                lunch_start,
                lunch_end,
                exit,
                worked,
                balance,
                getDayStatus(dayView, userAttendance.userId),
                getDayObservation(dayView, userAttendance.userId),
              ]);
            });
          }
        });
        return rowsToExport;
      })(),
    });
  };

  return (
    <div className="space-y-6">
      <section id="daily-sheet" className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Espelho diario consolidado"
          title="Visão em tabela de equipe"
          note="Consulte rapidamente todas as marcações da equipe no período filtrado. Use para auditoria rápida de horários."
          aside={
            <div className="flex flex-wrap items-end gap-3">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={handleExportExcel} 
                disabled={!attendanceData || attendanceData.length === 0}
              >
                Exportar Excel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExportIndividualPdf}
                disabled={!selectedAttendanceUser}
                title={selectedAttendanceUser ? 'Gera o espelho individual com campo de assinatura' : 'Selecione um colaborador no filtro geral'}
              >
                PDF individual com assinatura
              </button>
            </div>
          }
        />

        {!selectedAttendanceUser && (
          <div className="mt-5 border border-[#ece8e8] bg-[#f8f6f6] p-4 text-sm leading-6 text-[#6e6a6a]">
            Selecione um colaborador no filtro geral para gerar o espelho individual completo, incluindo folgas, férias, atestados e trabalho externo.
          </div>
        )}

        {parsedUserId && attendanceData.length === 1 && (
          <div className="grid gap-3 md:grid-cols-4 mt-5">
            <div className="insight-card">
              <div className="metric-label">Total Trabalhado</div>
              <div className="mt-2 text-xl font-bold text-[#191717]">{formatMinutes((attendanceData[0] as UserAttendance).bankHours?.workedMinutesTotal ?? 0)}</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Carga Exigida</div>
              <div className="mt-2 text-xl font-bold text-[#191717]">{formatMinutes((attendanceData[0] as UserAttendance).bankHours?.expectedMinutesTotal ?? 0)}</div>
            </div>
            <div className="insight-card">
              <div className="metric-label">Saldo do Período</div>
              <div className={`mt-2 text-xl font-bold ${((attendanceData[0] as UserAttendance).bankHours?.balanceMinutesTotal ?? 0) > 0 ? 'text-[#026666]' : ((attendanceData[0] as UserAttendance).bankHours?.balanceMinutesTotal ?? 0) < 0 ? 'text-[#b43737]' : 'text-[#191717]'}`}>
                {((attendanceData[0] as UserAttendance).bankHours?.balanceMinutesTotal ?? 0) > 0 ? '+' : ''}{formatMinutes((attendanceData[0] as UserAttendance).bankHours?.balanceMinutesTotal ?? 0)}
              </div>
            </div>
            <div className="insight-card flex gap-4">
              <div className="flex-1">
                <div className="metric-label">Horas Extras</div>
                <div className="mt-1 text-lg font-bold text-[#026666]">{formatMinutes((attendanceData[0] as UserAttendance).bankHours?.overtimeMinutes ?? 0)}</div>
              </div>
              <div className="w-px bg-[#ebe8e8]"></div>
              <div className="flex-1">
                <div className="metric-label">Déficit / Atrasos</div>
                <div className="mt-1 text-lg font-bold text-[#b43737]">{formatMinutes((attendanceData[0] as UserAttendance).bankHours?.deficitMinutes ?? 0)}</div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-[#ebe8e8] rounded-xl mt-5">
          <table className="data-table min-w-[1500px]">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Data</th>
                <th>Dia da semana</th>
                <th>Entrada</th>
                <th>Saída Almoço</th>
                <th>Retorno Almoço</th>
                <th>Saída</th>
                <th>Jornada</th>
                <th>Saldo</th>
                <th>Status / ocorrência</th>
                <th>Observação</th>
                <th>Evidências</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                if (!attendanceData || attendanceData.length === 0) {
                  return (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-[#6e6a6a]">Sem marcações na equipe para este período.</td>
                    </tr>
                  );
                }
                
                const rowsToRender: React.ReactNode[] = [];
                (attendanceData as UserAttendance[]).forEach((userAttendance) => {
                  if (userAttendance.allDailyViews && userAttendance.allDailyViews.length > 0) {
                    userAttendance.allDailyViews.forEach((dayView, idx) => {
                      const dateKey = dayView.date || `Dia ${idx + 1}`;
                      let entry: TimelineItem | null = null, lunch_start: TimelineItem | null = null, lunch_end: TimelineItem | null = null, exit: TimelineItem | null = null;
                      
                      if (dayView.timeline) {
                        dayView.timeline.forEach((item) => {
                          if (item.recordType === 'entry') entry = item;
                          else if (item.recordType === 'lunch_start') lunch_start = item;
                          else if (item.recordType === 'lunch_end') lunch_end = item;
                          else if (item.recordType === 'exit') exit = item;
                        });
                      }

                      const renderRecordCell = (record: TimelineItem | null) => {
                        if (!record) return <span className="text-[#6e6a6a]">—</span>;
                        const time = record.timeLabel || new Date(record.recordTime).toLocaleTimeString();
                        return (
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-[#191717]">{time}</span>
                            {record.method === 'web' && <span className="status-chip w-fit border-[#b9dede] bg-[#e4f4f4] text-[#026666]">Remoto</span>}
                            {(record.mapUrl || record.photoUrl) && (
                              <div className="flex flex-col gap-0.5 text-[11px]">
                                {record.mapUrl && <a className="font-medium text-[#026666] hover:underline" href={record.mapUrl} target="_blank" rel="noreferrer">Mapa</a>}
                                {record.photoUrl && (
                                  <ProtectedRecordPhoto recordId={record.id} className="h-8 w-8 rounded-md border border-[#ece8e8] object-cover" linkClassName="mt-0.5 block" />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      };

                      const renderEvidenceCell = (records: Array<TimelineItem | null>) => {
                        const evidenceRecords = records.filter((record): record is TimelineItem => Boolean(record && (record.mapUrl || record.photoUrl || record.method === 'web')));
                        if (!evidenceRecords.length) return <span className="text-[#6e6a6a]">—</span>;
                        return (
                          <div className="flex flex-col gap-1 text-[11px]">
                            {evidenceRecords.map((record) => (
                              <div key={`team-evidence-${record.id || Math.random()}`} className="flex flex-wrap gap-1.5 items-center">
                                <span className="font-medium text-[#191717] uppercase tracking-wider">{recordTypeLabel(record.recordType)}:</span>
                                {record.mapUrl ? <a className="font-medium text-[#026666] hover:underline" href={record.mapUrl} target="_blank" rel="noreferrer">Mapa</a> : null}
                                {record.photoUrl ? (
                                  <ProtectedRecordPhoto recordId={record.id} className="h-8 w-8 rounded-md border border-[#ece8e8] object-cover" />
                                ) : record.method === 'web' ? <span className="text-[#6e6a6a]">Foto expirada pela retenção</span> : null}
                              </div>
                            ))}
                          </div>
                        );
                      };
                      
                      rowsToRender.push(
                        <tr key={`${userAttendance.userId}-${idx}`} className="hover:bg-[#fcfbfb]">
                          <td className="font-medium text-[#191717]">{userAttendance.name}</td>
                          <td className="font-medium text-[#191717] whitespace-nowrap">{getDateLabel(dayView.date) || dateKey}</td>
                          <td className="whitespace-nowrap text-[#6e6a6a]">{getWeekdayLabel(dayView.date)}</td>
                          <td>{renderRecordCell(entry)}</td>
                          <td>{renderRecordCell(lunch_start)}</td>
                          <td>{renderRecordCell(lunch_end)}</td>
                          <td>{renderRecordCell(exit)}</td>
                          <td>
                            <div className="font-medium text-[#026666]">
                              {formatMinutes(dayView.workedMinutes ?? 0)}
                            </div>
                          </td>
                          <td>
                            {(dayView.balanceMinutes ?? 0) > 0 ? (
                              <span className="text-[#026666] font-medium">+{formatMinutes(dayView.balanceMinutes ?? 0)}</span>
                            ) : (dayView.balanceMinutes ?? 0) < 0 ? (
                              <span className="text-[#b43737] font-medium">{formatMinutes(Math.abs(dayView.balanceMinutes ?? 0))}</span>
                            ) : (
                              <span className="text-[#6e6a6a]">—</span>
                            )}
                          </td>
                          <td>
                            <span className="text-sm font-medium text-[#191717]">{getDayStatus(dayView, userAttendance.userId)}</span>
                          </td>
                          <td className="min-w-[240px] whitespace-normal text-sm leading-5 text-[#6e6a6a]">{getDayObservation(dayView, userAttendance.userId)}</td>
                          <td>{renderEvidenceCell([entry, lunch_start, lunch_end, exit])}</td>
                        </tr>
                      );
                    });
                  }
                });
                return rowsToRender;
              })()}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
