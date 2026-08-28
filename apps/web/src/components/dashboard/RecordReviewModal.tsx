import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { recordsApi } from '../../services/recordsApi';
import { methodLabel, recordTypeLabel } from './dashboardUtils';
import { ProtectedRecordPhoto } from './ProtectedFile';

export default function RecordReviewModal({
  record,
  onClose,
  onSuccess,
}: {
  record: {
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
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    status: 'valid' as 'valid' | 'adjusted' | 'rejected',
    reason: '',
    adjusted_time: new Date(record.recordTime).toTimeString().slice(0, 5),
    adjusted_record_type: record.recordType as 'entry' | 'lunch_start' | 'lunch_end' | 'exit',
  });

  const updateRecord = useMutation({
    mutationFn: async () => {
      return recordsApi.updateStatus(record.id, {
        status: form.status,
        reason: form.reason,
        adjusted_time: form.status === 'adjusted' ? form.adjusted_time : undefined,
        adjusted_record_type: form.status === 'adjusted' ? form.adjusted_record_type : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Marcação tratada com sucesso!');
      onSuccess();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Não foi possível tratar a marcação.');
    },
  });

  return (
    <div className="modal-shell z-[60]">
      <div className="modal-card max-h-[92vh] max-w-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Tratamento de exceção</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Revisar marcação pendente</h3>
          </div>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>

        <div className="space-y-6 p-6">
          <div className="surface-muted p-4 text-sm flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-2">
              <p><strong>Colaborador:</strong> {record.userName}</p>
              <p><strong>Data/hora:</strong> {new Date(record.recordTime).toLocaleString()}</p>
              <p><strong>Tipo atual:</strong> {recordTypeLabel(record.recordType)}</p>
              <p><strong>Método:</strong> {methodLabel(record.method)}</p>
              <p><strong>Motivo da Exceção:</strong> {record.reviewReason || 'Sem justificativa registrada'}</p>
              {record.mapUrl && (
                <p><strong>Localização:</strong> <a className="font-medium text-[#026666] hover:underline" href={record.mapUrl} target="_blank" rel="noreferrer">Ver no mapa</a></p>
              )}
            </div>
            {record.photoUrl && (
              <div className="shrink-0 w-32 h-32 rounded-lg border border-[#ece8e8] overflow-hidden bg-white flex items-center justify-center">
                <ProtectedRecordPhoto recordId={record.id} className="h-32 w-32 object-cover" linkClassName="hover:opacity-90 transition-opacity" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-[#191717]">Decisão</h4>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="record-status" value="valid" checked={form.status === 'valid'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'valid' | 'adjusted' | 'rejected' }))} />
                <span>Aprovar</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="record-status" value="adjusted" checked={form.status === 'adjusted'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'valid' | 'adjusted' | 'rejected' }))} />
                <span>Ajustar</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="record-status" value="rejected" checked={form.status === 'rejected'} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as 'valid' | 'adjusted' | 'rejected' }))} />
                <span>Rejeitar</span>
              </label>
            </div>
          </div>

          {form.status === 'adjusted' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="field-label">Novo horário</label>
                <input type="time" className="field-input" value={form.adjusted_time} onChange={(e) => setForm((s) => ({ ...s, adjusted_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="field-label">Novo tipo</label>
                <select className="field-input" value={form.adjusted_record_type} onChange={(e) => setForm((s) => ({ ...s, adjusted_record_type: e.target.value as 'entry' | 'lunch_start' | 'lunch_end' | 'exit' }))}>
                  <option value="entry">Entrada</option>
                  <option value="lunch_start">Saída Almoço</option>
                  <option value="lunch_end">Retorno Almoço</option>
                  <option value="exit">Saída</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="field-label">Motivo da decisão</label>
            <textarea className="field-input min-h-[90px]" value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} placeholder="Descreva a aprovação, rejeição ou ajuste aplicado." />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-4 backdrop-blur-sm">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => updateRecord.mutate()} disabled={updateRecord.isPending || ((form.status === 'adjusted' || form.status === 'rejected') && form.reason.trim().length < 3)} className="btn-primary">
            {updateRecord.isPending ? 'Salvando...' : 'Aplicar decisão'}
          </button>
        </div>
      </div>
    </div>
  );
}
