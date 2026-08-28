import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';
import { getCompanyProfile, rotateKioskAccessKey, updateCompanyProfile } from '../controllers/companyController.js';

const router = Router();

router.get('/', authenticate, authorize(['admin', 'manager']), getCompanyProfile);
router.put('/', authenticate, authorize(['admin']), updateCompanyProfile);
router.put('/kiosk-key', authenticate, authorize(['admin']), rotateKioskAccessKey);

export default router;
