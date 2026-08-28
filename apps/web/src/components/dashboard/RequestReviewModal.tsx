import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { requestsApi } from '../../services/requestsApi';
import { requestTypeLabel } from './dashboardUtils';
import { ProtectedAttachmentLink } from './ProtectedFile';

export default function RequestReviewModal({
  request,
  onClose,
  onSuccess,
}: {
  request: {
    id: number;
    request_type: string;
    status: string;
    target_date: string;
    User?: { name: string };
    requester?: { name: string };
    requested_entry_time?: string | null;
    requested_lunch_start?: string | null;
    requested_lunch_end?: string | null;
    requested_exit_time?: string | null;
    absence_start_time?: string | null;
    absence_end_time?: string | null;
    reason?: string;
    attachment_url?: string | null;
    attachment_name?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    status: 'approved' as 'approved' | 'rejected',
    admin_comment: '',
    override_entry_time: request.requested_entry_time || '',
    override_lunch_start: request.requested_lunch_start || '',
    override_lunch_end: request.requested_lunch_end || '',
    override_exit_time: request.requested_exit_time || '',
    override_absence_start_time: request.absence_start_time || '',
    override_absence_end_time: request.absence_end_time || '',
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      return requestsApi.review(request.id, {
        status: form.status,
        admin_comment: form.admin_comment,
        override_entry_time: form.override_entry_time || null,
        override_lunch_start: form.override_lunch_start || null,
        override_lunch_end: form.override_lunch_end || null,
        override_exit_time: form.override_exit_time || null,
        override_absence_start_time: form.override_absence_start_time || null,
        override_absence_end_time: form.override_absence_end_time || null,
      });
    },
    onSuccess: () => {
      toast.success('Solicitação revisada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onSuccess();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Erro ao revisar solicitação');
    },
  });

  return (
    <div className="modal-shell z-[60]">
      <div className="modal-card max-h-[92vh] max-w-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Revisão RH</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Analisar Solicitação</h3>
          </div>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>

        <div className="space-y-6 p-6">
          <div className="surface-muted p-4">
            <div className="text-sm">
              <p><strong>Colaborador:</strong> {request.requester?.name}</p>
              <p><strong>Data Alvo:</strong> {new Date(request.target_date + 'T12:00:00Z').toLocaleDateString()}</p>
              <p><strong>Tipo:</strong> {requestTypeLabel(request.request_type)}</p>
              <p className="mt-2 text-[#6e6a6a]"><strong>Motivo do Colaborador:</strong></p>
              <p className="italic text-[#191717]">{request.reason}</p>
              {request.attachment_url && (
                <p className="mt-3">
                  <ProtectedAttachmentLink requestId={request.id} sourceUrl={request.attachment_url} className="font-semibold text-[#026666]">
                    {request.attachment_name || 'Abrir anexo enviado'}
                  </ProtectedAttachmentLink>
                </p>
              )}
            </div>
          </div>

          {request.request_type === 'time_adjustment' && (
            <div className="space-y-4">
              <h4 className="font-semibold text-[#191717]">Horários do Ajuste</h4>
              <p className="text-sm text-[#6e6a6a]">Você pode alterar os horários solicitados antes de aprovar.</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="field-label">Entrada</label>
                  <input type="time" className="field-input" value={form.override_entry_time} onChange={(e) => setForm((s) => ({ ...s, override_entry_time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Saída Almoço</label>
                  <input type="time" className="field-input" value={form.override_lunch_start} onChange={(e) => setForm((s) => ({ ...s, override_lunch_start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Retorno Almoço</label>
                  <input type="time" className="field-input" value={form.override_lunch_end} onChange={(e) => setForm((s) => ({ ...s, override_lunch_end: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Saída</label>
                  <input type="time" className="field-input" value={form.override_exit_time} onChange={(e) => setForm((s) => ({ ...s, override_exit_time: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {request.request_type === 'declaration' && (
            <div className="space-y-4">
              <h4 className="font-semibold text-[#191717]">Período da declaração</h4>
              <p className="text-sm text-[#6e6a6a]">Confira o intervalo comprovado. Você pode corrigi-lo antes de aprovar.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="field-label">Horário inicial</label>
                  <input type="time" className="field-input" value={form.override_absence_start_time} onChange={(e) => setForm((s) => ({ ...s, override_absence_start_time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Horário final</label>
                  <input type="time" className="field-input" value={form.override_absence_end_time} onChange={(e) => setForm((s) => ({ ...s, override_absence_end_time: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-[#6e6a6a]">O abono será limitado ao déficit do dia e não criará saldo positivo.</p>
            </div>
          )}

          <div className="space-y-4">
            <h4 className="font-semibold text-[#191717]">Decisão</h4>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="status" value="approved" checked={form.status === 'approved'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'approved' | 'rejected' }))} />
                <span className="font-medium text-[#026666]">Aprovar</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="status" value="rejected" checked={form.status === 'rejected'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'approved' | 'rejected' }))} />
                <span className="font-medium text-[#b43737]">Rejeitar</span>
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="field-label">Comentário do RH (Opcional)</label>
            <textarea className="field-input min-h-[80px]" placeholder="Justificativa da decisão..." value={form.admin_comment} onChange={(e) => setForm((s) => ({ ...s, admin_comment: e.target.value }))} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-4 backdrop-blur-sm">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending || (request.request_type === 'declaration' && form.status === 'approved' && (!form.override_absence_start_time || !form.override_absence_end_time || form.override_absence_end_time <= form.override_absence_start_time))} className="btn-primary">
            {reviewMutation.isPending ? 'Processando...' : 'Confirmar Decisão'}
          </button>
        </div>
      </div>
    </div>
  );
}
