import { FileText, PlusCircle } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { requestsApi } from '../../services/requestsApi';
import { recordsApi } from '../../services/recordsApi';
import {
  requestStatusClass,
  requestStatusLabel,
  requestTypeLabel,
} from '../../components/dashboard/dashboardUtils';
import { ProtectedAttachmentLink } from '../../components/dashboard/ProtectedFile';
import RequestAdjustmentModal from '../../components/dashboard/RequestAdjustmentModal';
import { useAuthStore } from '../../stores/authStore';

export default function MyRequestsPage() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  const myRequests = useQuery({
    queryKey: ['requests', 'my'],
    queryFn: async () => {
      const res = await requestsApi.my();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const myRecords = useQuery({
    queryKey: ['records', 'me'],
    queryFn: async () => {
      const res = await recordsApi.myRecords();
      return res.data;
    },
    enabled: !!auth.token,
  });

  const pendingCount = (myRequests.data ?? []).filter((request) => request.status === 'pending').length;

  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="border-b border-[#e7e4e4] p-5 md:p-6 xl:border-b-0 xl:border-r">
            <div className="page-eyebrow">Solicitações</div>
            <h2 className="page-title">Pedidos, acompanhamento e histórico</h2>
            <p className="page-description">
              Centralize ajustes, documentos e acompanhamentos sem misturar com a consulta do espelho de ponto.
            </p>
          </div>
          <div className="p-5 md:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Situação atual</div>
            <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">{pendingCount} pendente(s)</div>
            <div className="mt-2 text-sm leading-6 text-[#6e6a6a]">
              Use esta área para criar novos pedidos e acompanhar o retorno do gestor ou RH.
            </div>
            <button onClick={() => setIsRequestModalOpen(true)} className="btn-primary mt-5">
              <PlusCircle className="h-4 w-4" />
              Criar Solicitação
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Pendentes</div>
            <FileText className="h-5 w-5 text-[#191717]" />
          </div>
          <div className="metric-value">{pendingCount}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Aguardando análise.</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Aprovadas</div>
            <FileText className="h-5 w-5 text-[#026666]" />
          </div>
          <div className="metric-value">{(myRequests.data ?? []).filter((request) => request.status === 'approved').length}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Já concluídas no fluxo.</div>
        </div>
        <div className="metric-card">
          <div className="flex items-center justify-between">
            <div className="metric-label">Rejeitadas</div>
            <FileText className="h-5 w-5 text-[#b43737]" />
          </div>
          <div className="metric-value">{(myRequests.data ?? []).filter((request) => request.status === 'rejected').length}</div>
          <div className="mt-2 text-sm text-[#6e6a6a]">Pedidos com devolutiva negativa.</div>
        </div>
      </section>

      <section className="surface-panel p-6">
        <div className="mb-5 flex flex-col gap-3 border-b border-[#ece8e8] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Histórico</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Minhas solicitações</h3>
          </div>
          <div className="text-sm text-[#6e6a6a]">Acompanhe status, motivo e comentário do aprovador.</div>
        </div>

        {!auth.token ? (
          <div className="py-16 text-center text-[#6e6a6a]">Faça login para visualizar suas solicitações.</div>
        ) : myRequests.isLoading ? (
          <div className="py-16 text-center text-[#6e6a6a]">Carregando solicitações...</div>
        ) : (myRequests.data?.length ?? 0) === 0 ? (
          <div className="py-16 text-center text-[#6e6a6a]">Nenhuma solicitação registrada até o momento.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Data alvo</th>
                  <th>Status</th>
                  <th>Período abonado</th>
                  <th>Motivo</th>
                  <th>Anexo</th>
                  <th>Comentário RH</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.data?.map((request) => (
                  <tr key={request.id}>
                    <td className="font-medium text-[#191717]">{requestTypeLabel(request.request_type)}</td>
                    <td>{new Date(`${request.target_date}T12:00:00`).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-chip ${requestStatusClass(request.status)}`}>
                        {requestStatusLabel(request.status)}
                      </span>
                    </td>
                    <td>{request.request_type === 'declaration' && request.absence_start_time && request.absence_end_time ? `${request.absence_start_time} às ${request.absence_end_time}` : '—'}</td>
                    <td className="max-w-[220px] truncate">{request.reason}</td>
                    <td>
                      {request.attachment_url ? (
                        <ProtectedAttachmentLink
                          requestId={request.id}
                          sourceUrl={request.attachment_url}
                          className="font-semibold text-[#026666] hover:underline"
                        >
                          {request.attachment_name || 'Abrir arquivo'}
                        </ProtectedAttachmentLink>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[220px] truncate">{request.admin_comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isRequestModalOpen && (
        <RequestAdjustmentModal
          onClose={() => setIsRequestModalOpen(false)}
          onSuccess={() => {
            setIsRequestModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['records', 'me'] });
            queryClient.invalidateQueries({ queryKey: ['requests', 'my'] });
            toast.success('Solicitação enviada com sucesso!');
          }}
          myRecords={myRecords.data || []}
        />
      )}
    </div>
  );
}
