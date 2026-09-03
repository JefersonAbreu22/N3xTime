import { CompanyProfile } from '../models/CompanyProfile.js';
import { EmailDeliveryFailure } from '../models/EmailDeliveryFailure.js';
import { EmailDeliveryLog } from '../models/EmailDeliveryLog.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { User } from '../models/User.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { createSmtpTransport, getSmtpConfiguration, getSmtpErrorDetails } from './SmtpService.js';

const EMAIL_DISABLED_CODE = 'EMAIL_DISABLED';

const recordTypeLabels: Record<TimeRecord['record_type'], string> = {
  entry: 'Entrada',
  lunch_start: 'Saída para almoço',
  lunch_end: 'Retorno do almoço',
  exit: 'Saída',
  auto: 'Registro automático',
};

const methodLabels: Record<TimeRecord['method'], string> = {
  facial: 'Reconhecimento facial',
  pin: 'PIN',
  manual: 'Manual',
  web: 'Ponto remoto/web',
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const persistFailure = async (payload: {
  user: User;
  record: TimeRecord;
  recipient: string;
  message: string;
  code: string | null;
  attemptedAt: Date;
}) => {
  const values = {
    record_id: payload.record.id,
    user_id: payload.user.id,
    recipient: payload.recipient,
    smtp_code: payload.code,
    error_message: payload.message,
    attempted_at: payload.attemptedAt,
  };

  await EmailDeliveryLog.create({
    ...values,
    status: 'failed',
    message_id: null,
    smtp_response: null,
  }).catch((logError) => console.error(`Unable to persist email delivery log for record ${payload.record.id}:`, logError));

  await EmailDeliveryFailure.create(values)
    .catch((logError) => console.error(`Unable to persist email failure for record ${payload.record.id}:`, logError));
};

const attemptInTenant = async (user: User, record: TimeRecord) => {
  const attemptedAt = new Date();
  // This fallback allows an invalid/missing recipient to be recorded in the
  // delivery logs instead of making the log insert fail as well.
  const recipient = user.email?.trim() || 'e-mail nao cadastrado';

  if (String(process.env.DISABLE_TIME_RECORD_EMAIL || '').trim().toLowerCase() === 'true') {
    const message = 'Envio de comprovantes desabilitado pela configuração DISABLE_TIME_RECORD_EMAIL.';
    console.warn(`Time record email skipped for record ${record.id}: ${message}`);
    await persistFailure({ user, record, recipient, message, code: EMAIL_DISABLED_CODE, attemptedAt });
    return;
  }

  try {
    if (!user.email?.trim()) {
      throw new Error('O colaborador nao possui e-mail cadastrado para receber a notificacao.');
    }
    const smtp = getSmtpConfiguration();
    const company = await CompanyProfile.findOne();
    const companyName = company?.trade_name || company?.legal_name || 'N3xtime';
    const recordDate = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date(record.record_time));
    const statusLabel = record.status === 'pending_approval' ? 'Aguardando aprovação' : 'Confirmado';

    const transporter = createSmtpTransport(smtp);

    const result = await transporter.sendMail({
      from: smtp.from,
      to: user.email,
      subject: `Comprovante de ponto - ${recordTypeLabels[record.record_type]}`,
      text: [
        `Olá, ${user.name}.`,
        '',
        'Sua marcação de ponto foi recebida pelo sistema.',
        `Registro: #${record.id}`,
        `Tipo: ${recordTypeLabels[record.record_type]}`,
        `Data e hora: ${recordDate}`,
        `Método: ${methodLabels[record.method]}`,
        `Situação: ${statusLabel}`,
        `Empresa: ${companyName}`,
        '',
        'Este é um e-mail automático. Guarde-o como comprovante da marcação.',
      ].join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;color:#191717;line-height:1.5;max-width:600px">
          <h2 style="color:#026666">Comprovante de ponto</h2>
          <p>Olá, <strong>${escapeHtml(user.name)}</strong>.</p>
          <p>Sua marcação de ponto foi recebida pelo sistema.</p>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:6px 0"><strong>Registro</strong></td><td>#${record.id}</td></tr>
            <tr><td style="padding:6px 0"><strong>Tipo</strong></td><td>${escapeHtml(recordTypeLabels[record.record_type])}</td></tr>
            <tr><td style="padding:6px 0"><strong>Data e hora</strong></td><td>${escapeHtml(recordDate)}</td></tr>
            <tr><td style="padding:6px 0"><strong>Método</strong></td><td>${escapeHtml(methodLabels[record.method])}</td></tr>
            <tr><td style="padding:6px 0"><strong>Situação</strong></td><td>${escapeHtml(statusLabel)}</td></tr>
            <tr><td style="padding:6px 0"><strong>Empresa</strong></td><td>${escapeHtml(companyName)}</td></tr>
          </table>
          <p style="margin-top:20px;color:#6e6a6a;font-size:13px">Este é um e-mail automático. Guarde-o como comprovante da marcação.</p>
        </div>
      `,
    });

    await EmailDeliveryLog.create({
      record_id: record.id, user_id: user.id, recipient, status: 'sent', smtp_code: null,
      message_id: result.messageId || null, smtp_response: result.response || null, error_message: null, attempted_at: attemptedAt,
    }).catch((logError) => console.error(`Unable to persist email delivery log for record ${record.id}:`, logError));
  } catch (error) {
    const details = getSmtpErrorDetails(error);
    console.error(`Time record email failed for record ${record.id}:`, details.message);
    await persistFailure({ user, record, recipient, message: details.message, code: details.code, attemptedAt });
  }
};

export const attemptTimeRecordEmail = async (user: User, record: TimeRecord) => {
  const userCompanyId = Number(user.company_id);
  const recordCompanyId = Number(record.company_id);
  const hasUserCompany = Number.isInteger(userCompanyId) && userCompanyId > 0;
  if (
    !Number.isInteger(recordCompanyId)
    || recordCompanyId <= 0
    || Number(user.id) !== Number(record.user_id)
    || (hasUserCompany && recordCompanyId !== userCompanyId)
  ) {
    console.error(`Time record email aborted for record ${record.id}: usuario ou tenant do registro nao confere.`);
    return;
  }

  // The SMTP attempt can outlive the HTTP request (kiosk flow). Recreate the
  // tenant context explicitly so the company profile and audit rows always
  // belong to the same company as the time record.
  await runWithTenant(recordCompanyId, () => attemptInTenant(user, record));
};
