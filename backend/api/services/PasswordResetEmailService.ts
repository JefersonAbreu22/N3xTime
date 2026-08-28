import nodemailer from 'nodemailer';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { User } from '../models/User.js';

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
  if (!host || !user || !pass || !from) throw new Error('SMTP não configurado para recuperação de senha.');
  return { host, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true', user, pass, from };
};

export const sendPasswordResetEmail = async (user: User, resetUrl: string) => {
  const smtp = getSmtpConfiguration();
  const company = await CompanyProfile.findOne();
  const companyName = company?.trade_name || company?.legal_name || 'N3xtime';
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
  });

  await transporter.sendMail({
    from: smtp.from,
    to: user.email,
    subject: `Redefinição de senha - ${companyName}`,
    text: [
      `Olá, ${user.name}.`, '',
      'Recebemos uma solicitação para redefinir a senha da sua conta.',
      'Acesse o link abaixo para criar uma nova senha:', resetUrl, '',
      'O link é válido por 30 minutos e poderá ser utilizado apenas uma vez.',
      'Se você não solicitou esta alteração, ignore esta mensagem. Sua senha continuará a mesma.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;color:#191717;line-height:1.6;max-width:600px;margin:auto">
        <div style="border:1px solid #d9d7d7;padding:28px;background:#fcfbfb">
          <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#026666">${escapeHtml(companyName)}</div>
          <h1 style="font-size:24px;margin:12px 0;color:#191717">Redefinição de senha</h1>
          <p>Olá, <strong>${escapeHtml(user.name)}</strong>.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
          <p style="margin:28px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#026666;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">Criar nova senha</a></p>
          <p style="font-size:13px;color:#6e6a6a">Este link é válido por 30 minutos e poderá ser usado apenas uma vez.</p>
          <p style="font-size:13px;color:#6e6a6a">Se você não solicitou esta alteração, ignore esta mensagem. Sua senha continuará a mesma.</p>
        </div>
      </div>`,
  });
};
