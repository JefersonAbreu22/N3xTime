import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { requestsApi } from '../../services/requestsApi';
import { TeamUser } from '../../services/usersApi';

type AssignAbsenceModalProps = {
  user: TeamUser;
  onClose: () => void;
};

type AbsenceRequestType = 'vacation' | 'day_off' | 'medical_certificate' | 'declaration' | 'external_work';

export default function AssignAbsenceModal({ user, onClose }: AssignAbsenceModalProps) {
  const queryClient = useQueryClient();
  const [dateMode, setDateMode] = useState<'single' | 'period'>('single');
  const [targetDate, setTargetDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestType, setRequestType] = useState<AbsenceRequestType>('day_off');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [absenceStartTime, setAbsenceStartTime] = useState('');
  const [absenceEndTime, setAbsenceEndTime] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      return requestsApi.assignAbsence({
        user_id: user.id,
        target_date: dateMode === 'single' ? targetDate : undefined,
        start_date: dateMode === 'period' ? startDate : undefined,
        end_date: dateMode === 'period' ? endDate : undefined,
        request_type: requestType,
        absence_start_time: requestType === 'declaration' ? absenceStartTime : undefined,
        absence_end_time: requestType === 'declaration' ? absenceEndTime : undefined,
        reason,
        attachment_file: attachment,
      });
    },
    onSuccess: (res) => {
      toast.success(res.message || 'Ausência lançada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Erro ao lançar ausência.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateMode === 'single' && !targetDate) {
      toast.error('Preencha a data.');
      return;
    }
    if (dateMode === 'period' && (!startDate || !endDate)) {
      toast.error('Preencha o período (início e fim).');
      return;
    }
    if (!reason) {
      toast.error('Preencha a justificativa.');
      return;
    }
    if (requestType === 'declaration' && (!absenceStartTime || !absenceEndTime || absenceEndTime <= absenceStartTime)) {
      toast.error('Informe um intervalo de horas válido para a declaração.');
      return;
    }
    if (requestType === 'declaration' && !attachment) {
      toast.error('Anexe a declaração que comprova o período informado.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold tracking-[-0.04em] text-[#191717]">Lançar ausência ou abono</h3>
          <button onClick={onClose} className="rounded-full p-2 text-[#6e6a6a] hover:bg-[#f6f4f4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-xl border border-[#dceaea] bg-[#edf8f8] p-4 text-sm text-[#245454]">
          Colaborador: <strong>{user.name}</strong>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="field-label">Tipo de Lançamento</label>
            <select
              className="field-input"
              value={requestType}
              onChange={(e) => {
                const nextType = e.target.value as AbsenceRequestType;
                setRequestType(nextType);
                if (nextType === 'declaration') setDateMode('single');
              }}
            >
              <option value="day_off">Folga</option>
              <option value="vacation">Férias</option>
              <option value="medical_certificate">Atestado / Licença</option>
              <option value="declaration">Declaração</option>
              <option value="external_work">Trabalho Externo</option>
            </select>
          </div>

          <div className="flex gap-4">
            <label className={`flex items-center gap-2 ${requestType === 'declaration' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name="dateMode"
                value="single"
                checked={dateMode === 'single'}
                onChange={() => setDateMode('single')}
                className="text-[#026666] focus:ring-[#026666]"
              />
              <span className="text-sm text-[#191717]">Dia específico</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dateMode"
                value="period"
                checked={dateMode === 'period'}
                onChange={() => setDateMode('period')}
                disabled={requestType === 'declaration'}
                className="text-[#026666] focus:ring-[#026666]"
              />
              <span className="text-sm text-[#191717]">Período (vários dias)</span>
            </label>
          </div>

          {dateMode === 'single' ? (
            <div>
              <label className="field-label">Data</label>
              <input
                type="date"
                min="1900-01-01"
                className="field-input"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="field-label">Data de Início</label>
                <input
                  type="date"
                  min="1900-01-01"
                  className="field-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="field-label">Data de Fim</label>
                <input
                  type="date"
                  min="1900-01-01"
                  className="field-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {requestType === 'declaration' && (
            <div className="rounded-xl border border-[#dceaea] bg-[#edf8f8] p-4">
              <div className="mb-3 text-sm font-semibold text-[#245454]">Período a abonar</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Horário inicial</label>
                  <input type="time" className="field-input" value={absenceStartTime} onChange={(e) => setAbsenceStartTime(e.target.value)} required />
                </div>
                <div>
                  <label className="field-label">Horário final</label>
                  <input type="time" className="field-input" value={absenceEndTime} onChange={(e) => setAbsenceEndTime(e.target.value)} required />
                </div>
              </div>
              <p className="mt-3 text-xs text-[#245454]">O abono será limitado ao déficit desse dia e não gerará horas extras.</p>
            </div>
          )}

          {(requestType === 'medical_certificate' || requestType === 'declaration' || requestType === 'external_work') && (
            <div>
              <label className="field-label">Anexar documento {requestType === 'declaration' ? '(Obrigatório)' : '(Opcional)'}</label>
              <input
                type="file"
                className="field-input"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                required={requestType === 'declaration'}
              />
            </div>
          )}

          <div>
            <label className="field-label">Justificativa / Motivo</label>
            <textarea
              className="field-input min-h-[100px] resize-none"
              placeholder="Descreva o motivo do lançamento..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={mutation.isPending}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1 bg-[#026666] hover:bg-[#014d4d]" disabled={mutation.isPending}>
              {mutation.isPending ? 'Salvando...' : 'Lançar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
