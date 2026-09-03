import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, KeyRound, MailCheck, RefreshCw, Send, Server, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { emailApi, SmtpTestFailure } from '../../services/emailApi';
import { useAuthStore } from '../../stores/authStore';

const stageLabels: Record<string, string> = {
  configuration: 'Configuração',
  connection: 'Conexão e autenticação',
  sending: 'Envio da mensagem',
};

const getFailure = (error: unknown): SmtpTestFailure => {
  const failure = error as { response?: { data?: SmtpTestFailure }; message?: string };
  return failure.response?.data || { success: false, error: failure.message || 'Não foi possível concluir o teste SMTP.' };
};

export default function SmtpTestPage() {
  const auth = useAuthStore();
  const [recipient, setRecipient] = useState(auth.user?.email || '');
  const [lastFailure, setLastFailure] = useState<SmtpTestFailure | null>(null);
  const statusQuery = useQuery({
    queryKey: ['email', 'smtp-status'],
    queryFn: emailApi.smtpStatus,
    enabled: auth.user?.role === 'admin',
  });
  const testMutation = useMutation({
    mutationFn: () => emailApi.sendSmtpTest(recipient.trim()),
    onMutate: () => setLastFailure(null),
    onSuccess: (response) => toast.success(response.message),
    onError: (error) => {
      const failure = getFailure(error);
      setLastFailure(failure);
      toast.error(failure.error);
    },
  });

  if (auth.user?.role !== 'admin') {
    return <div className="surface-panel py-12 text-center text-[#6e6a6a]">Acesso restrito ao administrador.</div>;
  }

  const status = statusQuery.data?.data;
  const result = testMutation.data?.data;
  const canSubmit = /^\S+@\S+\.\S+$/.test(recipient.trim()) && !testMutation.isPending && status?.configured !== false;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit) testMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <section className="surface-panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#026666]">
              <MailCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Diagnóstico de notificações</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-[#191717]">Teste de envio SMTP</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6e6a6a]">
              Valide a configuração, a autenticação e a entrega de uma mensagem real sem criar registro de ponto.
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => statusQuery.refetch()} disabled={statusQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${statusQuery.isFetching ? 'animate-spin' : ''}`} /> Atualizar configuração
          </button>
        </div>

        {statusQuery.isLoading && <div className="mt-5 rounded-xl bg-[#f6f4f4] p-4 text-sm text-[#6e6a6a]">Consultando configuração SMTP...</div>}
        {statusQuery.isError && <div className="mt-5 rounded-xl border border-[#f0dede] bg-[#fffafa] p-4 text-sm text-[#b43737]">Não foi possível consultar a configuração SMTP.</div>}

        {status && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="insight-card">
                <div className="flex items-center gap-2 text-[#6e6a6a]"><Server className="h-4 w-4" /><span className="metric-label">Servidor</span></div>
                <div className="mt-2 break-all text-sm font-semibold text-[#191717]">{status.host || 'Não configurado'}</div>
              </div>
              <div className="insight-card">
                <div className="flex items-center gap-2 text-[#6e6a6a]"><ShieldCheck className="h-4 w-4" /><span className="metric-label">Transporte</span></div>
                <div className="mt-2 text-sm font-semibold text-[#191717]">Porta {status.port || '—'} · {status.secure ? 'TLS direto' : 'STARTTLS'}</div>
              </div>
              <div className="insight-card">
                <div className="flex items-center gap-2 text-[#6e6a6a]"><KeyRound className="h-4 w-4" /><span className="metric-label">Remetente</span></div>
                <div className="mt-2 break-all text-sm font-semibold text-[#191717]">{status.from || 'Não configurado'}</div>
              </div>
              <div className="insight-card">
                <div className="flex items-center gap-2 text-[#6e6a6a]">
                  {status.timeRecordEmailEnabled ? <CheckCircle2 className="h-4 w-4 text-[#026666]" /> : <AlertTriangle className="h-4 w-4 text-[#b36b00]" />}
                  <span className="metric-label">Comprovantes de ponto</span>
                </div>
                <div className={`mt-2 text-sm font-semibold ${status.timeRecordEmailEnabled ? 'text-[#026666]' : 'text-[#b36b00]'}`}>
                  {status.timeRecordEmailEnabled ? 'Envio habilitado' : 'Envio desabilitado'}
                </div>
              </div>
            </div>

            {!status.configured && (
              <div className="mt-4 rounded-xl border border-[#efd9b0] bg-[#fff8eb] p-4 text-sm text-[#805000]">
                <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Configuração incompleta.</strong><div className="mt-1">Verifique: {status.missing.join(', ')}.</div></div></div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="surface-panel p-5 md:p-6">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#026666]">Mensagem de teste</div>
          <h2 className="mt-2 text-xl font-bold text-[#191717]">Escolha o destinatário</h2>
          <p className="mt-2 text-sm leading-6 text-[#6e6a6a]">O endereço será usado somente neste teste. A senha SMTP nunca é enviada ao navegador.</p>

          <form className="mt-6" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="smtp-test-recipient">E-mail do destinatário</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="smtp-test-recipient"
                type="email"
                className="field-input h-11 flex-1"
                placeholder="nome@empresa.com.br"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                autoComplete="email"
                required
                maxLength={255}
              />
              <button className="btn-primary h-11 shrink-0" type="submit" disabled={!canSubmit}>
                {testMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {testMutation.isPending ? 'Testando SMTP...' : 'Enviar teste'}
              </button>
            </div>
          </form>

          <div className="mt-5 rounded-xl border border-[#e7e4e4] bg-[#f8f6f6] p-4 text-xs leading-5 text-[#6e6a6a]">
            O teste primeiro valida a conexão e a autenticação. Em seguida, envia uma mensagem real. Ele funciona mesmo se os comprovantes de ponto estiverem desabilitados.
          </div>
        </section>

        <section className="surface-panel p-5 md:p-6" aria-live="polite">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#6e6a6a]">Último resultado</div>
          {!result && !lastFailure && (
            <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-[#d9d6d6] px-6 text-center">
              <MailCheck className="h-8 w-8 text-[#9a9696]" />
              <p className="mt-3 text-sm text-[#6e6a6a]">Envie uma mensagem para visualizar o diagnóstico.</p>
            </div>
          )}

          {result && !lastFailure && (
            <div className="mt-5 rounded-xl border border-[#b9dede] bg-[#f3fbfb] p-4">
              <div className="flex items-center gap-2 font-semibold text-[#026666]"><CheckCircle2 className="h-5 w-5" /> Envio aceito pelo servidor SMTP</div>
              <dl className="mt-4 space-y-3 text-sm">
                <div><dt className="metric-label">Destinatário</dt><dd className="mt-1 break-all text-[#191717]">{result.recipient}</dd></div>
                <div><dt className="metric-label">Message ID</dt><dd className="mt-1 break-all font-mono text-xs text-[#191717]">{result.messageId || 'Não informado'}</dd></div>
                <div><dt className="metric-label">Resposta SMTP</dt><dd className="mt-1 break-words text-[#191717]">{result.smtpResponse || 'Mensagem aceita'}</dd></div>
                <div className="flex items-center gap-2 text-[#6e6a6a]"><Clock3 className="h-4 w-4" /> Concluído em {result.durationMs} ms</div>
              </dl>
            </div>
          )}

          {lastFailure && (
            <div className="mt-5 rounded-xl border border-[#efcaca] bg-[#fffafa] p-4">
              <div className="flex items-center gap-2 font-semibold text-[#b43737]"><XCircle className="h-5 w-5" /> Teste não concluído</div>
              <p className="mt-3 break-words text-sm leading-6 text-[#7b3434]">{lastFailure.error}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div><dt className="metric-label">Etapa</dt><dd className="mt-1 text-sm text-[#191717]">{stageLabels[lastFailure.data?.stage || ''] || 'Não identificada'}</dd></div>
                <div><dt className="metric-label">Código SMTP</dt><dd className="mt-1 text-sm text-[#191717]">{lastFailure.data?.smtpCode || 'Não informado'}</dd></div>
              </dl>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
