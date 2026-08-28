import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { requestsApi } from '../../services/requestsApi';
import { recordTypeLabel, todayKey } from './dashboardUtils';

export default function RequestAdjustmentModal({
  onClose,
  onSuccess,
  myRecords,
}: {
  onClose: () => void;
  onSuccess: () => void;
  myRecords: Array<{ id: number; record_time: string; record_type: string }>;
}) {
  const [form, setForm] = useState({
    request_type: 'time_adjustment' as 'time_adjustment' | 'medical_certificate' | 'declaration' | 'vacation' | 'day_off',
    target_date: todayKey(),
    requested_entry_time: '',
    requested_lunch_start: '',
    requested_lunch_end: '',
    requested_exit_time: '',
    adjustment_target: 'entry' as 'entry' | 'lunch_start' | 'lunch_end' | 'exit',
    requested_time: '',
    absence_start_time: '',
    absence_end_time: '',
    reason: '',
    attachment_url: '',
    attachment_file: null as File | null,
  });

  const today = todayKey();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const requestedDateTime = form.target_date && form.requested_time
    ? new Date(`${form.target_date}T${form.requested_time}:00`)
    : null;
  const isFutureAdjustment = form.request_type === 'time_adjustment'
    && requestedDateTime !== null
    && requestedDateTime.getTime() > now.getTime();

  const createRequest = useMutation({
    mutationFn: async () => {
      if (isFutureAdjustment) {
        throw new Error('Ajustes de ponto só podem ser solicitados para horários que já ocorreram.');
      }
      return requestsApi.create({
        request_type: form.request_type,
        target_date: form.target_date,
        requested_entry_time: form.request_type === 'time_adjustment' && form.adjustment_target === 'entry' ? form.requested_time || null : null,
        requested_lunch_start: form.request_type === 'time_adjustment' && form.adjustment_target === 'lunch_start' ? form.requested_time || null : null,
        requested_lunch_end: form.request_type === 'time_adjustment' && form.adjustment_target === 'lunch_end' ? form.requested_time || null : null,
        requested_exit_time: form.request_type === 'time_adjustment' && form.adjustment_target === 'exit' ? form.requested_time || null : null,
        absence_start_time: form.request_type === 'declaration' ? form.absence_start_time || null : null,
        absence_end_time: form.request_type === 'declaration' ? form.absence_end_time || null : null,
        reason: form.reason,
        attachment_url: form.attachment_url || null,
        attachment_name: form.attachment_file?.name || null,
        attachment_file: form.attachment_file,
      });
    },
    onSuccess: () => onSuccess(),
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Erro ao criar solicitação');
    },
  });

  const dayRecords = myRecords.filter((record) => record.record_time.startsWith(form.target_date));

  return (
    <div className="modal-shell z-[60]">
      <div className="modal-card max-h-[92vh] max-w-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-5 backdrop-blur-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Solicitações</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">Nova solicitação do colaborador</h3>
          </div>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>

        <div className="space-y-6 p-6">
          <div className="space-y-1.5">
            <label className="field-label">Tipo de solicitação</label>
            <select className="field-input" value={form.request_type} onChange={(e) => setForm((s) => ({ ...s, request_type: e.target.value as typeof form.request_type }))}>
              <option value="time_adjustment">Ajuste de ponto</option>
              <option value="medical_certificate">Atestado médico</option>
              <option value="declaration">Declaração</option>
              <option value="vacation">Férias</option>
              <option value="day_off">Folga</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="field-label">Data da solicitação</label>
            <input
              type="date"
              min="1900-01-01"
              className="form-control field-input"
              value={form.target_date}
              max={form.request_type === 'time_adjustment' ? today : undefined}
              onChange={(e) => setForm((s) => ({ ...s, target_date: e.target.value }))}
            />
          </div>

          {form.request_type === 'time_adjustment' && form.target_date && (
            <div className="surface-muted p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Registros atuais no dia</div>
              {dayRecords.length === 0 ? (
                <div className="text-sm text-[#6e6a6a]">Nenhum registro encontrado para esta data.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {dayRecords.map((record) => (
                    <div key={record.id} className="text-sm">
                      <span className="font-semibold text-[#191717]">{new Date(record.record_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="ml-2 text-[#6e6a6a]">({recordTypeLabel(record.record_type)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.request_type === 'time_adjustment' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="field-label">Horário a ajustar</label>
                <select className="field-input" value={form.adjustment_target} onChange={(e) => setForm((s) => ({ ...s, adjustment_target: e.target.value as typeof form.adjustment_target }))}>
                  <option value="entry">Entrada</option>
                  <option value="lunch_start">Saída para Almoço</option>
                  <option value="lunch_end">Retorno do Almoço</option>
                  <option value="exit">Saída</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="field-label">Novo Horário</label>
                <input
                  type="time"
                  className="field-input"
                  value={form.requested_time}
                  max={form.target_date === today ? currentTime : undefined}
                  onChange={(e) => setForm((s) => ({ ...s, requested_time: e.target.value }))}
                />
                <div className={`text-xs ${isFutureAdjustment ? 'text-[#b43737]' : 'text-[#6e6a6a]'}`}>
                  {isFutureAdjustment
                    ? 'Este horário ainda não ocorreu e não pode ser solicitado.'
                    : 'Somente horários que já ocorreram podem receber ajuste.'}
                </div>
              </div>
            </div>
          )}

          {form.request_type === 'declaration' && (
            <div className="surface-muted p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6e6a6a]">Período a abonar</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="field-label">Horário inicial</label>
                  <input type="time" className="field-input" value={form.absence_start_time} onChange={(e) => setForm((s) => ({ ...s, absence_start_time: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="field-label">Horário final</label>
                  <input type="time" className="field-input" value={form.absence_end_time} onChange={(e) => setForm((s) => ({ ...s, absence_end_time: e.target.value }))} />
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6e6a6a]">Informe exatamente o intervalo comprovado pelo documento. Somente esse período será considerado no abono.</p>
            </div>
          )}

          {form.request_type !== 'time_adjustment' && (
            <div>
              {form.request_type === 'declaration' && <p className="mb-3 text-xs font-semibold text-[#245454]">Anexe o documento comprobatório por arquivo ou link.</p>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="field-label">Link do anexo</label>
                <input className="field-input" placeholder="Cole a URL do documento, se existir" value={form.attachment_url} onChange={(e) => setForm((s) => ({ ...s, attachment_url: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="field-label">Arquivo</label>
                <input type="file" className="field-input" onChange={(e) => setForm((s) => ({ ...s, attachment_file: e.target.files?.[0] ?? null }))} />
              </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="field-label">Motivo / Justificativa</label>
            <textarea className="field-input min-h-[100px]" placeholder="Explique o motivo da solicitação..." value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#ece8e8] bg-[#fcfbfb]/95 px-6 py-4 backdrop-blur-sm">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => createRequest.mutate()} disabled={createRequest.isPending || !form.target_date || form.reason.trim().length < 5 || (form.request_type === 'time_adjustment' && (!form.requested_time || isFutureAdjustment)) || (form.request_type === 'declaration' && (!form.absence_start_time || !form.absence_end_time || form.absence_end_time <= form.absence_start_time || (!form.attachment_file && !form.attachment_url.trim())))} className="btn-primary">
            {createRequest.isPending ? 'Enviando...' : 'Enviar Solicitação'}
          </button>
        </div>
      </div>
    </div>
  );
}
