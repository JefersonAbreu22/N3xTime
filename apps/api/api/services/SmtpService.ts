import nodemailer from 'nodemailer';

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

const isTimeRecordEmailEnabled = () =>
  String(process.env.DISABLE_TIME_RECORD_EMAIL || '').trim().toLowerCase() !== 'true';

export const getSmtpConfigurationStatus = () => {
  const host = process.env.SMTP_HOST?.trim() || '';
  const user = process.env.SMTP_USER?.trim() || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM?.trim() || user;
  const port = Number(process.env.SMTP_PORT || 587);
  const missing: string[] = [];

  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('SMTP_FROM');
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) missing.push('SMTP_PORT');

  return {
    configured: missing.length === 0,
    missing,
    host: host || null,
    port: Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null,
    secure: String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true',
    from: from || null,
    timeRecordEmailEnabled: isTimeRecordEmailEnabled(),
  };
};

export const getSmtpConfiguration = (): SmtpConfiguration => {
  const status = getSmtpConfigurationStatus();
  if (!status.configured) {
    throw new Error(`SMTP não configurado. Verifique: ${status.missing.join(', ')}.`);
  }

  return {
    host: status.host!,
    port: status.port!,
    secure: status.secure,
    user: process.env.SMTP_USER!.trim(),
    pass: process.env.SMTP_PASS!,
    from: status.from!,
  };
};

export const createSmtpTransport = (smtp: SmtpConfiguration = getSmtpConfiguration()) =>
  nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
  });

export const getSmtpErrorDetails = (error: unknown) => {
  const smtpError = error as { message?: string; code?: string; responseCode?: number };
  const message = (smtpError?.message || 'Falha desconhecida na comunicação com o servidor SMTP.').slice(0, 4000);
  const code = smtpError?.code || (smtpError?.responseCode ? String(smtpError.responseCode) : null);
  return { message, code: code?.slice(0, 80) || null };
};
