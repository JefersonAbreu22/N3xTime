import { useOutletContext } from 'react-router-dom';
import { type ReportsContextType } from './ReportsLayout';
import { ReportInsightCard, ReportSectionHeader, downloadHtmlAsExcel, exportTableToPdf } from './reportsHelpers';
import { requestStatusLabel, requestTypeLabel, requestStatusClass, todayKey } from '../../../components/dashboard/dashboardUtils';
import { ProtectedAttachmentLink } from '../../../components/dashboard/ProtectedFile';

export default function RequestsTab() {
  const { companyName, filters, summaryData } = useOutletContext<ReportsContextType>();

  const handleExportExcel = () => {
    downloadHtmlAsExcel({
      title: 'Solicitações e Ajustes',
      subtitle: `Período ${filters.startDate} até ${filters.endDate}`,
      fileName: `solicitacoes-ajustes-${todayKey()}.xls`,
      columns: ['Colaborador', 'Matrícula', 'Setor', 'Tipo', 'Data', 'Período abonado', 'Status', 'Anexo', 'Revisado por', 'Motivo/Observação'],
      rows: (summaryData?.absenceDocuments ?? []).map((document) => [
        document.userName,
        document.registrationNumber || '-',
        document.departmentName || '-',
        requestTypeLabel(document.requestType),
        new Date(`${document.targetDate}T12:00:00`).toLocaleDateString('pt-BR'),
        document.absenceStartTime && document.absenceEndTime ? `${document.absenceStartTime} às ${document.absenceEndTime}` : '-',
        requestStatusLabel(document.status),
        document.attachmentName || 'Sem anexo',
        document.reviewedByName || 'Pendente',
        document.reason || '-',
      ]),
    });
  };

  const handleExportPdf = () => {
    exportTableToPdf({
      companyName,
      title: 'Solicitações e Ajustes',
      subtitle: `Período ${filters.startDate} até ${filters.endDate}`,
      fileName: `solicitacoes-ajustes-${todayKey()}.pdf`,
      columns: ['Colaborador', 'Matrícula', 'Setor', 'Tipo', 'Data', 'Período abonado', 'Status', 'Anexo', 'Revisado por'],
      rows: (summaryData?.absenceDocuments ?? []).map((document) => [
        document.userName,
        document.registrationNumber || '-',
        document.departmentName || '-',
        requestTypeLabel(document.requestType),
        new Date(`${document.targetDate}T12:00:00`).toLocaleDateString('pt-BR'),
        document.absenceStartTime && document.absenceEndTime ? `${document.absenceStartTime} às ${document.absenceEndTime}` : '-',
        requestStatusLabel(document.status),
        document.attachmentName || 'Sem anexo',
        document.reviewedByName || 'Pendente',
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Gestão de Ponto e Ausências"
          title="Central de Solicitações do RH"
          note="Acompanhe atestados, declarações, férias, folgas e ajustes de ponto lançados ou solicitados pelos colaboradores."
          aside={
            <div className="flex flex-wrap justify-end gap-2">
              <span className="self-center mr-3 font-medium text-[#026666] bg-[#edf8f8] px-3 py-1 rounded-full text-sm">
                {summaryData?.absenceDocumentStats?.total ?? 0} registro(s) encontrados
              </span>
              <button type="button" className="btn-secondary" onClick={handleExportExcel}>
                Exportar Excel
              </button>
              <button type="button" className="btn-secondary" onClick={handleExportPdf}>
                Exportar PDF
              </button>
            </div>
          }
        />
        
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 mt-5">
          <ReportInsightCard label="Pendentes" value={summaryData?.absenceDocumentStats?.pending ?? 0} description="Aguardando analise." />
          <ReportInsightCard label="Aprovados" value={summaryData?.absenceDocumentStats?.approved ?? 0} description="Aceitos no fluxo." />
          <ReportInsightCard label="Rejeitados" value={summaryData?.absenceDocumentStats?.rejected ?? 0} description="Recusados pelo RH." />
          <ReportInsightCard label="Ajustes de Ponto" value={summaryData?.absenceDocumentStats?.timeAdjustments ?? 0} description="Correções manuais." />
          <ReportInsightCard label="Com anexo" value={summaryData?.absenceDocumentStats?.withAttachment ?? 0} description="Evidencia anexada." />
          <ReportInsightCard label="Férias/Folgas" value={(summaryData?.absenceDocumentStats?.vacations ?? 0) + (summaryData?.absenceDocumentStats?.dayOffs ?? 0)} description="Ausencia planejada." />
        </div>

        <div className="mt-6 overflow-x-auto border border-[#ebe8e8] rounded-xl bg-white shadow-sm">
          <table className="data-table">
            <thead>
              <tr className="bg-[#fcfbfb]">
                <th>Colaborador</th>
                <th>Setor / Matrícula</th>
                <th>Tipo de Solicitação</th>
                <th>Data Alvo</th>
                <th>Período abonado</th>
                <th>Motivo / Observação</th>
                <th>Anexo</th>
                <th>Revisado por</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaryData?.absenceDocuments?.map((document) => (
                <tr key={document.id} className="hover:bg-[#fcfbfb] transition-colors">
                  <td className="font-medium text-[#191717]">{document.userName}</td>
                  <td>
                    <div className="text-sm text-[#191717]">{document.departmentName || '-'}</div>
                    <div className="text-xs text-[#6e6a6a]">{document.registrationNumber || 'Sem matrícula'}</div>
                  </td>
                  <td>
                    <span className="font-medium text-[#4a4747]">{requestTypeLabel(document.requestType)}</span>
                  </td>
                  <td>
                    <div className="font-medium text-[#191717]">{new Date(`${document.targetDate}T12:00:00`).toLocaleDateString('pt-BR')}</div>
                  </td>
                  <td>{document.absenceStartTime && document.absenceEndTime ? `${document.absenceStartTime} às ${document.absenceEndTime}` : '-'}</td>
                  <td className="max-w-[200px] truncate text-sm text-[#6e6a6a]" title={document.reason || ''}>
                    {document.reason || '-'}
                  </td>
                  <td>
                    {document.attachmentUrl ? (
                      <ProtectedAttachmentLink requestId={document.id} sourceUrl={document.attachmentUrl} className="inline-flex items-center gap-1 font-semibold text-[#026666] hover:underline">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        Abrir
                      </ProtectedAttachmentLink>
                    ) : (
                      <span className="text-[#a09c9c] text-sm">Sem anexo</span>
                    )}
                  </td>
                  <td className="text-sm text-[#6e6a6a]">
                    {document.reviewedByName || '-'}
                  </td>
                  <td>
                    <span className={`status-chip ${requestStatusClass(document.status)}`}>
                      {requestStatusLabel(document.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {!summaryData?.absenceDocuments?.length && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-[#6e6a6a]">
                    <div className="text-lg font-medium text-[#191717] mb-1">Nenhuma solicitação encontrada</div>
                    <p>Altere os filtros acima para buscar registros em outro período.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
