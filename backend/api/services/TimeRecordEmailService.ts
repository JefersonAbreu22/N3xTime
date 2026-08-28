import nodemailer from 'nodemailer';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { EmailDeliveryFailure } from '../models/EmailDeliveryFailure.js';
import { EmailDeliveryLog } from '../models/EmailDeliveryLog.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { User } from '../models/User.js';

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

const getSmtpConfiguration = () => {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP não configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.');
  }

  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    user,
    pass,
    from,
  };
};

const getErrorDetails = (error: unknown) => {
  const smtpError = error as { message?: string; code?: string; responseCode?: number };
  const message = (smtpError?.message || 'Falha desconhecida ao enviar o comprovante por e-mail').slice(0, 4000);
  const code = smtpError?.code || (smtpError?.responseCode ? String(smtpError.responseCode) : null);
  return { message, code: code?.slice(0, 80) || null };
};

export const attemptTimeRecordEmail = async (user: User, record: TimeRecord) => {
  if (String(process.env.DISABLE_TIME_RECORD_EMAIL || '').toLowerCase() === 'true') return;
  const attemptedAt = new Date();
  // This fallback allows an invalid/missing recipient to be recorded in the
  // delivery logs instead of making the log insert fail as well.
  const recipient = user.email?.trim() || 'e-mail nao cadastrado';

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

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 10_000,
    });

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
    const details = getErrorDetails(error);
    console.error(`Time record email failed for record ${record.id}:`, details.message);

    await EmailDeliveryLog.create({
      record_id: record.id, user_id: user.id, recipient, status: 'failed', smtp_code: details.code,
      message_id: null, smtp_response: null, error_message: details.message, attempted_at: attemptedAt,
    }).catch((logError) => console.error(`Unable to persist email delivery log for record ${record.id}:`, logError));
    await EmailDeliveryFailure.create({
      record_id: record.id, user_id: user.id, recipient, error_message: details.message,
      smtp_code: details.code, attempted_at: attemptedAt,
    }).catch((logError) => console.error(`Unable to persist email failure for record ${record.id}:`, logError));
  }
};
