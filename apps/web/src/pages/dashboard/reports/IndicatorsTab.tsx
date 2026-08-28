import { useOutletContext } from 'react-router-dom';
import { type ReportsContextType } from './ReportsLayout';
import { ReportInsightCard, ReportSectionHeader, ReportStatCard, exportTableToPdf } from './reportsHelpers';
import { formatMinutes, todayKey } from '../../../components/dashboard/dashboardUtils';

export default function IndicatorsTab() {
  const { companyName, filters, summaryData, biometricData, attendanceData, monthlyClosureRows } = useOutletContext<ReportsContextType>();

  const negativeBalanceCount = attendanceData.filter((item: { bankHours: { balanceMinutesTotal: number } }) => item.bankHours.balanceMinutesTotal < 0).length;
  const closedCompetencies = monthlyClosureRows.filter((item: { status: string }) => item.status === 'closed').length;

  const handleExportPdf = () => {
    const departments = summaryData?.departmentBreakdown ?? [];
    exportTableToPdf({
      companyName,
      title: 'Indicadores de RH',
      subtitle: `Período ${filters.startDate} até ${filters.endDate}`,
      fileName: `indicadores-rh-${todayKey()}.pdf`,
      orientation: 'landscape',
      columns: ['Categoria', 'Indicador / Setor', 'Total', 'Presentes', 'Faltantes', 'Detalhe'],
      rows: [
        ['Resumo', 'Pendências', summaryData?.metrics?.pendingApprovals ?? 0, '—', '—', 'Aguardando análise'],
        ['Resumo', 'Banco de horas', formatMinutes(summaryData?.bankHours?.balanceMinutesTotal ?? 0), '—', '—', 'Saldo consolidado'],
        ['Resumo', 'Horas extras', formatMinutes(summaryData?.bankHours?.overtimeMinutes ?? 0), '—', '—', 'Carga excedente'],
        ['Resumo', 'Déficit', formatMinutes(summaryData?.bankHours?.deficitMinutes ?? 0), '—', '—', 'Carga abaixo do previsto'],
        ['Risco', 'Falhas faciais', biometricData?.recentVerificationFailures ?? 0, '—', '—', 'Ocorrências biométricas recentes'],
        ['Risco', 'Colaboradores com saldo negativo', negativeBalanceCount, '—', '—', 'Exigem acompanhamento'],
        ['Fechamento', 'Competências fechadas', closedCompetencies, '—', '—', 'Períodos consolidados'],
        ...departments.map((department) => [
          'Setor', department.departmentName, department.totalEmployees, department.presentToday,
          department.missingToday, `${department.lateToday} atraso(s) · ${department.pendingApprovals} pendência(s)`,
        ]),
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStatCard
          label="Presentes hoje"
          value={summaryData?.metrics?.presentToday ?? 0}
          description="Colaboradores com marcacao registrada no dia."
        />
        <ReportStatCard
          label="Faltantes"
          value={summaryData?.metrics?.missingToday ?? 0}
          description="Ausencias operacionais que precisam de acompanhamento."
        />
        <ReportStatCard
          label="Pendencias"
          value={summaryData?.metrics?.pendingApprovals ?? 0}
          description="Ajustes, excecoes e revisoes ainda sem decisao."
        />
        <ReportStatCard
          label="Banco de horas"
          value={<span className="text-[2rem]">{formatMinutes(summaryData?.bankHours?.balanceMinutesTotal ?? 0)}</span>}
          description="Saldo consolidado do periodo selecionado."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="section-card">
          <ReportSectionHeader
            eyebrow="Resumo executivo"
            title="Indicadores principais de RH"
            note="Leitura prioritaria para entender capacidade, faltas, atrasos e saldo do periodo."
            aside={<button type="button" className="btn-secondary" onClick={handleExportPdf}>Exportar PDF</button>}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <ReportInsightCard label="Adicional noturno" value={formatMinutes(summaryData?.bankHours?.nightMinutesTotal ?? 0)} description="Minutos elegiveis para tratamento noturno." />
            <ReportInsightCard label="Horas extras" value={formatMinutes(summaryData?.bankHours?.overtimeMinutes ?? 0)} description="Carga excedente consolidada no periodo." />
            <ReportInsightCard label="Deficit" value={formatMinutes(summaryData?.bankHours?.deficitMinutes ?? 0)} description="Tempo abaixo do previsto nas jornadas." />
            <ReportInsightCard label="Feriados trabalhados" value={formatMinutes(summaryData?.bankHours?.holidayWorkedMinutes ?? 0)} description="Base de compensacao e adicional." />
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr><th>Setor</th><th>Total</th><th>Presentes</th><th>Faltantes</th><th>Atrasos</th><th>Pendencias</th></tr>
              </thead>
              <tbody>
                {summaryData?.departmentBreakdown?.map((department: {
                  departmentId?: string | number;
                  departmentName: string;
                  totalEmployees: number;
                  presentToday: number;
                  missingToday: number;
                  lateToday: number;
                  pendingApprovals: number;
                }) => (
                  <tr key={`${department.departmentId ?? 'none'}-${department.departmentName}`}>
                    <td className="font-medium text-[#191717]">{department.departmentName}</td>
                    <td>{department.totalEmployees}</td>
                    <td>{department.presentToday}</td>
                    <td>{department.missingToday}</td>
                    <td>{department.lateToday}</td>
                    <td>{department.pendingApprovals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section-card">
          <ReportSectionHeader
            eyebrow="Radar de risco"
            title="Sinais que exigem acompanhamento"
            note="Destaque para o que pode impactar operacao, fechamento ou seguranca."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <ReportInsightCard label="Documentos pendentes" value={summaryData?.absenceDocumentStats?.pending ?? 0} description="Itens ainda aguardando parecer." />
            <ReportInsightCard label="Saldo negativo" value={negativeBalanceCount} description="Colaboradores com deficit no periodo." />
            <ReportInsightCard label="Falhas faciais" value={biometricData?.recentVerificationFailures ?? 0} description="Leituras recusadas com impacto operacional." />
            <ReportInsightCard label="Competencias fechadas" value={closedCompetencies} description="Meses consolidados e bloqueados para alteracao." />
          </div>
        </section>
      </div>
    </div>
  );
}
