import { useOutletContext } from 'react-router-dom';
import { type ReportsContextType } from './ReportsLayout';
import { ReportInsightCard, ReportSectionHeader, downloadHtmlAsExcel, exportTableToPdf } from './reportsHelpers';
import { formatMinutes, todayKey } from '../../../components/dashboard/dashboardUtils';
import { useAuthStore } from '../../../stores/authStore';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '../../../services/reportsApi';


export default function ClosingTab() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const { companyName, filters, summaryData, monthlyClosureRows, attendanceData } = useOutletContext<ReportsContextType>();

  const parsedUserId = filters.userId ? Number(filters.userId) : null;
  const reportYear = Number(filters.startDate.slice(0, 4)) || new Date().getFullYear();

  const closedCompetencies = monthlyClosureRows.filter((item: { status: string }) => item.status === 'closed').length;
  const openCompetencies = monthlyClosureRows.filter((item: { status: string }) => item.status === 'open').length;
  const latestClosedCompetency = monthlyClosureRows.find((item: { status: string; periodLabel: string }) => item.status === 'closed')?.periodLabel ?? 'Nenhum';

  const selectedAttendanceUser =
    attendanceData.find((item: { userId: number }) => item.userId === parsedUserId) ?? null;

  const closeMonthlyClosure = useMutation({
    mutationFn: async (payload: { periodMonth: string; notes?: string }) =>
      reportsApi.closeMonthlyClosure(payload.periodMonth, payload.notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports', 'monthly-closures'] });
      await queryClient.invalidateQueries({ queryKey: ['reports', 'summary'] });
      await queryClient.invalidateQueries({ queryKey: ['reports', 'attendance'] });
    },
  });

  const reopenMonthlyClosure = useMutation({
    mutationFn: async (payload: { periodMonth: string; reason?: string }) =>
      reportsApi.reopenMonthlyClosure(payload.periodMonth, payload.reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reports', 'monthly-closures'] });
      await queryClient.invalidateQueries({ queryKey: ['reports', 'summary'] });
      await queryClient.invalidateQueries({ queryKey: ['reports', 'attendance'] });
    },
  });

  const handleCloseMonth = async (periodMonth: string) => {
    const notes = window.prompt(`Observacao opcional para o fechamento de ${periodMonth}:`) ?? '';
    await closeMonthlyClosure.mutateAsync({ periodMonth, notes: notes.trim() || undefined });
  };

  const handleReopenMonth = async (periodMonth: string) => {
    const reason = window.prompt(`Motivo da reabertura de ${periodMonth}:`) ?? '';
    await reopenMonthlyClosure.mutateAsync({ periodMonth, reason: reason.trim() || undefined });
  };

  const handleExportMonthlyBreakdownExcel = () => {
    downloadHtmlAsExcel({
      title: 'Espelho Mensal Consolidado',
      subtitle: `Periodo base ${filters.startDate} ate ${filters.endDate} | Empresa ${summaryData?.company?.tradeName || summaryData?.company?.legalName || 'Nao configurada'}`,
      fileName: `espelho-mensal-${todayKey()}.xls`,
      columns: ['Mes', 'Trabalhadas', 'Exigidas', 'A Trabalhar (Déficit)', 'Extras', 'Faltas', 'Justificadas'],
      rows: (summaryData?.bankHours?.monthlyBreakdown ?? []).map((month: { month: string; workedMinutes: number; expectedMinutes: number; requiredMinutes: number; balanceMinutes: number; overtimeMinutes: number; deficitMinutes: number; absenceDays: number; justifiedDays: number }) => [
        new Date(`${month.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        formatMinutes(month.workedMinutes),
        formatMinutes(month.expectedMinutes),
        formatMinutes(month.deficitMinutes),
        formatMinutes(month.overtimeMinutes),
        month.absenceDays,
        month.justifiedDays,
      ]),
    });
  };

  const handleExportMonthlyBreakdownPdf = () => {
    exportTableToPdf({
      companyName,
      title: 'Espelho Mensal Consolidado',
      subtitle: `Periodo base ${filters.startDate} ate ${filters.endDate} | Empresa ${summaryData?.company?.tradeName || summaryData?.company?.legalName || 'Nao configurada'}`,
      fileName: `espelho-mensal-${todayKey()}.pdf`,
      columns: ['Mes', 'Trabalhadas', 'Exigidas', 'A Trabalhar (Déficit)', 'Extras', 'Faltas', 'Justificadas'],
      rows: (summaryData?.bankHours.monthlyBreakdown ?? []).map((month: { month: string; workedMinutes: number; expectedMinutes: number; requiredMinutes: number; balanceMinutes: number; overtimeMinutes: number; deficitMinutes: number; absenceDays: number; justifiedDays: number }) => [
        new Date(`${month.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        formatMinutes(month.workedMinutes),
        formatMinutes(month.expectedMinutes),
        formatMinutes(month.deficitMinutes),
        formatMinutes(month.overtimeMinutes),
        month.absenceDays,
        month.justifiedDays,
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Fechamento mensal"
          title="Controle de competencias da operacao"
          note="Competencias fechadas bloqueiam alteracoes de marcacao e revisao de solicitacoes ate reabertura."
          aside={`Ano-base: ${reportYear}`}
        />

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ReportInsightCard label="Competencias fechadas" value={closedCompetencies} description="Meses ja consolidados para conferencia e folha." />
            <ReportInsightCard label="Competencias abertas" value={openCompetencies} description="Meses ainda sujeitos a ajustes e validacoes." />
            <ReportInsightCard label="Ultimo fechamento" value={latestClosedCompetency} description="Referencia mais recente consolidada no sistema." />
          </div>
          <div className="hidden overflow-x-auto md:block border border-[#ebe8e8] rounded-xl mt-5">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Competencia</th>
                  <th>Status</th>
                  <th>Trabalhadas</th>
                  <th>Carga Mensal</th>
                  <th>A Trabalhar (Déficit)</th>
                  <th>Horas Extras</th>
                  <th>Fechado por</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {monthlyClosureRows.map((item: { periodMonth: string; periodLabel: string; periodStart: string; periodEnd: string; status: string; snapshot?: { bankHours?: { workedMinutesTotal?: number; requiredMinutesTotal?: number; expectedMinutesTotal?: number; balanceMinutesTotal?: number; overtimeMinutes?: number; deficitMinutes?: number } }; closedByName?: string; closedAt?: string; canClose: boolean; canReopen: boolean; notes?: string }) => {
                  const liveMonthData = summaryData?.bankHours?.monthlyBreakdown?.find(m => m.month === item.periodMonth);
                  const snapshotBankHours = item.snapshot?.bankHours;
                  const shouldUseSnapshot = item.status === 'closed' && Boolean(snapshotBankHours);
                  
                  const workedMinutes = shouldUseSnapshot
                    ? (snapshotBankHours?.workedMinutesTotal ?? 0)
                    : (liveMonthData?.workedMinutes ?? 0);
                    
                  const requiredMinutes = shouldUseSnapshot
                    ? (snapshotBankHours?.requiredMinutesTotal ?? snapshotBankHours?.expectedMinutesTotal ?? 0)
                    : (liveMonthData?.requiredMinutes ?? 0);
                    
                  const deficitMinutes = shouldUseSnapshot
                    ? (snapshotBankHours?.deficitMinutes ?? 0)
                    : (liveMonthData?.deficitMinutes ?? 0);
                    
                  const overtimeMinutes = shouldUseSnapshot
                    ? (snapshotBankHours?.overtimeMinutes ?? 0)
                    : (liveMonthData?.overtimeMinutes ?? 0);

                  return (
                  <tr key={item.periodMonth}>
                    <td>
                      <div className="font-medium text-[#191717]">{item.periodLabel}</div>
                      <div className="text-xs text-[#6e6a6a]">
                        {item.periodStart} ate {item.periodEnd}
                      </div>
                    </td>
                    <td>
                      <span className={`status-chip ${item.status === 'closed' ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : 'border-[#ece8e8] bg-[#f6f4f4] text-[#191717]'}`}>
                        {item.status === 'closed' ? 'Fechado' : 'Aberto'}
                      </span>
                    </td>
                    <td>{formatMinutes(workedMinutes)}</td>
                    <td>{formatMinutes(requiredMinutes)}</td>
                    <td>{formatMinutes(deficitMinutes)}</td>
                    <td>{formatMinutes(overtimeMinutes)}</td>
                    <td>
                      {item.closedByName ? (
                        <div className="text-sm text-[#191717]">
                          {item.closedByName}
                          <div className="text-xs text-[#6e6a6a]">
                            {item.closedAt ? new Date(item.closedAt).toLocaleString() : 'Sem data'}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {auth.user?.role === 'admin' && item.canClose && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleCloseMonth(item.periodMonth)}
                            disabled={closeMonthlyClosure.isPending}
                          >
                            Fechar
                          </button>
                        )}
                        {auth.user?.role === 'admin' && item.canReopen && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleReopenMonth(item.periodMonth)}
                            disabled={reopenMonthlyClosure.isPending}
                          >
                            Reabrir
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            exportTableToPdf({
                              companyName,
                              title: `Relatório de Fechamento: ${item.periodLabel}`,
                              subtitle: `Período: ${item.periodStart} até ${item.periodEnd} | Empresa: ${summaryData?.company?.tradeName || summaryData?.company?.legalName || 'Não configurada'}`,
                              fileName: `fechamento-${item.periodMonth}.pdf`,
                              columns: ['Indicador', 'Valor'],
                              rows: [
                                ['Status', item.status === 'closed' ? 'Fechado' : 'Aberto'],
                                ['Total de Horas Trabalhadas', formatMinutes(workedMinutes)],
                                ['Carga Horária Mensal Exigida', formatMinutes(requiredMinutes)],
                                ['A Trabalhar (Déficit)', formatMinutes(deficitMinutes)],
                                ['Horas Extras', formatMinutes(overtimeMinutes)],
                                ['Responsável pelo Fechamento', item.closedByName || '—'],
                                ['Data de Fechamento', item.closedAt ? new Date(item.closedAt).toLocaleString() : '—'],
                                ['Observações', item.notes || 'Nenhuma'],
                              ],
                            });
                          }}
                        >
                          Baixar Relatório
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Espelho mensal"
          title="Consolidado por competencia"
          note="Base de banco de horas, faltas e justificativas usada no fechamento."
          aside={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={handleExportMonthlyBreakdownExcel}>
                Exportar Excel
              </button>
              <button type="button" className="btn-secondary" onClick={handleExportMonthlyBreakdownPdf}>
                Exportar PDF
              </button>
            </div>
          }
        />
        <div className="overflow-x-auto border border-[#ebe8e8] rounded-xl mt-5">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Trabalhadas</th>
                <th>Exigidas</th>
                <th>Saldo</th>
                <th>Extras</th>
                <th>Deficit</th>
                <th>Faltas</th>
                <th>Justificadas</th>
              </tr>
            </thead>
            <tbody>
              {(summaryData?.bankHours?.monthlyBreakdown ?? []).map((month: { month: string; workedMinutes: number; requiredMinutes: number; balanceMinutes: number; overtimeMinutes: number; deficitMinutes: number; absenceDays: number; justifiedDays: number }) => (
                <tr key={month.month}>
                  <td className="font-medium text-[#191717]">
                    {new Date(`${month.month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </td>
                  <td>{formatMinutes(month.workedMinutes)}</td>
                  <td>{formatMinutes(month.requiredMinutes)}</td>
                  <td>{formatMinutes(month.balanceMinutes)}</td>
                  <td>{formatMinutes(month.overtimeMinutes)}</td>
                  <td>{formatMinutes(month.deficitMinutes)}</td>
                  <td>{month.absenceDays}</td>
                  <td>{month.justifiedDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="individual-closing" className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Fechamento individual"
          title="Conferencia por colaborador"
          note="Selecione um colaborador no filtro geral ou na area de RH para montar a conferencia individual."
          aside={
            <div className="flex flex-col items-end gap-2">
              <span className="text-sm font-medium text-[#191717]">
                {selectedAttendanceUser ? selectedAttendanceUser.name : 'Nenhum colaborador selecionado'}
              </span>
              {selectedAttendanceUser && (
                <button
                  type="button"
                  className="btn-secondary text-xs px-2.5 py-1.5"
                  onClick={() => {
                    exportTableToPdf({
                      companyName,
                      title: `Fechamento Individual: ${selectedAttendanceUser.name}`,
                      subtitle: `Periodo: ${filters.startDate} ate ${filters.endDate} | Matrícula: ${selectedAttendanceUser.registrationNumber || '—'} | Setor: ${selectedAttendanceUser.departmentName}`,
                      fileName: `fechamento-${selectedAttendanceUser.name.toLowerCase().replace(/\s+/g, '-')}-${todayKey()}.pdf`,
                      columns: ['Indicador', 'Valor', 'Detalhe'],
                      rows: [
                        ['Saldo consolidado', formatMinutes(selectedAttendanceUser.bankHours.balanceMinutesTotal), 'Resultado final do banco de horas'],
                        ['Horas extras', formatMinutes(Math.max(selectedAttendanceUser.bankHours.balanceMinutesTotal, 0)), 'Carga excedente validada'],
                        ['Deficit', formatMinutes(Math.abs(Math.min(selectedAttendanceUser.bankHours.balanceMinutesTotal, 0))), 'Tempo abaixo do previsto'],
                        ['Dias presentes', String(selectedAttendanceUser.daysPresent), 'Presencas confirmadas'],
                        ['Dias completos', String(selectedAttendanceUser.bankHours.completeDays), 'Jornadas fechadas sem pendencia'],
                        ['Ausencias', `${selectedAttendanceUser.bankHours.absenceDays} totais / ${selectedAttendanceUser.bankHours.justifiedDays} justificadas`, 'Faltas e afastamentos'],
                        ['Pendencias abertas', String(selectedAttendanceUser.pendingApprovals), 'Aguardando aprovacao'],
                        ['Registros ajustados', String(selectedAttendanceUser.adjustedRecords), 'Marcacoes alteradas manualmente'],
                        ['Falhas biometricas', String(selectedAttendanceUser.biometricFailures), 'Problemas de validacao facial'],
                        ['Jornada Prevista', `${selectedAttendanceUser.schedule?.entry_time || '—'} as ${selectedAttendanceUser.schedule?.exit_time || '—'}`, 'Horario padrao'],
                      ],
                    });
                  }}
                >
                  Exportar Resumo PDF
                </button>
              )}
            </div>
          }
        />
        {!filters.userId ? (
          <div className="py-16 text-center text-[#6e6a6a]">
            Selecione um colaborador no filtro do painel para abrir o fechamento individual.
          </div>
        ) : !selectedAttendanceUser ? (
          <div className="py-16 text-center text-[#6e6a6a]">
            Nenhum dado consolidado encontrado para o colaborador selecionado nesse periodo.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="surface-muted p-4 text-sm leading-6 text-[#6e6a6a]">
              <span className="font-semibold text-[#191717]">{selectedAttendanceUser.name}</span>
              {' • '}
              Matrícula: {selectedAttendanceUser.registrationNumber || 'Sem matrícula'}
              {' • '}
              Setor: {selectedAttendanceUser.departmentName}
              {' • '}
              Gestor: {selectedAttendanceUser.managerName}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <ReportInsightCard label="Saldo consolidado" value={formatMinutes(selectedAttendanceUser.bankHours.balanceMinutesTotal)} description="Resultado final do banco de horas no periodo." />
              <ReportInsightCard label="Horas Extras" value={formatMinutes(Math.max(selectedAttendanceUser.bankHours.balanceMinutesTotal, 0))} description="Tempo total excedente no periodo." />
              <ReportInsightCard label="Faltam (Déficit)" value={formatMinutes(Math.abs(Math.min(selectedAttendanceUser.bankHours.balanceMinutesTotal, 0)))} description="Total de horas a compensar no periodo." />
              <ReportInsightCard label="Dias completos" value={selectedAttendanceUser.bankHours.completeDays} description="Jornadas fechadas sem pendencia no periodo." />
              <ReportInsightCard label="Ausencias" value={`${selectedAttendanceUser.bankHours.absenceDays} / ${selectedAttendanceUser.bankHours.justifiedDays}`} description="Ausencias totais e justificadas." />
            </div>
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="surface-muted p-5">
                <div className="metric-label">Checklist de fechamento</div>
                <div className="mt-4 space-y-3 text-sm text-[#393636]">
                  <div>Presencas confirmadas: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.daysPresent} dia(s)</span></div>
                  <div>Pendencias abertas: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.pendingApprovals}</span></div>
                  <div>Registros ajustados: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.adjustedRecords}</span></div>
                  <div>Registros rejeitados: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.rejectedRecords}</span></div>
                  <div>Fallback por PIN: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.pinFallbacks}</span></div>
                  <div>Falhas biometricas: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.biometricFailures}</span></div>
                </div>
              </div>
              <div className="surface-muted p-5">
                <div className="metric-label">Jornada e ultimo saldo diario</div>
                <div className="mt-4 space-y-3 text-sm text-[#393636]">
                  <div>Entrada prevista: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.schedule?.entry_time || '—'}</span></div>
                  <div>Saida prevista: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.schedule?.exit_time || '—'}</span></div>
                  <div>Carga diaria: <span className="font-semibold text-[#191717]">{formatMinutes(selectedAttendanceUser.schedule?.daily_workload_minutes ?? 0)}</span></div>
                  <div>Primeiro registro: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.firstRecordAt ? new Date(selectedAttendanceUser.firstRecordAt).toLocaleString() : '—'}</span></div>
                  <div>Ultimo registro: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.lastRecordAt ? new Date(selectedAttendanceUser.lastRecordAt).toLocaleString() : '—'}</span></div>
                  <div>Ultimo saldo diario: <span className="font-semibold text-[#191717]">{selectedAttendanceUser.bankHours.latestDailyBalance ? `${selectedAttendanceUser.bankHours.latestDailyBalance.date} • ${formatMinutes(selectedAttendanceUser.bankHours.latestDailyBalance.balanceMinutes)}` : '—'}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
