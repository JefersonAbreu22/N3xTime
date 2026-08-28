import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDirectory = path.resolve(__dirname, '..', 'uploads', 'remote_photos');

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

import { AuthRequest } from './authMiddleware.js';

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (req, file, callback) => {
    // Expected format: colaborador_data_hora.jpg
    const authReq = req as AuthRequest;
    const userId = authReq.user?.id || 'unknown';
    const timestamp = Date.now();
    const extension = path.extname(file.originalname || '.jpg').toLowerCase();
    callback(null, `colaborador_${userId}_${timestamp}${extension}`);
  },
});

export const remotePhotoUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    const error = new Error('Formato de foto inválido. Envie JPG, PNG ou WEBP.') as Error & {
      statusCode?: number;
    };
    error.statusCode = 400;
    callback(error);
  },
});
