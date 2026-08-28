import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { requestsApi } from '../../services/requestsApi';
import { requestTypeLabel } from './dashboardUtils';
import RequestReviewModal from './RequestReviewModal';

export default function ReviewQueue() {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<{
    id: number;
    request_type: string;
    status: string;
    target_date: string;
    User?: { name: string };
    requested_entry_time?: string | null;
    requested_lunch_start?: string | null;
    requested_lunch_end?: string | null;
    requested_exit_time?: string | null;
    absence_start_time?: string | null;
    absence_end_time?: string | null;
    reason?: string;
    attachment_url?: string | null;
  } | null>(null);
  const [filters, setFilters] = useState({
    status: 'pending' as 'pending' | 'approved' | 'rejected' | 'all',
    requestType: '' as '' | 'time_adjustment' | 'medical_certificate' | 'declaration' | 'vacation' | 'day_off',
  });

  const queue = useQuery({
    queryKey: ['requests', 'reviewQueue', filters.status, filters.requestType],
    queryFn: async () => {
      const res = await requestsApi.reviewQueue({
        status: filters.status === 'all' ? undefined : filters.status,
        requestType: filters.requestType || undefined,
      });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return requestsApi.delete(id);
    },
    onSuccess: () => {
      toast.success('Solicitação excluída com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['records'] });
      queryClient.invalidateQueries({ queryKey: ['pending'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Erro ao excluir solicitação.');
    },
  });

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir esta solicitação? Esta ação atualizará o banco de horas do colaborador.')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <section id="review-queue" className="surface-panel p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Gestão</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Fila de Revisão</h3>
        </div>
        <div className="text-sm text-[#6e6a6a]">Aprovações e histórico de solicitações do colaborador.</div>
      </div>

      <div className="mb-5 grid gap-4 border-b border-[#ece8e8] pb-5 md:grid-cols-[0.9fr_1.1fr_auto]">
        <div>
          <label className="field-label">Status</label>
          <select className="field-input" value={filters.status} onChange={(e) => setFilters((state) => ({ ...state, status: e.target.value as typeof filters.status }))}>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Rejeitadas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        <div>
          <label className="field-label">Tipo</label>
          <select className="field-input" value={filters.requestType} onChange={(e) => setFilters((state) => ({ ...state, requestType: e.target.value as typeof filters.requestType }))}>
            <option value="">Todos os tipos</option>
            <option value="time_adjustment">Ajuste de ponto</option>
            <option value="medical_certificate">Atestado</option>
            <option value="declaration">Declaração</option>
            <option value="vacation">Férias</option>
            <option value="day_off">Folga</option>
            <option value="external_work">Trabalho Externo</option>
          </select>
        </div>
        <div className="flex items-end text-sm text-[#6e6a6a]">
          {(queue.data?.length ?? 0)} item(ns) encontrado(s)
        </div>
      </div>

      {queue.isLoading ? (
        <div className="py-16 text-center text-[#6e6a6a]">Carregando fila...</div>
      ) : (queue.data?.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-[#6e6a6a]">Nenhuma solicitação pendente no momento.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Data Alvo</th>
                <th>Tipo</th>
                <th>Período abonado</th>
                <th>Motivo</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {queue.data?.map((req) => (
                <tr key={req.id}>
                  <td className="font-medium text-[#191717]">{req.requester?.name}</td>
                  <td>{new Date(req.target_date + 'T12:00:00Z').toLocaleDateString()}</td>
                  <td>
                    <span className={`status-chip ${req.status === 'approved' ? 'border-[#dceaea] bg-[#edf8f8] text-[#026666]' : req.status === 'rejected' ? 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]' : 'border-[#e8e4e4] bg-[#f6f4f4] text-[#191717]'}`}>
                      {requestTypeLabel(req.request_type)}
                    </span>
                  </td>
                  <td>{req.request_type === 'declaration' && req.absence_start_time && req.absence_end_time ? `${req.absence_start_time} às ${req.absence_end_time}` : '—'}</td>
                  <td className="max-w-[200px] truncate">{req.reason}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedRequest(req)} className="btn-secondary px-3 py-1.5 text-xs">
                        {req.status === 'pending' ? 'Revisar' : 'Detalhes'}
                      </button>
                      <button
                        onClick={() => handleDelete(req.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded-lg p-1.5 text-[#b43737] hover:bg-[#fbf1f1] transition-colors"
                        title="Excluir solicitação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRequest && (
        <RequestReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onSuccess={() => {
            setSelectedRequest(null);
            queryClient.invalidateQueries({ queryKey: ['requests'] });
            queryClient.invalidateQueries({ queryKey: ['records'] });
            queryClient.invalidateQueries({ queryKey: ['pending'] });
          }}
        />
      )}
    </section>
  );
}
