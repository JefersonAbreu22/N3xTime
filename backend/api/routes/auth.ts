import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, getCurrentSession, login, requestPasswordReset, resetPassword, registerFace, resetFace, getFaces, kioskLogin, getKioskCompany, getKioskStatus, revokeKioskSession, releaseKioskSession, getBiometricSummary, getBiometricHistory } from '../controllers/authController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = Router();
const passwordResetRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.' } });
const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' } });

router.post('/login', login);
router.get('/me', authenticate, getCurrentSession);
router.post('/password/forgot', passwordResetRequestLimiter, requestPasswordReset);
router.post('/password/reset', passwordResetLimiter, resetPassword);
router.post('/password/change', authenticate, authorize(['admin', 'manager', 'employee']), changePassword);
router.get('/kiosk/company/:companySlug', getKioskCompany);
router.post('/kiosk/login', kioskLogin);
router.get('/kiosk/status', authenticate, authorize(['admin', 'kiosk']), getKioskStatus);
router.post('/kiosk/release', authenticate, authorize(['admin']), releaseKioskSession);
router.post('/kiosk/revoke', authenticate, authorize(['admin']), revokeKioskSession);
router.get('/biometrics/summary', authenticate, authorize(['admin', 'manager']), getBiometricSummary);
router.get('/biometrics/history', authenticate, authorize(['admin', 'manager']), getBiometricHistory);

router.get('/faces', authenticate, authorize(['admin', 'manager', 'kiosk']), getFaces);

router.post('/face/register', authenticate, authorize(['admin', 'manager']), registerFace);
router.post('/face/reset', authenticate, authorize(['admin', 'manager']), resetFace);

export default router;
