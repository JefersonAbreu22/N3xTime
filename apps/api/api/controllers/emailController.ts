import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { CompanyProfile } from '../models/CompanyProfile.js';
import { User } from '../models/User.js';
import { AuditService } from '../services/AuditService.js';
import { SmtpDiagnosticError, sendSmtpDiagnosticEmail } from '../services/SmtpDiagnosticService.js';
import { getSmtpConfigurationStatus } from '../services/SmtpService.js';

const testEmailSchema = z.object({
  recipient: z.string().trim().email('Informe um e-mail válido.').max(255),
});

export const getSmtpStatus = async (_req: AuthRequest, res: Response) => {
  return res.json({ success: true, data: getSmtpConfigurationStatus() });
};

export const sendSmtpTestEmail = async (req: AuthRequest, res: Response) => {
  const parsed = testEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Destinatário inválido.' });
  }

  const adminId = Number(req.user?.id);
  try {
    const [admin, company] = await Promise.all([
      User.findByPk(adminId, { attributes: ['id', 'name'] }),
      CompanyProfile.findOne({ attributes: ['trade_name', 'legal_name'] }),
    ]);
    if (!admin) return res.status(403).json({ success: false, error: 'Administrador não encontrado.' });

    const companyName = company?.trade_name || company?.legal_name || 'N3xtime';
    const result = await sendSmtpDiagnosticEmail({
      recipient: parsed.data.recipient,
      requestedBy: admin.name,
      companyName,
    });

    await AuditService.log({
      user_id: admin.id,
      action: 'SMTP_TEST_SENT',
      entity_name: 'smtp_diagnostic',
      new_value: {
        recipient: result.recipient,
        messageId: result.messageId,
        smtpResponse: result.smtpResponse,
        durationMs: result.durationMs,
      },
    }, req);

    return res.json({
      success: true,
      message: `E-mail de teste enviado para ${result.recipient}.`,
      data: result,
    });
  } catch (error) {
    const diagnostic = error instanceof SmtpDiagnosticError
      ? error
      : new SmtpDiagnosticError('Não foi possível concluir o teste SMTP.', 'sending', null, 0);

    await AuditService.log({
      user_id: adminId || null,
      action: 'SMTP_TEST_FAILED',
      entity_name: 'smtp_diagnostic',
      new_value: {
        recipient: parsed.data.recipient,
        stage: diagnostic.stage,
        smtpCode: diagnostic.smtpCode,
        error: diagnostic.message,
        durationMs: diagnostic.durationMs,
      },
    }, req);

    console.error(`SMTP diagnostic failed at ${diagnostic.stage}:`, diagnostic.message);
    return res.status(diagnostic.stage === 'configuration' ? 503 : 502).json({
      success: false,
      error: diagnostic.message,
      data: {
        stage: diagnostic.stage,
        smtpCode: diagnostic.smtpCode,
        durationMs: diagnostic.durationMs,
      },
    });
  }
};
