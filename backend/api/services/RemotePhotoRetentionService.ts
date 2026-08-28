import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { TimeRecord } from '../models/TimeRecord.js';
import { RemotePhotoEvidence } from '../models/RemotePhotoEvidence.js';
import { runWithoutTenant } from '../tenancy/tenantContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const remotePhotosDirectory = path.resolve(__dirname, '..', 'uploads', 'remote_photos');
const RETENTION_MONTHS = 3;

const getRetentionCutoff = () => {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  return cutoff;
};

export const cleanExpiredRemotePhotos = async () => runWithoutTenant(async () => {
  const cutoff = getRetentionCutoff();
  const legacyRecords = await TimeRecord.findAll({
    where: { method: 'web', photo_url: { [Op.ne]: null } },
    attributes: ['id', 'company_id', 'photo_url', 'created_at'],
  });
  const existingEvidences = await RemotePhotoEvidence.findAll({
    where: { record_id: { [Op.in]: legacyRecords.map((record) => record.id) } },
    attributes: ['record_id'],
  });
  const evidenceRecordIds = new Set(existingEvidences.map((evidence) => evidence.record_id));

  for (const record of legacyRecords) {
    if (evidenceRecordIds.has(record.id) || !record.photo_url?.startsWith('/uploads/remote_photos/')) continue;
    const filePath = path.resolve(remotePhotosDirectory, path.basename(record.photo_url));
    try {
      const photoData = await fs.readFile(filePath);
      const expiresAt = new Date(record.created_at);
      expiresAt.setUTCMonth(expiresAt.getUTCMonth() + RETENTION_MONTHS);
      await RemotePhotoEvidence.create({
        company_id: record.company_id,
        record_id: record.id,
        photo_data: photoData,
        mime_type: path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : path.extname(filePath).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg',
        expires_at: expiresAt,
        deleted_at: null,
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') await record.update({ photo_url: null });
      else console.error(`Remote photo evidence backfill failed for record ${record.id}:`, error);
    }
  }

  const evidences = await RemotePhotoEvidence.scope('withPhotoData').findAll({
    where: {
      photo_data: { [Op.ne]: null },
      expires_at: { [Op.lte]: new Date() },
    },
    include: [{ model: TimeRecord, as: 'record', attributes: ['id', 'photo_url'], required: true }],
  });

  let removed = 0;
  let failures = 0;
  for (const evidence of evidences) {
    const record = evidence.record;
    if (!record) continue;
    const photoUrl = record.photo_url;

    try {
      if (photoUrl?.startsWith('/uploads/remote_photos/')) {
        const filePath = path.resolve(remotePhotosDirectory, path.basename(photoUrl));
        if (path.dirname(filePath) !== remotePhotosDirectory) {
          throw new Error('Caminho de foto remota fora do diretório permitido.');
        }
        await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }

      // The time record and method remain permanent. Only the retained image
      // reference is cleared after the physical evidence is removed.
      await record.update({ photo_url: null });
      await evidence.update({ photo_data: null, deleted_at: new Date() });
      removed += 1;
    } catch (error) {
      failures += 1;
      console.error(`Remote photo retention failed for record ${record.id}:`, error);
    }
  }

  if (evidences.length) {
    console.log(`Remote photo retention completed: ${removed} removed, ${failures} failed, cutoff ${cutoff.toISOString()}.`);
  }
  return { inspected: evidences.length, removed, failures, cutoff };
});

export const startRemotePhotoRetentionJob = () => {
  // Run at startup and hourly. This bounds retention to three calendar months
  // plus, at most, the interval until the next execution.
  void cleanExpiredRemotePhotos().catch((error) => console.error('Initial remote photo retention failed:', error));
  return cron.schedule('15 * * * *', () => {
    void cleanExpiredRemotePhotos().catch((error) => console.error('Scheduled remote photo retention failed:', error));
  }, { timezone: 'America/Sao_Paulo' });
};
