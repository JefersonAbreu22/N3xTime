import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { platformTransferRateLimiter } from '../middlewares/security.js';
import { accessCompany, bootstrapPlatformSession, listCompanies, listPlatformLogs, provisionCompany, updateCompanyStatus } from '../controllers/platformController.js';
import { backupCompanyTenant, importCompanyTenant, listCompanyTransfers } from '../controllers/tenantTransferController.js';

const router = Router();
const dumpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, /\.sql$/i.test(file.originalname)),
});
router.post('/auth/session', authenticate, bootstrapPlatformSession);
router.get('/companies', authenticate, authorize(['platform_admin']), listCompanies);
router.post('/companies', authenticate, authorize(['platform_admin']), provisionCompany);
router.post('/companies/:id/access', authenticate, authorize(['platform_admin']), accessCompany);
router.patch('/companies/:id/status', authenticate, authorize(['platform_admin']), updateCompanyStatus);
router.get('/companies/:id/backup', authenticate, authorize(['platform_admin']), platformTransferRateLimiter, backupCompanyTenant);
router.post('/companies/:id/import', authenticate, authorize(['platform_admin']), platformTransferRateLimiter, dumpUpload.single('dump'), importCompanyTenant);
router.get('/companies/:id/transfers', authenticate, authorize(['platform_admin']), listCompanyTransfers);
router.get('/logs', authenticate, authorize(['platform_admin']), listPlatformLogs);

export default router;
