import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/authMiddleware.js';
import { Company } from '../models/Company.js';
import { TenantTransferLog } from '../models/TenantTransferLog.js';
import { createTenantBackup, importTenantDump } from '../services/tenantTransferService.js';

export const backupCompanyTenant = async (req: AuthRequest, res: Response) => {
  const companyId = Number(req.params.id); if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ success: false, error: 'Empresa inválida.' });
  const company = await Company.findByPk(companyId); if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
  const log = await TenantTransferLog.create({ company_id: companyId, platform_user_id: req.user!.id, operation: 'backup', filename: 'pending.sql', status: 'running', rows_processed: 0 });
  try {
    const backup = await createTenantBackup(companyId);
    await log.update({ filename: backup.filename, status: 'success', rows_processed: backup.rowsProcessed, details: JSON.stringify({ tables: backup.tables }), finished_at: new Date() });
    res.setHeader('Content-Type', 'application/sql; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`); res.setHeader('Cache-Control', 'no-store');
    return res.send(backup.buffer);
  } catch (error) {
    await log.update({ status: 'failed', error_message: error instanceof Error ? error.message : String(error), finished_at: new Date() });
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Não foi possível gerar o backup.' });
  }
};

export const importCompanyTenant = async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
  const companyId = Number(req.params.id); if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ success: false, error: 'Empresa inválida.' });
  if (!req.file) return res.status(400).json({ success: false, error: 'Envie um arquivo .sql.' });
  const company = await Company.findByPk(companyId); if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada.' });
  const log = await TenantTransferLog.create({ company_id: companyId, platform_user_id: req.user!.id, operation: 'import', filename: req.file.originalname, status: 'running', rows_processed: 0 });
  try {
    const result = await importTenantDump(companyId, req.file.buffer, String(req.body?.replaceExisting ?? 'true') !== 'false');
    await log.update({ status: 'success', rows_processed: result.rowsProcessed, details: JSON.stringify({ tables: result.tables }), finished_at: new Date() });
    return res.json({ success: true, message: 'Dump importado com isolamento por tenant.', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log.update({ status: 'failed', error_message: message, finished_at: new Date() });
    return res.status(400).json({ success: false, error: message });
  }
};

export const listCompanyTransfers = async (req: AuthRequest, res: Response) => {
  const companyId = Number(req.params.id); if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ success: false, error: 'Empresa inválida.' });
  const rows = await TenantTransferLog.findAll({ where: { company_id: companyId }, order: [['created_at', 'DESC']], limit: 50 });
  return res.json({ success: true, data: rows });
};
