import { Router } from 'express';
import { getSmtpStatus, sendSmtpTestEmail } from '../controllers/emailController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/smtp/status', authenticate, authorize(['admin']), getSmtpStatus);
router.post('/smtp/test', authenticate, authorize(['admin']), sendSmtpTestEmail);

export default router;
