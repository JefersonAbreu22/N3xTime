import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import { reportsApi } from '../../services/reportsApi';
import { methodLabel, recordTypeLabel, todayKey } from './dashboardUtils';
import RecordReviewModal from './RecordReviewModal';

export default function RecordExceptionQueue() {
  const queryClient = useQueryClient();
  const [selectedRecord, setSelectedRecord] = useState<{
    id: number;
    userName: string;
    recordTime: string;
    recordType: string;
    method: string;
    trustLevel?: string;
    gpsAccuracy?: number;
    reviewReason?: string;
    mapUrl?: string | null;
    photoUrl?: string | null;
  } | null>(null);
  const [filters, setFilters] = useState({
    method: 'all' as 'all' | 'facial' | 'pin' | 'manual' | 'web',
    search: '',
  });

  const report = useQuery({
    queryKey: ['reports', 'exceptions-today'],
    queryFn: async () => reportsApi.hrSummary({ startDate: todayKey(), endDate: todayKey() }),
  });

  const exceptions = (report.data?.data.exceptionQueue ?? []).filter((record) => {
    const matchesMethod = filters.method === 'all' || record.method === filters.method;
    const query = filters.search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      record.userName.toLowerCase().includes(query) ||
      recordTypeLabel(record.recordType).toLowerCase().includes(query) ||
      (record.reviewReason || '').toLowerCase().includes(query);
    return matchesMethod && matchesSearch;
  });

  const getTrustBadge = (level: string) => {
    if (level === 'high') {
      return <div title="Alta Confiança (Biometria)" className="flex items-center justify-center text-green-600"><ShieldCheck className="h-4 w-4" /></div>;
    }
    if (level === 'low') {
      return <div title="Baixa Confiança (Risco de Fraude)" className="flex items-center justify-center text-red-600"><ShieldAlert className="h-4 w-4" /></div>;
    }
    return <div title="Média Confiança (GPS+Foto)" className="flex items-center justify-center text-yellow-500"><Shield className="h-4 w-4" /></div>;
  };

  return (
    <section id="record-exception-queue" className="surface-panel p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Exceções de ponto</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Marcações pendentes de tratamento</h3>
        </div>
        <div className="text-sm text-[#6e6a6a]">Aprove, rejeite ou ajuste manualmente as batidas marcadas como exceção.</div>
      </div>

      <div className="mb-5 grid gap-4 border-b border-[#ece8e8] pb-5 md:grid-cols-[0.8fr_1.2fr_auto]">
        <div>
          <label className="field-label">Método</label>
          <select className="field-input" value={filters.method} onChange={(e) => setFilters((state) => ({ ...state, method: e.target.value as typeof filters.method }))}>
            <option value="all">Todos</option>
            <option value="facial">Facial</option>
            <option value="pin">PIN</option>
            <option value="manual">Manual</option>
            <option value="web">Web</option>
          </select>
        </div>
        <div>
          <label className="field-label">Busca</label>
          <input className="field-input" placeholder="Colaborador, tipo ou motivo" value={filters.search} onChange={(e) => setFilters((state) => ({ ...state, search: e.target.value }))} />
        </div>
        <div className="flex items-end text-sm text-[#6e6a6a]">
          {exceptions.length} exceção(ões)
        </div>
      </div>

      {report.isLoading ? (
        <div className="py-16 text-center text-[#6e6a6a]">Carregando exceções...</div>
      ) : exceptions.length === 0 ? (
        <div className="py-16 text-center text-[#6e6a6a]">Nenhuma marcação pendente de tratamento no momento.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 text-center">Nível</th>
                <th>Colaborador</th>
                <th>Hora</th>
                <th>Tipo</th>
                <th>Método</th>
                <th>Motivo</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((record) => (
                <tr key={record.id} className={record.trustLevel === 'low' ? 'bg-red-50/50' : ''}>
                  <td className="text-center">{getTrustBadge(record.trustLevel || 'medium')}</td>
                  <td className="font-medium text-[#191717]">
                    {record.userName}
                    {record.gpsAccuracy && record.gpsAccuracy > 100 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
                        GPS Impreciso
                      </span>
                    )}
                  </td>
                  <td>{new Date(record.recordTime).toLocaleString()}</td>
                  <td>{recordTypeLabel(record.recordType)}</td>
                  <td>{methodLabel(record.method)}</td>
                  <td className="max-w-[220px] truncate">{record.reviewReason || 'Pendente de avaliação'}</td>
                  <td>
                    <button onClick={() => setSelectedRecord(record)} className="btn-secondary px-3 py-1.5 text-xs">
                      Tratar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRecord && (
        <RecordReviewModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onSuccess={() => {
            setSelectedRecord(null);
            queryClient.invalidateQueries({ queryKey: ['reports'] });
            queryClient.invalidateQueries({ queryKey: ['records'] });
            queryClient.invalidateQueries({ queryKey: ['pending'] });
          }}
        />
      )}
    </section>
  );
}
