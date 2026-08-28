import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { type ReportsContextType } from './ReportsLayout';
import { ReportInsightCard, ReportSectionHeader, downloadHtmlAsExcel, exportTableToPdf } from './reportsHelpers';
import { formatMinutes, todayKey } from '../../../components/dashboard/dashboardUtils';

export default function DailyReportsTab() {
  const { companyName, filters, team, attendanceData } = useOutletContext<ReportsContextType>();
  
  const [bankHoursFilters, setBankHoursFilters] = useState({ search: '', risk: 'all' });
  const bankHoursSearchTerm = bankHoursFilters.search.trim().toLowerCase();

  const filteredAttendanceRows = useMemo(() => {
    return attendanceData.filter((item: { name: string; departmentName: string; registrationNumber: string; managerName: string; bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number; balanceMinutesTotal: number; overtimeMinutes: number; deficitMinutes: number }; pendingApprovals: number; biometricFailures: number; userId: number }) => {
      const matchesSearch = !bankHoursSearchTerm || [
        item.name,
        item.departmentName,
        item.registrationNumber,
        item.managerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(bankHoursSearchTerm);

      if (!matchesSearch) return false;

      if (bankHoursFilters.risk === 'negative' && item.bankHours.workedMinutesTotal >= item.bankHours.expectedMinutesTotal) return false;
      if (bankHoursFilters.risk === 'overtime' && item.bankHours.workedMinutesTotal <= item.bankHours.expectedMinutesTotal) return false;
      if (bankHoursFilters.risk === 'pending' && item.pendingApprovals <= 0) return false;
      if (bankHoursFilters.risk === 'biometric' && item.biometricFailures <= 0) return false;
      if (bankHoursFilters.risk === 'remote_enabled') {
        const u = team?.find((u: { id: number; remote_clock_in_enabled?: boolean }) => u.id === item.userId);
        if (!u?.remote_clock_in_enabled) return false;
      }

      return true;
    });
  }, [attendanceData, bankHoursFilters.risk, bankHoursSearchTerm, team]);

  const negativeBalanceCount = filteredAttendanceRows.filter((item: { bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number } }) => item.bankHours.workedMinutesTotal < item.bankHours.expectedMinutesTotal).length;
  const overtimeUsersCount = filteredAttendanceRows.filter((item: { bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number } }) => item.bankHours.workedMinutesTotal > item.bankHours.expectedMinutesTotal).length;
  const pendingAttendanceCount = filteredAttendanceRows.filter((item: { pendingApprovals: number }) => item.pendingApprovals > 0).length;
  const formatBalance = (minutes: number) => {
    if (minutes > 0) return `+${formatMinutes(minutes)}`;
    if (minutes < 0) return `-${formatMinutes(Math.abs(minutes))}`;
    return '0h 00m';
  };

  const handleExportAttendanceExcel = () => {
    downloadHtmlAsExcel({
      title: 'Banco de Horas por Colaborador',
      subtitle: `Período ${filters.startDate} até ${filters.endDate}`,
      fileName: `banco-horas-colaboradores-${todayKey()}.xls`,
      columns: ['Colaborador', 'Setor', 'Dias presentes', 'Pendencias', 'Trabalhadas', 'Carga do Período', 'A Trabalhar (Déficit)', 'Horas Extras', 'Saldo de horas', 'Falhas biométricas'],
      rows: filteredAttendanceRows.map((item: { name: string; departmentName: string; daysPresent: number; pendingApprovals: number; bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number; balanceMinutesTotal: number; deficitMinutes: number; overtimeMinutes: number; }; biometricFailures: number }) => [
        item.name,
        item.departmentName,
        item.daysPresent,
        item.pendingApprovals,
        formatMinutes(item.bankHours.workedMinutesTotal),
        formatMinutes(item.bankHours.expectedMinutesTotal),
        formatMinutes(item.bankHours.deficitMinutes),
        formatMinutes(item.bankHours.overtimeMinutes),
        formatBalance(item.bankHours.balanceMinutesTotal),
        item.biometricFailures,
      ]),
    });
  };

  const handleExportAttendancePdf = () => {
    exportTableToPdf({
      companyName,
      title: 'Banco de Horas por Colaborador',
      subtitle: `Período ${filters.startDate} até ${filters.endDate}`,
      fileName: `banco-horas-colaboradores-${todayKey()}.pdf`,
      columns: ['Colaborador', 'Setor', 'Dias presentes', 'Pendencias', 'Trabalhadas', 'Carga do Período', 'A Trabalhar (Déficit)', 'Horas Extras', 'Saldo de horas', 'Falhas biométricas'],
      rows: filteredAttendanceRows.map((item: { name: string; departmentName: string; daysPresent: number; pendingApprovals: number; bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number; balanceMinutesTotal: number; deficitMinutes: number; overtimeMinutes: number; }; biometricFailures: number }) => [
        item.name,
        item.departmentName,
        item.daysPresent,
        item.pendingApprovals,
        formatMinutes(item.bankHours.workedMinutesTotal),
        formatMinutes(item.bankHours.expectedMinutesTotal),
        formatMinutes(item.bankHours.deficitMinutes),
        formatMinutes(item.bankHours.overtimeMinutes),
        formatBalance(item.bankHours.balanceMinutesTotal),
        item.biometricFailures,
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Relatório de equipe"
          title="Banco de horas por usuário"
          note="Visão operacional por colaborador com filtros rápidos para horas a cumprir, excesso de jornada, pendências e risco biométrico."
          aside={<div className="font-medium text-[#026666] bg-[#edf8f8] px-3 py-1 rounded-full">{filteredAttendanceRows.length} colaborador(es) no filtro</div>}
        />
        
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <ReportInsightCard label="Com horas a cumprir" value={negativeBalanceCount} description="Colaboradores que nao atingiram a carga horaria do periodo." />
            <ReportInsightCard label="Com horas extras" value={overtimeUsersCount} description="Colaboradores que excederam a carga horaria do periodo." />
            <ReportInsightCard label="Com pendencias" value={pendingAttendanceCount} description="Casos que exigem acao operacional do RH." />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-[#f8f6f6] p-4 rounded-xl border border-[#ebe8e8]">
            <div className="grid flex-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="field-label">Buscar colaborador</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Nome, setor, matricula ou gestor"
                  value={bankHoursFilters.search}
                  onChange={(e) => setBankHoursFilters((state) => ({ ...state, search: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Filtro operacional</label>
                <select
                  className="field-input"
                  value={bankHoursFilters.risk}
                  onChange={(e) => setBankHoursFilters((state) => ({ ...state, risk: e.target.value }))}
                >
                  <option value="all">Todos</option>
                  <option value="negative">Com horas a cumprir</option>
                  <option value="remote_enabled">Ponto Remoto Habilitado</option>
                  <option value="overtime">Com horas extras</option>
                  <option value="pending">Com pendencias</option>
                  <option value="biometric">Com falhas biometricas</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={handleExportAttendanceExcel} disabled={!filteredAttendanceRows.length}>
                Exportar Excel
              </button>
              <button type="button" className="btn-secondary" onClick={handleExportAttendancePdf} disabled={!filteredAttendanceRows.length}>
                Exportar PDF
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-[#ebe8e8] rounded-xl">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Setor</th>
                  <th>Dias presentes</th>
                  <th>Trabalhadas</th>
                  <th>Carga do Período</th>
                  <th>Faltam (Déficit)</th>
                  <th>Horas Extras</th>
                  <th>Saldo de horas</th>
                  <th>Pendencias</th>
                  <th>Falhas bio</th>
                  <th>Ultimo saldo diario</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendanceRows.slice(0, 30).map((item: { userId: number; name: string; registrationNumber: string; managerName: string; departmentName: string; daysPresent: number; bankHours: { workedMinutesTotal: number; expectedMinutesTotal: number; balanceMinutesTotal: number; overtimeMinutes: number; deficitMinutes: number; latestDailyBalance?: { date: string; balanceMinutes: number } }; pendingApprovals: number; biometricFailures: number }) => (
                  <tr key={item.userId}>
                    <td>
                      <div className="font-medium text-[#191717]">{item.name}</div>
                      <div className="text-xs text-[#6e6a6a]">{item.registrationNumber || 'Sem matrícula'} • {item.managerName}</div>
                    </td>
                    <td>{item.departmentName}</td>
                    <td>{item.daysPresent}</td>
                    <td>{formatMinutes(item.bankHours.workedMinutesTotal)}</td>
                    <td>{formatMinutes(item.bankHours.expectedMinutesTotal)}</td>
                    <td>{formatMinutes(item.bankHours.deficitMinutes)}</td>
                    <td>{formatMinutes(item.bankHours.overtimeMinutes)}</td>
                    <td>
                      <span className={`font-medium ${item.bankHours.balanceMinutesTotal > 0 ? 'text-[#026666]' : item.bankHours.balanceMinutesTotal < 0 ? 'text-[#b43737]' : 'text-[#6e6a6a]'}`}>
                        {formatBalance(item.bankHours.balanceMinutesTotal)}
                      </span>
                    </td>
                    <td>{item.pendingApprovals}</td>
                    <td>{item.biometricFailures}</td>
                    <td>{item.bankHours.latestDailyBalance ? `${item.bankHours.latestDailyBalance.date} • ${formatMinutes(item.bankHours.latestDailyBalance.balanceMinutes)}` : '—'}</td>
                  </tr>
                ))}
                {!filteredAttendanceRows.length && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-[#6e6a6a]">
                      Nenhum colaborador encontrado para os filtros operacionais atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
