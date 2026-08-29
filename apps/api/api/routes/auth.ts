import { Router } from 'express';
import { registerFace, resetFace, getFaces, kioskLogin, getKioskCompany, getKioskStatus, revokeKioskSession, releaseKioskSession, getBiometricSummary, getBiometricHistory } from '../controllers/authController.js';
import { changeAccountPassword, getAccountCurrentSession, loginWithAccount, requestAccountPasswordReset, resetAccountPassword, selectAccountCompany } from '../controllers/accountAuthController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import {
  kioskLoginRateLimiter,
  loginRateLimiter,
  passwordResetLimiter,
  passwordResetRequestLimiter,
  publicLookupRateLimiter,
} from '../middlewares/security.js';

const router = Router();

router.post('/login', loginRateLimiter, loginWithAccount);
router.post('/company/select', loginRateLimiter, selectAccountCompany);
router.get('/me', authenticate, getAccountCurrentSession);
router.post('/password/forgot', passwordResetRequestLimiter, requestAccountPasswordReset);
router.post('/password/reset', passwordResetLimiter, resetAccountPassword);
router.post('/password/change', authenticate, authorize(['admin', 'manager', 'employee']), changeAccountPassword);
router.get('/kiosk/company/:companySlug', publicLookupRateLimiter, getKioskCompany);
router.post('/kiosk/login', kioskLoginRateLimiter, kioskLogin);
router.get('/kiosk/status', authenticate, authorize(['admin', 'kiosk']), getKioskStatus);
router.post('/kiosk/release', authenticate, authorize(['admin']), releaseKioskSession);
router.post('/kiosk/revoke', authenticate, authorize(['admin']), revokeKioskSession);
router.get('/biometrics/summary', authenticate, authorize(['admin', 'manager']), getBiometricSummary);
router.get('/biometrics/history', authenticate, authorize(['admin', 'manager']), getBiometricHistory);

router.get('/faces', authenticate, authorize(['admin', 'manager', 'kiosk']), getFaces);

router.post('/face/register', authenticate, authorize(['admin', 'manager']), registerFace);
router.post('/face/reset', authenticate, authorize(['admin', 'manager']), resetFace);

export default router;
