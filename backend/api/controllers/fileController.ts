import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/authMiddleware.js';
import { EmployeeRequest } from '../models/EmployeeRequest.js';
import { RemotePhotoEvidence } from '../models/RemotePhotoEvidence.js';
import { TimeRecord } from '../models/TimeRecord.js';
import { User } from '../models/User.js';
import { isManagerResponsibleForUser } from '../utils/leadership.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDirectory = path.resolve(__dirname, '..', 'uploads');

const mimeTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const canAccessUserFile = async (
  requester: NonNullable<AuthRequest['user']>,
  owner: User,
  permission: 'view_time_records' | 'approve_requests',
) => {
  if (requester.role === 'admin' || requester.id === owner.id) return true;
  if (requester.role !== 'manager') return false;
  const manager = await User.findByPk(requester.id, { attributes: ['id', 'department_id'] });
  return Boolean(manager && await isManagerResponsibleForUser(manager.id, manager.department_id, owner, permission));
};

const sendStoredFile = async (
  res: Response,
  storedUrl: string,
  expectedDirectory: 'remote_photos' | 'requests',
  downloadName?: string | null,
) => {
  const expectedPrefix = `/uploads/${expectedDirectory}/`;
  if (!storedUrl.startsWith(expectedPrefix)) {
    return res.status(404).json({ success: false, error: 'Arquivo local não encontrado.' });
  }

  const filename = path.basename(storedUrl);
  const filePath = path.resolve(uploadsDirectory, expectedDirectory, filename);
  const directoryPath = path.resolve(uploadsDirectory, expectedDirectory) + path.sep;
  if (!filePath.startsWith(directoryPath)) {
    return res.status(400).json({ success: false, error: 'Caminho de arquivo inválido.' });
  }

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return res.status(404).json({ success: false, error: 'Arquivo não encontrado ou já removido pela política de retenção.' });
  }

  const extension = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const safeName = (downloadName || filename).replace(/[\r\n"]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  return res.sendFile(filePath);
};

export const getRecordPhoto = async (req: AuthRequest, res: Response) => {
  const requester = req.user;
  const recordId = Number(req.params.id);
  if (!requester || requester.role === 'kiosk' || !Number.isInteger(recordId) || recordId <= 0) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const record = await TimeRecord.findByPk(recordId, { attributes: ['id', 'user_id', 'photo_url'] });
  if (!record?.photo_url) return res.status(404).json({ success: false, error: 'Foto não encontrada.' });
  const owner = await User.findByPk(record.user_id, { attributes: ['id', 'department_id', 'manager_id'] });
  if (!owner || !await canAccessUserFile(requester, owner, 'view_time_records')) {
    return res.status(403).json({ success: false, error: 'Sem permissão para visualizar esta foto.' });
  }
  const evidence = await RemotePhotoEvidence.scope('withPhotoData').findOne({
    where: { record_id: record.id },
    attributes: ['photo_data', 'mime_type', 'deleted_at'],
  });
  if (!evidence?.photo_data || evidence.deleted_at) {
    return res.status(404).json({ success: false, error: 'Foto já removida pela política de retenção.' });
  }
  res.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  return res.end(evidence.photo_data);
};

export const getRequestAttachment = async (req: AuthRequest, res: Response) => {
  const requester = req.user;
  const requestId = Number(req.params.id);
  if (!requester || requester.role === 'kiosk' || !Number.isInteger(requestId) || requestId <= 0) {
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }

  const request = await EmployeeRequest.findByPk(requestId, { attributes: ['id', 'user_id', 'attachment_url', 'attachment_name'] });
  if (!request?.attachment_url) return res.status(404).json({ success: false, error: 'Anexo não encontrado.' });
  const owner = await User.findByPk(request.user_id, { attributes: ['id', 'department_id', 'manager_id'] });
  if (!owner || !await canAccessUserFile(requester, owner, 'approve_requests')) {
    return res.status(403).json({ success: false, error: 'Sem permissão para visualizar este anexo.' });
  }
  return sendStoredFile(res, request.attachment_url, 'requests', request.attachment_name);
};
