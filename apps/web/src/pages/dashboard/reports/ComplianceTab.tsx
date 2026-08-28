import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { type ReportsContextType } from './ReportsLayout';
import {
  ReportInsightCard,
  ReportSectionHeader,
  buildBiometricActorLabel,
  buildBiometricEventDetail,
  csvEscape,
  downloadHtmlAsExcel,
  exportTableToPdf,
} from './reportsHelpers';
import { biometricEventTypeLabel, biometricReasonLabel, todayKey } from '../../../components/dashboard/dashboardUtils';

import { type BiometricHistoryEvent } from '../../../services/authApi';

export default function ComplianceTab() {
  const { companyName, filters, biometricData, biometricHistoryRows } = useOutletContext<ReportsContextType>();
  
  const [biometricHistoryFilters, setBiometricHistoryFilters] = useState({
    eventType: 'all',
    result: 'all',
    search: '',
  });

  const parsedUserId = filters.userId ? Number(filters.userId) : null;

  const filteredBiometricHistory = useMemo(() => {
    const startTime = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : null;
    const endTime = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : null;
    const searchTerm = biometricHistoryFilters.search.trim().toLowerCase();

    return biometricHistoryRows.filter((event: BiometricHistoryEvent) => {
      const createdAt = new Date(event.created_at).getTime();
      if (startTime && createdAt < startTime) return false;
      if (endTime && createdAt > endTime) return false;

      if (parsedUserId && event.user_id !== parsedUserId) return false;

      if (biometricHistoryFilters.eventType !== 'all' && event.event_type !== biometricHistoryFilters.eventType) {
        return false;
      }

      if (biometricHistoryFilters.result === 'success' && !event.success) return false;
      if (biometricHistoryFilters.result === 'failure' && event.success) return false;

      if (!searchTerm) return true;

      const haystack = [
        event.User?.name,
        buildBiometricActorLabel(event),
        biometricEventTypeLabel(event.event_type),
        biometricReasonLabel(event.reason),
        buildBiometricEventDetail(event),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchTerm);
    });
  }, [
    biometricHistoryRows,
    biometricHistoryFilters.eventType,
    biometricHistoryFilters.result,
    biometricHistoryFilters.search,
    filters.endDate,
    filters.startDate,
    parsedUserId,
  ]);

  const handleExportBiometricHistory = () => {
    if (!filteredBiometricHistory.length) return;

    const csvLines = [
      ['Quando', 'Evento', 'Colaborador', 'Motivo', 'Detalhe', 'Acionado por', 'Resultado'],
      ...filteredBiometricHistory.map((event: BiometricHistoryEvent) => [
        new Date(event.created_at).toLocaleString(),
        biometricEventTypeLabel(event.event_type),
        event.User?.name ?? 'Sem vinculo',
        biometricReasonLabel(event.reason),
        buildBiometricEventDetail(event),
        buildBiometricActorLabel(event),
        event.success ? 'Sucesso' : 'Falha',
      ]),
    ].map((row) => row.map((value) => csvEscape(value)).join(';'));

    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico-biometrico-${todayKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExportBiometricHistoryExcel = () => {
    downloadHtmlAsExcel({
      title: 'Auditoria Biometrica',
      subtitle: `Periodo ${filters.startDate} ate ${filters.endDate} | ${filteredBiometricHistory.length} evento(s)`,
      fileName: `auditoria-biometrica-${todayKey()}.xls`,
      columns: ['Quando', 'Evento', 'Colaborador', 'Motivo', 'Detalhe', 'Acionado por', 'Resultado'],
      rows: filteredBiometricHistory.map((event: BiometricHistoryEvent) => [
        new Date(event.created_at).toLocaleString(),
        biometricEventTypeLabel(event.event_type),
        event.User?.name ?? 'Sem vinculo',
        biometricReasonLabel(event.reason),
        buildBiometricEventDetail(event),
        buildBiometricActorLabel(event),
        event.success ? 'Sucesso' : 'Falha',
      ]),
    });
  };

  const handleExportBiometricHistoryPdf = () => {
    exportTableToPdf({
      companyName,
      title: 'Auditoria Biometrica',
      subtitle: `Periodo ${filters.startDate} ate ${filters.endDate} | ${filteredBiometricHistory.length} evento(s)`,
      fileName: `auditoria-biometrica-${todayKey()}.pdf`,
      columns: ['Quando', 'Evento', 'Colaborador', 'Motivo', 'Detalhe', 'Acionado por', 'Resultado'],
      rows: filteredBiometricHistory.map((event: BiometricHistoryEvent) => [
        new Date(event.created_at).toLocaleString(),
        biometricEventTypeLabel(event.event_type),
        event.User?.name ?? 'Sem vinculo',
        biometricReasonLabel(event.reason),
        buildBiometricEventDetail(event),
        buildBiometricActorLabel(event),
        event.success ? 'Sucesso' : 'Falha',
      ]),
    });
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Biometria"
          title="Saude biometrica e risco operacional"
          note="Informacoes tecnicas e de seguranca separadas do restante do RH para facilitar leitura."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ReportInsightCard label="Cobertura" value={biometricData ? `${Math.round(biometricData.sampleCoverageRate)}%` : '—'} description="Percentual da base com cobertura biometrica adequada." />
          <ReportInsightCard label="Sem biometria" value={biometricData?.usersWithoutBiometrics ?? 0} description="Colaboradores ainda sem cadastro facial ativo." />
          <ReportInsightCard label="Baixa cobertura" value={biometricData?.usersWithLowCoverage ?? 0} description="Cadastros que pedem reforco de amostras faciais." />
          <ReportInsightCard label="Fallback PIN" value={biometricData?.pinFallbacks ?? 0} description="Volume de contingencias por PIN no periodo." />
          <ReportInsightCard label="Falhas faciais" value={biometricData?.recentVerificationFailures ?? 0} description="Leituras recusadas que exigem acompanhamento." />
          <ReportInsightCard label="PIN invalido" value={biometricData?.invalidPinAttempts ?? 0} description="Tentativas rejeitadas antes do bloqueio temporario." />
          <ReportInsightCard label="PIN bloqueado" value={biometricData?.rateLimitedPinAttempts ?? 0} description="Protecoes acionadas por excesso de falhas." />
          <ReportInsightCard label="Score recusado" value={biometricData?.lowConfidenceRejections ?? 0} description="Registros negados por confianca insuficiente." />
          <ReportInsightCard label="Resets faciais" value={biometricData?.recentResets ?? 0} description="Recadastros biometrico liberados recentemente." />
        </div>
      </section>

      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Leitura tecnica"
          title="Motivos e dispositivos"
          note="Onde o problema aparece, em qual causa e em qual terminal."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-muted p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6e6a6a]">Principais motivos</div>
            <div className="mt-4 overflow-x-auto border border-[#ebe8e8] rounded-xl">
              <table className="data-table">
                <thead>
                  <tr><th>Motivo</th><th>Ocorrências</th></tr>
                </thead>
                <tbody>
                  {(biometricData?.topFailureReasons ?? []).slice(0, 5).map((item: { reason: string; count: number }) => (
                    <tr key={item.reason}>
                      <td className="font-medium text-[#191717]">{biometricReasonLabel(item.reason)}</td>
                      <td>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="surface-muted p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6e6a6a]">Dispositivos</div>
            <div className="mt-4 overflow-x-auto border border-[#ebe8e8] rounded-xl">
              <table className="data-table">
                <thead>
                  <tr><th>Dispositivo</th><th>Sucessos</th><th>Falhas</th><th>PIN</th></tr>
                </thead>
                <tbody>
                  {(biometricData?.deviceBreakdown ?? []).slice(0, 5).map((item: { deviceLabel: string; successCount: number; failureCount: number; pinFallbackCount: number }) => (
                    <tr key={item.deviceLabel}>
                      <td className="font-medium text-[#191717]">{item.deviceLabel}</td>
                      <td>{item.successCount}</td>
                      <td>{item.failureCount}</td>
                      <td>{item.pinFallbackCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel p-5">
        <ReportSectionHeader
          eyebrow="Auditoria biometrica"
          title="Historico filtravel e exportavel"
          note="Use filtros para localizar falhas, resets, fallback por PIN e operacoes manuais."
          aside={<div className="font-medium text-[#026666] bg-[#edf8f8] px-3 py-1 rounded-full">{filteredBiometricHistory.length} evento(s) no filtro</div>}
        />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-[#f8f6f6] p-4 rounded-xl border border-[#ebe8e8]">
          <div className="grid flex-1 gap-4 lg:grid-cols-[1.1fr_0.7fr_0.7fr]">
            <div>
              <label className="field-label">Buscar</label>
              <input
                type="text"
                className="field-input"
                placeholder="Colaborador, motivo ou ator"
                value={biometricHistoryFilters.search}
                onChange={(e) => setBiometricHistoryFilters((state) => ({ ...state, search: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label">Evento</label>
              <select
                className="field-input"
                value={biometricHistoryFilters.eventType}
                onChange={(e) => setBiometricHistoryFilters((state) => ({ ...state, eventType: e.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="enrollment">Cadastro facial</option>
                <option value="verification_success">Leitura validada</option>
                <option value="verification_failure">Falha biométrica</option>
                <option value="pin_fallback">Fallback PIN</option>
                <option value="reset">Reset biométrico</option>
              </select>
            </div>
            <div>
              <label className="field-label">Resultado</label>
              <select
                className="field-input"
                value={biometricHistoryFilters.result}
                onChange={(e) => setBiometricHistoryFilters((state) => ({ ...state, result: e.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="success">Sucesso</option>
                <option value="failure">Falha</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setBiometricHistoryFilters({ eventType: 'all', result: 'all', search: '' })}>
              Limpar
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportBiometricHistory} disabled={!filteredBiometricHistory.length}>
              CSV
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportBiometricHistoryExcel} disabled={!filteredBiometricHistory.length}>
              Excel
            </button>
            <button type="button" className="btn-secondary" onClick={handleExportBiometricHistoryPdf} disabled={!filteredBiometricHistory.length}>
              PDF
            </button>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto border border-[#ebe8e8] rounded-xl">
          <table className="data-table">
            <thead>
              <tr><th>Quando</th><th>Evento</th><th>Colaborador</th><th>Detalhe</th><th>Acionado por</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {filteredBiometricHistory.slice(0, 20).map((event: BiometricHistoryEvent) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td className="font-medium text-[#191717]">{biometricEventTypeLabel(event.event_type)}</td>
                  <td>{event.User?.name ?? 'Sem vinculo'}</td>
                  <td>
                    <div className="font-medium text-[#191717]">{biometricReasonLabel(event.reason)}</div>
                    <div className="text-xs text-[#6e6a6a]">{buildBiometricEventDetail(event)}</div>
                  </td>
                  <td>{buildBiometricActorLabel(event)}</td>
                  <td>{event.success ? 'Sucesso' : 'Falha'}</td>
                </tr>
              ))}
              {!filteredBiometricHistory.length && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#6e6a6a]">
                    Nenhum evento biométrico encontrado para os filtros atuais.
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
