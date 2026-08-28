import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDirectory = path.resolve(__dirname, '..', 'uploads', 'requests');

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const normalizeFilename = (originalName: string) => {
  const extension = path.extname(originalName || '').toLowerCase();
  const basename = path
    .basename(originalName || 'anexo', extension)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return `${Date.now()}-${basename || 'anexo'}${extension}`;
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    callback(null, normalizeFilename(file.originalname));
  },
});

export const requestAttachmentUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error('Formato de anexo inválido. Envie PDF, JPG, PNG ou WEBP.') as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    callback(error);
  },
});
