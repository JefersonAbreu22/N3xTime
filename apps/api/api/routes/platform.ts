import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { accessCompany, bootstrapPlatformSession, listCompanies, listPlatformLogs, provisionCompany, updateCompanyStatus } from '../controllers/platformController.js';

const router = Router();
router.post('/auth/session', authenticate, bootstrapPlatformSession);
router.get('/companies', authenticate, authorize(['platform_admin']), listCompanies);
router.post('/companies', authenticate, authorize(['platform_admin']), provisionCompany);
router.post('/companies/:id/access', authenticate, authorize(['platform_admin']), accessCompany);
router.patch('/companies/:id/status', authenticate, authorize(['platform_admin']), updateCompanyStatus);
router.get('/logs', authenticate, authorize(['platform_admin']), listPlatformLogs);

export default router;
