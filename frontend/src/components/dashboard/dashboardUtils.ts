export const recordTypeLabel = (t: string) => {
  if (t === 'entry') return 'Entrada';
  if (t === 'lunch_start') return 'Saída Almoço';
  if (t === 'lunch_end') return 'Retorno Almoço';
  if (t === 'exit') return 'Saída';
  return 'Automático';
};

export const methodLabel = (m: string) => {
  if (m === 'facial') return 'Facial';
  if (m === 'pin') return 'PIN';
  if (m === 'manual') return 'Manual';
  if (m === 'web') return 'Remoto';
  return m;
};

export const biometricEventTypeLabel = (eventType: string) => {
  if (eventType === 'enrollment') return 'Cadastro facial';
  if (eventType === 'verification_success') return 'Leitura validada';
  if (eventType === 'verification_failure') return 'Falha biométrica';
  if (eventType === 'pin_fallback') return 'Fallback por PIN';
  if (eventType === 'reset') return 'Reset biométrico';
  return eventType;
};

const biometricReasonLabels: Record<string, string> = {
  biometric_not_enrolled: 'Sem biometria cadastrada',
  biometric_score_missing: 'Score biométrico ausente',
  biometric_threshold_invalid: 'Limiar biométrico inválido',
  biometric_score_below_threshold: 'Score abaixo do mínimo',
  biometric_mismatch: 'Biometria não conferiu',
  biometric_identity_ambiguous: 'Identidade facial ambígua',
  liveness_not_verified: 'Prova de vida não validada',
  liveness_challenge_missing: 'Desafio de prova de vida ausente',
  liveness_alignment_pending: 'Aguardando alinhamento',
  liveness_turn_pending: 'Aguardando giro solicitado',
  liveness_return_pending: 'Aguardando retorno ao centro',
  pin_invalid: 'PIN inválido',
  pin_rate_limited: 'PIN temporariamente bloqueado',
};

export const biometricReasonLabel = (reason: string | null | undefined) => {
  if (!reason) return '—';
  return biometricReasonLabels[reason] ?? reason.replace(/_/g, ' ');
};

export const requestTypeLabel = (type: string) => {
  if (type === 'time_adjustment') return 'Ajuste de Ponto';
  if (type === 'medical_certificate') return 'Atestado';
  if (type === 'declaration') return 'Declaração';
  if (type === 'vacation') return 'Férias';
  if (type === 'day_off') return 'Folga';
  if (type === 'external_work') return 'Trabalho Externo';
  return 'Solicitação';
};

export const requestStatusLabel = (status: string) => {
  if (status === 'approved') return 'Aprovada';
  if (status === 'rejected') return 'Rejeitada';
  return 'Pendente';
};

export const requestStatusClass = (status: string) => {
  if (status === 'approved') return 'border-[#dceaea] bg-[#edf8f8] text-[#026666]';
  if (status === 'rejected') return 'border-[#f0dede] bg-[#fbf1f1] text-[#b43737]';
  return 'border-[#ece8e8] bg-[#f6f4f4] text-[#191717]';
};

export const formatMinutes = (minutes: number | null | undefined) => {
  if (!minutes) return '0h 00min';
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${hours}h ${String(remainder).padStart(2, '0')}min`;
};

export const todayKey = () => new Date().toISOString().split('T')[0];

export const monthStartKey = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
};


