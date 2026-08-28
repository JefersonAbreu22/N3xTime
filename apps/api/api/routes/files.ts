import { Router } from 'express';
import { getRecordPhoto, getRequestAttachment } from '../controllers/fileController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/records/:id/photo', authenticate, (req, res, next) => { void getRecordPhoto(req, res).catch(next); });
router.get('/requests/:id/attachment', authenticate, (req, res, next) => { void getRequestAttachment(req, res).catch(next); });

export default router;
