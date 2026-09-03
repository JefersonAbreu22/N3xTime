import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MailWarning, RefreshCw } from 'lucide-react';
import { recordsApi } from '../../services/recordsApi';
import { useAuthStore } from '../../stores/authStore';
import { recordTypeLabel } from '../../components/dashboard/dashboardUtils';

const methodLabels: Record<string, string> = { facial: 'Facial', pin: 'PIN', manual: 'Manual', web: 'Remoto/web' };
const formatDateTime = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';

export default function EmailFailuresPage() {
  const auth = useAuthStore();
  const failuresQuery = useQuery({ queryKey: ['records', 'email-failures'], queryFn: () => recordsApi.emailFailures(200), enabled: auth.user?.role === 'admin', refetchInterval: 60_000 });
  const logsQuery = useQuery({ queryKey: ['records', 'email-logs'], queryFn: () => recordsApi.emailLogs(200), enabled: auth.user?.role === 'admin', refetchInterval: 60_000 });

  if (auth.user?.role !== 'admin') return <div className="surface-panel py-12 text-center text-[#6e6a6a]">Acesso restrito ao administrador.</div>;

  const failures = failuresQuery.data?.data ?? [];
  const logs = logsQuery.data?.data ?? [];
  const sentCount = logs.filter((log) => log.status === 'sent').length;
  const configurationBlockedCount = logs.filter((log) => log.smtp_code === 'EMAIL_DISABLED').length;
  const isFetching = failuresQuery.isFetching || logsQuery.isFetching;

  return <div className="space-y-6"><section className="surface-panel p-5">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div>
      <div className="flex items-center gap-2 text-[#b43737]"><MailWarning size={20} /><span className="text-xs font-bold uppercase tracking-[0.18em]">Auditoria de notificações</span></div>
      <h1 className="mt-2 text-2xl font-bold text-[#191717]">Envios de comprovantes por e-mail</h1>
      <p className="mt-2 max-w-3xl text-sm text-[#6e6a6a]">Acompanhe cada tentativa, a aceitação pelo servidor SMTP e as falhas de envio.</p>
    </div><button type="button" className="btn-secondary flex items-center gap-2" onClick={() => { failuresQuery.refetch(); logsQuery.refetch(); }} disabled={isFetching}><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />Atualizar</button></div>

    <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="insight-card"><div className="metric-label">Falhas registradas</div><div className="mt-2 text-2xl font-bold text-[#b43737]">{failures.length}</div></div><div className="insight-card"><div className="metric-label">Bloqueados pela configuração</div><div className="mt-2 text-2xl font-bold text-[#b36b00]">{configurationBlockedCount}</div></div><div className="insight-card"><div className="metric-label">Envios aceitos pelo SMTP</div><div className="mt-2 flex items-center gap-2 text-sm font-medium text-[#026666]"><CheckCircle2 size={16} />{sentCount} nos últimos {logs.length} registros</div></div></div>

    <h2 className="mt-7 text-lg font-bold text-[#191717]">Histórico de envio</h2>
    <div className="mt-3 overflow-x-auto rounded-xl border border-[#ebe8e8]"><table className="data-table min-w-[1200px]"><thead><tr><th>Tentativa</th><th>Status</th><th>Colaborador</th><th>Destinatário</th><th>Registro de ponto</th><th>Message ID</th><th>Resposta SMTP / erro</th></tr></thead><tbody>
      {logs.map((log) => <tr key={log.id}><td className="whitespace-nowrap">{formatDateTime(log.attempted_at)}</td><td className={log.status === 'sent' ? 'font-medium text-[#026666]' : log.smtp_code === 'EMAIL_DISABLED' ? 'font-medium text-[#b36b00]' : 'font-medium text-[#b43737]'}>{log.status === 'sent' ? 'Aceito pelo SMTP' : log.smtp_code === 'EMAIL_DISABLED' ? 'Desabilitado por configuração' : 'Falhou'}</td><td>{log.user?.name || `Usuário #${log.user_id}`}</td><td>{log.recipient}</td><td>#{log.record_id} • {log.record ? recordTypeLabel(log.record.record_type) : 'Registro'}</td><td className="max-w-xs break-all text-xs">{log.message_id || '—'}</td><td className="max-w-md whitespace-normal break-words">{log.smtp_response || log.error_message || '—'}</td></tr>)}
      {!logs.length && !logsQuery.isLoading && !logsQuery.isError && <tr><td colSpan={7} className="py-10 text-center text-[#6e6a6a]">Nenhum envio registrado ainda. Os novos registros de ponto aparecerão aqui.</td></tr>}
      {logsQuery.isLoading && <tr><td colSpan={7} className="py-10 text-center text-[#6e6a6a]">Carregando registros de envio...</td></tr>}
      {logsQuery.isError && <tr><td colSpan={7} className="py-10 text-center text-[#b43737]">Não foi possível consultar os registros de envio.</td></tr>}
    </tbody></table></div>

    <h2 className="mt-7 text-lg font-bold text-[#191717]">Falhas detalhadas</h2>
    <div className="mt-3 overflow-x-auto rounded-xl border border-[#ebe8e8]"><table className="data-table min-w-[1050px]"><thead><tr><th>Tentativa</th><th>Colaborador</th><th>Destinatário</th><th>Registro de ponto</th><th>Método</th><th>Código SMTP</th><th>Motivo da falha</th></tr></thead><tbody>
      {failures.map((failure) => <tr key={failure.id}><td className="whitespace-nowrap">{formatDateTime(failure.attempted_at)}</td><td><div className="font-medium text-[#191717]">{failure.user?.name || `Usuário #${failure.user_id}`}</div><div className="text-xs text-[#6e6a6a]">{failure.user?.registration_number || 'Sem matrícula'}</div></td><td>{failure.recipient}</td><td><div className="font-medium text-[#191717]">#{failure.record_id} • {failure.record ? recordTypeLabel(failure.record.record_type) : 'Registro'}</div><div className="text-xs text-[#6e6a6a]">{formatDateTime(failure.record?.record_time)}</div></td><td>{failure.record ? methodLabels[failure.record.method] || failure.record.method : '—'}</td><td>{failure.smtp_code || '—'}</td><td className="max-w-md whitespace-normal break-words text-[#b43737]">{failure.error_message}</td></tr>)}
      {!failures.length && !failuresQuery.isLoading && !failuresQuery.isError && <tr><td colSpan={7} className="py-10 text-center text-[#6e6a6a]">Nenhuma falha de envio registrada.</td></tr>}
      {failuresQuery.isLoading && <tr><td colSpan={7} className="py-10 text-center text-[#6e6a6a]">Carregando falhas de e-mail...</td></tr>}
      {failuresQuery.isError && <tr><td colSpan={7} className="py-10 text-center text-[#b43737]">Não foi possível consultar o painel de falhas.</td></tr>}
    </tbody></table></div>
  </section></div>;
}
