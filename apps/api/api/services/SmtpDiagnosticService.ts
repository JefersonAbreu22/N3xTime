import { createSmtpTransport, getSmtpConfiguration, getSmtpErrorDetails } from './SmtpService.js';

export type SmtpDiagnosticStage = 'configuration' | 'connection' | 'sending';

export class SmtpDiagnosticError extends Error {
  constructor(
    message: string,
    readonly stage: SmtpDiagnosticStage,
    readonly smtpCode: string | null,
    readonly durationMs: number,
  ) {
    super(message);
    this.name = 'SmtpDiagnosticError';
  }
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const diagnosticError = (error: unknown, stage: SmtpDiagnosticStage, startedAt: number) => {
  const details = getSmtpErrorDetails(error);
  return new SmtpDiagnosticError(details.message, stage, details.code, Date.now() - startedAt);
};

export const sendSmtpDiagnosticEmail = async (payload: {
  recipient: string;
  requestedBy: string;
  companyName: string;
}) => {
  const startedAt = Date.now();
  let smtp;

  try {
    smtp = getSmtpConfiguration();
  } catch (error) {
    throw diagnosticError(error, 'configuration', startedAt);
  }

  const transporter = createSmtpTransport(smtp);
  try {
    try {
      await transporter.verify();
    } catch (error) {
      throw diagnosticError(error, 'connection', startedAt);
    }

    const sentAt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());

    try {
      const result = await transporter.sendMail({
        from: smtp.from,
        to: payload.recipient,
        subject: `[N3xtime] Teste de envio SMTP - ${payload.companyName}`,
        text: [
          'Teste de envio SMTP concluído.',
          '',
          `Empresa: ${payload.companyName}`,
          `Solicitado por: ${payload.requestedBy}`,
          `Data e hora: ${sentAt}`,
          '',
          'Se esta mensagem chegou à caixa de entrada, a conexão, a autenticação e o envio SMTP estão funcionando.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;color:#191717;line-height:1.6;max-width:620px">
            <div style="display:inline-block;border-radius:999px;background:#e4f4f4;color:#026666;padding:6px 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Diagnóstico SMTP</div>
            <h2 style="margin:18px 0 8px;color:#026666">Teste realizado com sucesso</h2>
            <p>O N3xtime conseguiu autenticar no servidor e enviar esta mensagem.</p>
            <table style="margin-top:18px;border-collapse:collapse;width:100%">
              <tr><td style="padding:7px 0;font-weight:700">Empresa</td><td>${escapeHtml(payload.companyName)}</td></tr>
              <tr><td style="padding:7px 0;font-weight:700">Solicitado por</td><td>${escapeHtml(payload.requestedBy)}</td></tr>
              <tr><td style="padding:7px 0;font-weight:700">Data e hora</td><td>${escapeHtml(sentAt)}</td></tr>
            </table>
            <p style="margin-top:22px;color:#6e6a6a;font-size:13px">Este e-mail foi gerado pela tela de teste SMTP do N3xtime.</p>
          </div>
        `,
      });

      return {
        recipient: payload.recipient,
        messageId: result.messageId || null,
        smtpResponse: result.response || null,
        accepted: (result.accepted || []).map(String),
        rejected: (result.rejected || []).map(String),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof SmtpDiagnosticError) throw error;
      throw diagnosticError(error, 'sending', startedAt);
    }
  } finally {
    transporter.close();
  }
};
