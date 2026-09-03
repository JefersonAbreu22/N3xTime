import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Ban, Briefcase, CalendarClock, HeartPulse, ShieldAlert, UserMinus, X, type LucideIcon } from 'lucide-react';
import {
  accessRestrictionLabels,
  type AccessRestrictionType,
  type TeamUser,
  usersApi,
} from '../../services/usersApi';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

const options: Array<{
  value: AccessRestrictionType;
  description: string;
  icon: LucideIcon;
  requiresEnd: boolean;
  tone?: 'danger';
}> = [
  { value: 'temporary_suspension', description: 'Bloqueio disciplinar ou administrativo com retorno definido.', icon: Ban, requiresEnd: true },
  { value: 'inss_leave', description: 'Benefício por incapacidade com retorno definido ou ainda pendente.', icon: HeartPulse, requiresEnd: false },
  { value: 'occupational_leave', description: 'Acidente ou doença relacionada ao trabalho.', icon: ShieldAlert, requiresEnd: false },
  { value: 'parental_leave', description: 'Licença maternidade, adoção ou afastamento parental.', icon: CalendarClock, requiresEnd: true },
  { value: 'unpaid_leave', description: 'Interrupção acordada sem remuneração e com prazo.', icon: Briefcase, requiresEnd: true },
  { value: 'permanent_disability_retirement', description: 'Benefício permanente por incapacidade reconhecida.', icon: HeartPulse, requiresEnd: false },
  { value: 'military_service', description: 'Afastamento para prestação de serviço militar.', icon: ShieldAlert, requiresEnd: false },
  { value: 'union_or_elective_mandate', description: 'Exercício de mandato sindical ou eleitoral.', icon: Briefcase, requiresEnd: false },
  { value: 'family_care_leave', description: 'Licença para acompanhar familiar enfermo.', icon: HeartPulse, requiresEnd: false },
  { value: 'protective_measure', description: 'Afastamento decorrente de medida protetiva.', icon: ShieldAlert, requiresEnd: false },
  { value: 'judicial_detention', description: 'Bloqueio decorrente de prisão ou ordem judicial.', icon: ShieldAlert, requiresEnd: false },
  { value: 'other_leave', description: 'Outra situação formal que exige bloqueio de acesso.', icon: CalendarClock, requiresEnd: false },
  { value: 'termination', description: 'Encerramento do vínculo, sem retorno automático.', icon: UserMinus, requiresEnd: false, tone: 'danger' },
];

const formatDate = (value?: string | null) => value
  ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR')
  : 'Não informado';

export default function SuspensionModal({ user, onClose }: { user: TeamUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isRestricted = user.status === 'suspended';
  const [restrictionType, setRestrictionType] = useState<AccessRestrictionType>('temporary_suspension');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const selectedOption = options.find((option) => option.value === restrictionType) ?? options[0];

  const mutation = useMutation({
    mutationFn: () => usersApi.changeStatus(user.id, isRestricted ? {
      status: 'active',
    } : {
      status: 'suspended',
      restriction_type: restrictionType,
      start_date: startDate,
      end_date: restrictionType === 'termination' ? null : endDate || null,
      reason: reason.trim(),
    }),
    onSuccess: async (response) => {
      toast.success(response.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users', 'team'] }),
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['overview'] }),
      ]);
      onClose();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      toast.error(err.response?.data?.error || err.message || 'Não foi possível alterar o acesso.');
    },
  });

  const canSubmit = isRestricted || (
    reason.trim().length >= 5
    && Boolean(startDate)
    && (!selectedOption.requiresEnd || Boolean(endDate))
    && (!endDate || endDate >= startDate)
  );

  return (
    <div className="modal-shell z-[70]">
      <div className="modal-card max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto">
        <div className="flex items-start justify-between border-b border-[#ece8e8] px-5 py-5 md:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#026666]">Hub de vínculo e acesso</div>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#191717]">
              {isRestricted ? 'Situação atual do colaborador' : 'Alterar situação do colaborador'}
            </h3>
            <p className="mt-1 text-sm text-[#6e6a6a]">{user.name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        {isRestricted ? (
          <div className="space-y-5 p-5 md:p-6">
            <div className="flex gap-3 rounded-xl border border-[#f0dede] bg-[#fbf1f1] p-4 text-sm text-[#6f3030]">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <p>O acesso ao painel e ao registro de ponto está bloqueado. A reativação manual ficará registrada na auditoria.</p>
            </div>
            <div className="surface-muted grid gap-4 p-4 text-sm sm:grid-cols-2">
              <div><div className="field-label">Situação</div><strong className="text-[#191717]">{user.suspension_type ? accessRestrictionLabels[user.suspension_type] : 'Suspensão de acesso'}</strong></div>
              <div><div className="field-label">Início</div><strong className="text-[#191717]">{formatDate(user.suspension_start_date || user.suspended_at)}</strong></div>
              <div><div className="field-label">Retorno automático</div><strong className="text-[#191717]">{user.suspension_end_at ? formatDate(user.suspension_end_at) : 'Sem data definida'}</strong></div>
              <div><div className="field-label">Motivo registrado</div><strong className="text-[#191717]">{user.suspension_reason || 'Não informado'}</strong></div>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-5 md:p-6">
            <div>
              <div className="field-label">Selecione a situação</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                  const Icon = option.icon;
                  const selected = restrictionType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setRestrictionType(option.value);
                        if (option.value === 'termination') setEndDate('');
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${selected
                        ? option.tone === 'danger' ? 'border-[#d9a9a9] bg-[#fff5f5]' : 'border-[#82b9b5] bg-[#edf8f8]'
                        : 'border-[#e3dfdf] bg-white hover:bg-[#f8f6f6]'}`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${option.tone === 'danger' ? 'text-[#b43737]' : 'text-[#026666]'}`} />
                      <span><strong className="block text-xs text-[#191717]">{accessRestrictionLabels[option.value]}</strong><span className="mt-1 block text-[10px] leading-4 text-[#6e6a6a]">{option.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="restriction-start">Data de início</label>
                <input id="restriction-start" type="date" className="field-input" value={startDate} max={today()} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              {restrictionType !== 'termination' && (
                <div>
                  <label className="field-label" htmlFor="restriction-end">Retorno previsto {selectedOption.requiresEnd ? '' : '(opcional)'}</label>
                  <input id="restriction-end" type="date" className="field-input" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
                  <p className="mt-1 text-[10px] text-[#777171]">Com uma data definida, o acesso será reativado automaticamente após o fim do dia.</p>
                </div>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="restriction-reason">Motivo e observações</label>
              <textarea id="restriction-reason" className="field-input min-h-[100px]" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="Registre o motivo administrativo e as informações necessárias..." />
              <div className="mt-2 text-xs text-[#6e6a6a]">O histórico do colaborador será preservado e a alteração ficará disponível na auditoria.</div>
            </div>

            {restrictionType === 'termination' && (
              <div className="flex gap-3 rounded-xl border border-[#f0dede] bg-[#fbf1f1] p-4 text-sm text-[#6f3030]">
                <UserMinus className="mt-0.5 h-5 w-5 shrink-0" />
                <p>O desligamento bloqueia o acesso sem retorno automático. Use a reativação manual apenas para corrigir um lançamento indevido.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-[#ece8e8] px-5 py-4 md:px-6">
          <button onClick={onClose} className="btn-secondary" disabled={mutation.isPending}>Cancelar</button>
          <button onClick={() => mutation.mutate()} className={`btn-primary ${!isRestricted && restrictionType === 'termination' ? '!bg-[#b43737] hover:!bg-[#942b2b]' : ''}`} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? 'Processando...' : isRestricted ? 'Reativar acesso' : restrictionType === 'termination' ? 'Confirmar desligamento' : 'Aplicar situação'}
          </button>
        </div>
      </div>
    </div>
  );
}
